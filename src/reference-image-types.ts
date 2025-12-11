import type { Texture } from 'playcanvas';

type ReferenceImageLayer = 'back' | 'front';

type ReferenceImageAnchor = { ax: number; ay: number; };

type ReferenceImageSize = { w: number; h: number; };

type ReferenceImageSourceMeta = {
    filename: string;
    mime: string;
    originalSize: ReferenceImageSize;
    appliedSize: ReferenceImageSize;
    pixelRatio: number;
    usedOriginal: boolean;
    objectUrl?: string | null;
};

type ReferenceImageState = {
    enabled: boolean;
    visible: boolean;
    layer: ReferenceImageLayer;
    opacity: number;
    scalePct: number;
    scaleK: number;
    offsetPx: { x: number; y: number; };
    anchor: ReferenceImageAnchor;
    includeInRender: boolean;
    source: ReferenceImageSourceMeta | null;
    pixelPerfectEligible: boolean;
};

type ReferenceImageRuntime = {
    canvas: HTMLCanvasElement | null;
    texture: Texture | null;
    previewTexture: Texture | null;
};

const DEFAULT_REFERENCE_IMAGE_STATE: ReferenceImageState = {
    enabled: false,
    visible: false,
    layer: 'back',
    opacity: 0.7,
    scalePct: 100,
    scaleK: 1,
    offsetPx: { x: 0, y: 0 },
    anchor: { ax: 0.5, ay: 0.5 },
    includeInRender: false,
    source: null,
    pixelPerfectEligible: false
};

export type {
    ReferenceImageAnchor,
    ReferenceImageLayer,
    ReferenceImageRuntime,
    ReferenceImageSize,
    ReferenceImageSourceMeta,
    ReferenceImageState
};

export { DEFAULT_REFERENCE_IMAGE_STATE };
