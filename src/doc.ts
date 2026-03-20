import { MemoryFileSystem, ZipReadFileSystem } from '@playcanvas/splat-transform';

import {
    type EditOp,
    DeleteSelectionOp,
    MultiOp,
    ResetOp,
    SeparateSplatOp,
    SplatsTransformOp
} from './edit-ops';
import { ElementType } from './element';
import { Events } from './events';
import { BrowserFileSystem, BlobReadSource, DeflateZipFileSystem, MappedReadFileSystem } from './io';
import { Model } from './model';
import {
    projectSaveStateStore,
    type WorkingAssetKind,
    type WorkingAssetRecord,
    type WorkingAssetStorage,
    type WorkingProjectRecord,
    type WorkingReferenceImageAssetRecord
} from './project-save-state';
import { recentFiles } from './recent-files';
import { normalizeReferenceImageFilename } from './reference-image-filename';
import { Scene } from './scene';
import { Splat } from './splat';
import { canSerializeSog, serializePly, serializeSog } from './splat-serialize';
import { State } from './splat-state';
import { Transform } from './transform';
import { formatInteger, localize } from './ui/localization';

const DOC_VERSION = 4;
const WORKING_STATE_VERSION = 1;
const SUPPORTED_DOC_VERSIONS = new Set([0, 1, 2, 3, 4]);
const ZIP64_MARGIN_BYTES = 1800n * 1024n * 1024n;
const ZIP32_LIMIT = 0xffffffffn;
const ZIP_ENTRY_OVERHEAD = 256n;
const hiddenStateMask = (State as { hidden?: number }).hidden ?? 0;
const trackedPerSplatStateMask = State.deleted | State.locked | hiddenStateMask;

type FilePickerAcceptType = unknown;

const SuperFileType: FilePickerAcceptType[] = [{
    description: 'SuperSplat document',
    accept: {
        'application/x-supersplat': ['.ssproj']
    }
}];

type FileSelectorCallback = (fileList: File) => void;
type TrackedAssetKind = 'splat' | 'model';

type SerializedAssetEntry = {
    id: string;
    kind: WorkingAssetKind;
    filename: string;
    packagePath: string | null;
    element: Splat | Model;
};

type EditedSplatPackageFormat = 'ply' | 'sog';
type PackageAssetSaveMode = 'copy-package-entry' | 'copy-blob' | 'serialize-ply';

type PackageAssetSavePlan = {
    entry: SerializedAssetEntry;
    outputPath: string;
    mode: PackageAssetSaveMode;
    sourcePath?: string;
    blob?: Blob;
};

type SerializedSceneState = {
    splats: Splat[];
    models: Model[];
    splatDocs: any[];
    modelDocs: any[];
    assetEntries: SerializedAssetEntry[];
    cameraState: any;
    viewState: any;
    poseSetsState: any;
    timelineState: any;
    cameraFramesState: any;
    referenceImagesState: any;
    referenceImageAssets: WorkingReferenceImageAssetRecord[];
    lightingState: any;
};

type SavePackageContext = {
    serialized: SerializedSceneState;
    editedSplatFormat: EditedSplatPackageFormat;
};

type NormalizedDocument = {
    version: number;
    schemaVersion: number | null;
    projectId: string | null;
    packageRevision: number | null;
    zip64?: boolean;
    camera?: any;
    view?: any;
    poseSets?: any;
    timeline?: any;
    cameraFrames?: any;
    referenceImages?: any;
    lighting?: any;
    splats: Array<any & { assetId: string; filename: string; }>;
    models: Array<any & { assetId: string; filename: string; }>;
};

type WorkingSnapshotDocument = {
    version: 0;
    schemaVersion: number;
    workingStateVersion: number;
    projectId: string;
    basePackageRevision: number | null;
    basePackageFingerprint: string | null;
    camera: any;
    view: any;
    poseSets: any;
    timeline: any;
    cameraFrames: any;
    referenceImages?: any;
    splats: Array<any & { assetId: string; filename: string; }>;
    models: Array<any & { assetId: string; filename: string; }>;
    lighting: any;
};

type LoadResult = {
    loaded: boolean;
};

class FileSelector {
    show: (callbackFunc: FileSelectorCallback) => void;

    constructor() {
        const fileSelector = document.createElement('input');
        fileSelector.setAttribute('id', 'document-file-selector');
        fileSelector.setAttribute('type', 'file');
        fileSelector.setAttribute('accept', '.ssproj');
        fileSelector.setAttribute('multiple', 'false');

        document.body.append(fileSelector);

        let callbackFunc: FileSelectorCallback = null;

        fileSelector.addEventListener('change', () => {
            callbackFunc(fileSelector.files[0]);
        });

        fileSelector.addEventListener('cancel', () => {
            callbackFunc(null);
        });

        this.show = (func: FileSelectorCallback) => {
            callbackFunc = func;
            fileSelector.click();
        };
    }
}

const hasFileSystemAccess = () => !!window.showSaveFilePicker;

