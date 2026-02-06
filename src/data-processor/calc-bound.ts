import {
    ADDRESS_CLAMP_TO_EDGE,
    PIXELFORMAT_RGBA32F,
    SEMANTIC_POSITION,
    drawQuadWithShader,
    BoundingBox,
    GraphicsDevice,
    Mat4,
    RenderTarget,
    ScopeSpace,
    Shader,
    ShaderUtils,
    Texture,
    Vec3,
    BlendState
} from 'playcanvas';

import type { ProcessorContext } from './types';
import { vertexShader, fragmentShader } from '../shaders/bound-shader';

const v1 = new Vec3();
const v2 = new Vec3();
const invWorld = new Mat4();

const resolve = (scope: ScopeSpace, values: any) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class CalcBound {
    private device: GraphicsDevice;
    private shader: Shader = null;
    private minTexture: Texture = null;
    private maxTexture: Texture = null;
    private renderTarget: RenderTarget = null;
    private minRenderTarget: RenderTarget = null;
    private maxRenderTarget: RenderTarget = null;
    private minData: Float32Array = null;
    private maxData: Float32Array = null;

    constructor(device: GraphicsDevice) {
        this.device = device;
    }

    private getResources() {
        const { device } = this;
        const width = 1;
        const height = 1;

        if (!this.shader) {
            this.shader = ShaderUtils.createShader(device, {
                uniqueName: 'calcBoundShader',
                attributes: {
                    vertex_position: SEMANTIC_POSITION
                },
                vertexGLSL: vertexShader,
                fragmentGLSL: fragmentShader
            });
        }

        if (!this.minTexture || this.minTexture.width !== width || this.minTexture.height !== height) {
            if (this.minTexture) {
                this.minTexture.destroy();
                this.maxTexture.destroy();
                this.renderTarget.destroy();
                this.minRenderTarget.destroy();
                this.maxRenderTarget.destroy();
            }

            const createTexture = (name: string) => {
                return new Texture(device, {
                    name,
                    width,
                    height,
                    format: PIXELFORMAT_RGBA32F,
                    mipmaps: false,
                    addressU: ADDRESS_CLAMP_TO_EDGE,
                    addressV: ADDRESS_CLAMP_TO_EDGE
                });
            };

            this.minTexture = createTexture('calcBoundMin');
            this.maxTexture = createTexture('calcBoundMax');

            this.renderTarget = new RenderTarget({
                colorBuffers: [this.minTexture, this.maxTexture],
                depth: false
            });

            this.maxRenderTarget = new RenderTarget({
                colorBuffer: this.maxTexture,
                depth: false
            });

            this.minRenderTarget = new RenderTarget({
                colorBuffer: this.minTexture,
                depth: false
            });

            this.minData = new Float32Array(width * height * 4);
            this.maxData = new Float32Array(width * height * 4);
        }

        return {
            shader: this.shader,
            minTexture: this.minTexture,
            maxTexture: this.maxTexture,
            renderTarget: this.renderTarget,
            minRenderTarget: this.minRenderTarget,
            maxRenderTarget: this.maxRenderTarget,
            minData: this.minData,
            maxData: this.maxData
        };
    }

    async runSingle(ctx: ProcessorContext, boundingBox: BoundingBox, onlySelected: boolean): Promise<void> {
        const { device } = this;
        const { scope } = device;

        const numSplats = ctx.count;
        const merged = ctx.splat.scene.renderSystem.mergedResource;
        const transformA = merged?.getTexture('transformA');
        const splatTransform = ctx.transformTexture;
        const transformPalette = ctx.transformPalette;
        const splatState = ctx.stateTexture;

        if (!transformA || !splatTransform || !transformPalette || !splatState || numSplats === 0) {
            boundingBox.center.set(0, 0, 0);
            boundingBox.halfExtents.set(0, 0, 0);
            return;
        }

        const resources = this.getResources();

        invWorld.copy(ctx.splat.entity.getWorldTransform());
        if (!invWorld.invert()) {
            invWorld.setIdentity();
        }

        resolve(scope, {
            transformA,
            splatTransform,
            transformPalette,
            splatState,
            splatOffset: ctx.offset,
            splatCount: numSplats,
            globalSplatParams: [transformA.width, transformA.width * transformA.height],
            mode: onlySelected ? 0 : 1,
            matrix_invModel: invWorld.data
        });

        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, resources.renderTarget, resources.shader);

        const [minData, maxData] = await Promise.all([
            resources.minTexture.read(0, 0, 1, 1, {
                renderTarget: resources.minRenderTarget,
                data: resources.minData,
                immediate: false
            }),
            resources.maxTexture.read(0, 0, 1, 1, {
                renderTarget: resources.maxRenderTarget,
                data: resources.maxData,
                immediate: false
            })
        ]);

        // resolve mins/maxs
        v1.set(Infinity, Infinity, Infinity);
        v2.set(-Infinity, -Infinity, -Infinity);

        const a = minData[0];
        const b = minData[1];
        const c = minData[2];
        if (isFinite(a)) v1.x = Math.min(v1.x, a);
        if (isFinite(b)) v1.y = Math.min(v1.y, b);
        if (isFinite(c)) v1.z = Math.min(v1.z, c);

        const d = maxData[0];
        const e = maxData[1];
        const f = maxData[2];
        if (isFinite(d)) v2.x = Math.max(v2.x, d);
        if (isFinite(e)) v2.y = Math.max(v2.y, e);
        if (isFinite(f)) v2.z = Math.max(v2.z, f);

        boundingBox.setMinMax(v1, v2);
    }

    async run(ctx: ProcessorContext, selectionBound: BoundingBox, localBound: BoundingBox): Promise<void> {
        await this.runSingle(ctx, selectionBound, true);
        await this.runSingle(ctx, localBound, false);
    }
}

export { CalcBound };
