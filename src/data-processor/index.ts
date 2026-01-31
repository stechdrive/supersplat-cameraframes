import {
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BoundingBox,
    GraphicsDevice,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    BlendState
} from 'playcanvas';

import { CalcBound } from './calc-bound';
import { CalcPositions } from './calc-positions';
import { Intersect, IntersectOptions } from './intersect';
import type { Splat } from '../splat';
import type { ProcessorContext } from './types';

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

// gpu processor for splat data
class DataProcessor {
    private device: GraphicsDevice;
    private copyShader: Shader;

    // promise chain for serializing all async operations
    private processingPromise: Promise<void> = Promise.resolve();

    // instances
    private intersectImpl: Intersect;
    private calcBoundImpl: CalcBound;
    private calcPositionsImpl: CalcPositions;

    constructor(device: GraphicsDevice) {
        this.device = device;

        this.copyShader = ShaderUtils.createShader(device, {
            uniqueName: 'copyShader',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: `
                attribute vec2 vertex_position;
                void main(void) {
                    gl_Position = vec4(vertex_position, 0.0, 1.0);
                }
            `,
            fragmentGLSL: `
                uniform sampler2D colorTex;
                void main(void) {
                    ivec2 texel = ivec2(gl_FragCoord.xy);
                    gl_FragColor = texelFetch(colorTex, texel, 0);
                }
            `
        });

        // create instances
        this.intersectImpl = new Intersect(device);
        this.calcBoundImpl = new CalcBound(device);
        this.calcPositionsImpl = new CalcPositions(device);
    }

    // enqueue async operations to run one at a time
    private enqueue<T>(fn: () => Promise<T>): Promise<T> {
        const result = this.processingPromise.then(fn);
        this.processingPromise = result.then(() => {}, () => {});
        return result;
    }

    private resolveContext(target: Splat | ProcessorContext): ProcessorContext {
        if ((target as ProcessorContext).splat) {
            return target as ProcessorContext;
        }
        return (target as Splat).scene.renderSystem.getProcessorContext(target as Splat);
    }

    // calculate the intersection of a mask canvas with splat centers
    intersect(options: IntersectOptions, target: Splat | ProcessorContext) {
        const ctx = this.resolveContext(target);
        return this.enqueue(() => this.intersectImpl.run(options, ctx));
    }

    // use gpu to calculate both selected and visible bounds
    calcBound(target: Splat | ProcessorContext, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void>;
    calcBound(target: Splat | ProcessorContext, boundingBox: BoundingBox, onlySelected: boolean): Promise<void>;
    calcBound(target: Splat | ProcessorContext, selectionBound: BoundingBox, localBoundOrOnlySelected?: BoundingBox | boolean): Promise<void> {
        const ctx = this.resolveContext(target);
        if (typeof localBoundOrOnlySelected === 'boolean') {
            const onlySelected = localBoundOrOnlySelected;
            return this.enqueue(() => this.calcBoundImpl.runSingle(ctx, selectionBound, onlySelected));
        }
        if (localBoundOrOnlySelected) {
            return this.enqueue(() => this.calcBoundImpl.run(ctx, selectionBound, localBoundOrOnlySelected));
        }
        return this.enqueue(() => this.calcBoundImpl.runSingle(ctx, selectionBound, false));
    }

    // calculate world-space splat positions
    calcPositions(target: Splat | ProcessorContext) {
        const ctx = this.resolveContext(target);
        return this.enqueue(() => this.calcPositionsImpl.run(ctx));
    }

    copyRt(source: RenderTarget, dest: RenderTarget) {
        const { device } = this;

        resolve(device.scope, {
            colorTex: source.colorBuffer
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, dest, this.copyShader);
    }
}

export { DataProcessor };
export type { IntersectOptions };
export { MaskOptions, RectOptions, SphereOptions, BoxOptions } from './intersect';
export type { ProcessorContext };
