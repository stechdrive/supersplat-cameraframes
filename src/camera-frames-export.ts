import { Crc } from './serialize/crc';

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
