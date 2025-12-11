import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_LINEAR,
    FILTER_NEAREST,
    GraphicsDevice,
    PIXELFORMAT_R8_G8_B8_A8,
    Texture
} from 'playcanvas';

import type { ReferenceImageSourceMeta } from './reference-image-types';

const MAX_APPLIED_DIM = 16000;

const loadImageElement = (url: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (ev) => reject(ev);
        img.src = url;
    });
};

type LoadedImage = {
    source: ReferenceImageSourceMeta;
    canvas: HTMLCanvasElement;
    blob: Blob;
    objectUrl: string | null;
};

class ReferenceImageLoader {
    async decode(blob: Blob, filename?: string): Promise<LoadedImage> {
        const objectUrl = URL.createObjectURL(blob);
        let image: ImageBitmap | HTMLImageElement | null = null;
        try {
            try {
                image = await createImageBitmap(blob);
            } catch {
                image = await loadImageElement(objectUrl);
            }
            const originalSize = {
                w: image.width,
                h: image.height
            };
            const maxDim = Math.max(originalSize.w, originalSize.h);
            const scale = maxDim > MAX_APPLIED_DIM ? (MAX_APPLIED_DIM / maxDim) : 1;
            const appliedSize = {
                w: Math.max(1, Math.round(originalSize.w * scale)),
                h: Math.max(1, Math.round(originalSize.h * scale))
            };
            const canvas = document.createElement('canvas');
            canvas.width = appliedSize.w;
            canvas.height = appliedSize.h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('Failed to acquire 2D context for reference image');
            }
            ctx.drawImage(image, 0, 0, appliedSize.w, appliedSize.h);

            if ('close' in image && typeof (image as ImageBitmap).close === 'function') {
                (image as ImageBitmap).close();
            }

            const source: ReferenceImageSourceMeta = {
                filename: filename ?? 'reference-image',
                mime: blob.type || 'application/octet-stream',
                originalSize,
                appliedSize,
                pixelRatio: appliedSize.w / Math.max(1, originalSize.w),
                usedOriginal: scale >= 0.999,
                objectUrl
            };

            return {
                source,
                canvas,
                blob,
                objectUrl
            };
        } catch (error) {
            URL.revokeObjectURL(objectUrl);
            throw error;
        }
    }

    createTexture(device: GraphicsDevice, source: HTMLCanvasElement, useNearest: boolean): Texture {
        const texture = new Texture(device, {
            width: source.width,
            height: source.height,
            format: PIXELFORMAT_R8_G8_B8_A8,
            mipmaps: false
        });
        texture.addressU = ADDRESS_CLAMP_TO_EDGE;
        texture.addressV = ADDRESS_CLAMP_TO_EDGE;
        texture.minFilter = useNearest ? FILTER_NEAREST : FILTER_LINEAR;
        texture.magFilter = useNearest ? FILTER_NEAREST : FILTER_LINEAR;
        texture.setSource(source);
        return texture;
    }

    destroyTexture(texture: Texture | null | undefined) {
        if (texture) {
            texture.destroy();
        }
    }

    revoke(objectUrl: string | null | undefined) {
        if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
        }
    }
}

export { ReferenceImageLoader, MAX_APPLIED_DIM };
export type { LoadedImage };
