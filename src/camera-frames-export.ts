import type { CameraFramesState, CameraPoseSnapshot, ExportFormat, ReferenceExportLayer } from './camera-frames-types';
import type { Events } from './events';
import type { Model } from './model';
import type { PngCompressor } from './png-compressor';
import { exportPsd, type PsdOverlayLayer } from './psd-export';
import type { Scene } from './scene';
import { Crc } from './serialize/crc';
import { localize } from './ui/localization';

type ApplyCameraPose = (pose: CameraPoseSnapshot, options: { silent: boolean; allowOrtho: boolean; }) => void;
type ClearViewportNearOverride = () => void;
type GetCompressor = () => PngCompressor;
type GetState = () => CameraFramesState;
type NormalizeFormat = (format: ExportFormat) => ExportFormat;
type RenderFrameOverlay = (width: number, height: number) => { canvas: HTMLCanvasElement; };
type RenderFrameOverlaysByManagement = (width: number, height: number) => Array<{ name: string; canvas: HTMLCanvasElement; }>;
type RequestRender = () => void;
type ResolveFilename = (name: string | undefined, format: ExportFormat) => string;
type SyncCameraFrustum = () => void;

type RenderPngParams = {
    basePixels: Uint8Array;
    referenceLayers?: ReferenceExportLayer[];
    frameOverlay: HTMLCanvasElement;
    gridOverlay?: HTMLCanvasElement | null;
    eyeLevelOverlay?: HTMLCanvasElement | null;
    width: number;
    height: number;
    filename: string;
    getCompressor: GetCompressor;
};

type RenderPsdParams = {
    basePixels: Uint8ClampedArray;
    underlays?: PsdOverlayLayer[];
    overlays: PsdOverlayLayer[];
    width: number;
    height: number;
    filename: string;
};

type RenderImageOptions = { format?: ExportFormat; filename?: string };

type RenderImageParams = {
    events: Events;
    scene: Scene;
    getState: GetState;
    applyCameraPose: ApplyCameraPose;
    normalizeFormat: NormalizeFormat;
    resolveFilename: ResolveFilename;
    renderFrameOverlay: RenderFrameOverlay;
    renderFrameOverlaysByManagement: RenderFrameOverlaysByManagement;
    getCompressor: GetCompressor;
    requestRender: RequestRender;
    syncCameraFrustum: SyncCameraFrustum;
    clearViewportNearOverride: ClearViewportNearOverride;
    options?: RenderImageOptions;
};

type SyncExportFrustumParams = {
    scene: Scene;
    width: number;
    height: number;
    clearViewportNearOverride: ClearViewportNearOverride;
    syncCameraFrustum: SyncCameraFrustum;
};

export const canvasFromPixels = (pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for overlay render');
    }
    const view = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
    const imgData = new ImageData(width, height);
    imgData.data.set(view);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
};

export const mergeOverlayCanvases = (
    width: number,
    height: number,
    overlays: Array<HTMLCanvasElement | null | undefined>
) => {
    const valid = overlays.filter((layer): layer is HTMLCanvasElement => !!layer);
    if (valid.length === 0) {
        return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for merged overlays');
    }
    valid.forEach(layer => ctx.drawImage(layer, 0, 0));
    return canvas;
};

export const flipForCompressor = (data: Uint32Array, width: number, height: number) => {
    // render.offscreen() は既に y 軸を反転済みだが、PngCompressor でもう一度反転されるため、
    // ここでバッファを bottom-up に戻しておく（ダブルフリップ対策）。
    const flipped = new Uint32Array(data.length);
    for (let y = 0; y < height; y++) {
        const srcStart = (height - 1 - y) * width;
        const dstStart = y * width;
        flipped.set(data.subarray(srcStart, srcStart + width), dstStart);
    }
    return flipped;
};

export const downloadArrayBuffer = (arrayBuffer: ArrayBuffer, filename: string) => {
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.href = url;
    el.download = filename;
    el.click();
    URL.revokeObjectURL(url);
};

