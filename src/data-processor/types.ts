import type { Texture } from 'playcanvas';

import type { Splat } from '../splat';

type ProcessorContext = {
    splat: Splat;
    offset: number;
    count: number;
    transformTexture: Texture | null;
    transformPalette: Texture | null;
    stateTexture?: Texture | null;
};

export type { ProcessorContext };
