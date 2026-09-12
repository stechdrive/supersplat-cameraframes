import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ZERO,
    BlendState,
    Layer
} from 'playcanvas';

import { bindViews } from './cameras/bind-views';
import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/blit-shader';
import { ShaderQuad, SimpleRenderPass } from './utils/simple-render-pass';

class Underlay extends Element {
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
            const shaderQuad = new ShaderQuad(device, vertexShader, fragmentShader, 'apply-underlay');
            const renderPass = new SimpleRenderPass(device, shaderQuad, {
                blendState: new BlendState(true,
                    BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE,
                    BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE
                )
            });


            const handle = camera.camera.on('preRenderLayer', (layer: Layer, transparent: boolean) => {
            // underlay is used when outline mode is disabled
                if (!this.enabled || events.invoke('view.outlineSelection')) {
                    return;
                }

                // apply at the start of the centers layer, which is the last thing
                // drawn before the centers themselves
                if (layer !== this.scene.centersLayer || transparent) {
                    return;
                }

                renderPass.execute({
                    srcTexture: camera.workTarget.colorBuffer,
                    // 1:1 copy - source and destination are both targetSize, and the
                    // underlay must not be quad-averaged like a stochastic frame
                    blitScale: [1, 1],
                    blitOffset: [0, 0],
                    quadResolve: 0
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

export { Underlay };
