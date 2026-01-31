import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    CameraComponent,
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
    private readonly blendState = new BlendState(true,
        BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
        BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA
    );
    private params: { back: RenderParams[]; front: RenderParams[]; } = { back: [], front: [] };
    private targetSize: { w: number; h: number; } = { w: 1, h: 1 };
    private mainCameraHandlers: {
        preRenderLayer: ((camera: CameraComponent, layer: Layer, transparent: boolean) => void) | null;
        postRenderLayer: ((camera: CameraComponent, layer: Layer, transparent: boolean) => void) | null;
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

        this.mainCameraHandlers.preRenderLayer = (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            if (camera !== mainCamera) {
                return;
            }
            if (transparent || this.drawnBack) {
                return;
            }
            const backLayer = this.referenceBackLayer;
            if (this.params.back.length === 0 || (backLayer && !backLayer.enabled)) {
                return;
            }
            const scene = this.scene;
            const isEarlyLayer = layer === scene.backgroundLayer || layer === scene.shadowLayer || layer === scene.modelLightingLayer;
            const isWorldFallback = !!this.worldLayer && layer === this.worldLayer;
            if (isEarlyLayer || isWorldFallback) {
                this.drawnBack = true;
                this.draw('back');
                return;
            }
            if (backLayer && layer === backLayer) {
                this.drawnBack = true;
                this.draw('back');
            }
        };

        this.mainCameraHandlers.postRenderLayer = (camera: CameraComponent, layer: Layer, transparent: boolean) => {
            if (camera !== mainCamera) {
                return;
            }
            if (!transparent || this.drawnFront) {
                return;
            }
            const frontLayer = this.referenceFrontLayer;
            if (this.params.front.length === 0 || (frontLayer && !frontLayer.enabled)) {
                return;
            }
            if (frontLayer) {
                if (layer !== frontLayer) {
                    return;
                }
                this.drawnFront = true;
                this.draw('front');
                return;
            }
            if (!this.worldLayer || layer !== this.worldLayer) {
                return;
            }
            this.drawnFront = true;
            this.draw('front');
        };

        this.scene.app.scene.on('prerender:layer', this.mainCameraHandlers.preRenderLayer);
        this.scene.app.scene.on('postrender:layer', this.mainCameraHandlers.postRenderLayer);
    }

    remove() {
        if (this.mainCameraHandlers.preRenderLayer) {
            this.scene?.app?.scene?.off('prerender:layer', this.mainCameraHandlers.preRenderLayer);
        }
        if (this.mainCameraHandlers.postRenderLayer) {
            this.scene?.app?.scene?.off('postrender:layer', this.mainCameraHandlers.postRenderLayer);
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

    setParamsList(layer: ReferenceImageLayer, paramsList: RenderParams[]) {
        const safeList = Array.isArray(paramsList) ? paramsList : [];
        if (layer === 'back') {
            this.params.back = safeList;
            if (this.referenceBackLayer) {
                this.referenceBackLayer.enabled = safeList.length > 0;
            }
        } else {
            this.params.front = safeList;
            if (this.referenceFrontLayer) {
                this.referenceFrontLayer.enabled = safeList.length > 0;
            }
        }
        safeList.forEach((params) => {
            if (!params?.texture) {
                return;
            }
            const filter = params.pixelPerfect ? FILTER_NEAREST : FILTER_LINEAR;
            params.texture.minFilter = filter;
            params.texture.magFilter = filter;
        });
    }

    // backward-compatible single item setter
    setParams(layer: ReferenceImageLayer, params: RenderParams | null) {
        this.setParamsList(layer, params ? [params] : []);
    }

    clearParams() {
        this.setParamsList('back', []);
        this.setParamsList('front', []);
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
        const paramsList = kind === 'back' ? this.params.back : this.params.front;
        if (paramsList.length === 0 || !this.scene || !this.quadRender) {
            return;
        }
        const device = this.scene.app.graphicsDevice;
        device.setBlendState(this.blendState);
        device.setCullMode(CULLFACE_NONE);
        device.setDepthState(DepthState.NODEPTH);
        device.setStencilState(null, null);
        for (const params of paramsList) {
            if (!this.applyParams(params)) {
                continue;
            }
            this.quadRender.render();
        }
    }
}

export { ReferenceImageRenderer };
export type { RenderParams, RenderRect };