export const addPngDpi = (arrayBuffer: ArrayBuffer, dpi: number) => {
    const data = new Uint8Array(arrayBuffer);
    const PNG_SIG = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    if (data.length < 33 || !PNG_SIG.every((b, i) => data[i] === b)) {
        return arrayBuffer;
    }

    const readUint32BE = (offset: number) => {
        return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
    };

    let ihdrEnd = -1;
    let offset = 8; // after signature
    while (offset + 8 <= data.length) {
        const length = readUint32BE(offset);
        const type = String.fromCharCode(data[offset + 4], data[offset + 5], data[offset + 6], data[offset + 7]);
        const chunkEnd = offset + 8 + length + 4;
        if (chunkEnd > data.length) {
            break;
        }
        if (type === 'IHDR') {
            ihdrEnd = chunkEnd;
            break;
        }
        offset = chunkEnd;
    }

    if (ihdrEnd < 0) {
        return arrayBuffer;
    }

    const ppm = Math.max(1, Math.round(dpi * 39.37007874015748)); // pixels per meter

    const chunk = new Uint8Array(4 + 4 + 9 + 4);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, 9); // data length
    chunk.set([0x70, 0x48, 0x59, 0x73], 4); // 'pHYs'
    view.setUint32(8, ppm, false);  // X pixels per unit
    view.setUint32(12, ppm, false); // Y pixels per unit
    chunk[16] = 1; // unit: meter

    const crc = new Crc();
    crc.update(chunk.subarray(4, 17)); // type + data
    view.setUint32(17, crc.value(), false);

    const result = new Uint8Array(data.length + chunk.length);
    result.set(data.subarray(0, ihdrEnd), 0);
    result.set(chunk, ihdrEnd);
    result.set(data.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return result.buffer;
};

export const renderBase = async (events: Events, width: number, height: number) => {
    // ベース描画には下絵を混ぜない（PSD で独立レイヤー化し、PNG も CPU 合成で制御する）
    const pixels = await events.invoke('render.offscreen', width, height, { includeReferenceImage: false }) as Uint8Array;
    if (!pixels) {
        throw new Error('render.offscreen returned empty buffer');
    }
    return pixels;
};

export const renderReferenceLayers = async (
    events: Events,
    width: number,
    height: number,
    options?: { applyOpacity?: boolean; }
): Promise<ReferenceExportLayer[]> => {
    const layers = await events.invoke('referenceImages.renderExportLayers', width, height, options) as ReferenceExportLayer[] | null;
    return Array.isArray(layers) ? layers : [];
};

export const renderOverlayLayer = async (
    events: Events,
    width: number,
    height: number,
    options: { includeGrid?: boolean; includeEyeLevel?: boolean; }
): Promise<HTMLCanvasElement | null> => {
    const includeGrid = !!options.includeGrid;
    const includeEyeLevel = !!options.includeEyeLevel;
    if (!includeGrid && !includeEyeLevel) {
        return null;
    }
    const pixels = await events.invoke('render.offscreen', width, height, {
        includeGrid,
        includeEyeLevel,
        overlaysOnly: true,
        unpremultiplyAlpha: true
    }) as Uint8Array;
    if (!pixels) {
        throw new Error('render.offscreen returned empty overlay buffer');
    }
    return canvasFromPixels(pixels, width, height);
};

export const renderOverlayLayers = async (
    events: Events,
    width: number,
    height: number,
    exportGridOverlay: boolean
): Promise<{ grid: HTMLCanvasElement | null; eyeLevel: HTMLCanvasElement | null; } | null> => {
    if (!exportGridOverlay) {
        return null;
    }
    const grid = await renderOverlayLayer(events, width, height, { includeGrid: true });
    const eyeLevel = await renderOverlayLayer(events, width, height, { includeEyeLevel: true });
    return { grid, eyeLevel };
};

