// 統合レンダラー専用。パレットはワールド行列を直接格納し、matrix_model は恒等で運用する。
// PlayCanvas 側を更新してもここでの前提を崩さないこと（元の gsplat に戻すとゴースト再発の危険あり）。
const vertexShader = /* glsl*/`
#include "gsplatCommonVS"

uniform sampler2D splatState;
uniform sampler2D splatParams0;                    // tint.rgb, temperature
uniform sampler2D splatParams1;                    // saturation, brightness, blackPoint, whitePoint
uniform sampler2D splatParams2;                    // transparency, selectionAlpha
uniform uvec2 globalParams;                        // texture width, total splats
uniform uvec2 splatParamsDim;                      // custom width, total splats for params/state

uniform vec4 selectedClr;
uniform vec4 lockedClr;
uniform vec3 clrOffset;
uniform vec4 clrScale;

varying mediump vec4 texCoord_flags;            // store locked flat in z
varying mediump vec4 color;

#if PICK_PASS
    uniform uint pickOp;                        // 0: add, 1: remove, 2: set
    uniform int pickMode;                       // 0: pick id, 1: depth estimation, 2: occlusion export
#endif

mediump vec4 discardVec = vec4(0.0, 0.0, 2.0, 1.0);

vec3 applySaturation(vec3 color, float saturation) {
    vec3 grey = vec3(dot(color, vec3(0.299, 0.587, 0.114)));
    return grey + (color - grey) * saturation;
}

void main(void) {
    // read gaussian details
    SplatSource source;
    if (!initSource(source)) {
        gl_Position = discardVec;
        return;
    }

    // Calculate custom UVs for our parameters (independent of engine's transformA layout)
    // Use splat.index (after splatOrder remap) so sorting does not desync params/state.
    uint gaussId = splat.index;
    uint paramWidth = splatParamsDim.x;
    ivec2 customUV = ivec2(int(gaussId % paramWidth), int(gaussId / paramWidth));

    // per-splat parameters (Using Custom UV)
    vec4 params0 = texelFetch(splatParams0, customUV, 0);
    vec4 params1 = texelFetch(splatParams1, customUV, 0);
    vec4 params2 = texelFetch(splatParams2, customUV, 0);
    float saturationVal = params1.x;
    float brightness = params1.y;
    float blackPoint = params1.z;
    float whitePoint = params1.w;
    vec3 tint = params0.rgb;
    float temperature = params0.a;
    float transparency = params2.x;
    float selectionAlpha = params2.y;

    // get per-gaussian edit state (Using Custom UV)
    uint vertexState = uint(texelFetch(splatState, customUV, 0).r * 255.0 + 0.5) & 15u;

    #if PICK_PASS
        if (pickOp == 0u) {
            // add: skip deleted, locked and selected splats
            if (vertexState != 0u) {
                gl_Position = discardVec;
                return;
            }
        } else if (pickOp == 1u) {
            // remove: skip deleted, locked and unselected splats
            if (vertexState != 1u) {
                gl_Position = discardVec;
                return;
            }
        } else {
            // set: skip deleted, locked and hidden splats
            if ((vertexState & 14u) != 0u) {
                gl_Position = discardVec;
                return;
            }
        }
    #else
        if ((vertexState & 12u) != 0u) {
            gl_Position = discardVec;
            return;
        }
    #endif

    // get center
    vec3 modelCenter = getCenter();

    SplatCenter center;
    center.modelCenterOriginal = modelCenter;
    modifySplatCenter(modelCenter);
    center.modelCenterModified = modelCenter;

    if (!initCenter(modelCenter, center)) {
        gl_Position = discardVec;
        return;
    }

    SplatCorner corner;
    if (!initCorner(source, center, corner)) {
        gl_Position = discardVec;
        return;
    }

    gl_Position = center.proj + vec4(corner.offset, 0.0);

    // store texture coord and locked state
    texCoord_flags = vec4(
        corner.uv,
        (vertexState & 1u) != 0u ? 1.0 : 0.0,       // selected
        (vertexState & 2u) != 0u ? 1.0 : 0.0        // locked
    );

    #if PICK_PASS
        if (pickMode == 1) {
            // depth estimation mode: compute normalized depth in vertex shader
            float linearDepth = -center.view.z;
            float normalizedDepth = (linearDepth - camera_params.z) / (camera_params.y - camera_params.z);
            vec4 clr = getColor();
            color = vec4(normalizedDepth, 0.0, 0.0, 1.0) * clr.a;
        } else if (pickMode == 2) {
            vec4 clr = getColor();
            color = vec4(0.0, 0.0, 0.0, clr.a);
        } else {
            // pick id
            uvec4 bits = (uvec4(splat.index) >> uvec4(0u, 8u, 16u, 24u)) & uvec4(255u);
            color = vec4(bits) / 255.0;
        }
    // handle splat color
    #elif FORWARD_PASS
        // read color
        color = getColor();

        // evaluate spherical harmonics
        #if SH_BANDS > 0
        // calculate the model-space view direction
            vec3 dir = normalize(center.view * mat3(center.modelView));

            // read sh coefficients
            vec3 sh[SH_COEFFS];
            float scale;
            readSHData(sh, scale);

            // evaluate
            color.xyz += evalSH(sh, dir) * scale;
        #endif

        // apply tint/brightness
        float offset = -blackPoint + brightness;
        float scaleBase = 1.0 / max(1e-6, (whitePoint - blackPoint));
        vec3 clrScaleVec = vec3(
            scaleBase * tint.r * (1.0 + temperature),
            scaleBase * tint.g,
            scaleBase * tint.b * (1.0 - temperature)
        );
        color.xyz = color.xyz * clrScaleVec + vec3(offset);

        // apply saturation
        color.xyz = applySaturation(color.xyz, saturationVal);

        // apply global color scale/offset
        color.xyz = color.xyz * clrScale.rgb + clrOffset;

        // don't allow out-of-range alpha
        color.a = clamp(color.a * transparency * clrScale.a, 0.0, 1.0);

        // apply tonemapping
        color = vec4(prepareOutputFromGamma(max(color.xyz, 0.0)), color.w);

        // apply locked/selected colors
        if ((vertexState & 2u) != 0u) {
            // locked
            color *= lockedClr;
        } else if ((vertexState & 1u) != 0u) {
            // selected
            vec4 sel = vec4(selectedClr.rgb, selectedClr.a * selectionAlpha);
            color.xyz = mix(color.xyz, sel.xyz * 0.8, sel.a);
        }
    #endif
}
`;

