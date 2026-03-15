import type { BoundingBox, Entity, Texture } from 'playcanvas';

import type { IntersectOptions } from './data-processor';
import type { Scene } from './scene';
import type { Splat } from './splat';
import { SplatRenderSystem } from './splat-render-system';
import type { TransformPalette } from './transform-palette';

type SplatRenderPickMapping = { splat: Splat; local: number };

type SplatRenderStateSummary = {
    numSelected: number;
    numLocked: number;
    numDeleted: number;
    numHidden: number;
    numVisible: number;
    numSplats: number;
};

type SplatRenderOverlayBinding = {
    node: Entity;
    positionTexture: Texture;
    stateTexture: Texture | null;
    transformTexture: Texture | null;
    transformPaletteTexture: Texture | null;
    offset: number;
    count: number;
    globalParams: [number, number];
};

type SplatRenderBackend = {
    add: (splat: Splat) => void;
    remove: (splat: Splat) => void;
    freeze: () => void;
    unfreeze: () => void;
    isSplatActive: (splat: Splat) => boolean;
    scheduleRebuildForVisibility: (immediate?: boolean) => void;
    mapPickId: (id: number) => SplatRenderPickMapping | null;
    getOverlayBinding: (splat: Splat) => SplatRenderOverlayBinding | null;
    withPickingBlendDisabled: (fn: () => void) => void;
    hasRenderableData: (splat: Splat) => boolean;
    readWorldCenter: (splat: Splat, localIndex: number, out: { set: (x: number, y: number, z: number) => void }) => boolean;
    writeWorldCenter: (splat: Splat, localIndex: number, x: number, y: number, z: number) => boolean;
    calcBound: (splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox) => Promise<void>;
    getBound: (splat: Splat, mode: 'selected' | 'visible') => BoundingBox | null;
    calcPositions: (splat: Splat) => Promise<Float32Array>;
    intersect: (splat: Splat, options: IntersectOptions) => Promise<Uint8Array>;
    waitForSorter: () => Promise<void>;
    updateState: (splat: Splat) => SplatRenderStateSummary | undefined;
    updateSplatParams: (splat: Splat) => void;
    updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => void;
    updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => void;
    onPreRender: () => void;
    rebuild: () => void;
};

const createSupersplatSplatRenderBackend = (scene: Scene): SplatRenderBackend => {
    return new SplatRenderSystem(scene);
};

export { createSupersplatSplatRenderBackend };
export type {
    SplatRenderBackend,
    SplatRenderOverlayBinding,
    SplatRenderPickMapping,
    SplatRenderStateSummary
};
