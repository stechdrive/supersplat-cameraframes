import { ZipFileSystem } from '@playcanvas/splat-transform';

import { ElementType } from './element';
import { Events } from './events';
import { Model } from './model';
import { recentFiles } from './recent-files';
import { normalizeReferenceImageFilename } from './reference-image-filename';
import { Scene } from './scene';
import { BrowserFileSystem } from './serialize/browser-file-system';
import { ZipReader } from './serialize/zip-reader';
import { Splat } from './splat';
import { serializePly } from './splat-serialize';
import { Transform } from './transform';
import { formatInteger, localize } from './ui/localization';

// NOTE: This fork extends the upstream ssproj format, but we keep the on-disk
// `document.json.version` as 0 to maximize the chance that upstream can load it.
const DOC_VERSION = 4;
const SUPPORTED_DOC_VERSIONS = new Set([0, 1, 2, 3, 4]);
const ZIP64_MARGIN_BYTES = 1800n * 1024n * 1024n;   // 約1.8GB (GiB基準)
const ZIP32_LIMIT = 0xffffffffn;
const ZIP_ENTRY_OVERHEAD = 256n;

// ts compiler and vscode find this type, but eslint does not
type FilePickerAcceptType = unknown;

const SuperFileType: FilePickerAcceptType[] = [{
    description: 'SuperSplat document',
    accept: {
        'application/x-supersplat': ['.ssproj']
    }
}];

type FileSelectorCallback = (fileList: File) => void;

// helper class to show a file selector dialog.
// used when showOpenFilePicker is not available.
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

const estimateSplatPlySize = (splat: Splat) => {
    const element = splat.splatData.getElement('vertex');
    const internalProps = new Set(['state', 'transform']);
    const props = element.properties.filter((p: any) => p.storage && !internalProps.has(p.name));
    const perPointBytes = props.reduce((sum: bigint, p: any) => sum + BigInt(p.byteSize ?? 4), 0n);
    const gaussianCount = BigInt(Math.max(0, splat.numSplats - splat.numDeleted));
    // ヘッダは数百バイト程度なので簡易的に上乗せ
    const headerBytes = 256n + BigInt(props.length * 32);
    return headerBytes + perPointBytes * gaussianCount;
};

