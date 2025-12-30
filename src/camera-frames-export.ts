import { Crc } from './serialize/crc';
import { localize } from './ui/localization';
import type { Events } from './events';
import type { Model } from './model';
import type { Scene } from './scene';
import type { ReferenceExportLayer } from './camera-frames-types';

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
