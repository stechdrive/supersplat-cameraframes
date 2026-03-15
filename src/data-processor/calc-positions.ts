import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    GraphicsDevice,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Texture,
    BlendState
} from 'playcanvas';

import type { ProcessorContext } from './types';
import { vertexShader, fragmentShader } from '../shaders/position-shader';

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class CalcPositions {
    private device: GraphicsDevice;
    private shader: Shader = null;
    private texture: Texture = null;
    private renderTarget: RenderTarget = null;
    private data: Float32Array = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
    }

    private getResources(width: number, height: number) {
        const { device } = this;

        if (!this.shader) {
            this.shader = ShaderUtils.createShader(device, {
                uniqueName: 'calcPositionShader',
                attributes: {
                    vertex_position: SEMANTIC_POSITION
                },
                vertexGLSL: vertexShader,
                fragmentGLSL: fragmentShader
            });
        }

        if (!this.texture || this.texture.width !== width || this.texture.height !== height) {
            if (this.texture) {
                this.texture.destroy();
                this.renderTarget.destroy();
            }

            this.texture = new Texture(device, {
                name: 'positionTex',
                width,
                height,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });

            this.renderTarget = new RenderTarget({
                colorBuffer: this.texture,
                depth: false
            });

            this.data = new Float32Array(width * height * 4);
        }

        return {
            shader: this.shader,
            texture: this.texture,
            renderTarget: this.renderTarget,
            data: this.data
        };
    }

    async run(ctx: ProcessorContext): Promise<Float32Array> {
        const { device } = this;
        const { scope } = device;

        const numSplats = ctx.count;
        if (numSplats === 0) {
            return new Float32Array(0);
        }

        const transformA = ctx.positionTexture;
        const splatTransform = ctx.transformTexture;
        const transformPalette = ctx.transformPalette;

        if (!transformA || !splatTransform || !transformPalette) {
            return new Float32Array(0);
        }

        // allocate resources
        const width = Math.max(1, Math.ceil(Math.sqrt(numSplats)));
        const height = Math.ceil(numSplats / width);
        const resources = this.getResources(width, height);

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splatOffset: ctx.offset,
            splatCount: numSplats,
            globalSplatParams: [transformA.width, transformA.width * transformA.height],
            output_params: [width, height]
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        const data = await resources.texture.read(0, 0, resources.texture.width, resources.texture.height, {
            renderTarget: resources.renderTarget,
            data: resources.data,
            immediate: false
        });

        return (data as Float32Array).subarray(0, numSplats * 4);
    }
}

export { CalcPositions };
