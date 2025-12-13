import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Layer,
    QuadRender,
    Shader,
    ShaderUtils,
    Texture,
    FILTER_LINEAR,
    FILTER_NEAREST
} from 'playcanvas';

import { Element, ElementType } from './element';
import type { ReferenceImageLayer } from './reference-image-types';
import { fragmentShader, vertexShader } from './shaders/reference-image-shader';

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
    private params: { back: RenderParams | null; front: RenderParams | null; } = { back: null, front: null };
    private targetSize: { w: number; h: number; } = { w: 1, h: 1 };
    private lastPixelPerfect = false;
    private mainCameraHandlers: {
        preRenderLayer: ((layer: Layer, transparent: boolean) => void) | null;
        postRenderLayer: ((layer: Layer, transparent: boolean) => void) | null;
    } = { preRenderLayer: null, postRenderLayer: null };
    private worldLayer: Layer | null = null;
    private drawnBack = false;
    private drawnFront = false;

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

        const { referenceBackLayer, referenceFrontLayer } = this;
        if (referenceBackLayer) this.scene.insertLayerBefore(referenceBackLayer, 'World');
        if (referenceFrontLayer) this.scene.insertLayerBefore(referenceFrontLayer, this.scene.overlayLayer);

        this.scene.referenceBackLayer = referenceBackLayer;
        this.scene.referenceFrontLayer = referenceFrontLayer;

        this.worldLayer = this.scene.app.scene.layers.getLayerByName('World');
        const mainCamera = this.scene.camera.entity.camera;

        this.mainCameraHandlers.preRenderLayer = (layer: Layer, transparent: boolean) => {
            if (transparent || this.drawnBack) {
                return;
            }
            if (!this.params.back || !this.referenceBackLayer?.enabled) {
                return;
            }
            const scene = this.scene;
            const isEarlyLayer = layer === scene.backgroundLayer || layer === scene.shadowLayer || layer === scene.modelLightingLayer;
            const isWorldFallback = !!this.worldLayer && layer === this.worldLayer;
            if (!isEarlyLayer && !isWorldFallback) {
                return;
            }
            this.drawnBack = true;
            this.draw('back');
        };

        this.mainCameraHandlers.postRenderLayer = (layer: Layer, transparent: boolean) => {
            if (!transparent || this.drawnFront) {
                return;
            }
            if (!this.params.front || !this.referenceFrontLayer?.enabled) {
                return;
            }
            if (!this.worldLayer || layer !== this.worldLayer) {
                return;
            }
            this.drawnFront = true;
            this.draw('front');
        };

        mainCamera.on('preRenderLayer', this.mainCameraHandlers.preRenderLayer);
        mainCamera.on('postRenderLayer', this.mainCameraHandlers.postRenderLayer);
    }

    remove() {
        const mainCamera = this.scene?.camera?.entity?.camera;
        if (mainCamera) {
            if (this.mainCameraHandlers.preRenderLayer) {
                mainCamera.off('preRenderLayer', this.mainCameraHandlers.preRenderLayer);
            }
            if (this.mainCameraHandlers.postRenderLayer) {
                mainCamera.off('postRenderLayer', this.mainCameraHandlers.postRenderLayer);
            }
        }
        this.mainCameraHandlers.preRenderLayer = null;
        this.mainCameraHandlers.postRenderLayer = null;

        const layers = this.scene?.app?.scene?.layers;
        [this.referenceBackLayer, this.referenceFrontLayer].forEach((layer) => {
            if (layer && layers) {
                layers.remove(layer);
            }
        });
        this.scene.referenceBackLayer = null;
        this.scene.referenceFrontLayer = null;
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
        this.drawnBack = false;
        this.drawnFront = false;
        const device = this.scene.app.graphicsDevice;
        const rt = this.scene.camera.entity.camera.renderTarget;
        if (rt && rt.width > 0 && rt.height > 0) {
            this.targetSize = { w: rt.width, h: rt.height };
        } else {
            this.targetSize = { w: device.width, h: device.height };
        }

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
        const params = kind === 'back' ? this.params.back : this.params.front;
        if (!params || !this.scene || !this.quadRender) {
            return;
        }
        if (!this.applyParams(params)) {
            return;
        }
        const device = this.scene.app.graphicsDevice;
        const blendState = new BlendState(true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );
        device.setBlendState(blendState);
        device.setCullMode(CULLFACE_NONE);
        device.setDepthState(DepthState.NODEPTH);
        device.setStencilState(null, null);
        this.quadRender.render();
    }
}

export { ReferenceImageRenderer };
export type { RenderParams, RenderRect };
