// 統合レンダラーのオーバーレイも、transformPalette をワールド行列として扱い matrix_model の二重適用を避ける。
// camera.setCustomFrustum で設定される非対称射影を前提に view/projection を明示的に受け取る。
const vertexShader = /* glsl */ `
    attribute uint vertex_id;

    uniform mat4 view_matrix;
    uniform mat4 projection_matrix;

    uniform sampler2D splatState;
    uniform highp sampler2D splatPosition;
    uniform highp usampler2D splatTransform;
    uniform sampler2D transformPalette;

    uniform uvec2 globalParams;
    uniform uint splatOffset;
    uniform uint splatCount;

    uniform float splatSize;
    uniform vec4 selectedClr;
    uniform vec4 unselectedClr;

    varying vec4 varying_color;
    varying vec2 vZW;

    ivec2 calcSplatUV(uint index, uint width) {
        return ivec2(int(index % width), int(index / width));
    }

    void main(void) {
        if (vertex_id >= splatCount) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            gl_PointSize = 0.0;
            return;
        }

        uint globalIndex = splatOffset + vertex_id;
        ivec2 splatUV = calcSplatUV(globalIndex, globalParams.x);
        uint splatState = uint(texelFetch(splatState, splatUV, 0).r * 255.0) & 15u;

        if ((splatState & 12u) != 0u) {
            // deleted or hidden (4 or 8)
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            gl_PointSize = 0.0;
        } else {
            mat4 model = mat4(1.0);

            uint transformIndex = texelFetch(splatTransform, splatUV, 0).r;
            if (transformIndex > 0u) {
                int u = int(transformIndex % 512u) * 3;
                int v = int(transformIndex / 512u);

                mat4 t;
                t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
                t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
                t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
                t[3] = vec4(0.0, 0.0, 0.0, 1.0);

                model = transpose(t);
            }

            varying_color = (splatState == 1u) ? selectedClr : unselectedClr;

            vec3 center = texelFetch(splatPosition, splatUV, 0).xyz;
            vec4 centerView = view_matrix * model * vec4(center, 1.0);
            gl_Position = projection_matrix * centerView;

            // Near/far クリップでオーバーレイが消えないように深度をクランプする。
            vZW = gl_Position.zw;
            gl_Position.z = 0.0;

            gl_PointSize = splatSize;
        }
    }
`;

const fragmentShader = /* glsl */ `
    varying vec4 varying_color;
    varying vec2 vZW;

    void main(void) {
        gl_FragColor = varying_color;
        gl_FragDepth = max(0.0, min(1.0, (vZW.x / vZW.y + 1.0) * 0.5));
    }
`;

export { vertexShader, fragmentShader };
