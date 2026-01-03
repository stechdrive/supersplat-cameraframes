import type { ReferenceImageSourceMeta } from './reference-image-types';

type ReferenceImageItemGroup = 'back' | 'front';

type ReferenceImageItemBase = {
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
};

type ReferenceImageItemState = ReferenceImageItemBase & {
    source: ReferenceImageSourceMeta;
};

type ReferenceImageItemV2 = ReferenceImageItemBase & {
    assetId: string;
};

type ReferenceImageAsset = {
    id: string;
    source: ReferenceImageSourceMeta;
};

type ReferenceImagePreset = {
    id: string;
    name: string;
    masterVisible: boolean;
    activeId: string | null;
    items: ReferenceImageItemV2[];
};

type ReferenceImagesState = {
    masterVisible: boolean;
    activeId: string | null;
    items: ReferenceImageItemState[];
};

type ReferenceImagesFullState = {
    version: 2;
    activePresetId: string | null;
    assets: ReferenceImageAsset[];
    presets: ReferenceImagePreset[];
};

type ReferenceImagesPresetsState = {
    activePresetId: string | null;
    presets: Array<{ id: string; name: string; }>;
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
    ReferenceImageItemV2,
    ReferenceImageAsset,
    ReferenceImagePreset,
    ReferenceImagesDocState,
    ReferenceImagesExportLayer,
    ReferenceImagesFullState,
    ReferenceImagesPresetsState,
    ReferenceImagesState
};

export { DEFAULT_REFERENCE_IMAGES_STATE };
