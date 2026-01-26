import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    BlendState,
    CameraComponent,
    Layer
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/blit-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

class Underlay extends Element {
    shaderQuad: ShaderQuad;
    renderPass: SimpleRenderPass;
    enabled = true;
    private preRenderLayerHandler: ((camera: CameraComponent, layer: Layer, transparent: boolean) => void) | null = null;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shaderQuad = new ShaderQuad(device, vertexShader, fragmentShader, 'apply-underlay');
        this.renderPass = new SimpleRenderPass(device, this.shaderQuad, {
            blendState: new BlendState(true,
                BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE,
                BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE
            )
        });

        const { camera, events } = this.scene;

        this.preRenderLayerHandler = (cameraComponent: CameraComponent, layer: Layer, transparent: boolean) => {
            if (cameraComponent !== camera.camera) {
                return;
            }
            // underlay is used when outline mode is disabled
            if (!this.enabled || events.invoke('view.outlineSelection')) {
                return;
            }

            // apply at the start of the gizmo layer
            if (layer !== this.scene.gizmoLayer || transparent) {
                return;
            }

            this.renderPass.execute({
                srcTexture: camera.workTarget.colorBuffer
            });
        };

        this.scene.app.scene.on('prerender:layer', this.preRenderLayerHandler);
    }

    remove() {
        // event listeners are cleaned up when camera is destroyed
        if (this.preRenderLayerHandler) {
            this.scene.app.scene.off('prerender:layer', this.preRenderLayerHandler);
            this.preRenderLayerHandler = null;
        }
    }

    onPreRender() {
        // no longer need to manage a separate camera
    }
}

export { Underlay };
