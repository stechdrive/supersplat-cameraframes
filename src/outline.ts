import {
    BlendState,
    CameraComponent,
    Layer
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

class Outline extends Element {
    shaderQuad: ShaderQuad;
    renderPass: SimpleRenderPass;
    enabled = true;
    private preRenderLayerHandler: ((camera: CameraComponent, layer: Layer, transparent: boolean) => void) | null = null;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        this.shaderQuad = new ShaderQuad(device, vertexShader, fragmentShader, 'apply-outline');
        this.renderPass = new SimpleRenderPass(device, this.shaderQuad, {
            blendState: BlendState.ALPHABLEND
        });

        const clr = [1, 1, 1, 1];

        const { camera, events } = this.scene;

        this.preRenderLayerHandler = (cameraComponent: CameraComponent, layer: Layer, transparent: boolean) => {
            if (cameraComponent !== camera.camera) {
                return;
            }
            // only apply when outline mode is enabled
            if (!this.enabled || !events.invoke('view.outlineSelection')) {
                return;
            }

            // apply at the start of the gizmo layer
            if (layer !== this.scene.gizmoLayer || transparent) {
                return;
            }

            events.invoke('selectedClr').toArray(clr);

            this.renderPass.execute({
                srcTexture: camera.workTarget.colorBuffer,
                alphaCutoff: events.invoke('camera.mode') === 'rings' ? 0.0 : 0.4,
                clr
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

export { Outline };
