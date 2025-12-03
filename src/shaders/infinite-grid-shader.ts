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
    uniform vec3 view_position;
    uniform mat4 matrix_viewProjection;
    uniform sampler2D blueNoiseTex32;

    uniform int plane;  // 0: x (yz), 1: y (xz), 2: z (xy)

    vec4 planes[3] = vec4[3](
        vec4(1.0, 0.0, 0.0, 0.0),
        vec4(0.0, 1.0, 0.0, 0.0),
        vec4(0.0, 0.0, 1.0, 0.0)
    );

    vec3 colors[3] = vec3[3](
        vec3(1.0, 0.2, 0.2),
        vec3(0.2, 1.0, 0.2),
        vec3(0.2, 0.2, 1.0)
    );

    int axis0[3] = int[3](1, 0, 0);
    int axis1[3] = int[3](2, 2, 1);

    varying vec3 worldNear;
    varying vec3 worldFar;

    bool intersectPlane(inout float t, vec3 pos, vec3 dir, vec4 plane) {
        float d = dot(dir, plane.xyz);
        if (abs(d) < 1e-06) {
            return false;
        }

        float n = -(dot(pos, plane.xyz) + plane.w) / d;
        if (n < 0.0) {
            return false;
        }

        t = n;

        return true;
    }

    // https://bgolus.medium.com/the-best-darn-grid-shader-yet-727f9278b9d8#1e7c
    float pristineGrid(in vec2 uv, in vec2 ddx, in vec2 ddy, vec2 lineWidth) {
        vec2 uvDeriv = vec2(length(vec2(ddx.x, ddy.x)), length(vec2(ddx.y, ddy.y)));
        bvec2 invertLine = bvec2(lineWidth.x > 0.5, lineWidth.y > 0.5);
        vec2 targetWidth = vec2(
            invertLine.x ? 1.0 - lineWidth.x : lineWidth.x,
            invertLine.y ? 1.0 - lineWidth.y : lineWidth.y
        );
        vec2 drawWidth = clamp(targetWidth, uvDeriv, vec2(0.5));
        vec2 lineAA = uvDeriv * 1.5;
        vec2 gridUV = abs(fract(uv) * 2.0 - 1.0);
        gridUV.x = invertLine.x ? gridUV.x : 1.0 - gridUV.x;
        gridUV.y = invertLine.y ? gridUV.y : 1.0 - gridUV.y;
        vec2 grid2 = smoothstep(drawWidth + lineAA, drawWidth - lineAA, gridUV);

        grid2 *= clamp(targetWidth / drawWidth, 0.0, 1.0);
        grid2 = mix(grid2, targetWidth, clamp(uvDeriv * 2.0 - 1.0, 0.0, 1.0));
        grid2.x = invertLine.x ? 1.0 - grid2.x : grid2.x;
        grid2.y = invertLine.y ? 1.0 - grid2.y : grid2.y;

        return mix(grid2.x, 1.0, grid2.y);
    }

    float calcDepth(vec3 p) {
        vec4 v = matrix_viewProjection * vec4(p, 1.0);
        return (v.z / v.w) * 0.5 + 0.5;
    }

    bool writeDepth(float alpha) {
        vec2 uv = fract(gl_FragCoord.xy / 32.0);
        float noise = texture2DLod(blueNoiseTex32, uv, 0.0).y;
        return alpha > noise;
    }

    void main(void) {
        vec3 p = worldNear;
        vec3 v = normalize(worldFar - worldNear);

        // intersect ray with selected plane
        float t;
        if (!intersectPlane(t, p, v, planes[plane])) {
            discard;
        }

        vec3 worldPos = p + v * t;
        vec2 pos = plane == 0 ? worldPos.yz : (plane == 1 ? worldPos.xz : worldPos.xy);
        vec2 ddx = dFdx(pos);
        vec2 ddy = dFdy(pos);

        float epsilon = 1.0 / 255.0;

        // calculate fade
        float fade = 1.0 - smoothstep(400.0, 1000.0, length(worldPos - view_position));
        if (fade < epsilon) {
            discard;
        }

        // common falloff so axis colors don't stretch infinitely
        float axisFalloff = 1.0 - smoothstep(200.0, 400.0, length(pos));

        // emphasize world origin axes (XZ plane only)
        if (plane == 1) {
            float axisWidth = 0.04; // meters (4 cm)
            float axisAA = max(length(ddx), length(ddy)) * 1.5;
            float xLine = 1.0 - smoothstep(axisWidth, axisWidth + axisAA, abs(pos.x));
            float zLine = 1.0 - smoothstep(axisWidth, axisWidth + axisAA, abs(pos.y));
            float axisAlpha = max(xLine, zLine) * fade * axisFalloff;
            if (axisAlpha > epsilon) {
                vec3 axisColor = vec3(0.0);
                if (xLine > 0.0 && zLine > 0.0) {
                    axisColor = vec3(1.0); // origin cross
                } else if (xLine >= zLine) {
                    axisColor = vec3(0.2, 0.2, 1.0); // X axis (swap colors)
                } else {
                    axisColor = vec3(1.0, 0.2, 0.2); // Z axis (swap colors)
                }
                gl_FragColor = vec4(axisColor, axisAlpha * 0.8);
                gl_FragDepth = writeDepth(axisAlpha) ? calcDepth(worldPos) : 1.0;
                return;
            }
        }

        vec2 levelPos;
        float levelSize;
        float levelAlpha;

        // 10m grid with colored main axes
        levelPos = pos * 0.1;
        levelSize = 2.0 / 1000.0;
        levelAlpha = pristineGrid(levelPos, ddx * 0.1, ddy * 0.1, vec2(levelSize)) * fade * 1.2;
        levelAlpha = min(levelAlpha, 1.0);
        if (levelAlpha > epsilon) {
            vec3 color;
            vec2 loc = abs(levelPos);
            float axisMask = (loc.x < levelSize || loc.y < levelSize) ? axisFalloff : 1.0;
            if (loc.x < levelSize) {
                if (loc.y < levelSize) {
                    color = vec3(1.0);
                } else {
                    color = colors[axis1[plane]];
                }
            } else if (loc.y < levelSize) {
                color = colors[axis0[plane]];
            } else {
                color = vec3(0.9);
            }
            gl_FragColor = vec4(color, levelAlpha * axisMask);
            gl_FragDepth = writeDepth(levelAlpha) ? calcDepth(worldPos) : 1.0;
            return;
        }

        // 1m grid
        levelPos = pos;
        levelSize = 1.0 / 100.0;
        levelAlpha = pristineGrid(levelPos, ddx, ddy, vec2(levelSize)) * fade * 1.2;
        levelAlpha = min(levelAlpha, 1.0);
        if (levelAlpha > epsilon) {
            gl_FragColor = vec4(vec3(0.7), levelAlpha);
            gl_FragDepth = writeDepth(levelAlpha) ? calcDepth(worldPos) : 1.0;
            return;
        }

        // 0.1m grid
        levelPos = pos * 10.0;
        levelSize = 1.0 / 100.0;
        levelAlpha = pristineGrid(levelPos, ddx * 10.0, ddy * 10.0, vec2(levelSize)) * fade * 1.2;
        levelAlpha = min(levelAlpha, 1.0);
        if (levelAlpha > epsilon) {
            gl_FragColor = vec4(vec3(0.7), levelAlpha);
            gl_FragDepth = writeDepth(levelAlpha) ? calcDepth(worldPos) : 1.0;
            return;
        }

        discard;
    }
`;

export { vertexShader, fragmentShader };
