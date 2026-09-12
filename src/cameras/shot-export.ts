import { renderFrameOverlay, renderFrameOverlaysByManagement } from '../camera-frames-overlay';
import { downloadBlob } from '../camera-save';
import { ElementType } from '../element';
import type { Events } from '../events';
import type { Model } from '../model';
import { encodePng } from '../png-writer';
import { canvasFromPixels, createPsd, type PsdOverlayLayer } from '../psd-export';
import type { ReferenceImagesExportLayer } from '../reference-images-types';
import type { Scene } from '../scene';
import type { Splat } from '../splat';
import type { CameraEditor } from './camera-editor';
import { legacyFrameState } from './camera-legacy';
import type { CameraRecord } from './camera-store';
import { reconstructLayerMask } from './layer-mask';
import { resolveView } from './render-view';
import { ShotRenderer } from './shot-renderer';

export const straightPixels = (pixels: Uint8Array) => {
    const result = new Uint8ClampedArray(pixels);
    for (let i = 0; i < result.length; i += 4) {
        const a = result[i + 3];
        if (a > 0 && a < 255) for (let c = 0; c < 3; c++) result[i + c] = Math.round(result[i + c] * 255 / a);
    }
    return result;
};

export const transmittanceMask = (front: Uint8Array) => {
    const result = new Uint8ClampedArray(front.length);
    for (let i = 0; i < result.length; i += 4) {
        const t = 255 - front[i + 3];
        result.set([t, t, t, 255], i);
    }
    return result;
};

export const captureShot = async (scene: Scene, events: Events, camera: CameraRecord, format: 'png' | 'psd') => {
    const view = resolveView(camera.camera, camera.composition);
    const { width, height } = view.outputSize;
    if (Math.max(width, height) > scene.graphicsDevice.maxTextureSize || width * height > 64 * 1024 * 1024) throw new Error('出力サイズがGPUまたは画像処理の上限を超えています');
    const output = await ShotRenderer.create(scene);
    try {
        const state = legacyFrameState(camera);
        const settings = camera.settings;
        const references: ReferenceImagesExportLayer[] = settings.exportReferenceImages ? await events.invoke('referenceImages.renderCameraLayers', camera, width, height) : [];
        const referenceLayers = (group: 'back' | 'front') => references.filter(layer => layer.group === group)
        .map(({ name, canvas, bounds, opacity }) => ({ name, canvas, bounds, opacity }));
        const frame = renderFrameOverlay(width, height, state.renderBox, state.frames);
        const composite = await output.capture(view, { grid: settings.exportGridOverlay });
        const overlays: PsdOverlayLayer[] = [];
        let base = straightPixels(composite);
        const maskLayer = (pixels: Uint8ClampedArray) => ({
            canvas: canvasFromPixels(pixels, width, height),
            defaultColor: 255,
            bounds: { left: 0, top: 0, right: width, bottom: height }
        });
        if (format === 'psd' && settings.exportModelLayers) {
            // Preserve the product's editable object-source / mask contract.
            // Each source is unoccluded. The mask contains transmittance only;
            // source alpha belongs exclusively to the original image layer.
            base = straightPixels(await output.capture(view, { models: [], splats: settings.exportSplatLayers ? [] : undefined }));
            const models = (scene.getElementsByType(ElementType.model) as Model[]).filter(model => model.visible);
            for (const model of models) {
                const source = await output.capture(view, { models: [model], splats: [] });
                const front = await output.capture(view, { models: [model], occluders: models.filter(other => other !== model), mode: 'front-alpha' });
                overlays.push({ name: model.name,
                    canvas: canvasFromPixels(straightPixels(source), width, height),
                    mask: maskLayer(transmittanceMask(front)) });
            }
            if (settings.exportSplatLayers) {
                const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);
                let all = await output.capture(view, { models: [], splats });
                for (const [index, splat] of splats.entries()) {
                    const pixels = await output.capture(view, { models: [], splats: [splat] });
                    const lower = index + 1 < splats.length ? await output.capture(view, { models: [], splats: splats.slice(index + 1) }) : null;
                    overlays.unshift({ name: splat.name,
                        canvas: canvasFromPixels(straightPixels(pixels), width, height),
                        ...(lower ? { mask: maskLayer(reconstructLayerMask(pixels, all, lower)) } : {}) });
                    all = lower;
                }
            }
            if (settings.exportGridOverlay) {
                const grid = await output.capture(view, { models: [], splats: [], grid: true });
                overlays.push({ name: 'グリッド・アイレベル', canvas: canvasFromPixels(straightPixels(grid), width, height) });
            }
        }
        const guides = format === 'psd' ? renderFrameOverlaysByManagement(width, height, state.renderBox, state.frames, id => `フレーム ${id}`) : [{ name: 'フレーム', canvas: frame.canvas }];
        const layers = [...overlays, ...referenceLayers('front'), ...guides];
        if (format === 'psd') {
            const psd = createPsd({ width, height, basePixels: base, underlays: referenceLayers('back'), overlays: layers, filename: '' });
            return { blob: new Blob([psd.buffer], { type: 'image/vnd.adobe.photoshop' }), width, height, composite };
        }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        const draw = (layer: PsdOverlayLayer) => {
            ctx.globalAlpha = layer.opacity ?? 1; ctx.drawImage(layer.canvas, layer.bounds?.left ?? 0, layer.bounds?.top ?? 0);
        };
        referenceLayers('back').forEach(draw);
        ctx.globalAlpha = 1; ctx.drawImage(canvasFromPixels(base, width, height), 0, 0);
        layers.forEach(draw);
        const pixels = new Uint8Array(ctx.getImageData(0, 0, width, height).data);
        return { blob: new Blob([await encodePng(pixels, width, height, 150)], { type: 'image/png' }), width, height, composite };
    } finally {
        output.destroy();
    }
};

