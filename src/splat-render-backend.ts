import type { BoundingBox, Entity, GSplatResource, Texture } from 'playcanvas';

import type { ProcessorContext } from './data-processor';
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

type SplatRenderCenters = {
    centers: Float32Array;
    offset: number;
} | null;

type SplatRenderBackend = {
    mergedResource: GSplatResource | null;
    mergedEntity: Entity;
    stateTexture: Texture | null;
    transformTexture: Texture | null;
    transformPalette: TransformPalette;
    offsets: ReadonlyMap<Splat, number>;
    counts: ReadonlyMap<Splat, number>;
    add: (splat: Splat) => void;
    remove: (splat: Splat) => void;
    freeze: () => void;
    unfreeze: () => void;
    isSplatActive: (splat: Splat) => boolean;
    scheduleRebuildForVisibility: (immediate?: boolean) => void;
    mapPickId: (id: number) => SplatRenderPickMapping | null;
    getMergedResource: () => GSplatResource | null;
    getMergedEntity: () => Entity;
    getMergedInstance: () => any;
    getStateTexture: () => Texture | null;
    getTransformTexture: () => Texture | null;
    getTransformPaletteTexture: () => Texture | null;
    getSplatRange: (splat: Splat) => { offset: number; count: number } | null;
    getCenters: (splat: Splat) => SplatRenderCenters;
    getProcessorContext: (splat: Splat) => ProcessorContext;
    getBound: (splat: Splat, mode: 'selected' | 'visible') => BoundingBox | null;
    calcPositions: (splat: Splat) => Promise<Float32Array>;
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
    SplatRenderCenters,
    SplatRenderPickMapping,
    SplatRenderStateSummary
};
