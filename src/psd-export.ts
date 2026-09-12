import { writePsd, type BlendMode, type Layer, type Psd } from 'ag-psd';

type PsdLayerBounds = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

type PsdLayerMask = {
    canvas: HTMLCanvasElement;
    bounds?: PsdLayerBounds;
    defaultColor?: number;
    disabled?: boolean;
    positionRelativeToLayer?: boolean;
    fromVectorData?: boolean;
    userMaskDensity?: number;
    userMaskFeather?: number;
    vectorMaskDensity?: number;
    vectorMaskFeather?: number;
};

type PsdOverlayLayer = {
    name: string;
    canvas?: HTMLCanvasElement;
    opacity?: number;
    bounds?: PsdLayerBounds;
    mask?: PsdLayerMask;
    hidden?: boolean;
    blendMode?: BlendMode;
    children?: PsdOverlayLayer[];
    opened?: boolean;
};

type PsdExportParams = {
    basePixels?: Uint8ClampedArray | null;
    underlays?: PsdOverlayLayer[];
    overlays: PsdOverlayLayer[];
    width: number;
    height: number;
    filename: string;
};

const downloadBinary = (arrayBuffer: ArrayBuffer, filename: string) => {
    const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
};

const canvasFromPixels = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for PSD layer');
    }
    const dataCopy = new Uint8ClampedArray(pixels.length);
    dataCopy.set(pixels);
    const imageData = new ImageData(dataCopy, width, height);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
};

const clampOpacity = (opacity?: number) => {
    return Math.max(0, Math.min(1, typeof opacity === 'number' ? opacity : 1));
};

const toLayerBounds = (bounds?: PsdLayerBounds) => {
    return bounds ? { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom } : {};
};

const toMaskData = (mask?: PsdLayerMask) => {
    if (!mask) {
        return undefined;
    }

    return {
        canvas: mask.canvas,
        defaultColor: mask.defaultColor,
        disabled: mask.disabled,
        positionRelativeToLayer: mask.positionRelativeToLayer,
        fromVectorData: mask.fromVectorData,
        userMaskDensity: mask.userMaskDensity,
        userMaskFeather: mask.userMaskFeather,
        vectorMaskDensity: mask.vectorMaskDensity,
        vectorMaskFeather: mask.vectorMaskFeather,
        ...toLayerBounds(mask.bounds)
    };
};

