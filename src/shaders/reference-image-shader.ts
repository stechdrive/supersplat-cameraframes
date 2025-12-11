const vertexShader = /* glsl */`
    attribute vec3 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 1.0);
    }
`;

const fragmentShader = /* glsl */`
    precision mediump float;

    uniform sampler2D referenceTexture;
    uniform vec4 rectPx;       // x, y, w, h (pixel space)
    uniform vec2 targetSize;   // render target size (pixels)
    uniform float opacity;

    void main(void) {
        vec2 frag = vec2(gl_FragCoord.x, targetSize.y - gl_FragCoord.y);
        vec2 minPos = rectPx.xy;
        vec2 maxPos = rectPx.xy + rectPx.zw;

        if (frag.x < minPos.x || frag.y < minPos.y || frag.x > maxPos.x || frag.y > maxPos.y) {
            discard;
        }

        vec2 uv = (frag - minPos) / rectPx.zw;
        vec4 color = texture2D(referenceTexture, uv);
        color.a *= opacity;
        gl_FragColor = color;
    }
`;

export { vertexShader, fragmentShader };
