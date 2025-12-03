const vertexShader = /* glsl*/ `
    attribute vec2 vertex_position;

    uniform mat4 matrix_viewProjectionInverse;

    varying vec3 worldNear;
    varying vec3 worldFar;

    void main(void) {
        // full-screen quad in clip space
        vec4 ndc = vec4(vertex_position, 0.0, 1.0);

        // unproject near and far points
        vec4 nearPoint = matrix_viewProjectionInverse * vec4(vertex_position, -1.0, 1.0);
        vec4 farPoint = matrix_viewProjectionInverse * vec4(vertex_position, 1.0, 1.0);

        worldNear = nearPoint.xyz / nearPoint.w;
        worldFar = farPoint.xyz / farPoint.w;

        gl_Position = ndc;
    }
`;

const fragmentShader = /* glsl*/ `
    uniform vec4 uColor;
    uniform float uLineWidthPx;
    uniform float uGlowWidthPx;
    uniform float uGlowAlpha;

    varying vec3 worldNear;
    varying vec3 worldFar;

    void main(void) {
        vec3 rayDir = normalize(worldFar - worldNear);

        // rayDir.y が 0 になる場所が地平線。pixel 幅は fwidth から得る。
        float distFromHorizon = abs(rayDir.y);
        float pixelWidth = max(fwidth(rayDir.y), 1e-6);
        float core = 1.0 - smoothstep(0.0, uLineWidthPx * pixelWidth, distFromHorizon);
        float glow = 1.0 - smoothstep(0.0, uGlowWidthPx * pixelWidth, distFromHorizon);
        float alpha = max(core, glow * uGlowAlpha);

        if (alpha <= 0.0) {
            discard;
        }

        gl_FragColor = vec4(uColor.rgb, uColor.a * alpha);
    }
`;

export { vertexShader, fragmentShader };
