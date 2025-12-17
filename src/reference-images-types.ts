import type { ReferenceImageSourceMeta } from './reference-image-types';

type ReferenceImageItemGroup = 'back' | 'front';

type ReferenceImageItemState = {
    id: string;
    name: string;
    group: ReferenceImageItemGroup;
    order: number;
    visible: boolean;
    includeInRender: boolean;
    opacity: number;
    scalePct: number;
    offsetPx: { x: number; y: number; };
    anchor: { ax: number; ay: number; };
    source: ReferenceImageSourceMeta;
};

type ReferenceImagesState = {
    masterVisible: boolean;
    activeId: string | null;
    items: ReferenceImageItemState[];
};

type ReferenceImagesDocState = {
    version: 1;
    masterVisible: boolean;
    activeId: string | null;
    items: ReferenceImageItemState[];
};

type ReferenceImagesExportLayer = {
    group: ReferenceImageItemGroup;
    name: string;
    opacity: number;
    canvas: HTMLCanvasElement;
    bounds?: { left: number; top: number; right: number; bottom: number; };
};

const DEFAULT_REFERENCE_IMAGES_STATE: ReferenceImagesState = {
    masterVisible: true,
    activeId: null,
    items: []
};

export type {
    ReferenceImageItemGroup,
    ReferenceImageItemState,
    ReferenceImagesDocState,
    ReferenceImagesExportLayer,
    ReferenceImagesState
};

export { DEFAULT_REFERENCE_IMAGES_STATE };