export const renderModelLayers = async (
    events: Events,
    scene: Scene,
    width: number,
    height: number,
    exportModelLayers: boolean
): Promise<Array<{ name: string; canvas: HTMLCanvasElement; }>> => {
    if (!exportModelLayers) {
        return [];
    }

    const models = ((events.invoke('mesh.list') as Model[] | null) ?? []).filter((model) => {
        return !!model && !!model.entity && model.visible && model.entity.enabled !== false;
    });

    if (models.length === 0) {
        return [];
    }

    const overlays: Array<{ name: string; canvas: HTMLCanvasElement; }> = [];

    const modelStates = models.map(model => ({
        model,
        enabled: model.entity.enabled
    }));

    const layers = scene.app.scene.layers;
    const worldLayer = layers.getLayerByName('World');
    const restoreLayers: Array<{ layer: any; enabled: boolean; }> = [];
    const rememberLayer = (layer?: any) => {
        if (!layer) return;
        restoreLayers.push({ layer, enabled: layer.enabled });
    };

    const layersToDisable = [
        worldLayer,
        scene.overlayLayer,
        scene.debugLayer,
        scene.gizmoLayer,
        scene.backgroundLayer,
        scene.shadowLayer,
        scene.exportOverlayLayer
    ];
    layersToDisable.forEach(rememberLayer);

    const prevRenderFlags = { ...scene.renderFlags };
    const prevGridVisible = scene.grid.visible;
    const prevEyeVisible = scene.eyeLevel.visible;
    const prevRenderOverlays = scene.camera.renderOverlays;

    try {
        layersToDisable.forEach((layer) => {
            if (layer) {
                layer.enabled = false;
            }
        });

        scene.renderFlags.forceGridOverlay = false;
        scene.renderFlags.forceEyeLevelOverlay = false;
        scene.renderFlags.eyeLevelLayerOverride = null;
        scene.renderFlags.gridLayerOverride = null;
        scene.renderFlags.hideBounds = true;
        scene.grid.visible = false;
        scene.eyeLevel.visible = false;
        scene.camera.renderOverlays = false;

        modelStates.forEach(({ model }) => {
            model.entity.enabled = false;
        });

        for (const { model } of modelStates) {
            model.entity.enabled = true;
            const pixels = await events.invoke('render.offscreen', width, height, {
                unpremultiplyAlpha: true
            }) as Uint8Array;
            if (pixels && pixels.length > 0) {
                overlays.push({
                    name: localize('panel.camera-frames.export.model-layer', { name: model.name ?? 'Model' }),
                    canvas: canvasFromPixels(pixels, width, height)
                });
            }
            model.entity.enabled = false;
        }
    } finally {
        modelStates.forEach(({ model, enabled }) => {
            model.entity.enabled = enabled;
        });
        restoreLayers.forEach(({ layer, enabled }) => {
            layer.enabled = enabled;
        });
        scene.renderFlags.forceGridOverlay = prevRenderFlags.forceGridOverlay;
        scene.renderFlags.forceEyeLevelOverlay = prevRenderFlags.forceEyeLevelOverlay;
        scene.renderFlags.eyeLevelLayerOverride = prevRenderFlags.eyeLevelLayerOverride;
        scene.renderFlags.gridLayerOverride = prevRenderFlags.gridLayerOverride;
        scene.renderFlags.hideBounds = prevRenderFlags.hideBounds;
        scene.grid.visible = prevGridVisible;
        scene.eyeLevel.visible = prevEyeVisible;
        scene.camera.renderOverlays = prevRenderOverlays;
    }

    return overlays;
};

export const renderPng = async (params: RenderPngParams) => {
    const { basePixels, referenceLayers, frameOverlay, gridOverlay, eyeLevelOverlay, width, height, filename, getCompressor } = params;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for PNG render');
    }

    const imgData = new ImageData(new Uint8ClampedArray(basePixels), width, height);
    ctx.putImageData(imgData, 0, 0);
    if (gridOverlay) {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(gridOverlay, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }
    const refLayers = Array.isArray(referenceLayers) ? referenceLayers : [];
    const backLayers = refLayers.filter(l => l?.group === 'back');
    const frontLayers = refLayers.filter(l => l?.group === 'front');
    if (backLayers.length > 0) {
        ctx.globalCompositeOperation = 'destination-over';
        backLayers.slice().reverse().forEach((layer) => {
            const bounds = layer.bounds;
            ctx.drawImage(layer.canvas, bounds?.left ?? 0, bounds?.top ?? 0);
        });
        ctx.globalCompositeOperation = 'source-over';
    }
    frontLayers.forEach((layer) => {
        const bounds = layer.bounds;
        ctx.drawImage(layer.canvas, bounds?.left ?? 0, bounds?.top ?? 0);
    });
    if (eyeLevelOverlay) {
        ctx.drawImage(eyeLevelOverlay, 0, 0);
    }
    ctx.drawImage(frameOverlay, 0, 0);

    const merged = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer);
    const flipped = flipForCompressor(merged, width, height);

    const compressor = getCompressor();
    let arrayBuffer = await compressor.compress(flipped, width, height);
    arrayBuffer = addPngDpi(arrayBuffer, 150);
    downloadArrayBuffer(arrayBuffer, filename);
};

export const renderPsd = async (params: RenderPsdParams) => {
    const { basePixels, underlays, overlays, width, height, filename } = params;
    await exportPsd({
        basePixels,
        underlays,
        overlays,
        width,
        height,
        filename
    });
};