const fragmentShader = /* glsl*/`
varying mediump vec4 texCoord_flags;
varying mediump vec4 color;

uniform bool outlineMode;
uniform float ringSize;

#if PICK_PASS
    uniform int pickMode;           // 0: id, 1: depth estimation, 2: occlusion export
    #ifdef DEPTH_PICK_PASS
        uniform sampler2D occlusionModelDepthTex;
        uniform vec2 occlusionModelDepthTexSize;
        #include "floatAsUintPS"
    #endif
#endif

const float EXP4 = exp(-4.0);
const float INV_EXP4 = 1.0 / (1.0 - EXP4);

float normExp(float x) {
    return (exp(x * -4.0) - EXP4) * INV_EXP4;
}

void main(void) {
    mediump float A = dot(texCoord_flags.xy, texCoord_flags.xy);

    if (A > 1.0) {
        discard;
    }

    #if PICK_PASS
        if (pickMode == 1) {
            // depth estimation
            mediump float alpha = normExp(A);
            if (alpha < 1.0 / 255.0) {
                discard;
            }
            // we should multiply by alpha here to take into account gaussian falloff,
            // but it results in less accurate depth for some reason
            gl_FragColor = color * alpha;
        } else if (pickMode == 2) {
            mediump float alpha = normExp(A) * color.a;
            if (alpha < 1.0 / 255.0) {
                discard;
            }
            #ifdef DEPTH_PICK_PASS
                vec2 uv = gl_FragCoord.xy / occlusionModelDepthTexSize;
                vec4 depthSample = texture2D(occlusionModelDepthTex, uv);
                if (all(greaterThanEqual(depthSample, vec4(0.999999)))) {
                    discard;
                }
                float modelDepth = uint2float(depthSample);
                if (gl_FragCoord.z >= modelDepth - 1e-6) {
                    discard;
                }
                pcFragColor0 = vec4(1.0);
                pcFragColor1 = vec4(0.0, 0.0, 0.0, alpha);
            #else
                gl_FragColor = vec4(0.0, 0.0, 0.0, alpha);
            #endif
        } else {
            // pick id
            gl_FragColor = color;
        }
    #else
        mediump float norm = normExp(A);
        mediump float alpha = norm * color.a;

        if (texCoord_flags.w == 0.0 && ringSize > 0.0) {
            // rings mode
            if (A < 1.0 - ringSize) {
                alpha = max(0.05, alpha);
            } else {
                alpha = 0.6;
            }
        }

        bool selected = texCoord_flags.z != 0.0;

        if (outlineMode) {
            pcFragColor0 = vec4(color.xyz * alpha, alpha);
            pcFragColor1 = vec4(0.0, 0.0, 0.0, selected ? alpha : 0.0);
        } else {
            if (selected) {
                pcFragColor0 = vec4(color.xyz * alpha * 0.8, alpha);
                pcFragColor1 = vec4(color.xyz * alpha * 0.2, alpha);
            } else {
                pcFragColor0 = vec4(color.xyz * alpha, alpha);
                pcFragColor1 = vec4(0.0, 0.0, 0.0, 0.0);
            }
        }
    #endif

    // DEBUG: REVERT FORCE RED
    // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}
`;