const estimateDocumentSize = (documentData: any, splats: Splat[], models: Model[], resolveBlob: (model: Model) => Blob | null, referenceImagesBytes: bigint = 0n, referenceImagesEntryCount: bigint = 0n) => {
    const encoder = new TextEncoder();
    const docSize = BigInt(encoder.encode(JSON.stringify(documentData)).length);
    const splatSize = splats.reduce((sum, splat) => sum + estimateSplatPlySize(splat), 0n);
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

const registerDocEvents = (scene: Scene, events: Events) => {
    // construct the file selector
    const fileSelector = window.showOpenFilePicker ? null : new FileSelector();

    // this file handle is updated as the current document is loaded and saved
    let documentFileHandle: FileSystemFileHandle = null;

    // show the user a reset confirmation popup
    const getResetConfirmation = async () => {
        const result = await events.invoke('showPopup', {
            type: 'yesno',
            header: localize('doc.reset'),
            message: localize(events.invoke('scene.dirty') ? 'doc.unsaved-message' : 'doc.reset-message')
        });

        if (result.action !== 'yes') {
            return false;
        }

        return true;
    };

    // reset the scene
    const resetScene = () => {
        events.fire('scene.clear');
        events.fire('camera.reset');
        events.fire('doc.setName', null);
        documentFileHandle = null;
    };

    // load the document from the given file
    const loadDocument = async (file: Blob | ArrayBuffer) => {
        events.fire('startSpinner');
        try {
            const zip = await ZipReader.from(file);

            const documentText = await zip.text('document.json');
            let document: any;
            try {
                document = JSON.parse(documentText);
            } catch (parseError) {
                throw new Error('document.json is not valid JSON');
            }

            const docVersion = (typeof document?.version === 'number' && isFinite(document.version)) ? document.version : 0;
            if (!SUPPORTED_DOC_VERSIONS.has(docVersion)) {
                throw new Error(`Unsupported document version: ${docVersion}`);
            }

            if (!Array.isArray(document?.splats)) {
                throw new Error('Invalid document: splats are missing');
            }

            // stage assets before mutating current scene
            const stagedSplats: { splat: Splat, settings: any }[] = [];
            for (let i = 0; i < document.splats.length; ++i) {
                const filename = `splat_${i}.ply`;
                const splatSettings = document.splats[i];

                const contents = await zip.blob(filename);
                const loaded = await scene.assetLoader.load({
                    filename,
                    contents
                });
                if (!(loaded instanceof Splat)) {
                    throw new Error('document contains a non-splat asset');
                }
                stagedSplats.push({ splat: loaded as Splat, settings: splatSettings });
            }

            const stagedModels: { model: Model, settings: any }[] = [];
            const modelDocs = Array.isArray(document?.models) ? document.models : [];
            for (let i = 0; i < modelDocs.length; ++i) {
                const modelDoc = modelDocs[i] ?? {};
                const modelPath = typeof modelDoc.filename === 'string' ? modelDoc.filename : `models/model_${i}.glb`;
                const contents = await zip.blob(modelPath);
                const loaded = await scene.assetLoader.load({
                    filename: modelPath.split('/').pop() ?? modelPath,
                    contents
                });
                if (!(loaded instanceof Model)) {
                    throw new Error('document contains a non-model asset');
                }
                stagedModels.push({ model: loaded as Model, settings: modelDoc });
            }

            // at this point staging succeeded, apply to scene
            resetScene();

            scene.renderSystem.freeze();
            for (const { model, settings } of stagedModels) {
                await scene.add(model);
                model.docDeserialize(settings ?? {});
            }
            for (const { splat, settings } of stagedSplats) {
                await scene.add(splat);
                splat.docDeserialize(settings ?? {});
            }
            scene.renderSystem.unfreeze();

            // FIXME: trigger scene bound calc in a better way
            const tmp = scene.bound;
            if (tmp === null) {
                console.error('this should never fire');
            }

            events.invoke('docDeserialize.timeline', document.timeline ?? {});
            events.invoke('docDeserialize.poseSets', document.poseSets ?? []);
            events.invoke('docDeserialize.view', document.view ?? {});
            events.invoke('docDeserialize.cameraFrames', document.cameraFrames ?? null);
            scene.camera.docDeserialize(document.camera ?? null);
            scene.docDeserializeLighting(document.lighting ?? null);
            const referenceDocState = document.referenceImages ?? document.referenceImage ?? null;
            const referenceBlobs = new Map<string, Blob>();
            if (referenceDocState?.assets && Array.isArray(referenceDocState.assets)) {
                for (const asset of referenceDocState.assets) {
                    const assetId = asset?.id;
                    const filename = asset?.source?.filename;
                    if (typeof assetId !== 'string' || !assetId || typeof filename !== 'string' || !filename) {
                        continue;
                    }
                    const safeName = normalizeReferenceImageFilename(filename);
                    const refPath = `reference-images/assets/${assetId}/${safeName}`;
                    try {
                        referenceBlobs.set(refPath, await zip.blob(refPath));
                    } catch (error) {
                        console.warn(`reference image missing: ${refPath}`, error);
                    }
                }
            }
            if (referenceDocState?.items && Array.isArray(referenceDocState.items)) {
                for (const item of referenceDocState.items) {
                    const id = item?.id;
                    const filename = item?.source?.filename;
                    if (typeof id !== 'string' || !id || typeof filename !== 'string' || !filename) {
                        continue;
                    }
                    const refPath = `reference-images/${id}/${filename}`;
                    try {
                        referenceBlobs.set(refPath, await zip.blob(refPath));
                    } catch (error) {
                        console.warn(`reference image missing: ${refPath}`, error);
                    }
                }
            } else if (referenceDocState?.source?.filename) {
                const refPath = `reference-image/${referenceDocState.source.filename}`;
                try {
                    referenceBlobs.set(refPath, await zip.blob(refPath));
                } catch (error) {
                    console.warn(`reference image missing: ${refPath}`, error);
                }
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

            // refresh the pivot to reflect the loaded transform
            const currentSelection = events.invoke('selection');
            if (currentSelection) {
                const pivot = events.invoke('pivot');
                const transform = new Transform();
                const pivotOrigin = events.invoke('pivot.origin');
                currentSelection.getPivot(pivotOrigin, false, transform);
                pivot.place(transform);
            }

            scene.scheduleViewportRefresh();
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.load-failed'),
                message: `'${error.message ?? error}'`
            });
        } finally {
            events.fire('stopSpinner');
        }
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

    const writeBlobToZip = async (zipFs: ZipFileSystem, filename: string, source: Blob | ReadableStream<Uint8Array>) => {
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

    const saveDocument = async (options: { stream?: FileSystemWritableFileStream, filename?: string }): Promise<boolean> => {
        events.fire('startSpinner');

        try {
            const splats = events.invoke('scene.allSplats') as Splat[];
            const models = scene.getElementsByType(ElementType.model) as Model[];
            const referenceImagesState = events.invoke('docSerialize.referenceImages');
            const referenceImagesAssets = (events.invoke('referenceImages.docAssets') as Array<{ path: string; blob: Blob }> | null) ?? [];
            const referenceImagesBytes = referenceImagesAssets.reduce((sum, a) => sum + BigInt(a?.blob?.size ?? 0), 0n);
            const referenceImagesEntryCount = BigInt(referenceImagesAssets.length);

            const modelDocs = models.map((model, i) => {
                const serialized = model.docSerialize();
                return {
                    ...serialized,
                    filename: `models/model_${i}.glb`
                };
            });

            const createDocumentPayload = (zip64: boolean) => ({
                // keep version compatible with upstream (playcanvas/supersplat)
                version: 0,
                // internal schema marker for this fork (upstream will ignore unknown keys)
                schemaVersion: DOC_VERSION,
                ...(zip64 ? { zip64: true } : {}),
                camera: scene.camera.docSerialize(),
                view: events.invoke('docSerialize.view'),
                poseSets: events.invoke('docSerialize.poseSets'),
                timeline: events.invoke('docSerialize.timeline'),
                cameraFrames: events.invoke('docSerialize.cameraFrames'),
                referenceImages: referenceImagesState ?? undefined,
                splats: splats.map(s => s.docSerialize()),
                models: modelDocs,
                lighting: scene.docSerializeLighting()
            });

            // 予測用のペイロードを使って ZIP64 が必要か判定
            const provisionalDoc = createDocumentPayload(true);
            const estimate = estimateDocumentSize(provisionalDoc, splats, models, model => scene.assetLoader.getSourceBlob(model), referenceImagesBytes, referenceImagesEntryCount);
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

            const serializeSettings = {
                // even though we support saving selection state, we disable that for now
                // because including a uint8 array in the document PLY results in slow loading
                // path.
                keepStateData: false,
                keepWorldTransform: true,
                keepColorTint: true
            };

            // Create browser filesystem and zip filesystem
            const browserFs = new BrowserFileSystem(options.filename, options.stream);
            const browserWriter = await browserFs.createWriter(options.filename);
            const zipFs = new ZipFileSystem(browserWriter);

            // Write document.json
            const docWriter = await zipFs.createWriter('document.json');
            await docWriter.write(new TextEncoder().encode(JSON.stringify(document)));
            await docWriter.close();

            // Write each splat as PLY
            for (let i = 0; i < splats.length; ++i) {
                await serializePly([splats[i]], serializeSettings, zipFs, `splat_${i}.ply`);
            }
            for (let i = 0; i < models.length; ++i) {
                const blob = await getModelBlob(models[i]);
                await writeBlobToZip(zipFs, modelDocs[i].filename, blob);
            }
            for (const asset of referenceImagesAssets) {
                if (!asset?.blob || typeof asset?.path !== 'string' || !asset.path) {
                    continue;
                }
                await writeBlobToZip(zipFs, asset.path, asset.blob);
            }
            await zipFs.close();
            return true;
        } catch (error) {
            await events.invoke('showPopup', {
                type: 'error',
                header: localize('doc.save-failed'),
                message: `'${error.message ?? error}'`
            });
            return false;
        } finally {
            events.fire('stopSpinner');
        }
    };

    // handle user requesting a new document
    events.function('doc.new', async () => {
        if (!await getResetConfirmation()) {
            return false;
        }
        resetScene();
        return true;
    });

    // handle document file being dropped
    // NOTE: on chrome it's possible to get the FileSystemFileHandle from the DataTransferItem
    // (which would result in more seamless user experience), but this is not yet supported in
    // other browsers.
    events.function('doc.load', async (file: File | Blob | ArrayBuffer, handle?: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        await loadDocument(file);

        const fileName = (file as File)?.name ?? handle?.name;
        if (fileName) {
            events.fire('doc.setName', fileName);
        }

        if (handle) {
            documentFileHandle = handle;
            recentFiles.add(handle);
        }
    });

    events.function('doc.open', async () => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        if (fileSelector) {
            fileSelector.show(async (file?: File) => {
                if (file) {
                    await loadDocument(file);
                    events.fire('doc.setName', file.name);
                }
            });
        } else {
            try {
                const fileHandles = await window.showOpenFilePicker({
                    id: 'SuperSplatDocumentOpen',
                    multiple: false,
                    types: SuperFileType
                });

                if (fileHandles?.length === 1) {
                    const fileHandle = fileHandles[0];

                    // null file handle incase loadDocument fails
                    await loadDocument(await fileHandle.getFile());

                    // store file handle for subsequent saves
                    documentFileHandle = fileHandle;
                    events.fire('doc.setName', fileHandle.name);
                    recentFiles.add(fileHandle);
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        }
    });

    events.function('doc.openRecent', async (fileHandle: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        try {
            if (await fileHandle.queryPermission({ mode: 'read' }) !== 'granted') {
                if (await fileHandle.requestPermission({ mode: 'read' }) !== 'granted') {
                    return false;
                }
            }

            await loadDocument(await fileHandle.getFile());

            // store file handle for subsequent saves
            documentFileHandle = fileHandle;
            events.fire('doc.setName', fileHandle.name);
            recentFiles.add(fileHandle);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: localize('popup.error-loading'),
                    message: `${error.message ?? error}`
                });
            }
        }
    });

    events.function('doc.save', async () => {
        if (documentFileHandle) {
            try {
                const saved = await saveDocument({
                    stream: await documentFileHandle.createWritable()
                });
                if (saved) {
                    events.fire('doc.saved');
                }
            } catch (error) {
                if (error.name !== 'AbortError' && error.name !== 'NotAllowedError') {
                    console.error(error);
                }
            }
        } else {
            await events.invoke('doc.saveAs');
        }
    });

    events.function('doc.saveAs', async () => {
        if (window.showSaveFilePicker) {
            try {
                const handle = await window.showSaveFilePicker({
                    id: 'SuperSplatDocumentSave',
                    types: SuperFileType,
                    suggestedName: 'scene.ssproj'
                });
                const saved = await saveDocument({ stream: await handle.createWritable() });
                if (!saved) {
                    return;
                }
                documentFileHandle = handle;
                events.fire('doc.setName', handle.name);
                events.fire('doc.saved');
                recentFiles.add(handle);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                }
            }
        } else {
            const saved = await saveDocument({
                filename: 'scene.ssproj'
            });
            if (saved) {
                events.fire('doc.saved');
            }
        }
    });

    // doc name

    let docName: string = null;

    const setDocName = (name: string) => {
        if (name !== docName) {
            docName = name;
            events.fire('doc.name', docName);
        }
    };

    events.function('doc.name', () => {
        return docName;
    });

    events.on('doc.setName', (name) => {
        setDocName(name);
    });
};

export { registerDocEvents };
