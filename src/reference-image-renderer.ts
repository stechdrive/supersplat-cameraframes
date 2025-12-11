import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    SEMANTIC_POSITION,
    BlendState,
    Entity,
    Layer,
    Mat4,
    QuadRender,
    Shader,
    ShaderUtils,
    Texture,
    WebglGraphicsDevice,
    FILTER_LINEAR,
    FILTER_NEAREST
} from 'playcanvas';

import { Element, ElementType } from './element';
import { fragmentShader, vertexShader } from './shaders/reference-image-shader';
import type { ReferenceImageLayer } from './reference-image-types';

type RenderRect = { x: number; y: number; w: number; h: number; };

type RenderParams = {
    rectPx: RenderRect;
    opacity: number;
    texture: Texture | null;
    pixelPerfect: boolean;
};

class ReferenceImageRenderer extends Element {
    referenceBackLayer: Layer | null = null;
    referenceFrontLayer: Layer | null = null;
    private shader: Shader | null = null;
    private quadRender: QuadRender | null = null;
    private backEntity: Entity | null = null;
    private frontEntity: Entity | null = null;
    private params: { back: RenderParams | null; front: RenderParams | null; } = { back: null, front: null };
    private targetSize: { w: number; h: number; } = { w: 1, h: 1 };
    private lastPixelPerfect = false;

    constructor() {
        super(ElementType.other);
    }

    add() {
        if (!this.scene) {
            return;
        }
        const device = this.scene.app.graphicsDevice;
        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'reference-image',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });
        this.quadRender = new QuadRender(this.shader);

        this.referenceBackLayer = new Layer({
            enabled: false,
            name: 'Reference Back',
            clearDepthBuffer: false
        });

        this.referenceFrontLayer = new Layer({
            enabled: false,
            name: 'Reference Front',
            clearDepthBuffer: false
        });

        this.backEntity = this.createEntity(this.referenceBackLayer, 'back');
        this.frontEntity = this.createEntity(this.referenceFrontLayer, 'front');

        const { referenceBackLayer, referenceFrontLayer } = this;
        if (referenceBackLayer) {
            this.scene.insertLayerBefore(referenceBackLayer, 'World');
        }
        if (referenceFrontLayer) {
            this.scene.insertLayerBefore(referenceFrontLayer, this.scene.overlayLayer);
        }

        this.scene.referenceBackLayer = referenceBackLayer;
        this.scene.referenceFrontLayer = referenceFrontLayer;
    }

    remove() {
        const layers = this.scene?.app?.scene?.layers;
        [this.referenceBackLayer, this.referenceFrontLayer].forEach(layer => {
            if (layer && layers) {
                layers.remove(layer);
            }
        });
        this.scene.referenceBackLayer = null;
        this.scene.referenceFrontLayer = null;
        this.backEntity?.destroy();
        this.frontEntity?.destroy();
        this.backEntity = null;
        this.frontEntity = null;
        this.quadRender = null;
        this.shader = null;
    }

    setParams(layer: ReferenceImageLayer, params: RenderParams | null) {
        if (layer === 'back') {
            this.params.back = params;
            if (this.referenceBackLayer) {
                this.referenceBackLayer.enabled = !!params;
            }
        } else {
            this.params.front = params;
            if (this.referenceFrontLayer) {
                this.referenceFrontLayer.enabled = !!params;
            }
        }
        if (params?.texture) {
            const filter = params.pixelPerfect ? FILTER_NEAREST : FILTER_LINEAR;
            params.texture.minFilter = filter;
            params.texture.magFilter = filter;
            this.lastPixelPerfect = params.pixelPerfect;
        }
    }

    clearParams() {
        this.setParams('back', null);
        this.setParams('front', null);
    }

    setTargetSize(width: number, height: number) {
        if (width > 0 && height > 0) {
            this.targetSize = { w: width, h: height };
        }
    }

    onPreRender() {
        if (!this.scene || !this.scene.camera || !this.quadRender) {
            return;
        }
        const device = this.scene.app.graphicsDevice;
        this.targetSize = {
            w: device.width,
            h: device.height
        };
        const targetSizeOverride = this.scene.camera.targetSize;
        if (targetSizeOverride) {
            this.targetSize = { w: targetSizeOverride.width, h: targetSizeOverride.height };
        }

        const copyProjection = (entity: Entity | null) => {
            if (!entity) return;
            const src = this.scene.camera.entity.camera;
            const dst = entity.camera;

            dst.projection = src.projection;
            dst.horizontalFov = src.horizontalFov;
            dst.fov = src.fov;
            dst.nearClip = src.nearClip;
            dst.farClip = src.farClip;
            dst.orthoHeight = src.orthoHeight;
            const customFrustum = this.scene.camera.getCustomFrustum();
            if (customFrustum) {
                dst.calculateProjection = (projMat: Mat4) => {
                    projMat.setFrustum(
                        customFrustum.left,
                        customFrustum.right,
                        customFrustum.bottom,
                        customFrustum.top,
                        customFrustum.near,
                        customFrustum.far
                    );
                };
            } else {
                dst.calculateProjection = null;
            }
            (dst as any)._projMatDirty = true;
            dst.renderTarget = this.scene.camera.entity.camera.renderTarget ?? this.scene.camera.workRenderTarget;
        };

        copyProjection(this.backEntity);
        copyProjection(this.frontEntity);
    }

    private applyParams(params: RenderParams | null) {
        if (!params || !params.texture || !this.quadRender || !this.scene) {
            return false;
        }
        const device = this.scene.app.graphicsDevice;
        const rectId = device.scope.resolve('rectPx');
        const targetSizeId = device.scope.resolve('targetSize');
        const opacityId = device.scope.resolve('opacity');
        const textureId = device.scope.resolve('referenceTexture');

        rectId.setValue([params.rectPx.x, params.rectPx.y, params.rectPx.w, params.rectPx.h]);
        targetSizeId.setValue([this.targetSize.w, this.targetSize.h]);
        opacityId.setValue(params.opacity);
        textureId.setValue(params.texture);
        return true;
    }

    private draw(kind: ReferenceImageLayer) {
        const layer = kind === 'back' ? this.referenceBackLayer : this.referenceFrontLayer;
        const params = kind === 'back' ? this.params.back : this.params.front;
        const entity = kind === 'back' ? this.backEntity : this.frontEntity;
        if (!layer || !entity || !params || !this.scene || !this.quadRender) {
            return;
        }
        if (!this.applyParams(params)) {
            return;
        }
        const device = this.scene.app.graphicsDevice as WebglGraphicsDevice;
        const blendState = new BlendState(true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );
        device.setBlendState(blendState);
        device.setRenderTarget(this.scene.camera.entity.camera.renderTarget ?? null);
        device.updateBegin();
        this.quadRender.render();
        device.updateEnd();
    }

    private createEntity(layer: Layer | null, kind: ReferenceImageLayer) {
        const entity = new Entity(kind === 'back' ? 'referenceBackCamera' : 'referenceFrontCamera');
        entity.addComponent('camera');
        entity.camera.clearColor.set(0, 0, 0, 0);
        entity.camera.setShaderPass('REFERENCE_IMAGE');
        entity.camera.layers = layer ? [layer.id] : [];
        entity.camera.on('postRenderLayer', (renderLayer: Layer, transparent: boolean) => {
            if (renderLayer !== layer || !transparent) {
                return;
            }
            this.draw(kind);
        });
        this.scene.camera.entity.addChild(entity);
        return entity;
    }
}

export { ReferenceImageRenderer };
export type { RenderParams, RenderRect };