const gsplatCenter = /* glsl*/`
uniform highp usampler2D splatTransform;        // per-splat index into transform palette
uniform sampler2D transformPalette;             // palette of transform matrices

// transformPalette はワールド行列前提。matrix_model は恒等として扱い、二重適用を防ぐ。
mat4 applyPaletteTransform() {
    uint transformIndex = texelFetch(splatTransform, splat.uv, 0).r;
    if (transformIndex == 0u) {
        return mat4(1.0);
    }

    // read transform matrix
    int u = int(transformIndex % 512u) * 3;
    int v = int(transformIndex / 512u);

    mat4 t;
    t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
    t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
    t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
    t[3] = vec4(0.0, 0.0, 0.0, 1.0);

    return transpose(t);
}

uniform mat4 matrix_model;
uniform mat4 matrix_view;
#ifndef GSPLAT_CENTER_NOPROJ
    uniform vec4 camera_params;             // 1 / far, far, near, isOrtho
    uniform mat4 matrix_projection;
#endif

// project the model space gaussian center to view and clip space
bool initCenter(vec3 modelCenter, inout SplatCenter center) {
    mat4 modelView = matrix_view * applyPaletteTransform();
    vec4 centerView = modelView * vec4(modelCenter, 1.0);

    #ifndef GSPLAT_CENTER_NOPROJ
        // early out if splat is behind the camera (perspective only)
        if (camera_params.w != 1.0 && centerView.z > 0.0) {
            return false;
        }

        // Enforce near clipping for splats (matches mesh behavior for camera-near).
        // camera_params = (1 / far, far, near, isOrtho)
        float dist = -centerView.z;
        if (dist < camera_params.z) {
            return false;
        }

        // 非対称フラスタムを含む射影行列をそのまま適用し、FOV 推定などで再計算しない。
        vec4 centerProj = matrix_projection * centerView;
        #if WEBGPU
            centerProj.z = clamp(centerProj.z, 0.0, abs(centerProj.w));
        #else
            centerProj.z = clamp(centerProj.z, -abs(centerProj.w), abs(centerProj.w));
        #endif

        center.proj = centerProj;
        center.projMat00 = matrix_projection[0][0];
    #endif

    center.view = centerView.xyz / centerView.w;
    center.modelView = modelView;
    return true;
}
`;

export { vertexShader, fragmentShader, gsplatCenter };
