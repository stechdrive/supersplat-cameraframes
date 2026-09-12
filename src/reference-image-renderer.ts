import { BlendState, FILTER_LINEAR, FILTER_NEAREST, type Layer, type Texture } from 'playcanvas';

import { bindViews } from './cameras/bind-views';
import type { CameraViews } from './cameras/camera-views';
import { Element, ElementType } from './element';
import type { ReferenceImageLayer } from './reference-image-types';
import { vertexShader } from './shaders/blit-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

export type RenderRect = { x: number; y: number; w: number; h: number };
export type RenderParams = { rectPx: RenderRect; opacity: number; texture: Texture | null; pixelPerfect: boolean };

const fragmentShader = /* wgsl */`
var referenceTexture: texture_2d<f32>;
var referenceTextureSampler: sampler;
uniform rectPx: vec4f;
uniform opacity: f32;
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    let uv = (input.position.xy - uniform.rectPx.xy) / uniform.rectPx.zw;
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { discard; }
    var color = textureSample(referenceTexture, referenceTextureSampler, uv);
    color.a *= uniform.opacity;
    var output: FragmentOutput;
    output.color = color;
    return output;
}
`;

// Reference textures are shared. Each view/image owns its quad's mutable
// uniform buffer, and uses the camera's ordinary layer callbacks.
export class ReferenceImageRenderer extends Element {
    private params: Record<ReferenceImageLayer, RenderParams[]> = { back: [], front: [] };
    private releaseViews: () => void;
    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.graphicsDevice;
        this.releaseViews = bindViews(this.scene, (camera) => {
            const resources = { back: [] as { quad: ShaderQuad; pass: SimpleRenderPass }[], front: [] as { quad: ShaderQuad; pass: SimpleRenderPass }[] };
            const draw = (kind: ReferenceImageLayer) => {
                const views = this.scene.events.functions.get('cameraViews')?.() as CameraViews;
                if (camera !== views?.shot || !camera.active) return;
                const params = this.params[kind];
                const pool = resources[kind];
                while (pool.length > params.length) {
                    const entry = pool.pop(); entry.pass.destroy(); entry.quad.destroy();
                }
                params.forEach((value, index) => {
                    if (!value.texture) return;
                    if (!pool[index]) {
                        const quad = new ShaderQuad(device, vertexShader, fragmentShader, 'camera-reference');
                        pool[index] = { quad, pass: new SimpleRenderPass(device, quad, { blendState: BlendState.ALPHABLEND }) };
                    }
                    const r = value.rectPx;
                    pool[index].pass.execute({ referenceTexture: value.texture, rectPx: [r.x, r.y, r.w, r.h], opacity: value.opacity });
                });
            };
            const back = camera.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
                if (layer === this.scene.worldLayer && !transparent) draw('back');
            });
            const front = camera.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
                if (layer === this.scene.overlayLayer && !transparent) draw('front');
            });
            return () => {
                back.off(); front.off();
                [...resources.back, ...resources.front].forEach(({ quad, pass }) => {
                    pass.destroy(); quad.destroy();
                });
            };
        });
    }

    remove() {
        this.releaseViews?.();
    }
    setParamsList(layer: ReferenceImageLayer, params: RenderParams[]) {
        this.params[layer] = params;
        params.forEach(({ texture, pixelPerfect }) => {
            if (texture) texture.minFilter = texture.magFilter = pixelPerfect ? FILTER_NEAREST : FILTER_LINEAR;
        });
    }
    clearParams() {
        this.params = { back: [], front: [] };
    }
}