const drawLayerToContext = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    layer: PsdOverlayLayer
) => {
    if (layer.hidden) {
        return;
    }

    const opacity = clampOpacity(layer.opacity);
    if (opacity <= 0) {
        return;
    }

    const compositeOperation = layer.blendMode === 'multiply' ? 'multiply' : 'source-over';

    if (layer.children && layer.children.length > 0) {
        const temp = document.createElement('canvas');
        temp.width = width;
        temp.height = height;
        const tempCtx = temp.getContext('2d');
        if (!tempCtx) {
            throw new Error('Failed to acquire 2D context for PSD layer group');
        }

        layer.children.forEach((child) => {
            drawLayerToContext(tempCtx, width, height, child);
        });

        const previousCompositeOperation = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = compositeOperation;
        ctx.globalAlpha = opacity;
        ctx.drawImage(temp, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = previousCompositeOperation;
        return;
    }

    if (!layer.canvas) {
        return;
    }

    const layerBounds = layer.bounds;
    const left = layerBounds?.left ?? 0;
    const top = layerBounds?.top ?? 0;
    const mask = layer.mask;

    if (!mask || mask.disabled) {
        const previousCompositeOperation = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = compositeOperation;
        ctx.globalAlpha = opacity;
        ctx.drawImage(layer.canvas, left, top);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = previousCompositeOperation;
        return;
    }

    const temp = document.createElement('canvas');
    temp.width = width;
    temp.height = height;
    const tempCtx = temp.getContext('2d');
    if (!tempCtx) {
        throw new Error('Failed to acquire 2D context for PSD masked layer');
    }

    tempCtx.drawImage(layer.canvas, left, top);
    tempCtx.globalCompositeOperation = 'destination-in';
    const maskBounds = mask.bounds;
    const alphaMask = document.createElement('canvas');
    alphaMask.width = mask.canvas.width; alphaMask.height = mask.canvas.height;
    const maskData = mask.canvas.getContext('2d').getImageData(0, 0, alphaMask.width, alphaMask.height);
    for (let i = 0; i < maskData.data.length; i += 4) maskData.data[i + 3] = maskData.data[i];
    alphaMask.getContext('2d').putImageData(maskData, 0, 0);
    tempCtx.drawImage(alphaMask, maskBounds?.left ?? 0, maskBounds?.top ?? 0);
    tempCtx.globalCompositeOperation = 'source-over';

    const previousCompositeOperation = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = compositeOperation;
    ctx.globalAlpha = opacity;
    ctx.drawImage(temp, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = previousCompositeOperation;
};

const toPsdLayer = (layer: PsdOverlayLayer): Layer => {
    return {
        name: layer.name,
        ...(layer.canvas ? { canvas: layer.canvas } : {}),
        opacity: clampOpacity(layer.opacity),
        hidden: !!layer.hidden,
        ...(layer.blendMode ? { blendMode: layer.blendMode } : {}),
        ...(typeof layer.opened === 'boolean' ? { opened: layer.opened } : {}),
        ...(layer.children ? { children: layer.children.map(child => toPsdLayer(child)) } : {}),
        ...toLayerBounds(layer.bounds),
        ...(layer.mask ? { mask: toMaskData(layer.mask) } : {})
    };
};

const createPsd = (params: PsdExportParams) => {
    const { basePixels, overlays, width, height } = params;
    const underlays = params.underlays ?? [];

    const baseCanvas = basePixels ? canvasFromPixels(basePixels, width, height) : null;
    const overlayLayers = overlays;

    // ビューア向け: 合成済みキャンバス（表示用）を用意
    const compositeCanvas = (() => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for PSD composite');
        }
        underlays.forEach((layer) => {
            drawLayerToContext(ctx, width, height, layer);
        });
        ctx.globalAlpha = 1;
        if (baseCanvas) {
            ctx.drawImage(baseCanvas, 0, 0);
        }
        overlayLayers.forEach((layer) => {
            drawLayerToContext(ctx, width, height, layer);
        });
        ctx.globalAlpha = 1;
        return canvas;
    })();

    // 小さなサムネイル（合成済み）を入れてプレビュー互換性を確保する
    const thumbnail = (() => {
        const maxThumb = 256;
        const scale = Math.min(1, maxThumb / Math.max(width, height));
        const thumbWidth = Math.max(1, Math.round(width * scale));
        const thumbHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = thumbWidth;
        canvas.height = thumbHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for PSD thumbnail');
        }
        ctx.drawImage(compositeCanvas, 0, 0, thumbWidth, thumbHeight);
        return canvas;
    })();

    const psd: Psd = {
        width,
        height,
        canvas: compositeCanvas,
        imageResources: {
            resolutionInfo: {
                horizontalResolution: 150,
                verticalResolution: 150,
                horizontalResolutionUnit: 'PPI',
                verticalResolutionUnit: 'PPI',
                widthUnit: 'Inches',
                heightUnit: 'Inches'
            },
            thumbnail
        },
        children: [
            ...underlays.map(layer => toPsdLayer(layer)),
            ...(baseCanvas ? [{
                name: 'Render',
                canvas: baseCanvas
            }] : []),
            ...overlayLayers.map(layer => toPsdLayer(layer))
        ]
    };

    const buffer = writePsd(psd, { compress: false });
    return { buffer, compositeCanvas };
};

const exportPsd = (params: PsdExportParams) => downloadBinary(createPsd(params).buffer, params.filename);

export { createPsd, exportPsd, canvasFromPixels };
export type { PsdExportParams, PsdLayerBounds, PsdLayerMask, PsdOverlayLayer };
