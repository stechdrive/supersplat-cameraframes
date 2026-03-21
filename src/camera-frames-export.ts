import type { CameraFramesRenderBackend } from './camera-frames-render-backend';
import type { CameraFramesState, CameraPoseSnapshot, ExportFormat, ReferenceExportLayer } from './camera-frames-types';
import type { PngCompressor } from './png-compressor';
import { exportPsd, type PsdOverlayLayer } from './psd-export';
import { localize } from './ui/localization';
import { Crc } from './utils/crc';

type ApplyCameraPose = (pose: CameraPoseSnapshot, options: { silent: boolean; allowOrtho: boolean; }) => void;
type GetCompressor = () => PngCompressor;
type GetState = () => CameraFramesState;
type NormalizeFormat = (format: ExportFormat) => ExportFormat;
type RenderFrameOverlay = (width: number, height: number) => { canvas: HTMLCanvasElement; };
type RenderFrameOverlaysByManagement = (width: number, height: number) => Array<{ name: string; canvas: HTMLCanvasElement; }>;
type ResolveFilename = (name: string | undefined, format: ExportFormat) => string;

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
    basePixels?: Uint8ClampedArray | null;
    underlays?: PsdOverlayLayer[];
    overlays: PsdOverlayLayer[];
    width: number;
    height: number;
    filename: string;
};

type RenderImageOptions = { format?: ExportFormat; filename?: string };
type RenderImageProgress = { text: string; progress: number; };
type OnRenderImageProgress = (update: RenderImageProgress) => void;

type RenderImageParams = {
    renderBackend: CameraFramesRenderBackend;
    getState: GetState;
    applyCameraPose: ApplyCameraPose;
    normalizeFormat: NormalizeFormat;
    resolveFilename: ResolveFilename;
    renderFrameOverlay: RenderFrameOverlay;
    renderFrameOverlaysByManagement: RenderFrameOverlaysByManagement;
    getCompressor: GetCompressor;
    options?: RenderImageOptions;
    onProgress?: OnRenderImageProgress;
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

const hasVisiblePixels = (pixels: Uint8Array | Uint8ClampedArray) => {
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) {
            return true;
        }
    }
    return false;
};

