import { writePsd, type Psd } from 'ag-psd';

type PsdOverlayLayer = {
    name: string;
    canvas: HTMLCanvasElement;
};

type PsdExportParams = {
    basePixels: Uint8ClampedArray;
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

const exportPsd = (params: PsdExportParams) => {
    const { basePixels, overlays, width, height, filename } = params;
    const underlays = params.underlays ?? [];

    const baseCanvas = canvasFromPixels(basePixels, width, height);
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
            ctx.drawImage(layer.canvas, 0, 0);
        });
        ctx.drawImage(baseCanvas, 0, 0);
        overlayLayers.forEach((layer) => {
            ctx.drawImage(layer.canvas, 0, 0);
        });
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
            ...underlays.map(layer => ({
                name: layer.name,
                canvas: layer.canvas
            })),
            {
                name: 'Render',
                canvas: baseCanvas
            },
            ...overlayLayers.map(layer => ({
                name: layer.name,
                canvas: layer.canvas
            }))
        ]
    };

    const buffer = writePsd(psd, { compress: true });
    downloadBinary(buffer, filename);
};

export { exportPsd };
export type { PsdExportParams, PsdOverlayLayer };
