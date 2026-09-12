import type { CameraEditor } from './cameras/camera-editor';
import { migrateLegacyCameras } from './cameras/camera-legacy';
import { normalizeDocument } from './cameras/camera-store';
import type { Events } from './events';

const type = 'supersplat.camera-frames.main-camera';

export const readCameraFile = (value: any) => {
    if (value?.type !== type || ![1, 2, 3, 4].includes(value.version)) throw new Error('対応していないカメラファイルです');
    return value.version === 4 ? normalizeDocument(value.shotCameras) : migrateLegacyCameras(value);
};

export const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const registerCameraSave = (events: Events, editor: CameraEditor) => {
    const serialize = () => ({ type,
        version: 4,
        shotCameras: structuredClone(editor.views.store.state),
        referenceImagePresets: events.invoke('referenceImages.presetsState').presets });
    const importBlob = async (blob: Blob) => {
        if (blob.size > 16 * 1024 * 1024) throw new Error('カメラファイルが大きすぎます');
        const parsed = JSON.parse(await blob.text());
        const document = readCameraFile(parsed);
        // Preserve reference preset identity; .sscam carries links, not pixels.
        const presets = parsed.referenceImagePresets ?? document.cameras.map(camera => ({ id: camera.referenceImagePresetId, name: camera.name }));
        events.invoke('referenceImages.ensurePresets', presets.filter((preset: any) => typeof preset.id === 'string' && preset.id));
        await editor.history.change(draft => Object.assign(draft, document));
        events.fire('cameraFrames.syncReferenceImages');
        return document;
    };
    const reportError = async (error: any) => {
        if (error.name === 'AbortError') return;
        await events.invoke('showPopup', { type: 'error', header: 'カメラファイル', message: error.message ?? String(error) });
    };
    const exportCameras = () => downloadBlob(new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' }), 'cameras.sscam');
    const importCameras = () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.sscam';
        input.onchange = () => {
            if (input.files?.[0]) importBlob(input.files[0]).catch(reportError);
        };
        input.click();
    };
    events.function('cameraSave.serialize', serialize);
    events.function('cameraSave.importBlob', importBlob);
    events.function('cameraSave.exportCameraPresets', exportCameras);
    events.function('cameraSave.importCameraPresets', importCameras);
    events.function('cameraSave.exportMainCamera', exportCameras);
    events.function('cameraSave.importMainCamera', importCameras);
};
