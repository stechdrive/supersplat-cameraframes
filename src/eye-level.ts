import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_NONE,
    PROJECTION_ORTHOGRAPHIC,
    SEMANTIC_POSITION,
    BlendState,
    CameraComponent,
    DepthState,
    Layer,
    QuadRender,
    ScopeSpace,
    Shader,
    ShaderUtils
} from 'playcanvas';

import {
    createCameraProjectionData,
    resolveCameraProjectionData,
    type CameraProjectionData
} from './camera-matrices';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/eye-level-shader';

const resolve = (scope: ScopeSpace, values: Record<string, any>) => {
    for (const key in values) {
        scope.resolve(key).setValue(values[key]);
    }
};

class EyeLevel extends Element {
    shader: Shader;
    quadRender: QuadRender;
    private preRenderLayerHandler: ((camera: CameraComponent, layer: Layer, transparent: boolean) => void) | null = null;

    visible = true;

    constructor() {
        super(ElementType.debug);
    }

    add() {
        const { app } = this.scene;
        const device = app.graphicsDevice;

        this.shader = ShaderUtils.createShader(device, {
            uniqueName: 'eye-level',
            attributes: {
                vertex_position: SEMANTIC_POSITION
            },
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });

        this.quadRender = new QuadRender(this.shader);

        const blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );

        const cameraMatrices: CameraProjectionData = createCameraProjectionData();

        this.preRenderLayerHandler = (cameraComponent: CameraComponent, layer: Layer, transparent: boolean) => {
            const { scene } = this;
            if (cameraComponent !== scene.camera.camera) {
                return;
            }
            const targetLayer = scene.renderFlags.eyeLevelLayerOverride ?? scene.gizmoLayer;
            const overlaysEnabled = scene.camera.renderOverlays || scene.renderFlags.forceEyeLevelOverlay;
            // 見やすさを優先し、デフォルトではワールド描画の後段で必ず前面に載せる
            if (!this.visible || transparent || layer !== targetLayer || !overlaysEnabled) {
                return;
            }

            if (cameraComponent.projection === PROJECTION_ORTHOGRAPHIC) {
                // Eye-level overlay fills the screen in orthographic projection.
                return;
            }
            if (!resolveCameraProjectionData(cameraComponent, cameraMatrices, { fallbackToCurrentMatrices: true })) {
                return;
            }

            device.setBlendState(blendState);
            device.setCullMode(CULLFACE_NONE);
            // 深度は現行シーンに影響させない（テストなし書き込みなし）
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);

            resolve(device.scope, {
                matrix_viewProjectionInverse: cameraMatrices.invViewProjection.data,
                uColor: [1, 1, 1, 0.9],
                uLineWidthPx: 1.2,
                uGlowWidthPx: 4.0,
                uGlowAlpha: 0.35
            });

            this.quadRender.render();
        };

        this.scene.app.scene.on('prerender:layer', this.preRenderLayerHandler);
    }

    remove() {
        this.shader?.destroy();
        this.quadRender?.destroy();
        if (this.preRenderLayerHandler) {
            this.scene.app.scene.off('prerender:layer', this.preRenderLayerHandler);
            this.preRenderLayerHandler = null;
        }
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible);
    }
}

export { EyeLevel };