export const registerShotExport = (scene: Scene, events: Events, editor: CameraEditor) => {
    let busy = false;
    events.function('cameraFrames.exportBusy', () => busy);
    const run = async <T>(action: () => Promise<T>) => {
        if (busy) throw new Error('書き出し中です');
        busy = true; events.fire('cameraFrames.exportBusyChanged', true); events.fire('startSpinner');
        try {
            return await scene.commandQueue.enqueue(action);
        } finally {
            busy = false; events.fire('cameraFrames.exportBusyChanged', false); events.fire('stopSpinner');
        }
    };
    events.function('shotCameras.capture', (id: string, format: 'png' | 'psd' = 'png') => {
        const camera = structuredClone(editor.views.store.get(id));
        if (!camera) throw new Error('出力する撮影カメラがありません');
        return run(() => captureShot(scene, events, camera, format));
    });
    events.function('cameraFrames.render', async (options: { format?: 'png' | 'psd'; filename?: string; target?: string; presetIds?: string[] } = {}) => {
        const state = structuredClone(editor.views.store.state);
        const cameras = state.cameras.filter(camera => (options.target ?? state.exportTarget) === 'all' ||
            ((options.target ?? state.exportTarget) === 'selected' ? (options.presetIds ?? state.exportPresetIds).includes(camera.id) : camera.id === state.outputCameraId));
        try {
            return await run(async () => {
                for (const camera of cameras) {
                    const format = options.format ?? camera.settings.exportFormat;
                    const result = await captureShot(scene, events, camera, format);
                    const sourceName = options.filename || camera.settings.exportName || 'cf-%cam';
                    const expanded = sourceName.replace(/%cam/g, camera.name).replace(/\.(png|psd)$/i, '');
                    const name = Array.from(`${expanded}${cameras.length > 1 && !sourceName.includes('%cam') ? `-${camera.name}` : ''}`)
                    .map(char => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? '_' : char)).join('');
                    downloadBlob(result.blob, `${name}.${format}`);
                }
                return true;
            });
        } catch (error) {
            await events.invoke('showPopup', { type: 'error', header: '画像の書き出し', message: error.message ?? String(error) });
            return false;
        }
    });
};
