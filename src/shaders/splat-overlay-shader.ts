const vertexShader = /* glsl */ `
    attribute uint vertex_id;

    uniform mat4 matrix_viewProjection;

    uniform sampler2D splatState;
    uniform highp usampler2D splatPosition;
    uniform highp usampler2D splatTransform;        // per-splat index into transform palette
    uniform sampler2D transformPalette;             // palette of transform matrices

    uniform uvec2 globalParams;                     // width, total count
    uniform uint splatOffset;
    uniform uint splatCount;

    uniform float splatSize;
    uniform vec4 selectedClr;
    uniform vec4 unselectedClr;

    varying vec4 varying_color;

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
        uint splatState = uint(texelFetch(splatState, splatUV, 0).r * 255.0);

        if ((splatState & 6u) != 0u) {
            // deleted or locked (4 or 2)
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            gl_PointSize = 0.0;
        } else {
            // transformPalette はワールド行列済み。ノード行列は掛けない。
            mat4 model = mat4(1.0);

            // handle per-splat transform (already in world space)
            uint transformIndex = texelFetch(splatTransform, splatUV, 0).r;
            if (transformIndex > 0u) {
                // read transform matrix
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

            vec3 center = uintBitsToFloat(texelFetch(splatPosition, splatUV, 0).xyz);

            gl_Position = matrix_viewProjection * model * vec4(center, 1.0);
            gl_PointSize = splatSize;
        }
    }
`;

const fragmentShader = /* glsl */ `
    varying vec4 varying_color;

    void main(void) {
        gl_FragColor = varying_color;
    }
`;

export { vertexShader, fragmentShader };
