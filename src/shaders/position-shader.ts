const vertexShader = /* glsl */ `
    attribute vec2 vertex_position;
    void main(void) {
        gl_Position = vec4(vertex_position, 0.0, 1.0);
    }
`;

const fragmentShader = /* glsl */ `
    uniform highp usampler2D transformA;            // splat center x, y, z
    uniform highp usampler2D splatTransform;        // transform palette index
    uniform sampler2D transformPalette;             // palette of transforms
    uniform uvec2 globalSplatParams;                // global texture width, total splats
    uniform uvec2 output_params;                    // output width, height
    uniform uint splatOffset;                       // start index
    uniform uint splatCount;                        // number of splats for this pass

    void main(void) {
        uint localId = uint(gl_FragCoord.x) + uint(gl_FragCoord.y) * output_params.x;

        if (localId >= splatCount) {
            discard;
        }

        uint globalIndex = splatOffset + localId;

        ivec2 splatUV = ivec2(
            int(globalIndex % globalSplatParams.x),
            int(globalIndex / globalSplatParams.x)
        );

        // read splat center
        vec3 center = uintBitsToFloat(texelFetch(transformA, splatUV, 0).xyz);

        // apply optional per-splat transform
        uint transformIndex = texelFetch(splatTransform, splatUV, 0).r;
        if (transformIndex > 0u) {
            // read transform matrix
            int u = int(transformIndex % 512u) * 3;
            int v = int(transformIndex / 512u);

            mat3x4 t;
            t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
            t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
            t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);

            center = vec4(center, 1.0) * t;
        }

        gl_FragColor = vec4(center, 0.0);
    }
`;

export { vertexShader, fragmentShader };
