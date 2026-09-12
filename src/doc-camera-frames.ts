import type { ReadFileSystem } from '@playcanvas/splat-transform';

import { migrateLegacyCameras } from './cameras/camera-legacy';
import { createCamera, normalizeDocument, type CameraDocument } from './cameras/camera-store';
import { ElementType } from './element';
import type { Events } from './events';
import { Model } from './model';
import type { Scene } from './scene';

export const readEntry = async (fs: ReadFileSystem, path: string) => {
    const source = await fs.createSource(path);
    try {
        return await source.read().readAll();
    } finally {
        source.close();
    }
};

// Validate metadata before touching the open scene. A native v1 resource table
// and a Camera Frames schema version describe different parts of the format.
export const validateProject = (document: any) => {
    if (!document || ![0, 1].includes(document.version ?? 0) || !Array.isArray(document.splats)) {
        throw new Error('対応していないプロジェクト形式です');
    }
    const entries = [...document.splats, ...document.models ?? []];
    for (const entry of entries) {
        for (const [key, length] of [['position', 3], ['rotation', 4], ['scale', 3]] as const) {
            const value = (entry?.transform ?? entry)?.[key];
            if (value && (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite))) {
                throw new Error('オブジェクトの姿勢が不正です');
            }
        }
    }
    for (const key of ['position', 'rotation', 'fpvPosition', 'focalPoint']) {
        const value = document.camera?.[key];
        if (value) {
            const values = Array.isArray(value) ? value : Object.values(value);
            if (values.length !== (key === 'rotation' ? 4 : 3) || !values.every(Number.isFinite) ||
                (key === 'rotation' && values.every(component => component === 0))) {
                throw new Error('ビューポートカメラの姿勢が不正です');
            }
        }
    }
    const fov = document.camera?.fov;
    const near = document.camera?.nearOverride;
    if ((fov !== undefined && (!Number.isFinite(fov) || fov <= 0 || fov >= 180)) ||
        (near != null && (!Number.isFinite(near) || near <= 0))) throw new Error('ビューポートカメラのレンズが不正です');
    if (document.version === 1) {
        if (!Array.isArray(document.resources)) throw new Error('Splat資源がありません');
        for (const splat of document.splats) {
            if (!Number.isInteger(splat.resource) || !document.resources[splat.resource] || typeof splat.instances !== 'string') {
                throw new Error('Splat資源への参照が不正です');
            }
        }
    }
    if (document.shotCameras) normalizeDocument(document.shotCameras);
    if (document.cameraFrames) migrateLegacyCameras(document.cameraFrames);
    return document;
};

export const collectProductState = (scene: Scene, events: Events) => {
    const models = scene.getElementsByType(ElementType.model) as Model[];
    return {
        schemaVersion: 5,
        shotCameras: events.invoke('docSerialize.shotCameras'),
        cameraWorkspace: events.invoke('docSerialize.cameraWorkspace'),
        referenceImages: events.invoke('docSerialize.referenceImages'),
        lighting: events.invoke('docSerialize.lighting'),
        models: models.map((model, index) => ({ ...model.docSerialize(), filename: `models/model_${index}.glb` }))
    };
};

export const collectProductAssets = (scene: Scene, events: Events): Array<{ path: string; blob: Blob }> => {
    const models = scene.getElementsByType(ElementType.model) as Model[];
    return [
        ...models.map((model, index) => {
            if (!model.sourceBlob) throw new Error(`${model.name}のGLB元データがありません`);
            return { path: `models/model_${index}.glb`, blob: model.sourceBlob };
        }),
        ...events.invoke('referenceImages.docAssets')
    ];
};

export const readProductAssets = async (document: any, fs: ReadFileSystem, names: string[], scene: Scene) => {
    const models: Model[] = [];
    const references = new Map<string, Blob>();
    try {
        for (const [index, settings] of (document.models ?? []).entries()) {
            const path = settings.filename ?? `models/model_${index}.glb`;
            const blob = new Blob([await readEntry(fs, path) as BlobPart], { type: 'model/gltf-binary' });
            const model = await scene.assetLoader.loadModel(path, blob);
            model.docDeserialize(settings);
            models.push(model);
        }
        for (const path of new Set(names.filter(path => path.startsWith('reference-images/') || path.startsWith('reference-image/')))) {
            references.set(path, new Blob([await readEntry(fs, path) as BlobPart]));
        }
        return { models, references };
    } catch (error) {
        models.forEach(model => model.destroy());
        throw error;
    }
};

export const restoreProductState = async (document: any, references: Map<string, Blob>, scene: Scene, events: Events) => {
    let cameras: CameraDocument = document.shotCameras;
    if (!cameras && document.cameraFrames) {
        // Old normalized orbit distance used the scene radius and base horizontal FOV.
        const fov = document.cameraFrames.renderBox?.projection?.baseFov ?? document.camera?.fov ?? 60;
        const factor = Math.sin(fov * Math.PI / 360);
        const radius = Math.max(0.001, scene.bound?.halfExtents.length() ?? 1);
        cameras = migrateLegacyCameras(document.cameraFrames, { radius, fovFactor: factor });
    }
    if (!cameras) {
        const record = createCamera(crypto.randomUUID());
        record.camera.position = scene.camera.position.toArray() as [number, number, number];
        record.camera.rotation = scene.camera.mainCamera.getRotation().toArray() as [number, number, number, number];
        cameras = { version: 1, cameras: [record], outputCameraId: record.id };
    }
    events.invoke('docDeserialize.shotCameras', cameras);
    await events.invoke('docDeserialize.referenceImages', document.referenceImages ?? document.referenceImage, references);
    // Legacy single-image documents did not carry a reference-preset ID.
    const refs = events.invoke('referenceImages.presetsState');
    const store = events.invoke('cameraViews').store;
    if (refs?.presets?.length && cameras.cameras.some(camera => !camera.referenceImagePresetId)) {
        const state = structuredClone(store.state) as CameraDocument;
        state.cameras.forEach((camera) => {
            camera.referenceImagePresetId ||= refs.activePresetId ?? refs.presets[0].id;
        });
        store.replace(state);
    }
    if (document.cameraWorkspace) events.invoke('docDeserialize.cameraWorkspace', document.cameraWorkspace);
    else if (document.cameraFrames?.enabled) {
        store.setWorkspace({ ...structuredClone(store.views), activePaneId: 'shot' });
    }
    events.invoke('docDeserialize.lighting', document.lighting);
    events.fire('cameraFrames.syncReferenceImages');
};
