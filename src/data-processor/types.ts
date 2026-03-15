import type { Texture } from 'playcanvas';

import type { Splat } from '../splat';

type ProcessorResources = {
    positionTexture: Texture | null;
    transformTexture: Texture | null;
    transformPaletteTexture: Texture | null;
    stateTexture: Texture | null;
    globalParams: [number, number];
};

type ProcessorContext = {
    splat: Splat;
    offset: number;
    count: number;
    resources: ProcessorResources;
};

export type { ProcessorContext, ProcessorResources };