export const syncExportFrustum = ({
    scene,
    width,
    height,
    clearViewportNearOverride,
    syncCameraFrustum
}: SyncExportFrustumParams) => {
    // 書き出し開始前に、指定サイズを前提としたエクスポート用フラスタムを明示的にカメラへ適用する
    // camera.resize などの副作用イベントに依存しない安全策。
    // 一時的に targetSize を設定して export モードの計算を行い、終わったら戻す
    // targetSize の切替はここに集約し、モード混在や累積誤差を防ぐ。
    clearViewportNearOverride();
    const prevTarget = scene.camera.targetSize ? { ...scene.camera.targetSize } : null;
    scene.camera.targetSize = { width, height };
    syncCameraFrustum();
    scene.camera.targetSize = prevTarget;
};

export const renderImage = async ({
    events,
    scene,
    getState,
    applyCameraPose,
    normalizeFormat,
    resolveFilename,
    renderFrameOverlay,
    renderFrameOverlaysByManagement,
    getCompressor,
    requestRender,
    syncCameraFrustum,
    clearViewportNearOverride,
    options
}: RenderImageParams) => {
    const state = getState();
    const rb = state.renderBox;
    const width = Math.round(rb.baseSize.w * rb.scale.kx);
    const height = Math.round(rb.baseSize.h * rb.scale.ky);

    if (width <= 0 || height <= 0) {
        return;
    }

    if (state.enabled && state.mainCameraPose) {
        applyCameraPose(state.mainCameraPose, { silent: true, allowOrtho: false });
    }

    const format = normalizeFormat(options?.format ?? state.exportFormat);
    const filename = resolveFilename(options?.filename ?? state.exportName, format);

    try {
        // 書き出し前に明示的にエクスポート用フラスタムを適用し、副作用イベント(camera.resize)頼りを排除
        syncExportFrustum({
            scene,
            width,
            height,
            clearViewportNearOverride,
            syncCameraFrustum
        });
        const basePixels = await renderBase(events, width, height);
        const debugOverlays = await renderOverlayLayers(events, width, height, getState().exportGridOverlay);
        const referenceLayers = await renderReferenceLayers(events, width, height, { applyOpacity: format !== 'psd' });

        if (format === 'psd') {
            const referenceUnderlays: PsdOverlayLayer[] = referenceLayers
            .filter(layer => layer.group === 'back')
            .map(layer => ({ name: layer.name, canvas: layer.canvas, opacity: layer.opacity, bounds: layer.bounds }));
            const referenceOverlays: PsdOverlayLayer[] = referenceLayers
            .filter(layer => layer.group === 'front')
            .map(layer => ({ name: layer.name, canvas: layer.canvas, opacity: layer.opacity, bounds: layer.bounds }));
            const modelOverlays = await renderModelLayers(events, scene, width, height, getState().exportModelLayers);
            const frameOverlays = renderFrameOverlaysByManagement(width, height);
            const overlayLayers = [
                ...(debugOverlays?.grid ? [{ name: localize('panel.camera-frames.export.grid-layer.grid'), canvas: debugOverlays.grid }] : []),
                ...(debugOverlays?.eyeLevel ? [{ name: localize('panel.camera-frames.export.grid-layer.eye-level'), canvas: debugOverlays.eyeLevel }] : []),
                ...modelOverlays,
                ...referenceOverlays,
                ...frameOverlays
            ];
            await renderPsd({
                basePixels: basePixels instanceof Uint8ClampedArray ? basePixels : new Uint8ClampedArray(basePixels),
                underlays: referenceUnderlays.length > 0 ? referenceUnderlays : undefined,
                overlays: overlayLayers,
                width,
                height,
                filename
            });
        } else {
            const overlay = renderFrameOverlay(width, height);
            const gridOverlay = mergeOverlayCanvases(width, height, [debugOverlays?.grid]);
            const eyeLevelOverlay = mergeOverlayCanvases(width, height, [debugOverlays?.eyeLevel]);
            await renderPng({
                basePixels,
                referenceLayers,
                frameOverlay: overlay.canvas,
                gridOverlay,
                eyeLevelOverlay,
                width,
                height,
                filename,
                getCompressor
            });
        }
    } catch (error) {
        console.error('cameraFrames.render failed', error);
        await events.invoke('showPopup', {
            type: 'error',
            header: 'Camera Frames',
            message: `'${(error as Error)?.message ?? error}'`
        });
    } finally {
        // --- 修正箇所: ビューの復元 ---
        // render.offscreen が終了し、scene.camera.targetSize は null に戻っている。
        // ここで syncCameraFrustum を呼ぶことで、「Exportモード」から「Previewモード」の計算に戻り、
        // 元の ViewZoomPct が適用されたフラスタムがカメラに再設定される。
        if (getState().enabled) {
            syncCameraFrustum();
            requestRender();
        }
    }
};
