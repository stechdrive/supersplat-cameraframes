import { MemoryFileSystem, ZipFileSystem, ZipReadFileSystem, type Writer } from '@playcanvas/splat-transform';
import type { Asset, Quat } from 'playcanvas';

import { createCamera } from './cameras/camera-store';
import { collectProductAssets, collectProductState, readEntry, readProductAssets, restoreProductState, validateProject } from './doc-camera-frames';
import { decodeInstances, encodeInstances, restorePalettes } from './doc-instances';
import { packageFingerprint, WorkingDocument, WorkingFileSystem, workingCompatible } from './doc-working';
import type { EditorSplatResource } from './editor-splat-resource';
import { Events } from './events';
import { GaussianInstances } from './gaussian-instances';
import { BrowserFileSystem, BlobReadSource, loadSplatSource, sourcesOf } from './io';
import { projectSaveStateStore } from './project-save-state';
import { recentFiles } from './recent-files';
import { Scene } from './scene';
import { Splat } from './splat';
import { writeResourceFile } from './splat-serialize';
import { Transform } from './transform';
import { i18n } from './ui/localization';

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

const registerDocEvents = (scene: Scene, events: Events) => {
    const working = new WorkingDocument();
    let savedSignature: string | null = null;
    let packageSignature: string | null = null;
    let saveBusy = false;
    const signature = () => JSON.stringify({ ...collectProductState(scene, events),
        camera: scene.camera.docSerialize(),
        view: events.invoke('docSerialize.view'),
        poseSets: events.invoke('docSerialize.poseSets'),
        timeline: events.invoke('docSerialize.timeline'),
        splats: (events.invoke('scene.allSplats') as Splat[]).map(splat => splat.docSerialize()),
        edits: events.invoke('scene.editVersion') });
    const status = () => {
        const current = signature();
        return { projectId: working.projectId,
            dirty: savedSignature !== null && current !== savedSignature,
            packageDirty: packageSignature !== null && current !== packageSignature,
            busy: saveBusy };
    };
    events.function('doc.status', status);
    events.function('doc.dirty', () => status().dirty);
    const markSaved = (packaged: boolean, writtenSignature = signature()) => {
        savedSignature = writtenSignature;
        if (packaged) packageSignature = savedSignature;
        events.fire('doc.saved');
        events.fire('doc.status', status());
    };
    let lastStatus = '';
    events.on('postrender', () => {
        if (!savedSignature) return;
        const current = JSON.stringify(status());
        if (current !== lastStatus) {
            lastStatus = current;
            events.fire('doc.status', JSON.parse(current));
        }
    });
    events.on('app.ready', () => {
        markSaved(true);
        events.once('postrender', () => {
            if (events.invoke('scene.empty')) markSaved(true);
        });
    });
    // construct the file selector
    const fileSelector = window.showOpenFilePicker ? null : new FileSelector();

    // this file handle is updated as the current document is loaded and saved
    let documentFileHandle: FileSystemFileHandle = null;

    // The zip the current document's resources still read from. A loaded resource
    // retains a lazy ChunkSource over its PLY - that is what export streams from -
    // so the archive has to outlive the load and can only be closed once nothing
    // references it. Closing it at the end of the load made every export from an
    // opened document fail with 'Source has been closed'.
    let documentFs: ZipReadFileSystem = null;

    // the file the archive reads from, and the resources reading from it. The
    // browser invalidates a File once its file changes, so saving over that file
    // has to move them all onto the new archive afterwards (see rebindDocument)
    let documentSource: BlobReadSource = null;
    let documentResources = new Set<EditorSplatResource>();
    const archives = new Map<ZipReadFileSystem, { source: BlobReadSource; resources: Set<EditorSplatResource> }>();

    events.function('doc.fileSources', () => [...archives.values()].map(archive => archive.source));

    // show the user a reset confirmation popup
    const getResetConfirmation = async () => {
        if (saveBusy) return false;
        const current = status();
        if (current.dirty || current.packageDirty) {
            const result = await events.invoke('showPopup', {
                type: 'okcancel',
                header: i18n.t('doc.reset'),
                message: i18n.t('doc.unsaved-message'),
                icon: false,
                select: { value: 'package',
                    options: [
                        { v: 'package', t: i18n.t('doc.transition.save-package') },
                        { v: 'working', t: i18n.t('doc.transition.save-state') },
                        { v: 'discard', t: i18n.t('doc.transition.discard') }
                    ] }
            });
            if (result.action !== 'ok') return false;
            if (result.value === 'package') return events.invoke('doc.savePackage');
            if (result.value === 'working') return events.invoke('doc.save');
            return result.value === 'discard';
        }
        const result = await events.invoke('showPopup', {
            type: 'yesno',
            header: i18n.t('doc.reset'),
            message: i18n.t(events.invoke('scene.dirty') ? 'doc.unsaved-message' : 'doc.reset-message')
        });

        if (result.action !== 'yes') {
            return false;
        }

        return true;
    };
    events.function('doc.confirmTransition', getResetConfirmation);

    // reset the scene
    const resetScene = () => {
        // clear first: the layers and their resources are what still read from the
        // archive, so the zip is only safe to close once they are gone
        events.fire('scene.clear');
        events.fire('camera.reset');
        events.fire('doc.setName', null);
        documentFileHandle = null;
        documentFs?.close();
        archives.forEach((_entry, fs) => fs.close());
        archives.clear();
        documentFs = null;
        documentSource = null;
        documentResources = new Set();
        working.reset();
        savedSignature = packageSignature = null;
    };

    // load the document from the given file. `handle` is the file's handle when
    // known, so a later save over the same file can be recognised
    const loadDocument = async (file: File, handle?: FileSystemFileHandle) => {
        events.fire('startSpinner');
        events.fire('timeline.setPlaying', false);
        await scene.commandQueue.enqueue(() => {});

        // Create streaming ZIP reader from the file
        const blobSource = new BlobReadSource(file, handle ?? null);
        const zipFs = new ZipReadFileSystem(blobSource);
        const stagedSplats: Splat[] = [];
        const stagedAssets: Asset[] = [];
        let product: Awaited<ReturnType<typeof readProductAssets>>;
        let adopted = false;

        try {
            // the document's view settings are applied through the same events
            // as user changes - suspend preference capture so they don't
            // overwrite the user's stored preferences. resumed in the finally
            // below so a failed load can't leave capture suspended.
            events.fire('preferences.suspend');

            // the document is applied piecewise: each layer becomes visible
            // before its saved transform is applied (scene.add awaits a GPU
            // bound readback in between) and the camera pose is restored last,
            // so frames rendered mid-load would show a half-assembled scene.
            // Suspend viewport rendering until the load settles; the finally
            // below resumes it and forces a render of the final state.
            scene.suspendRender = true;

            const json = new TextDecoder().decode(await readEntry(zipFs, 'document.json'));
            const baseDocument = validateProject(JSON.parse(json));
            const fingerprint = packageFingerprint(file.name, file.size, json);
            const record = baseDocument.projectId ? await projectSaveStateStore.load(baseDocument.projectId) :
                await projectSaveStateStore.loadByFingerprint(fingerprint);
            const useWorking = workingCompatible(record, baseDocument.packageRevision ?? null, fingerprint);
            const document = useWorking ? validateProject(record.snapshot) : baseDocument;
            const fs = new WorkingFileSystem(zipFs, useWorking ? record : undefined);
            const names = [...await zipFs.list(), ...fs.blobs.keys()];
            product = await readProductAssets(document, fs, names, scene);
            // Missing or malformed instance files must fail before clearing the
            // open project. Static resources keep the original lazy ZIP lifetime.
            const instanceData = new Map<string, ReturnType<typeof decodeInstances>>();
            if (document.version === 1) {
                for (const settings of document.splats) instanceData.set(settings.instances, decodeInstances(await readEntry(fs, settings.instances)));
            }
            if ((document.version ?? 0) >= 1) {
                // v1: the static tier is stored once per resource, and each layer
                // brings its own instance list and palettes. Layers sharing a
                // resource share it here too, so a duplicated layer costs nothing
                // beyond its list.
                const assets: { asset: Asset, rotation: Quat }[] = [];
                for (const resource of document.resources) {
                    const loaded = await scene.assetLoader.loadAsset(resource.filename, fs, false, true);
                    if (!loaded) throw new Error('Splatの読込をキャンセルしました');
                    stagedAssets.push(loaded.asset);
                    assets.push(loaded);
                }

                for (const splatSettings of document.splats) {
                    const { asset, rotation } = assets[splatSettings.resource];
                    const numRows = (asset.resource as EditorSplatResource).numRows;

                    const records = instanceData.get(splatSettings.instances);
                    if (records.sourceRow.some(row => row >= numRows)) throw new Error('Splat行への参照が不正です');

                    const instances = GaussianInstances.fromRecords(
                        scene.app.graphicsDevice, numRows, records.sourceRow, records.flags, records.palette
                    );
                    const splat = new Splat(asset, rotation, instances);
                    stagedSplats.push(splat);
                    restorePalettes(records, splat.transformPalette, splat.colorPalette);
                }
            } else {
                // v0: one baked PLY per layer, no instance list
                for (let i = 0; i < document.splats.length; ++i) {
                    const splatSettings = document.splats[i];
                    const filename = splatSettings.filename ?? `splat_${i}.ply`;

                    // load splat directly from the zip filesystem (streams on-demand)
                    // skipReorder=true because ssproj PLY files are already in morton order
                    const splat = await scene.assetLoader.load(filename, fs, false, true);
                    if (!splat) throw new Error('Splatの読込をキャンセルしました');
                    stagedSplats.push(splat);
                }
            }

            // All archive entries, static GPU resources and instance palettes
            // are ready before replacing the user's current project.
            resetScene();
            documentFs = zipFs;
            documentSource = blobSource;
            const projectId = baseDocument.projectId ?? record?.projectId ?? crypto.randomUUID();
            working.restore(projectId, baseDocument.packageRevision ?? null, fingerprint, await zipFs.list(), useWorking ? record : undefined);
            adopted = true;
            for (let i = 0; i < stagedSplats.length; ++i) {
                const splat = stagedSplats[i];
                documentResources.add(splat.resource);
                const settings = document.splats[i];
                working.resourcePaths.set(splat.resource, document.version === 1 ? document.resources[settings.resource].filename :
                    settings.filename ?? `splat_${i}.ply`);
                await scene.add(splat);
                splat.docDeserialize(document.splats[i]);
            }
            archives.set(zipFs, { source: blobSource, resources: documentResources });

            for (const model of product.models) await scene.add(model);

            // reading the bound forces a recalculation (and its
            // scene.boundChanged event) so the deserialize steps below observe
            // the loaded scene's extents. The result must be consumed: the
            // release build's treeshaker assumes property reads are pure and
            // drops a bare read, getter side effects and all
            if (scene.bound === null) {
                console.error('unexpected missing scene bound');
            }

            events.invoke('docDeserialize.timeline', document.timeline ?? {});
            events.invoke('docDeserialize.poseSets', document.poseSets, document.camera?.fov);
            events.invoke('docDeserialize.view', document.view ?? {});
            scene.camera.docDeserialize(document.camera);
            scene.camera.onUpdate(0);
            await restoreProductState(document, product.references, scene, events);
            // History clears queued by scene.clear must settle before the save
            // marker is captured, otherwise a reopened project appears dirty.
            await scene.commandQueue.enqueue(() => {});
            markSaved(!useWorking);
            if (useWorking) packageSignature = 'base-package';
            await projectSaveStateStore.setProjectLink(fingerprint, projectId);

            // refresh the pivot to reflect the loaded transform
            const currentSelection = events.invoke('selection');
            if (currentSelection) {
                const pivot = events.invoke('pivot');
                const transform = new Transform();
                if (currentSelection instanceof Splat) currentSelection.getPivot(transform);
                else currentSelection.getPivot('center', false, transform);
                pivot.place(transform);
            }
            return document;
        } catch (error) {
            console.error('Project load failed', error);
            if (!adopted) {
                const ownedAssets = new Set(stagedSplats.map(splat => splat.asset));
                stagedSplats.forEach(splat => splat.destroy());
                stagedAssets.filter(asset => !ownedAssets.has(asset)).forEach((asset) => {
                    asset.registry.remove(asset);
                    asset.unload();
                });
                product?.models.forEach(model => model.destroy());
            }
            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('doc.load-failed'),
                message: `'${error.message ?? error}'`
            });
            if (documentFs !== zipFs) zipFs.close();
            return null;
        } finally {
            scene.suspendRender = false;
            scene.forceRender = true;
            events.fire('preferences.resume');
            events.fire('stopSpinner');
        }
    };

    // Group layers by the static resource they share and work out, per resource,
    // which rows are still referenced. The saved file stores each resource's
    // gaussian data once, so a duplicated layer costs its instance list rather than
    // a second copy of the scene.
    //
    // The union across layers is a correctness requirement, not a size
    // optimisation: if one layer deleted rows another still references, dropping
    // them would corrupt that other layer. Rows nothing references are dropped, so
    // deletions become permanent at save - as they already were.
    //
    // `compact` false keeps every row instead, so the written resource is an
    // identical view of the live one. Used when saving over the file the document
    // is open from, where the resources are then re-read from what was written
    // (see rebindDocument) and an undo must still find its rows.
    const groupByResource = (splats: Splat[], compact: boolean) => {
        const groups: { resource: EditorSplatResource, layers: Splat[] }[] = [];
        const index = new Map<EditorSplatResource, number>();
        for (const splat of splats) {
            let at = index.get(splat.resource);
            if (at === undefined) {
                at = groups.length;
                index.set(splat.resource, at);
                groups.push({ resource: splat.resource, layers: [] });
            }
            groups[at].layers.push(splat);
        }

        return groups.map(({ resource, layers }) => {
            const referenced = new Uint8Array(resource.numRows);
            if (!compact) referenced.fill(1);
            for (const layer of layers) {
                const { sourceRow, count } = layer.instances;
                for (let i = 0; i < count; ++i) {
                    referenced[sourceRow[i]] = 1;
                }
            }

            // ascending, so the written order is the retained subsequence of the
            // resource's own row order - which is morton order, and what the
            // instance run encoding stays compact under
            let numRows = 0;
            for (let row = 0; row < referenced.length; ++row) {
                if (referenced[row]) numRows++;
            }
            const rows = new Uint32Array(numRows);
            const rowMap = new Uint32Array(resource.numRows);
            let at = 0;
            for (let row = 0; row < referenced.length; ++row) {
                if (referenced[row]) {
                    rows[at] = row;
                    rowMap[row] = at;
                    at++;
                }
            }
            return { resource, layers, rows, rowMap };
        });
    };

    // returns the resource groups written, in resource file order, or null if
    // the save failed
    const saveDocument = async (options: { stream?: FileSystemWritableFileStream, filename?: string, compact?: boolean, writer?: Writer }) => {
        events.fire('startSpinner');

        try {
            const splats = events.invoke('scene.allSplats') as Splat[];
            const groups = groupByResource(splats, options.compact ?? true);

            // layer -> the resource file it reads from, and its remapped records
            const layerInfo = new Map<Splat, { resource: number, records: ArrayBuffer }>();
            groups.forEach((group, resourceIndex) => {
                for (const layer of group.layers) {
                    // remap into the compacted row numbering on a copy: the live
                    // instance list must keep working after the save
                    const records = encodeInstances(layer, group.rowMap);
                    layerInfo.set(layer, { resource: resourceIndex, records });
                }
            });

            const document = {
                version: 1,
                projectId: working.projectId ?? crypto.randomUUID(),
                packageRevision: (working.revision ?? 0) + 1,
                ...collectProductState(scene, events),
                camera: scene.camera.docSerialize(),
                view: events.invoke('docSerialize.view'),
                poseSets: events.invoke('docSerialize.poseSets'),
                timeline: events.invoke('docSerialize.timeline'),
                resources: groups.map((group, i) => ({
                    filename: `resource_${i}.ply`,
                    numRows: group.rows.length
                })),
                splats: splats.map((splat, i) => ({
                    ...splat.docSerialize(),
                    resource: layerInfo.get(splat).resource,
                    instances: `instances_${i}.bin`
                }))
            };
            const writtenSignature = signature();

            // Create browser filesystem and zip filesystem
            const browserFs = new BrowserFileSystem(options.filename, options.stream);
            const productAssets = collectProductAssets(scene, events);
            // The upstream ZIP writer is ZIP32. Refuse before opening entries;
            // include a conservative PLY header/ZIP directory allowance.
            const bytes = groups.reduce((sum, group) => sum + group.rows.length * (17 + [0, 9, 24, 45][group.resource.shBands]) * 4 + 16384, 0) +
                [...layerInfo.values()].reduce((sum, layer) => sum + layer.records.byteLength, 0) +
                productAssets.reduce((sum, asset) => sum + asset.blob.size + 2048, 0) + JSON.stringify(document).length * 4 + 65536;
            if (bytes >= 0xffffffff || 1 + groups.length + splats.length + productAssets.length >= 65535) throw new Error('このプロジェクトはZIP32の保存上限を超えます');
            const browserWriter = options.writer ?? await browserFs.createWriter(options.filename);
            const zipFs = new ZipFileSystem(browserWriter);

            // Write document.json
            const docWriter = await zipFs.createWriter('document.json');
            await docWriter.write(new TextEncoder().encode(JSON.stringify(document)));
            await docWriter.close();

            // Write each resource's static data once, verbatim
            for (let i = 0; i < groups.length; ++i) {
                await writeResourceFile(groups[i].resource, groups[i].rows, `resource_${i}.ply`, zipFs);
            }

            // Write each layer's instance list and palettes
            for (let i = 0; i < splats.length; ++i) {
                const writer = await zipFs.createWriter(`instances_${i}.bin`);
                await writer.write(new Uint8Array(layerInfo.get(splats[i]).records));
                await writer.close();
            }

            for (const asset of productAssets) {
                const writer = await zipFs.createWriter(asset.path);
                const reader = asset.blob.stream().getReader();
                try {
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        await writer.write(value);
                    }
                } finally {
                    reader.releaseLock();
                }
                await writer.close();
            }

            // Close zip (also closes underlying browser writer)
            await zipFs.close();

            return { groups, document, writtenSignature };
        } catch (error) {
            await options.stream?.abort().catch(() => { /* the writer may already have aborted */ });
            console.error('saveDocument failed', error);
            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('doc.save-failed'),
                message: error.name === 'QuotaExceededError' ? i18n.t('doc.save-working-state-quota.message') : `'${error.message ?? error}'`
            });
            return null;
        } finally {
            events.fire('stopSpinner');
        }
    };

    // Shared production paths also used by the local GPU regression page.
    events.function('doc.writeTo', (writer: Writer) => scene.commandQueue.enqueue(() => saveDocument({ writer, compact: false })));
    events.function('doc.loadFile', (file: File, handle?: FileSystemFileHandle) => loadDocument(file, handle));

    // The document was just written over the file it is open from. The browser
    // invalidates a File once its file changes, so the archive and every resource
    // reading from it are moved onto the freshly written file. The rows were
    // written verbatim (see writeDocument), so each resource's new entry is an
    // identical view of its rows: nothing is copied or re-uploaded.
    const rebindDocument = async (handle: FileSystemFileHandle, groups: { resource: EditorSplatResource }[]) => {
        const blobSource = new BlobReadSource(await handle.getFile(), handle);
        const zipFs = new ZipReadFileSystem(blobSource);
        const rebound = new Set<EditorSplatResource>();
        for (let i = 0; i < groups.length; ++i) {
            const { resource } = groups[i];
            const loaded = await loadSplatSource(`resource_${i}.ply`, zipFs, true);
            await resource.rebind(loaded.source);
            rebound.add(resource);
        }
        documentFs = zipFs;
        documentSource = blobSource;
        documentResources = rebound;
        archives.set(zipFs, { source: blobSource, resources: rebound });
    };

    const acceptPackage = async (saved: Awaited<ReturnType<typeof saveDocument>>, file?: File) => {
        const { groups, document } = saved;
        working.restore(document.projectId, document.packageRevision,
            file ? packageFingerprint(file.name, file.size, JSON.stringify(document)) : null,
            document.resources.map(resource => resource.filename));
        groups.forEach((group, i) => working.resourcePaths.set(group.resource, `resource_${i}.ply`));
        await projectSaveStateStore.clear(working.projectId);
        await projectSaveStateStore.setProjectLink(working.fingerprint, working.projectId);
        markSaved(true, saved.writtenSignature);
    };

    // write the document to `handle`, which may be the file it is open from.
    // returns false if nothing was written
    const writeDocument = async (handle: FileSystemFileHandle) => {
        const active = new Set((events.invoke('scene.allSplats') as Splat[]).map(splat => splat.resource));
        // Undo may still own a removed layer. Before replacing an archive,
        // detach those resources too, so undo after save never reads an invalid File.
        for (const archive of archives.values()) {
            if (!(await sourcesOf([archive.source], handle)).length) continue;
            for (const resource of archive.resources) {
                if (active.has(resource) || resource.isClosed) continue;
                const memory = new MemoryFileSystem();
                const rows = Uint32Array.from({ length: resource.numRows }, (_, i) => i);
                await writeResourceFile(resource, rows, 'undo.ply', memory);
                const fs = new WorkingFileSystem(null);
                fs.blobs.set('undo.ply', new Blob([memory.results.get('undo.ply') as BlobPart]));
                await resource.rebind((await loadSplatSource('undo.ply', fs, true)).source);
            }
        }
        const saved = await saveDocument({ stream: await handle.createWritable(), compact: false });
        if (!saved) {
            return false;
        }
        await rebindDocument(handle, saved.groups);
        await acceptPackage(saved, await handle.getFile());
        return true;
    };

    // handle user requesting a new document
    events.function('doc.new', async () => {
        if (!await getResetConfirmation()) {
            return false;
        }
        resetScene();
        // new documents start from the user's stored preferences rather than
        // whatever view state the previous document left behind
        events.fire('preferences.apply');
        const camera = createCamera(crypto.randomUUID());
        events.invoke('docDeserialize.shotCameras', { version: 1, cameras: [camera], outputCameraId: camera.id });
        await events.invoke('docDeserialize.referenceImages', null, new Map());
        await scene.commandQueue.enqueue(() => {});
        markSaved(true);
        return true;
    });

    // handle document file being dropped
    // NOTE: on chrome it's possible to get the FileSystemFileHandle from the DataTransferItem
    // (which would result in more seamless user experience), but this is not yet supported in
    // other browsers.
    events.function('doc.load', async (file: File, handle?: FileSystemFileHandle) => {
        if (!events.invoke('scene.empty') && !await getResetConfirmation()) {
            return false;
        }

        if (!await loadDocument(file, handle)) return false;

        events.fire('doc.setName', file.name);

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
                    if (await loadDocument(file)) events.fire('doc.setName', file.name);
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
                    if (!await loadDocument(await fileHandle.getFile(), fileHandle)) return false;

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

            if (!await loadDocument(await fileHandle.getFile(), fileHandle)) return false;

            // store file handle for subsequent saves
            documentFileHandle = fileHandle;
            events.fire('doc.setName', fileHandle.name);
            recentFiles.add(fileHandle);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: i18n.t('popup.error-loading'),
                    message: `${error.message ?? error}`
                });
            }
        }
    });

    const saveQueued = async (action: () => Promise<boolean>) => {
        if (saveBusy) return false;
        saveBusy = true;
        events.fire('doc.status', status());
        events.fire('startSpinner');
        try {
            return await scene.commandQueue.enqueue(action);
        } catch (error) {
            console.error('Project save failed', error);
            await events.invoke('showPopup', { type: 'error',
                header: i18n.t('doc.save-failed'),
                message: error.name === 'QuotaExceededError' ? i18n.t('doc.save-working-state-quota.message') : `${error.message ?? error}` });
            return false;
        } finally {
            saveBusy = false;
            events.fire('stopSpinner');
            events.fire('doc.status', status());
        }
    };

    events.function('doc.save', () => {
        if (!working.projectId) return events.invoke('doc.saveAs');
        return saveQueued(async () => {
            const writtenSignature = signature();
            await working.save(scene, events);
            markSaved(false, writtenSignature);
            return true;
        });
    });

    events.function('doc.savePackage', () => {
        if (documentFileHandle) {
            return saveQueued(() => writeDocument(documentFileHandle));
        }
        return events.invoke('doc.saveAs');
    });
    events.function('doc.writeHandle', (handle: FileSystemFileHandle) => saveQueued(() => writeDocument(handle)));
    events.function('doc.localWorkingStateStats', () => projectSaveStateStore.getStats());
    events.function('doc.clearLocalWorkingState', async () => {
        if (saveBusy) return false;
        const stats = await projectSaveStateStore.getStats();
        if (!stats.projectCount) return true;
        const current = status();
        const result = await events.invoke('showPopup', {
            type: 'okcancel',
            header: i18n.t('doc.cleanup.header'),
            message: i18n.t(current.dirty || current.packageDirty ? 'doc.cleanup.confirm-message-current' : 'doc.cleanup.confirm-message', {
                count: stats.projectCount.toLocaleString(), size: `${(stats.totalBytes / 1024 / 1024).toFixed(1)} MiB`
            })
        });
        if (result.action !== 'ok') return false;
        return saveQueued(async () => {
            await projectSaveStateStore.clearAll();
            // The live scene still owns its blobs. Only the persisted checkpoint
            // was removed, so unsaved work must again trigger the exit warning.
            savedSignature = packageSignature;
            return true;
        });
    });

    events.function('doc.saveAs', async () => {
        try {
            const hasFilePicker = !!window.showDirectoryPicker;
            const directory = hasFilePicker ? await events.invoke('scene.getExportDirectory') : undefined;

            const options = await events.invoke('show.savePopup', events.invoke('doc.name') || 'scene.ssproj', directory, documentSource);
            if (!options) return false;

            if (hasFilePicker) {
                const target = options.fileTarget;
                const handle = target.handle;
                let written = false;
                try {
                    written = await saveQueued(() => writeDocument(handle));
                    if (!written) return false;
                } finally {
                    if (!written) await target.discard?.();
                }
                documentFileHandle = handle;
                events.fire('doc.setName', handle.name);
                recentFiles.add(handle);
            } else {
                const written = await saveQueued(async () => {
                    const saved = await saveDocument({ filename: options.filename, compact: false });
                    if (!saved) return false;
                    await acceptPackage(saved);
                    return true;
                });
                if (!written) return false;
                events.fire('doc.setName', options.filename);
            }
            return true;
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error(error);
                await events.invoke('showPopup', {
                    type: 'error',
                    header: i18n.t('doc.save-failed'),
                    message: `${error.message ?? error}`
                });
            }
        }
        return false;
    });
    for (const name of ['doc.save', 'doc.savePackage']) {
        events.on(name, () => events.invoke(name));
    }

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
