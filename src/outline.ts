import {
    BlendState,
    Layer
} from 'playcanvas';

import { bindViews } from './cameras/bind-views';
import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

class Outline extends Element {
    shaderQuad: ShaderQuad;
    renderPass: SimpleRenderPass;
    enabled = true;
    private releaseViews: () => void;

    constructor() {
        super(ElementType.other);
    }

    add() {
        const device = this.scene.app.graphicsDevice;

        const { events } = this.scene;
        this.releaseViews = bindViews(this.scene, (camera) => {
            const shaderQuad = new ShaderQuad(device, vertexShader, fragmentShader, 'apply-outline');
            const renderPass = new SimpleRenderPass(device, shaderQuad, {
                blendState: BlendState.ALPHABLEND
            });

            const clr = [1, 1, 1, 1];


            const handle = camera.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
            // only apply when outline mode is enabled
                const outlineSelection = events.invoke('view.outlineSelection') || !!events.invoke('colorPanel.pending');
                if (!this.enabled || !outlineSelection) {
                    return;
                }

                // apply at the end of the gizmo layer (after overlay renders)
                if (layer !== this.scene.gizmoLayer || !transparent) {
                    return;
                }

                events.invoke('selectedClr').toArray(clr);

                renderPass.execute({
                    srcTexture: camera.workTarget.colorBuffer,
                    alphaCutoff: 0.8,
                    clr
                });
            });
            return () => {
                handle.off(); renderPass.destroy(); shaderQuad.destroy();
            };
        });
    }

    remove() {
        this.releaseViews?.();
    }
}

export { Outline };
