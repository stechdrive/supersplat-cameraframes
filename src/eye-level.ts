import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_NONE,
    SEMANTIC_POSITION,
    BlendState,
    DepthState,
    Layer,
    Mat4,
    QuadRender,
    ScopeSpace,
    Shader,
    ShaderUtils
} from 'playcanvas';

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

        const viewProjectionMatrix = new Mat4();
        const viewProjectionInverse = new Mat4();

        this.scene.camera.entity.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
            const { scene } = this;
            const targetLayer = scene.renderFlags.eyeLevelLayerOverride ?? scene.gizmoLayer;
            const overlaysEnabled = scene.camera.renderOverlays || scene.renderFlags.forceEyeLevelOverlay;
            // 見やすさを優先し、デフォルトではワールド描画の後段で必ず前面に載せる
            if (!this.visible || transparent || layer !== targetLayer || !overlaysEnabled) {
                return;
            }

            const camera = scene.camera.entity.camera;
            const projection = camera.projectionMatrix;
            const view = camera.viewMatrix;
            if (!projection || !view) {
                return;
            }
            viewProjectionMatrix.mul2(projection, view);

            device.setBlendState(blendState);
            device.setCullMode(CULLFACE_NONE);
            // 深度は現行シーンに影響させない（テストなし書き込みなし）
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);

            viewProjectionInverse.copy(viewProjectionMatrix);
            if (!viewProjectionInverse.invert()) {
                return;
            }

            resolve(device.scope, {
                matrix_viewProjectionInverse: viewProjectionInverse.data,
                uColor: [1, 1, 1, 0.9],
                uLineWidthPx: 1.2,
                uGlowWidthPx: 4.0,
                uGlowAlpha: 0.35
            });

            this.quadRender.render();
        });
    }

    remove() {
        this.shader?.destroy();
        this.quadRender?.destroy();
    }

    serialize(serializer: Serializer): void {
        serializer.pack(this.visible);
    }
}

export { EyeLevel };