export const renderImage = async ({
    renderBackend,
    getState,
    applyCameraPose,
    normalizeFormat,
    resolveFilename,
    renderFrameOverlay,
    renderFrameOverlaysByManagement,
    getCompressor,
    options,
    onProgress
}: RenderImageParams) => {
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
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
    const usePsdModelMaskExport = format === 'psd' && !!state.exportModelLayers;
    const usePsdSplatMaskExport = format === 'psd' && !!state.exportModelLayers && !!state.exportSplatLayers;

    const stageKeys = [
        'panel.camera-frames.export.progress.stage.prepare',
        'panel.camera-frames.export.progress.stage.base',
        'panel.camera-frames.export.progress.stage.reference',
        'panel.camera-frames.export.progress.stage.overlays',
        ...(usePsdModelMaskExport ? ['panel.camera-frames.export.progress.stage.model-layers'] : []),
        ...(usePsdSplatMaskExport ? ['panel.camera-frames.export.progress.stage.splat-layers'] : []),
        'panel.camera-frames.export.progress.stage.write'
    ];
    const totalStages = Math.max(stageKeys.length, 1);
    let currentStageIndex = 0;

    const emitStageProgress = (text: string, stageProgress = 0) => {
        onProgress?.({
            text,
            progress: clamp01((currentStageIndex + clamp01(stageProgress)) / totalStages)
        });
    };

    const runStage = async <T>(
        key: string,
        fn: (reportStageProgress: (progress: number, text?: string) => void) => T | Promise<T>
    ) => {
        const baseText = localize(key);
        emitStageProgress(baseText, 0);
        try {
            const result = await fn((progress, text) => {
                emitStageProgress(text ?? baseText, progress);
            });
            emitStageProgress(baseText, 1);
            return result;
        } finally {
            currentStageIndex += 1;
        }
    };

    try {
        await runStage('panel.camera-frames.export.progress.stage.prepare', () => {
            renderBackend.syncExportFrustum(width, height);
        });

        const currentState = getState();
        const basePixels = await runStage('panel.camera-frames.export.progress.stage.base', async () => {
            return (usePsdModelMaskExport || usePsdSplatMaskExport) ?
                await renderBackend.renderBaseWithoutLayers(width, height, {
                    excludeModels: usePsdModelMaskExport,
                    excludeSplats: usePsdSplatMaskExport
                }) :
                await renderBackend.renderBase(width, height);
        });
        const referenceLayers = await runStage('panel.camera-frames.export.progress.stage.reference', async () => {
            return await renderBackend.renderReferenceLayers(width, height, { applyOpacity: format !== 'psd' });
        });
        const debugOverlays = await runStage('panel.camera-frames.export.progress.stage.overlays', async () => {
            return await renderBackend.renderOverlayLayers(width, height, getState().exportGridOverlay);
        });

        if (format === 'psd') {
            const referenceGroupLayers: PsdOverlayLayer[] = referenceLayers
            .map(layer => ({ name: layer.name, canvas: layer.canvas, opacity: layer.opacity, bounds: layer.bounds }));
            const modelOverlays = usePsdModelMaskExport ?
                await runStage('panel.camera-frames.export.progress.stage.model-layers', async (reportStageProgress) => {
                    return await renderBackend.renderModelLayersWithOcclusion(width, height, currentState.exportModelLayers, ({ completed, total, name }) => {
                        const itemText = localize('panel.camera-frames.export.progress.item.model', {
                            index: completed,
                            total,
                            name: name ?? 'Model'
                        });
                        reportStageProgress(total > 0 ? completed / total : 1, itemText);
                    });
                }) :
                await renderBackend.renderModelLayers(width, height, currentState.exportModelLayers);
            const splatOverlays = usePsdSplatMaskExport ?
                await runStage('panel.camera-frames.export.progress.stage.splat-layers', async (reportStageProgress) => {
                    return await renderBackend.renderSplatLayersWithOcclusion(width, height, currentState.exportSplatLayers, ({ completed, total, name }) => {
                        const itemText = localize('panel.camera-frames.export.progress.item.splat', {
                            index: completed,
                            total,
                            name: name ?? 'Splat'
                        });
                        reportStageProgress(total > 0 ? completed / total : 1, itemText);
                    });
                }) :
                [];
            const orderedSplatOverlays = [...splatOverlays].reverse();
            const orderedModelOverlays = [...modelOverlays].reverse();
            const frameOverlays = renderFrameOverlaysByManagement(width, height);
            const guideGroupLayers: PsdOverlayLayer[] = [
                ...(debugOverlays?.grid ? [{
                    name: localize('panel.camera-frames.export.grid-layer.grid'),
                    canvas: debugOverlays.grid,
                    blendMode: 'multiply' as const
                }] : []),
                ...(debugOverlays?.eyeLevel ? [{
                    name: localize('panel.camera-frames.export.grid-layer.eye-level'),
                    canvas: debugOverlays.eyeLevel
                }] : [])
            ];
            const overlayLayers = [
                // Scene Manager の上側が PSD の上側レイヤーになるよう、
                // export 配列は bottom-to-top に並べる。
                ...orderedSplatOverlays,
                ...orderedModelOverlays,
                ...(guideGroupLayers.length > 0 ? [{
                    name: localize('panel.camera-frames.export.guide-group'),
                    opened: true,
                    children: guideGroupLayers
                }] : []),
                ...(referenceGroupLayers.length > 0 ? [{
                    name: localize('panel.camera-frames.export.reference-group'),
                    opened: true,
                    children: referenceGroupLayers
                }] : []),
                ...frameOverlays
            ];
            await runStage('panel.camera-frames.export.progress.stage.write', async () => {
                await renderPsd({
                    basePixels: hasVisiblePixels(basePixels) ?
                        (basePixels instanceof Uint8ClampedArray ? basePixels : new Uint8ClampedArray(basePixels)) :
                        null,
                    overlays: overlayLayers,
                    width,
                    height,
                    filename
                });
            });
        } else {
            const overlay = renderFrameOverlay(width, height);
            const gridOverlay = mergeOverlayCanvases(width, height, [debugOverlays?.grid]);
            const eyeLevelOverlay = mergeOverlayCanvases(width, height, [debugOverlays?.eyeLevel]);
            await runStage('panel.camera-frames.export.progress.stage.write', async () => {
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
            });
        }
    } catch (error) {
        console.error('cameraFrames.render failed', error);
        await renderBackend.showExportError(error);
    } finally {
        renderBackend.restorePreviewAfterExport(getState().enabled);
    }
};