const createId = (prefix: string) => {
    try {
        const uuid = (globalThis.crypto as any)?.randomUUID?.();
        if (typeof uuid === 'string' && uuid) {
            return `${prefix}-${uuid}`;
        }
    } catch {
        // ignore
    }
    return `${prefix}-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
};

const hashString = (value: string) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const createPackageFingerprint = (name: string | null | undefined, size: number, documentJson: string) => {
    return `doc:${name ?? ''}:${size}:${hashString(documentJson)}`;
};

const isQuotaExceededError = (error: unknown) => {
    const name = (error as Error & { name?: string })?.name ?? '';
    return name === 'QuotaExceededError' ||
        name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        `${error}`.includes('QuotaExceededError');
};

const formatStorageSize = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Math.max(0, bytes);
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
};

const resolveDocumentAssetId = (entry: any, kind: TrackedAssetKind, index: number) => {
    if (typeof entry?.assetId === 'string' && entry.assetId) {
        return entry.assetId;
    }
    return `legacy-${kind}-${index}`;
};

const resolveDocumentSplatFilename = (entry: any, index: number) => {
    return (typeof entry?.filename === 'string' && entry.filename) ? entry.filename : `splat_${index}.ply`;
};

const resolveDocumentModelFilename = (entry: any, index: number) => {
    return (typeof entry?.filename === 'string' && entry.filename) ? entry.filename : `models/model_${index}.glb`;
};

const normalizeDocument = (document: any): NormalizedDocument => {
    const source = (document && typeof document === 'object') ? document : {};
    const splats = Array.isArray(source.splats) ? source.splats : [];
    const models = Array.isArray(source.models) ? source.models : [];

    return {
        version: (typeof source.version === 'number' && isFinite(source.version)) ? source.version : 0,
        schemaVersion: (typeof source.schemaVersion === 'number' && isFinite(source.schemaVersion)) ? source.schemaVersion : null,
        projectId: (typeof source.projectId === 'string' && source.projectId) ? source.projectId : null,
        packageRevision: (typeof source.packageRevision === 'number' && isFinite(source.packageRevision)) ? source.packageRevision : null,
        zip64: source.zip64 === true,
        camera: source.camera ?? null,
        view: source.view ?? null,
        poseSets: source.poseSets ?? [],
        timeline: source.timeline ?? {},
        cameraFrames: source.cameraFrames ?? null,
        referenceImages: source.referenceImages ?? source.referenceImage ?? null,
        lighting: source.lighting ?? null,
        splats: splats.map((entry: any, index: number) => ({
            ...(entry ?? {}),
            assetId: resolveDocumentAssetId(entry, 'splat', index),
            filename: resolveDocumentSplatFilename(entry, index)
        })),
        models: models.map((entry: any, index: number) => ({
            ...(entry ?? {}),
            assetId: resolveDocumentAssetId(entry, 'model', index),
            filename: resolveDocumentModelFilename(entry, index)
        }))
    };
};

const isWorkingRecordCompatible = (
    record: WorkingProjectRecord | null,
    packageRevision: number | null,
    packageFingerprint: string | null
) => {
    if (!record) {
        return false;
    }

    if ((record.packageRevision ?? null) !== (packageRevision ?? null)) {
        return false;
    }

    if (record.packageFingerprint && packageFingerprint && record.packageFingerprint !== packageFingerprint) {
        return false;
    }

    if (record.packageRevision === null && packageRevision === null) {
        return !!record.packageFingerprint && !!packageFingerprint && record.packageFingerprint === packageFingerprint;
    }

    return true;
};

const estimateSplatPlySize = (splat: Splat) => {
    const element = splat.splatData.getElement('vertex');
    const internalProps = new Set(['state', 'transform']);
    const props = element.properties.filter((p: any) => p.storage && !internalProps.has(p.name));
    const perPointBytes = props.reduce((sum: bigint, p: any) => sum + BigInt(p.byteSize ?? 4), 0n);
    const gaussianCount = BigInt(Math.max(0, splat.numSplats - splat.numDeleted));
    const headerBytes = 256n + BigInt(props.length * 32);
    return headerBytes + perPointBytes * gaussianCount;
};

const estimateDocumentSize = (
    documentData: any,
    splats: Splat[],
    resolveSplatSize: (splat: Splat, index: number) => bigint,
    models: Model[],
    resolveBlob: (model: Model) => Blob | null,
    referenceImagesBytes: bigint = 0n,
    referenceImagesEntryCount: bigint = 0n
) => {
    const encoder = new TextEncoder();
    const docSize = BigInt(encoder.encode(JSON.stringify(documentData)).length);
    const splatSize = splats.reduce((sum, splat, index) => sum + resolveSplatSize(splat, index), 0n);
    const modelSize = models.reduce((sum, model) => sum + BigInt(resolveBlob(model)?.size ?? 0), 0n);
    const entryCount = BigInt(1 + splats.length + models.length) + referenceImagesEntryCount;
    const overhead = entryCount * ZIP_ENTRY_OVERHEAD;
    return {
        docSize,
        splatSize,
        modelSize,
        total: docSize + splatSize + modelSize + referenceImagesBytes + overhead
    };
};

const serializeSplatToBlob = async (splat: Splat) => {
    const memFs = new MemoryFileSystem();
    await serializePly([splat], {
        keepStateData: false,
        keepWorldTransform: true,
        keepColorTint: true
    }, memFs);
    const data = memFs.results.get('output.ply');
    if (!data) {
        throw new Error(`Failed to serialize splat '${splat.name}'`);
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy], { type: 'application/octet-stream' });
};

const serializeSplatToSogBlob = async (splat: Splat, events?: Events, progressHeader?: string) => {
    const memFs = new MemoryFileSystem();
    await serializeSog([splat], {
        keepStateData: false,
        keepWorldTransform: true,
        keepColorTint: true,
        iterations: 10,
        ...(events ? { events } : {}),
        ...(progressHeader ? { progressHeader } : {})
    }, memFs);
    const data = memFs.results.get('output.sog');
    if (!data) {
        throw new Error(`Failed to serialize splat '${splat.name}' as SOG`);
    }
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return new Blob([copy], { type: 'application/octet-stream' });
};

const writeBlobToZip = async (zipFs: { createWriter(filename: string): Promise<{ write(data: Uint8Array): void | Promise<void>; close(): void | Promise<void>; }>; }, filename: string, source: Blob | ReadableStream<Uint8Array>) => {
    const writer = await zipFs.createWriter(filename);
    const reader = (source instanceof Blob ? source.stream() : source).getReader();
    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }
        if (value) {
            await writer.write(value);
        }
    }
    await writer.close();
};

const cleanupWritableStream = async (stream?: FileSystemWritableFileStream | null, reason?: unknown) => {
    if (!stream) {
        return;
    }

    const writable = stream as FileSystemWritableFileStream & {
        abort?: (reason?: unknown) => Promise<void>;
    };
    try {
        if (typeof writable.abort === 'function') {
            await writable.abort(reason);
        } else {
            await writable.close();
        }
    } catch (cleanupError) {
        console.warn('failed to cleanup writable stream after save failure', cleanupError);
    }
};

const getDirtySplatsFromOp = (op: EditOp, dirtySplats: Set<Splat>) => {
    if (op instanceof MultiOp) {
        op.ops.forEach(child => getDirtySplatsFromOp(child, dirtySplats));
        return;
    }

    if (op instanceof DeleteSelectionOp || op instanceof ResetOp || op instanceof SplatsTransformOp) {
        if ((op as any).splat instanceof Splat) {
            dirtySplats.add((op as any).splat);
        }
        return;
    }

    if (op instanceof SeparateSplatOp && (op as any).splat instanceof Splat) {
        dirtySplats.add((op as any).splat);
    }
};

const registerDocEvents = (scene: Scene, events: Events) => {
    const fileSelector = window.showOpenFilePicker ? null : new FileSelector();

    let documentFileHandle: FileSystemFileHandle = null;
    let docName: string = null;
    let currentProjectId: string | null = null;
    let currentPackageRevision: number | null = null;
    let currentPackageFingerprint: string | null = null;
    let currentPackageBlob: Blob | null = null;
    let stateDirty = false;
    let packageDirty = false;
    let bootstrapDirtyTrackingReady = false;
    let suppressDirtyTracking = 0;
    let elementAssetIds = new WeakMap<object, string>();

    const assetKinds = new Map<string, TrackedAssetKind>();
    const packageAssetIds = new Set<string>();
    const packageAssetPaths = new Map<string, string>();
    const dirtySplatAssetIds = new Set<string>();
    const splatSnapshotAssetIds = new Set<string>();
    const workingOverrideAssetIds = new Set<string>();
    let preferredEditedSplatPackageFormat: EditedSplatPackageFormat = 'ply';

    const emitDocStatusChanged = () => {
        events.fire('doc.statusChanged', {
            name: docName,
            stateDirty,
            packageDirty
        });
    };

    const setDocName = (name: string) => {
        if (name !== docName) {
            docName = name;
            events.fire('doc.name', docName);
            emitDocStatusChanged();
        }
    };

    const setDirtyFlags = (nextStateDirty: boolean, nextPackageDirty: boolean) => {
        if (stateDirty === nextStateDirty && packageDirty === nextPackageDirty) {
            return;
        }

        stateDirty = nextStateDirty;
        packageDirty = nextPackageDirty;
        emitDocStatusChanged();
    };

    const withDirtyTrackingSuspended = async <T>(fn: () => Promise<T> | T) => {
        suppressDirtyTracking++;
        try {
            return await fn();
        } finally {
            suppressDirtyTracking--;
        }
    };

    const clearTrackingState = () => {
        elementAssetIds = new WeakMap<object, string>();
        assetKinds.clear();
        packageAssetIds.clear();
        packageAssetPaths.clear();
        dirtySplatAssetIds.clear();
        splatSnapshotAssetIds.clear();
        workingOverrideAssetIds.clear();
    };

    const resetDocContext = () => {
        currentProjectId = null;
        currentPackageRevision = null;
        currentPackageFingerprint = null;
        currentPackageBlob = null;
        setDirtyFlags(false, false);
        clearTrackingState();
    };

    const getOrAssignElementAssetId = (element: Splat | Model, kind: TrackedAssetKind) => {
        const existing = elementAssetIds.get(element);
        if (existing) {
            assetKinds.set(existing, kind);
            return existing;
        }
        const next = createId(`asset-${kind}`);
        elementAssetIds.set(element, next);
        assetKinds.set(next, kind);
        return next;
    };

    const rememberLoadedAsset = (element: Splat | Model, kind: TrackedAssetKind, assetId: string, packagePath?: string | null) => {
        elementAssetIds.set(element, assetId);
        assetKinds.set(assetId, kind);
        if (packagePath) {
            packageAssetIds.add(assetId);
            packageAssetPaths.set(assetId, packagePath);
        }
    };

    const markDirty = () => {
        if (suppressDirtyTracking > 0 || !bootstrapDirtyTrackingReady) {
            return;
        }
        setDirtyFlags(true, true);
    };

    const markSplatSnapshotDirty = (splats: Splat[]) => {
        if (suppressDirtyTracking > 0 || !bootstrapDirtyTrackingReady) {
            return;
        }
        splats.forEach((splat) => {
            const assetId = elementAssetIds.get(splat);
            if (assetId) {
                dirtySplatAssetIds.add(assetId);
                splatSnapshotAssetIds.add(assetId);
            }
        });
        setDirtyFlags(true, true);
    };

    const needsResetConfirmation = () => {
        const splats = ((events.invoke('scene.allSplats') as Splat[] | undefined) ?? []).length;
        const models = scene.getElementsByType(ElementType.model).length;
        return splats > 0 || models > 0 || !!docName || stateDirty || packageDirty || !!currentProjectId;
    };

    const finalizeBootstrapDirtyTracking = () => {
        if (bootstrapDirtyTrackingReady) {
            return;
        }

        bootstrapDirtyTrackingReady = true;

        const splats = ((events.invoke('scene.allSplats') as Splat[] | undefined) ?? []).length;
        const models = scene.getElementsByType(ElementType.model).length;
        const hasSceneContent = splats > 0 || models > 0;
        const hasDocumentContext = !!docName || !!currentProjectId;

        if (!hasDocumentContext && hasSceneContent) {
            setDirtyFlags(true, true);
            return;
        }

        if (!hasDocumentContext && !hasSceneContent) {
            setDirtyFlags(false, false);
        }
    };

    const getResetConfirmation = async () => {
        if (stateDirty || packageDirty) {
            if (!currentProjectId) {
                const result = await events.invoke('showPopup', {
                    type: 'info',
                    header: localize('doc.reset'),
                    message: localize('doc.transition.unsaved-no-project-message'),
                    buttons: [
                        {
                            label: localize('doc.transition.save-package'),
                            action: 'save-package'
                        },
                        {
                            label: localize('doc.transition.discard'),
                            action: 'discard'
                        },
                        {
                            label: localize('popup.cancel'),
                            action: 'cancel'
                        }
                    ]
                });

                switch (result.action) {
                    case 'save-package':
                        return await events.invoke('doc.savePackage');
                    case 'discard':
                        return true;
                    default:
                        return false;
                }
            }

            if (stateDirty) {
                const result = await events.invoke('showPopup', {
                    type: 'info',
                    header: localize('doc.reset'),
                    message: localize('doc.transition.unsaved-message'),
                    buttons: [
                        {
                            label: localize('doc.transition.save-package'),
                            action: 'save-package'
                        },
                        {
                            label: localize('doc.transition.save-state'),
                            action: 'save-state'
                        },
                        {
                            label: localize('doc.transition.discard'),
                            action: 'discard'
                        },
                        {
                            label: localize('popup.cancel'),
                            action: 'cancel'
                        }
                    ]
                });

                switch (result.action) {
                    case 'save-package':
                        return await events.invoke('doc.savePackage');
                    case 'save-state':
                        return await events.invoke('doc.save');
                    case 'discard':
                        return true;
                    default:
                        return false;
                }
            }

            const result = await events.invoke('showPopup', {
                type: 'info',
                header: localize('doc.reset'),
                message: localize('doc.transition.package-outdated-message'),
                buttons: [
                    {
                        label: localize('doc.transition.save-package'),
                        action: 'save-package'
                    },
                    {
                        label: localize('doc.transition.continue-with-working-state'),
                        action: 'continue-with-working-state'
                    },
                    {
                        label: localize('popup.cancel'),
                        action: 'cancel'
                    }
                ]
            });

            switch (result.action) {
                case 'save-package':
                    return await events.invoke('doc.savePackage');
                case 'continue-with-working-state':
                    return true;
                default:
                    return false;
            }
        }

        const messageKey = stateDirty ?
            'doc.unsaved-message' :
            packageDirty ?
                'doc.package-outdated-message' :
                'doc.reset-message';

        const result = await events.invoke('showPopup', {
            type: 'yesno',
            header: localize('doc.reset'),
            message: localize(messageKey)
        });

        return result.action === 'yes';
    };

    const resetScene = async () => {
        await withDirtyTrackingSuspended(() => {
            events.fire('scene.clear');
            events.fire('camera.reset');
        });
        events.fire('doc.setName', null);
        documentFileHandle = null;
        resetDocContext();
    };

    const getModelBlob = async (model: Model) => {
        const stored = scene.assetLoader.getSourceBlob(model);
        if (stored instanceof Blob) {
            return stored;
        }

        const file = model.asset?.file as any;
        if (file?.contents instanceof Blob) {
            return file.contents;
        }
        if (file?.contents instanceof Response) {
            return await file.contents.clone().blob();
        }
        if (file?.url) {
            const response = await fetch(file.url);
            if (!response.ok) {
                throw new Error(`Failed to fetch model data: ${response.status} ${response.statusText}`);
            }
            return await response.blob();
        }

        throw new Error(`Model source not available for '${model.name}'`);
    };

    const getSplatSourceBlob = async (splat: Splat) => {
        const stored = scene.assetLoader.getSourceBlob(splat);
        if (stored instanceof Blob) {
            return stored;
        }

        const file = splat.asset?.file as any;
        if (file?.contents instanceof Blob) {
            return file.contents;
        }
        if (file?.contents instanceof Response) {
            return await file.contents.clone().blob();
        }

        return null;
    };

    const splitPathExt = (path: string) => {
        const normalized = path.replace(/\\/g, '/');
        const slash = normalized.lastIndexOf('/');
        const dot = normalized.lastIndexOf('.');
        const hasExt = dot > slash;
        return {
            normalized,
            base: hasExt ? normalized.slice(0, dot) : normalized,
            ext: hasExt ? normalized.slice(dot) : ''
        };
    };

    const ensureUniquePackagePath = (usedPaths: Set<string>, preferredPath: string | null | undefined, fallbackPath: string) => {
        const candidateRaw = (typeof preferredPath === 'string' && preferredPath.trim().length > 0) ? preferredPath : fallbackPath;
        const { normalized, base, ext } = splitPathExt(candidateRaw);
        let candidate = normalized;
        let suffix = 1;
        while (usedPaths.has(candidate)) {
            candidate = `${base}_${suffix}${ext}`;
            suffix++;
        }
        usedPaths.add(candidate);
        return candidate;
    };

    const resolveSplatPackagePath = (
        entry: SerializedAssetEntry,
        index: number,
        preserveSource: boolean,
        fallbackFormat: EditedSplatPackageFormat = 'ply'
    ) => {
        if (!preserveSource) {
            return `splat_${index}.${fallbackFormat}`;
        }

        if (entry.packagePath) {
            return entry.packagePath;
        }

        const sourceName = (entry.element as Splat).filename;
        const { ext } = splitPathExt(sourceName ?? '');
        return `splat_${index}${ext || '.ply'}`;
    };

    const resolveModelPackagePath = (entry: SerializedAssetEntry, index: number) => {
        if (entry.packagePath) {
            return entry.packagePath;
        }

        const sourceName = ((entry.element as Model).asset?.file as any)?.filename ?? entry.filename;
        const { ext } = splitPathExt(sourceName ?? '');
        return `models/model_${index}${ext || '.glb'}`;
    };

    const resolveWorkingSplatFilename = (splat: Splat, assetId: string, index: number) => {
        return packageAssetPaths.get(assetId) ?? splat.filename ?? `splat_${index}.ply`;
    };

    const resolveWorkingModelFilename = (model: Model, assetId: string, index: number) => {
        return packageAssetPaths.get(assetId) ??
            ((model.asset?.file as any)?.filename ?? model.name ?? `model_${index}.glb`);
    };

    const collectSerializedSceneState = (mode: 'working' | 'package'): SerializedSceneState => {
        const splats = (events.invoke('scene.allSplats') as Splat[] | null) ?? [];
        const models = scene.getElementsByType(ElementType.model) as Model[];
        const referenceImagesState = events.invoke('docSerialize.referenceImages');
        const referenceImagesAssetsRaw = (events.invoke('referenceImages.docAssets') as Array<{ path: string; blob: Blob; }> | null) ?? [];
        const referenceImageAssets = referenceImagesAssetsRaw
        .filter(asset => !!asset?.blob && typeof asset?.path === 'string' && asset.path.length > 0)
        .map(asset => ({
            path: asset.path,
            blob: asset.blob
        }));

        const assetEntries: SerializedAssetEntry[] = [];
        const splatDocs = splats.map((splat, index) => {
            const assetId = getOrAssignElementAssetId(splat, 'splat');
            const filename = mode === 'package' ? `splat_${index}.ply` : resolveWorkingSplatFilename(splat, assetId, index);
            assetEntries.push({
                id: assetId,
                kind: 'splat',
                filename,
                packagePath: packageAssetPaths.get(assetId) ?? null,
                element: splat
            });
            return {
                ...splat.docSerialize(),
                assetId,
                filename
            };
        });

        const modelDocs = models.map((model, index) => {
            const assetId = getOrAssignElementAssetId(model, 'model');
            const filename = mode === 'package' ? `models/model_${index}.glb` : resolveWorkingModelFilename(model, assetId, index);
            assetEntries.push({
                id: assetId,
                kind: 'model',
                filename,
                packagePath: packageAssetPaths.get(assetId) ?? null,
                element: model
            });
            return {
                ...model.docSerialize(),
                assetId,
                filename
            };
        });

        return {
            splats,
            models,
            splatDocs,
            modelDocs,
            assetEntries,
            cameraState: scene.camera.docSerialize(),
            viewState: events.invoke('docSerialize.view'),
            poseSetsState: events.invoke('docSerialize.poseSets'),
            timelineState: events.invoke('docSerialize.timeline'),
            cameraFramesState: events.invoke('docSerialize.cameraFrames'),
            referenceImagesState,
            referenceImageAssets,
            lightingState: scene.docSerializeLighting()
        };
    };

    const buildWorkingSnapshotDocument = (serialized: SerializedSceneState): WorkingSnapshotDocument => {
        return {
            version: 0,
            schemaVersion: DOC_VERSION,
            workingStateVersion: WORKING_STATE_VERSION,
            projectId: currentProjectId ?? createId('project'),
            basePackageRevision: currentPackageRevision,
            basePackageFingerprint: currentPackageFingerprint,
            camera: serialized.cameraState,
            view: serialized.viewState,
            poseSets: serialized.poseSetsState,
            timeline: serialized.timelineState,
            cameraFrames: serialized.cameraFramesState,
            referenceImages: serialized.referenceImagesState ?? undefined,
            splats: serialized.splatDocs,
            models: serialized.modelDocs,
            lighting: serialized.lightingState
        };
    };

    const buildPackageAssetSavePlans = async (
        serialized: SerializedSceneState,
        editedSplatFormat: EditedSplatPackageFormat
    ) => {
        const assetPlanById = new Map<string, PackageAssetSavePlan>();
        let usedSogFallback = false;
        const totalEditedSplats = serialized.assetEntries.reduce((sum, entry) => {
            return sum + ((entry.kind === 'splat' && splatSnapshotAssetIds.has(entry.id)) ? 1 : 0);
        }, 0);
        const usedPaths = new Set<string>();
        serialized.referenceImageAssets.forEach((asset) => {
            if (typeof asset?.path === 'string' && asset.path) {
                usedPaths.add(asset.path.replace(/\\/g, '/'));
            }
        });

        let splatIndex = 0;
        let modelIndex = 0;
        let editedSplatIndex = 0;

        for (const entry of serialized.assetEntries) {
            if (entry.kind === 'model') {
                const blob = await getModelBlob(entry.element as Model);
                const outputPath = ensureUniquePackagePath(
                    usedPaths,
                    resolveModelPackagePath(entry, modelIndex),
                    `models/model_${modelIndex}.glb`
                );

                assetPlanById.set(entry.id, {
                    entry,
                    outputPath,
                    mode: 'copy-blob',
                    blob
                });
                modelIndex++;
                continue;
            }

            const assetId = entry.id;
            const sourceBlob = await getSplatSourceBlob(entry.element as Splat);
            const hasSnapshotOverride = splatSnapshotAssetIds.has(assetId);
            const canCopyPackageEntry =
                !hasSnapshotOverride &&
                !!entry.packagePath &&
                currentPackageBlob instanceof Blob;
            const canCopySourceBlob = !hasSnapshotOverride && sourceBlob instanceof Blob;

            let mode: PackageAssetSaveMode = 'serialize-ply';
            let outputPath = `splat_${splatIndex}.${editedSplatFormat}`;
            let blob: Blob | undefined;
            let sourcePath: string | undefined;

            if (canCopyPackageEntry) {
                mode = 'copy-package-entry';
                sourcePath = entry.packagePath ?? undefined;
                outputPath = resolveSplatPackagePath(entry, splatIndex, true);
            } else if (canCopySourceBlob) {
                mode = 'copy-blob';
                blob = sourceBlob ?? undefined;
                outputPath = resolveSplatPackagePath(entry, splatIndex, true);
            } else {
                if (editedSplatFormat === 'sog') {
                    try {
                        editedSplatIndex++;
                        const progressHeader = localize('doc.save-package-options.sog-progress', {
                            current: formatInteger(editedSplatIndex),
                            total: formatInteger(totalEditedSplats)
                        });
                        blob = await serializeSplatToSogBlob(entry.element as Splat, events, progressHeader);
                        mode = 'copy-blob';
                        outputPath = resolveSplatPackagePath(entry, splatIndex, false, 'sog');
                    } catch (error) {
                        usedSogFallback = true;
                        console.warn(`SOG package pre-serialization failed for '${entry.filename}', falling back to PLY`, error);
                        mode = 'serialize-ply';
                        outputPath = resolveSplatPackagePath(entry, splatIndex, false, 'ply');
                    }
                } else {
                    outputPath = resolveSplatPackagePath(entry, splatIndex, false, 'ply');
                }
            }

            const defaultOutputPath = blob && editedSplatFormat === 'sog' ? `splat_${splatIndex}.sog` : `splat_${splatIndex}.ply`;
            outputPath = ensureUniquePackagePath(usedPaths, outputPath, defaultOutputPath);

            assetPlanById.set(assetId, {
                entry,
                outputPath,
                mode,
                ...(blob ? { blob } : {}),
                ...(sourcePath ? { sourcePath } : {})
            });
            splatIndex++;
        }

        serialized.splatDocs.forEach((doc) => {
            const plan = assetPlanById.get(doc.assetId);
            if (plan) {
                doc.filename = plan.outputPath;
            }
        });
        serialized.modelDocs.forEach((doc) => {
            const plan = assetPlanById.get(doc.assetId);
            if (plan) {
                doc.filename = plan.outputPath;
            }
        });
        serialized.assetEntries.forEach((entry) => {
            const plan = assetPlanById.get(entry.id);
            if (plan) {
                entry.filename = plan.outputPath;
            }
        });

        return {
            assetPlanById,
            usedSogFallback
        };
    };

    const runWorkingStateCleanup = async (keepProjectId?: string | null) => {
        try {
            const result = await projectSaveStateStore.cleanup({
                keepProjectIds: keepProjectId ? [keepProjectId] : []
            });
            if (result.removedProjects > 0 || result.removedLinks > 0) {
                console.info('cleaned local working state', result);
            }
        } catch (error) {
            console.warn('working state cleanup failed', error);
        }
    };

    const reclaimWorkingStateBudget = async () => {
        if (!currentProjectId) {
            return;
        }

        try {
            const result = await projectSaveStateStore.cleanup({
                keepProjectIds: [currentProjectId],
                maxProjects: 1,
                maxBytes: 0
            });
            if (result.removedProjects > 0 || result.removedLinks > 0) {
                console.info('reclaimed local working state budget before save', result);
            }
        } catch (error) {
            console.warn('failed to reclaim working state budget before save', error);
        }
    };

    const handleWorkingStateQuotaExceeded = async () => {
        const result = await events.invoke('showPopup', {
            type: 'info',
            header: localize('doc.save-working-state-quota.header'),
            message: localize('doc.save-working-state-quota.message'),
            buttons: [
                {
                    label: localize('doc.transition.save-package'),
                    action: 'save-package'
                },
                {
                    label: localize('popup.cancel'),
                    action: 'cancel'
                }
            ]
        });

        if (result.action === 'save-package') {
            return await events.invoke('doc.savePackage');
        }

        return false;
    };

    const clearLocalWorkingState = async () => {
        const stats = await projectSaveStateStore.getStats();
        if (stats.projectCount === 0) {
            await events.invoke('showPopup', {
                type: 'info',
                header: localize('doc.cleanup.header'),
                message: localize('doc.cleanup.empty-message')
            });
            return true;
        }

        const hasCurrentUnsavedState = stateDirty || packageDirty;
        const result = await events.invoke('showPopup', {
            type: 'info',
            header: localize('doc.cleanup.header'),
            message: localize(
                hasCurrentUnsavedState ?
                    'doc.cleanup.confirm-message-current' :
                    'doc.cleanup.confirm-message',
                {
                    count: formatInteger(stats.projectCount),
                    size: formatStorageSize(stats.totalBytes)
                }
            ),
            buttons: [
                {
                    label: localize('doc.cleanup.clear'),
                    action: 'clear'
                },
                {
                    label: localize('popup.cancel'),
                    action: 'cancel'
                }
            ]
        });

        if (result.action !== 'clear') {
            return false;
        }

        events.fire('startSpinner');
        try {
            const cleanup = await projectSaveStateStore.clearAll();
            if (stateDirty || packageDirty) {
                setDirtyFlags(stateDirty || packageDirty, packageDirty);
            }
            await events.invoke('showPopup', {
                type: 'info',
                header: localize('doc.cleanup.header'),
                message: localize('doc.cleanup.success', {
                    count: formatInteger(cleanup.removedProjects),
                    size: formatStorageSize(cleanup.freedBytes)
                })
            });
            return true;
        } catch (error) {
            console.error('clearLocalWorkingState failed', error);
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.cleanup.failed'),
                message: `'${(error as Error)?.message ?? error}'`
            });
            return false;
        } finally {
            events.fire('stopSpinner');
        }
    };

    const saveWorkingState = async () => {
        if (!currentProjectId) {
            return false;
        }
        if (!stateDirty) {
            return true;
        }

        events.fire('startSpinner');
        try {
            const serialized = collectSerializedSceneState('working');
            const previousRecord = await projectSaveStateStore.load(currentProjectId);
            const previousAssets = new Map<string, WorkingAssetRecord>();
            previousRecord?.assets?.forEach(asset => previousAssets.set(asset.id, asset));

            const assets: WorkingAssetRecord[] = [];

            for (const entry of serialized.assetEntries) {
                const inPackage = packageAssetIds.has(entry.id);
                const previous = previousAssets.get(entry.id) ?? null;

                if (entry.kind === 'model') {
                    if (inPackage) {
                        continue;
                    }
                    assets.push({
                        id: entry.id,
                        kind: entry.kind,
                        blob: previous?.blob ?? await getModelBlob(entry.element as Model),
                        storage: 'source'
                    });
                    continue;
                }

                const isDirtySplat = dirtySplatAssetIds.has(entry.id);
                const needsOverride = !inPackage || isDirtySplat || workingOverrideAssetIds.has(entry.id);
                if (!needsOverride) {
                    continue;
                }

                const previousStorage = previous?.storage ?? 'snapshot';
                const sourceBlob = await getSplatSourceBlob(entry.element as Splat);
                let blob: Blob;
                let storage: WorkingAssetStorage = 'snapshot';

                if (isDirtySplat || splatSnapshotAssetIds.has(entry.id)) {
                    blob = await serializeSplatToBlob(entry.element as Splat);
                } else if (previous?.blob && previousStorage === 'source') {
                    blob = previous.blob;
                    storage = 'source';
                } else if (sourceBlob instanceof Blob) {
                    blob = sourceBlob;
                    storage = 'source';
                } else if (previous?.blob) {
                    blob = previous.blob;
                } else {
                    blob = await serializeSplatToBlob(entry.element as Splat);
                }

                assets.push({
                    id: entry.id,
                    kind: entry.kind,
                    blob,
                    storage
                });
            }

            const record: WorkingProjectRecord = {
                projectId: currentProjectId,
                savedAt: Date.now(),
                packageRevision: currentPackageRevision,
                packageFingerprint: currentPackageFingerprint,
                snapshot: buildWorkingSnapshotDocument(serialized),
                assets,
                referenceImageAssets: serialized.referenceImageAssets
            };

            await reclaimWorkingStateBudget();
            await projectSaveStateStore.save(record);
            await projectSaveStateStore.setProjectLink(currentPackageFingerprint, currentProjectId);
            await runWorkingStateCleanup(currentProjectId);

            dirtySplatAssetIds.clear();
            workingOverrideAssetIds.clear();
            assets.forEach(asset => workingOverrideAssetIds.add(asset.id));
            setDirtyFlags(false, true);
            events.fire('doc.saved');
            return true;
        } catch (error) {
            if (isQuotaExceededError(error)) {
                console.warn('working state save exceeded browser quota', error);
                return await handleWorkingStateQuotaExceeded();
            }
            console.error('saveWorkingState failed', error);
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.save-failed'),
                message: `'${(error as Error)?.message ?? error}'`
            });
            return false;
        } finally {
            events.fire('stopSpinner');
        }
    };

    const resolveSavePackageContext = async (): Promise<SavePackageContext | null> => {
        const serialized = collectSerializedSceneState('package');
        const hasEditedSplats = serialized.assetEntries.some((entry) => {
            return entry.kind === 'splat' && splatSnapshotAssetIds.has(entry.id);
        });

        if (!hasEditedSplats) {
            return {
                serialized,
                editedSplatFormat: 'ply'
            };
        }

        const sogAvailable = await canSerializeSog();
        if (!sogAvailable) {
            preferredEditedSplatPackageFormat = 'ply';
            return {
                serialized,
                editedSplatFormat: 'ply'
            };
        }

        const result = await events.invoke('showPopup', {
            type: 'info',
            header: localize('doc.save-package-options.header'),
            message: localize('doc.save-package-options.message'),
            select: {
                label: localize('doc.save-package-options.edited-splat-format'),
                value: preferredEditedSplatPackageFormat,
                options: [
                    {
                        label: localize('doc.save-package-options.edited-splat-format.ply'),
                        value: 'ply'
                    },
                    {
                        label: localize('doc.save-package-options.edited-splat-format.sog'),
                        value: 'sog'
                    }
                ]
            },
            buttons: [
                {
                    label: localize('doc.transition.save-package'),
                    action: 'save'
                },
                {
                    label: localize('popup.cancel'),
                    action: 'cancel'
                }
            ]
        });

        if (result.action !== 'save') {
            return null;
        }

        const editedSplatFormat: EditedSplatPackageFormat = result.value === 'sog' ? 'sog' : 'ply';

        preferredEditedSplatPackageFormat = editedSplatFormat;

        return {
            serialized,
            editedSplatFormat
        };
    };

    const savePackageDocument = async (options: {
        stream?: FileSystemWritableFileStream;
        filename?: string;
        handle?: FileSystemFileHandle | null;
        serialized: SerializedSceneState;
        editedSplatFormat: EditedSplatPackageFormat;
    }): Promise<boolean> => {
        events.fire('startSpinner');
        let saveStep = 'init';
        let saved = false;
        let spinnerStopped = false;
        let jsonLength = 0;
        let sourcePackageZip: ZipReadFileSystem | null = null;
        let sourcePackageBlobSource: BlobReadSource | null = null;
        let usedSogFallback = false;

        try {
            const nextProjectId = currentProjectId ?? createId('project');
            const nextPackageRevision = (currentPackageRevision ?? 0) + 1;
            const { serialized, editedSplatFormat } = options;
            const packagePlans = await buildPackageAssetSavePlans(serialized, editedSplatFormat);
            const { assetPlanById } = packagePlans;
            usedSogFallback = packagePlans.usedSogFallback;
            const modelBlobMap = new Map<Model, Blob>();
            serialized.models.forEach((model, index) => {
                const doc = serialized.modelDocs[index];
                const plan = assetPlanById.get(doc.assetId);
                if (plan?.blob) {
                    modelBlobMap.set(model, plan.blob);
                }
            });

            const referenceImagesBytes = serialized.referenceImageAssets.reduce((sum, asset) => {
                return sum + BigInt(asset?.blob?.size ?? 0);
            }, 0n);
            const referenceImagesEntryCount = BigInt(serialized.referenceImageAssets.length);

            const createDocumentPayload = (zip64: boolean) => ({
                version: 0,
                schemaVersion: DOC_VERSION,
                ...(zip64 ? { zip64: true } : {}),
                projectId: nextProjectId,
                packageRevision: nextPackageRevision,
                camera: serialized.cameraState,
                view: serialized.viewState,
                poseSets: serialized.poseSetsState,
                timeline: serialized.timelineState,
                cameraFrames: serialized.cameraFramesState,
                referenceImages: serialized.referenceImagesState ?? undefined,
                splats: serialized.splatDocs,
                models: serialized.modelDocs,
                lighting: serialized.lightingState
            });

            saveStep = 'estimate document size';
            const provisionalDoc = createDocumentPayload(true);
            const estimate = estimateDocumentSize(
                provisionalDoc,
                serialized.splats,
                (splat, index) => {
                    const doc = serialized.splatDocs[index];
                    const plan = assetPlanById.get(doc.assetId);
                    if (!plan || plan.mode === 'serialize-ply' || !(plan.blob instanceof Blob)) {
                        return estimateSplatPlySize(splat);
                    }
                    return BigInt(plan.blob.size);
                },
                serialized.models,
                model => modelBlobMap.get(model) ?? null,
                referenceImagesBytes,
                referenceImagesEntryCount
            );
            const useZip64 = estimate.total >= ZIP64_MARGIN_BYTES || estimate.total > ZIP32_LIMIT;
            const document = createDocumentPayload(useZip64);

            if (!options.stream && useZip64 && !hasFileSystemAccess()) {
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('doc.save-failed'),
                    message: 'この環境では大容量プロジェクトの保存に対応していません。File System Access API 対応ブラウザで保存してください。'
                });
                return false;
            }

            const readSourcePackageEntry = async (path: string) => {
                if (!(currentPackageBlob instanceof Blob)) {
                    throw new Error(`Package source not available for '${path}'`);
                }
                if (!sourcePackageBlobSource || !sourcePackageZip) {
                    sourcePackageBlobSource = new BlobReadSource(currentPackageBlob);
                    sourcePackageZip = new ZipReadFileSystem(sourcePackageBlobSource);
                }
                const source = await sourcePackageZip.createSource(path);
                try {
                    const data = await source.read().readAll();
                    return new Blob([new Uint8Array(data)]);
                } finally {
                    source.close();
                }
            };

            saveStep = 'create writer';
            const browserFs = new BrowserFileSystem(options.filename ?? 'scene.ssproj', options.stream);
            const browserWriter = await browserFs.createWriter(options.filename ?? 'scene.ssproj');
            const zipFs = new DeflateZipFileSystem(browserWriter);

            saveStep = 'write document.json';
            const documentJson = JSON.stringify(document);
            jsonLength = documentJson.length;
            const docWriter = await zipFs.createWriter('document.json');
            await docWriter.write(new TextEncoder().encode(documentJson));
            await docWriter.close();

            for (let i = 0; i < serialized.splats.length; i++) {
                const doc = serialized.splatDocs[i];
                const plan = assetPlanById.get(doc.assetId);
                if (!plan) {
                    throw new Error(`Missing package save plan for splat '${doc.assetId}'`);
                }

                saveStep = `write ${plan.outputPath}`;
                if (plan.mode === 'serialize-ply') {
                    await serializePly([serialized.splats[i]], {
                        keepStateData: false,
                        keepWorldTransform: true,
                        keepColorTint: true
                    }, zipFs, plan.outputPath);
                } else if (plan.mode === 'copy-package-entry') {
                    await writeBlobToZip(zipFs, plan.outputPath, await readSourcePackageEntry(plan.sourcePath ?? plan.outputPath));
                } else {
                    await writeBlobToZip(zipFs, plan.outputPath, plan.blob ?? await getSplatSourceBlob(serialized.splats[i]));
                }
            }

            for (let i = 0; i < serialized.models.length; i++) {
                const doc = serialized.modelDocs[i];
                const plan = assetPlanById.get(doc.assetId);
                if (!plan?.blob) {
                    throw new Error(`Missing package save plan for model '${doc.assetId}'`);
                }
                saveStep = `write ${plan.outputPath}`;
                await writeBlobToZip(zipFs, plan.outputPath, plan.blob);
            }

            for (const asset of serialized.referenceImageAssets) {
                if (!asset?.blob || typeof asset?.path !== 'string' || !asset.path) {
                    continue;
                }
                saveStep = `write ${asset.path}`;
                await writeBlobToZip(zipFs, asset.path, asset.blob);
            }

            saveStep = 'finalize zip';
            await zipFs.close();
            saved = true;

            currentProjectId = nextProjectId;
            currentPackageRevision = nextPackageRevision;
            currentPackageFingerprint = null;
            if (options.handle) {
                try {
                    const savedFile = await options.handle.getFile();
                    currentPackageBlob = savedFile;
                    currentPackageFingerprint = createPackageFingerprint(options.handle.name, savedFile.size, documentJson);
                } catch (error) {
                    console.warn('failed to refresh package fingerprint after save', error);
                    currentPackageBlob = null;
                }
            } else if (options.filename) {
                currentPackageBlob = null;
                currentPackageFingerprint = createPackageFingerprint(options.filename, documentJson.length, documentJson);
            }

            await projectSaveStateStore.clear(currentProjectId);
            await projectSaveStateStore.setProjectLink(currentPackageFingerprint, currentProjectId);
            await runWorkingStateCleanup(currentProjectId);

            setDirtyFlags(false, false);
            dirtySplatAssetIds.clear();
            splatSnapshotAssetIds.clear();
            workingOverrideAssetIds.clear();
            packageAssetIds.clear();
            packageAssetPaths.clear();
            serialized.splatDocs.forEach((doc) => {
                packageAssetIds.add(doc.assetId);
                packageAssetPaths.set(doc.assetId, doc.filename);
            });
            serialized.modelDocs.forEach((doc) => {
                packageAssetIds.add(doc.assetId);
                packageAssetPaths.set(doc.assetId, doc.filename);
            });

            if (options.handle) {
                documentFileHandle = options.handle;
                recentFiles.add(options.handle);
                events.fire('doc.setName', options.handle.name);
            } else if (options.filename) {
                documentFileHandle = null;
                events.fire('doc.setName', options.filename);
            }

            events.fire('doc.saved');
            if (usedSogFallback) {
                events.fire('stopSpinner');
                spinnerStopped = true;
                await events.invoke('showPopup', {
                    type: 'info',
                    header: localize('doc.save-package-options.sog-fallback.header'),
                    message: localize('doc.save-package-options.sog-fallback.message')
                });
            }
            return true;
        } catch (error) {
            const errorName = (error as Error & { name?: string })?.name;
            const errorMessage = (error as Error)?.message ?? `${error}`;
            const fullMessage = `${saveStep}${errorName ? ` | ${errorName}` : ''} | ${errorMessage}`;
            console.error('savePackageDocument failed', {
                saveStep,
                jsonLength,
                error
            });
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.save-failed'),
                message: `'${fullMessage}'`
            });
            return false;
        } finally {
            sourcePackageZip?.close();
            sourcePackageBlobSource?.close();
            if (!saved && options.stream) {
                await cleanupWritableStream(options.stream);
            }
            if (!spinnerStopped) {
                events.fire('stopSpinner');
            }
        }
    };

    const readZipBlobsForReferenceImages = async (
        zipFs: ZipReadFileSystem,
        docState: any,
        blobs: Map<string, Blob>
    ) => {
        const readZipBlob = async (path: string) => {
            const source = await zipFs.createSource(path);
            try {
                const data = await source.read().readAll();
                return new Blob([new Uint8Array(data)]);
            } finally {
                source.close();
            }
        };

        if (docState?.assets && Array.isArray(docState.assets)) {
            for (const asset of docState.assets) {
                const assetId = asset?.id;
                const filename = asset?.source?.filename;
                if (typeof assetId !== 'string' || !assetId || typeof filename !== 'string' || !filename) {
                    continue;
                }
                const safeName = normalizeReferenceImageFilename(filename);
                const refPath = `reference-images/assets/${assetId}/${safeName}`;
                if (blobs.has(refPath)) {
                    continue;
                }
                try {
                    blobs.set(refPath, await readZipBlob(refPath));
                } catch (error) {
                    console.warn(`reference image missing: ${refPath}`, error);
                }
            }
        }

        if (docState?.items && Array.isArray(docState.items)) {
            for (const item of docState.items) {
                const id = item?.id;
                const filename = item?.source?.filename;
                if (typeof id !== 'string' || !id || typeof filename !== 'string' || !filename) {
                    continue;
                }
                const safeName = normalizeReferenceImageFilename(filename);
                const refPath = `reference-images/${id}/${safeName}`;
                if (blobs.has(refPath)) {
                    continue;
                }
                try {
                    blobs.set(refPath, await readZipBlob(refPath));
                } catch (error) {
                    console.warn(`reference image missing: ${refPath}`, error);
                }
            }
            return;
        }

        if (docState?.source?.filename) {
            const safeName = normalizeReferenceImageFilename(docState.source.filename);
            const refPath = `reference-image/${safeName}`;
            if (blobs.has(refPath)) {
                return;
            }
            try {
                blobs.set(refPath, await readZipBlob(refPath));
            } catch (error) {
                console.warn(`reference image missing: ${refPath}`, error);
            }
        }
    };

    const loadSplatFromBlob = async (filename: string, blob: Blob) => {
        const fs = new MappedReadFileSystem();
        fs.addFile(filename, blob);
        const splat = await scene.assetLoader.load(filename, fs, false, blob, true);
        if (!(splat instanceof Splat)) {
            throw new Error(`document contains a non-splat asset: ${filename}`);
        }
        if (splat.numSplats === 0) {
            throw new Error(`loaded splat has no points: ${filename}`);
        }
        return splat;
    };

    const loadDocument = async (file: Blob | ArrayBuffer, sourceName?: string | null): Promise<LoadResult> => {
        events.fire('startSpinner');

        const blob = (file instanceof Blob) ? file : new Blob([file]);
        const blobSource = new BlobReadSource(blob);
        const zipFs = new ZipReadFileSystem(blobSource);

        const readZipBlob = async (path: string) => {
            const source = await zipFs.createSource(path);
            try {
                const data = await source.read().readAll();
                return new Blob([new Uint8Array(data)]);
            } finally {
                source.close();
            }
        };

        try {
            const docSource = await zipFs.createSource('document.json');
            const docData = await docSource.read().readAll();
            docSource.close();

            let rawDocument: any;
            try {
                rawDocument = JSON.parse(new TextDecoder().decode(docData));
            } catch {
                throw new Error('document.json is not valid JSON');
            }

            const docVersion = (typeof rawDocument?.version === 'number' && isFinite(rawDocument.version)) ? rawDocument.version : 0;
            if (!SUPPORTED_DOC_VERSIONS.has(docVersion)) {
                throw new Error(`Unsupported document version: ${docVersion}`);
            }

            if (!Array.isArray(rawDocument?.splats)) {
                throw new Error('Invalid document: splats are missing');
            }

            const packageDocument = normalizeDocument(rawDocument);
            const packageFingerprint = createPackageFingerprint(
                sourceName ?? null,
                blob.size,
                new TextDecoder().decode(docData)
            );
            let projectId = packageDocument.projectId;
            let workingRecord = projectId ?
                await projectSaveStateStore.load(projectId) :
                await projectSaveStateStore.loadByFingerprint(packageFingerprint);

            if (!projectId && workingRecord?.projectId) {
                projectId = workingRecord.projectId;
            }
            if (!projectId) {
                projectId = createId('project');
            }

            await projectSaveStateStore.setProjectLink(packageFingerprint, projectId);

            if (workingRecord && workingRecord.projectId !== projectId) {
                workingRecord = null;
            }

            const useWorkingState = isWorkingRecordCompatible(workingRecord, packageDocument.packageRevision, packageFingerprint);
            const effectiveDocument = useWorkingState ? normalizeDocument(workingRecord?.snapshot) : packageDocument;
            const workingAssets = new Map<string, WorkingAssetRecord>();
            const workingReferenceImageAssets = new Map<string, Blob>();
            workingRecord?.assets?.forEach((asset) => {
                workingAssets.set(asset.id, asset);
            });
            workingRecord?.referenceImageAssets?.forEach((asset) => {
                if (asset?.blob && typeof asset?.path === 'string' && asset.path) {
                    workingReferenceImageAssets.set(asset.path, asset.blob);
                }
            });

            const packageAssetPathById = new Map<string, string>();
            packageDocument.splats.forEach(entry => packageAssetPathById.set(entry.assetId, entry.filename));
            packageDocument.models.forEach(entry => packageAssetPathById.set(entry.assetId, entry.filename));

            const stagedSplats: Array<{ splat: Splat; settings: any; assetId: string; packagePath: string | null; }> = [];
            for (let i = 0; i < effectiveDocument.splats.length; ++i) {
                const splatSettings = effectiveDocument.splats[i];
                const assetId = splatSettings.assetId;
                const filename = splatSettings.filename;
                const packagePath = packageAssetPathById.get(assetId) ?? null;
                const override = workingAssets.get(assetId);

                let splat: Splat;
                if (override?.blob) {
                    splat = await loadSplatFromBlob(filename, override.blob);
                } else {
                    try {
                        const loaded = await scene.assetLoader.load(filename, zipFs, false, true);
                        if (!(loaded instanceof Splat)) {
                            throw new Error('document contains a non-splat asset');
                        }
                        if (loaded.numSplats === 0) {
                            throw new Error('loaded splat has no points');
                        }
                        splat = loaded;
                    } catch (error) {
                        const fallbackBlob = await readZipBlob(filename);
                        splat = await loadSplatFromBlob(filename, fallbackBlob);
                        console.warn(`fallback splat load used for '${filename}'`, error);
                    }
                }

                stagedSplats.push({ splat, settings: splatSettings, assetId, packagePath });
            }

            const stagedModels: Array<{ model: Model; settings: any; assetId: string; packagePath: string | null; }> = [];
            for (let i = 0; i < effectiveDocument.models.length; ++i) {
                const modelSettings = effectiveDocument.models[i];
                const assetId = modelSettings.assetId;
                const filename = modelSettings.filename;
                const packagePath = packageAssetPathById.get(assetId) ?? null;
                const override = workingAssets.get(assetId);
                const modelBlob = override?.blob ?? await readZipBlob(filename);
                const model = await scene.assetLoader.loadModel(filename.split('/').pop() ?? filename, modelBlob);
                if (!(model instanceof Model)) {
                    throw new Error(`document contains a non-model asset: ${filename}`);
                }
                stagedModels.push({ model, settings: modelSettings, assetId, packagePath });
            }

            await resetScene();

            packageAssetIds.clear();
            packageAssetPaths.clear();
            packageDocument.splats.forEach((entry) => {
                packageAssetIds.add(entry.assetId);
                packageAssetPaths.set(entry.assetId, entry.filename);
            });
            packageDocument.models.forEach((entry) => {
                packageAssetIds.add(entry.assetId);
                packageAssetPaths.set(entry.assetId, entry.filename);
            });

            await withDirtyTrackingSuspended(async () => {
                scene.splatRenderLifecycle.freeze();
                try {
                    for (const { model, settings, assetId, packagePath } of stagedModels) {
                        await scene.add(model);
                        rememberLoadedAsset(model, 'model', assetId, packagePath);
                        model.docDeserialize(settings ?? {});
                    }
                    for (const { splat, settings, assetId, packagePath } of stagedSplats) {
                        await scene.add(splat);
                        rememberLoadedAsset(splat, 'splat', assetId, packagePath);
                        splat.docDeserialize(settings ?? {});
                    }
                } finally {
                    scene.splatRenderLifecycle.unfreeze();
                }

                const _tmpBound = scene.bound;
                if (_tmpBound === null) {
                    console.error('scene bound should not be null after document load');
                }

                events.invoke('docDeserialize.timeline', effectiveDocument.timeline ?? {});
                events.invoke('docDeserialize.poseSets', effectiveDocument.poseSets ?? [], effectiveDocument.camera?.fov);
                events.invoke('docDeserialize.view', effectiveDocument.view ?? {});
                events.invoke('docDeserialize.cameraFrames', effectiveDocument.cameraFrames ?? null);
                scene.camera.docDeserialize(effectiveDocument.camera ?? null);
                scene.docDeserializeLighting(effectiveDocument.lighting ?? null);

                const referenceDocState = effectiveDocument.referenceImages ?? null;
                const referenceBlobs = new Map<string, Blob>(workingReferenceImageAssets);
                await readZipBlobsForReferenceImages(zipFs, packageDocument.referenceImages, referenceBlobs);
                if (useWorkingState) {
                    await readZipBlobsForReferenceImages(zipFs, referenceDocState, referenceBlobs);
                }

                const referenceLoadReport = await events.invoke('docDeserialize.referenceImages', referenceDocState, referenceBlobs) as {
                    missingItems?: number;
                } | null;
                if (referenceLoadReport?.missingItems) {
                    await events.invoke('showPopup', {
                        type: 'info',
                        header: localize('panel.reference-image.title'),
                        message: localize('doc.reference-images.missing', {
                            count: formatInteger(referenceLoadReport.missingItems)
                        })
                    });
                }
                events.fire('cameraFrames.syncReferenceImages');
            });

            const currentSelection = events.invoke('selection');
            if (currentSelection) {
                const pivot = events.invoke('pivot');
                const transform = new Transform();
                const pivotOrigin = events.invoke('pivot.origin');
                currentSelection.getPivot(pivotOrigin, false, transform);
                pivot.place(transform);
            }

            currentProjectId = projectId;
            currentPackageRevision = packageDocument.packageRevision;
            currentPackageFingerprint = packageFingerprint;
            currentPackageBlob = blob;
            dirtySplatAssetIds.clear();
            splatSnapshotAssetIds.clear();
            workingOverrideAssetIds.clear();
            if (useWorkingState) {
                workingRecord?.assets?.forEach((asset) => {
                    workingOverrideAssetIds.add(asset.id);
                    if (asset.kind === 'splat' && asset.storage !== 'source') {
                        splatSnapshotAssetIds.add(asset.id);
                    }
                });
            }
            setDirtyFlags(false, !!useWorkingState);
            runWorkingStateCleanup(projectId).catch((error) => {
                console.warn('working state cleanup failed after load', error);
            });

            scene.scheduleViewportRefresh();
            return { loaded: true };
        } catch (error) {
            console.error('loadDocument failed', error);
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.load-failed'),
                message: `'${(error as Error)?.message ?? error}'`
            });
            return { loaded: false };
        } finally {
            zipFs.close();
            events.fire('stopSpinner');
        }
    };

    events.function('doc.stateDirty', () => stateDirty);
    events.function('doc.packageDirty', () => packageDirty);
    events.function('doc.hasUnsavedChanges', () => stateDirty || packageDirty);
    events.function('doc.hasUnloadWarning', () => stateDirty || (!currentProjectId && packageDirty));
    events.function('doc.localWorkingStateStats', async () => await projectSaveStateStore.getStats());
    events.function('doc.clearLocalWorkingState', async () => await clearLocalWorkingState());
    events.function('doc.status', () => ({
        name: docName,
        stateDirty,
        packageDirty
    }));
    events.on('app.bootstrapComplete', finalizeBootstrapDirtyTracking);

    events.on('edit.apply', (op: EditOp) => {
        const dirtySplats = new Set<Splat>();
        getDirtySplatsFromOp(op, dirtySplats);
        if (dirtySplats.size > 0) {
            markSplatSnapshotDirty([...dirtySplats]);
        } else {
            markDirty();
        }
    });

    events.on('splat.stateChanged', (splat: Splat, changedState = State.selected) => {
        if ((changedState & trackedPerSplatStateMask) !== 0) {
            markSplatSnapshotDirty([splat]);
        }
    });

    events.on('splat.positionsChanged', (splat: Splat, reason: 'snapshot' | 'object-transform' = 'snapshot') => {
        if (reason === 'object-transform') {
            markDirty();
            return;
        }
        markSplatSnapshotDirty([splat]);
    });

    [
        'camera.transform',
        'camera.fov',
        'camera.navMode',
        'camera.ortho',
        'camera.overlay',
        'camera.mode',
        'camera.bound',
        'camera.showPoses',
        'camera.splatSize',
        'camera.flySpeed',
        'camera.tonemapping',
        'bgClr',
        'selectedClr',
        'unselectedClr',
        'lockedClr',
        'view.outlineSelection',
        'view.centersUseGaussianColor',
        'view.bands',
        'grid.visible',
        'eyeLevel.visible',
        'timeline.frames',
        'timeline.frameRate',
        'timeline.frame',
        'timeline.smoothness',
        'cameraFrames.stateChanged',
        'referenceImages.stateChanged',
        'referenceImage.stateChanged',
        'lighting.ambientChanged',
        'modelLight.state',
        'model.name',
        'model.visibility',
        'model.moved',
        'splat.name',
        'splat.visibility',
        'splat.moved',
        'splat.tintClr',
        'splat.temperature',
        'splat.saturation',
        'splat.brightness',
        'splat.blackPoint',
        'splat.whitePoint',
        'splat.transparency'
    ].forEach((eventName) => {
        events.on(eventName, () => {
            markDirty();
        });
    });

    events.on('scene.elementAdded', (element: Splat | Model) => {
        if (element instanceof Splat) {
            getOrAssignElementAssetId(element, 'splat');
            markDirty();
        } else if (element instanceof Model) {
            getOrAssignElementAssetId(element, 'model');
            markDirty();
        }
    });

    events.on('scene.elementRemoved', () => {
        markDirty();
    });

    events.on('scene.clear', () => {
        clearTrackingState();
        setDirtyFlags(false, false);
    });

    events.function('doc.new', async () => {
        if (needsResetConfirmation() && !await getResetConfirmation()) {
            return false;
        }
        await resetScene();
        return true;
    });

    events.function('doc.load', async (file: File | Blob | ArrayBuffer, handle?: FileSystemFileHandle) => {
        if (needsResetConfirmation() && !await getResetConfirmation()) {
            return false;
        }

        const fileName = (file as File)?.name ?? handle?.name ?? null;
        const result = await loadDocument(file, fileName);
        if (!result.loaded) {
            return false;
        }

        if (fileName) {
            events.fire('doc.setName', fileName);
        }

        if (handle) {
            documentFileHandle = handle;
            recentFiles.add(handle);
        } else {
            documentFileHandle = null;
        }

        return true;
    });

    events.function('doc.open', async () => {
        if (needsResetConfirmation() && !await getResetConfirmation()) {
            return false;
        }

        if (fileSelector) {
            fileSelector.show(async (file?: File) => {
                if (!file) {
                    return;
                }
                const result = await loadDocument(file, file.name);
                if (!result.loaded) {
                    return;
                }
                documentFileHandle = null;
                events.fire('doc.setName', file.name);
            });
            return true;
        }

        try {
            const fileHandles = await window.showOpenFilePicker({
                id: 'SuperSplatDocumentOpen',
                multiple: false,
                types: SuperFileType
            });

            if (fileHandles?.length !== 1) {
                return false;
            }

            const fileHandle = fileHandles[0];
            const result = await loadDocument(await fileHandle.getFile(), fileHandle.name);
            if (!result.loaded) {
                return false;
            }

            documentFileHandle = fileHandle;
            events.fire('doc.setName', fileHandle.name);
            recentFiles.add(fileHandle);
            return true;
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') {
                console.error(error);
            }
            return false;
        }
    });

    events.function('doc.openRecent', async (fileHandle: FileSystemFileHandle) => {
        if (needsResetConfirmation() && !await getResetConfirmation()) {
            return false;
        }

        try {
            if (await fileHandle.queryPermission({ mode: 'read' }) !== 'granted') {
                if (await fileHandle.requestPermission({ mode: 'read' }) !== 'granted') {
                    return false;
                }
            }

            const result = await loadDocument(await fileHandle.getFile(), fileHandle.name);
            if (!result.loaded) {
                return false;
            }

            documentFileHandle = fileHandle;
            events.fire('doc.setName', fileHandle.name);
            recentFiles.add(fileHandle);
            return true;
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('popup.error-loading'),
                    message: `${(error as Error)?.message ?? error}`
                });
            }
            return false;
        }
    });

    events.function('doc.save', async () => {
        if (!currentProjectId) {
            return await events.invoke('doc.savePackageAs');
        }
        return await saveWorkingState();
    });

    events.on('doc.save', async () => {
        await events.invoke('doc.save');
    });

    const savePackageAsWithContext = async (saveContext: SavePackageContext) => {
        if (window.showSaveFilePicker) {
            try {
                const suggestedName = docName && docName.endsWith('.ssproj') ? docName : 'scene.ssproj';
                const handle = await window.showSaveFilePicker({
                    id: 'SuperSplatDocumentSave',
                    types: SuperFileType,
                    suggestedName
                });
                return await savePackageDocument({
                    stream: await handle.createWritable(),
                    handle,
                    ...saveContext
                });
            } catch (error) {
                if ((error as Error)?.name !== 'AbortError') {
                    console.error(error);
                    await events.invoke('showPopup', {
                        type: 'error',
                        header: localize('doc.save-failed'),
                        message: `'${(error as Error)?.message ?? error}'`
                    });
                }
                return false;
            }
        }

        const fallbackName = docName && docName.endsWith('.ssproj') ? docName : 'scene.ssproj';
        return await savePackageDocument({
            filename: fallbackName,
            ...saveContext
        });
    };

    events.function('doc.savePackage', async () => {
        const saveContext = await resolveSavePackageContext();
        if (!saveContext) {
            return false;
        }

        if (documentFileHandle) {
            try {
                return await savePackageDocument({
                    stream: await documentFileHandle.createWritable(),
                    handle: documentFileHandle,
                    ...saveContext
                });
            } catch (error) {
                if ((error as Error)?.name !== 'AbortError' && (error as Error)?.name !== 'NotAllowedError') {
                    console.error(error);
                    await events.invoke('showPopup', {
                        type: 'error',
                        header: localize('doc.save-failed'),
                        message: `'${(error as Error)?.message ?? error}'`
                    });
                }
                return false;
            }
        }
        return await savePackageAsWithContext(saveContext);
    });

    events.on('doc.savePackage', async () => {
        await events.invoke('doc.savePackage');
    });

    events.function('doc.savePackageAs', async () => {
        const saveContext = await resolveSavePackageContext();
        if (!saveContext) {
            return false;
        }
        return await savePackageAsWithContext(saveContext);
    });

    events.function('doc.saveAs', async () => {
        return await events.invoke('doc.savePackageAs');
    });

    events.function('doc.name', () => docName);
    events.on('doc.setName', (name: string) => {
        setDocName(name);
    });
};

export { registerDocEvents };
