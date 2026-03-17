import type { Texture } from 'playcanvas';

import type { Splat } from '../splat';

type ProcessorGlobalUvParams = {
    textureWidth: number;
    textureCapacity: number;
};

type ProcessorInputLayout = {
    centerSource: Texture | null;
    transformIndexSource: Texture | null;
    transformPaletteSource: Texture | null;
    stateSource: Texture | null;
    globalUv: ProcessorGlobalUvParams;
};

type ProcessorContext = {
    splat: Splat;
    offset: number;
    count: number;
    inputLayout: ProcessorInputLayout;
};

const getProcessorShaderBindings = (inputLayout: ProcessorInputLayout) => {
    return {
        transformA: inputLayout.centerSource,
        splatTransform: inputLayout.transformIndexSource,
        transformPalette: inputLayout.transformPaletteSource,
        splatState: inputLayout.stateSource,
        globalSplatParams: [
            inputLayout.globalUv.textureWidth,
            inputLayout.globalUv.textureCapacity
        ] as [number, number]
    };
};

export { getProcessorShaderBindings };
export type { ProcessorContext, ProcessorGlobalUvParams, ProcessorInputLayout };
