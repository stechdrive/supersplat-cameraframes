import { BLENDMODE_ONE, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA, BLENDEQUATION_ADD,
    BlendState, CULLFACE_NONE, DepthState, Mat4, PROJECTION_ORTHOGRAPHIC, QuadRender, SEMANTIC_POSITION, ShaderUtils } from 'playcanvas';

import { bindViews } from './cameras/bind-views';
import type { Events } from './events';
import type { Scene } from './scene';

// The horizon is a view overlay derived from the stock projection and world
// rotation. It has no camera state or projection callback of its own.
export const registerEyeLevel = (scene: Scene, events: Events) => {
    let visible = true;
    const device = scene.graphicsDevice;
    const shader = ShaderUtils.createShader(device, {
        uniqueName: 'camera-frames-eye-level',
        attributes: { vertex_position: SEMANTIC_POSITION },
        vertexWGSL: `
            attribute vertex_position: vec2f;
            uniform eyeInverseViewProjection: mat4x4f;
            varying eyeNear: vec3f;
            varying eyeFar: vec3f;
            @vertex fn vertexMain(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                let nearPoint = uniform.eyeInverseViewProjection * vec4f(input.vertex_position, -1.0, 1.0);
                let farPoint = uniform.eyeInverseViewProjection * vec4f(input.vertex_position, 1.0, 1.0);
                output.eyeNear = nearPoint.xyz / nearPoint.w;
                output.eyeFar = farPoint.xyz / farPoint.w;
                output.position = vec4f(input.vertex_position, 0.0, 1.0);
                return output;
            }`,
        fragmentWGSL: `
            varying eyeNear: vec3f;
            varying eyeFar: vec3f;
            @fragment fn fragmentMain(input: FragmentInput) -> FragmentOutput {
                var output: FragmentOutput;
                let y = normalize(input.eyeFar - input.eyeNear).y;
                let width = max(fwidth(y), 0.000001);
                let core = 1.0 - smoothstep(0.0, 1.2 * width, abs(y));
                let glow = 1.0 - smoothstep(0.0, 4.0 * width, abs(y));
                let alpha = 0.9 * max(core, glow * 0.35);
                if (alpha <= 0.0) { discard; }
                output.color = vec4f(1.0, 1.0, 1.0, alpha);
                output.color1 = vec4f(0.0);
                return output;
            }`
    });
    const blend = new BlendState(true,
        BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
        BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA);
    bindViews(scene, (camera) => {
        const quad = new QuadRender(shader);
        const inverse = new Mat4();
        const handle = camera.camera.on('postRenderLayer', (layer, transparent) => {
            if (!visible || transparent || layer !== camera.splatLayer || camera.camera.projection === PROJECTION_ORTHOGRAPHIC ||
                !(camera.renderOverlays || camera.exportGrid)) return;
            inverse.mul2(camera.camera.projectionMatrix, camera.camera.viewMatrix).invert();
            device.scope.resolve('eyeInverseViewProjection').setValue(inverse.data);
            device.setBlendState(blend);
            device.setCullMode(CULLFACE_NONE);
            device.setDepthState(DepthState.NODEPTH);
            device.setStencilState(null, null);
            quad.render();
        });
        return () => {
            handle.off(); quad.destroy();
        };
    });
    events.function('eyeLevel.visible', () => visible);
    events.on('eyeLevel.setVisible', (value: boolean) => {
        visible = !!value;
        scene.forceRender = true;
        events.fire('eyeLevel.visible', visible);
    });
};
