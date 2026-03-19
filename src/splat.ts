import {
    Asset,
    BoundingBox,
    Color,
    Entity,
    GSplatData,
    type GSplatComponent,
    type Texture,
    Mat4,
    Quat,
    Vec3,
    GSplatResource
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { State } from './splat-state';
import { Transform } from './transform';
import { TransformPalette } from './transform-palette';

const vec = new Vec3();
const veca = new Vec3();
const vecb = new Vec3();

type EngineGsplatComponentState = {
    enabled?: boolean;
    unified?: boolean;
};

const engineGsplatColorAdjustTintParam = 'cameraFramesTint';
const engineGsplatColorAdjustTemperatureParam = 'cameraFramesTemperature';
const engineGsplatColorAdjustSaturationParam = 'cameraFramesSaturation';
const engineGsplatColorAdjustBrightnessParam = 'cameraFramesBrightness';
const engineGsplatColorAdjustBlackPointParam = 'cameraFramesBlackPoint';
const engineGsplatColorAdjustWhitePointParam = 'cameraFramesWhitePoint';
const engineGsplatColorAdjustTransparencyParam = 'cameraFramesTransparency';
const engineGsplatStateTextureParam = 'cameraFramesStateTexture';
const engineGsplatStateInfoParam = 'cameraFramesStateInfo';
const engineGsplatTransformTextureParam = 'cameraFramesTransformTexture';
const engineGsplatTransformPaletteTextureParam = 'cameraFramesTransformPaletteTexture';
const engineGsplatUseTransformPaletteParam = 'cameraFramesUseTransformPalette';
const engineGsplatSelectionAlphaParam = 'cameraFramesSelectionAlpha';
const engineGsplatSelectedColorParam = 'cameraFramesSelectedColor';
const engineGsplatLockedColorParam = 'cameraFramesLockedColor';

const roundEngineGsplatVisualValue = (value: number) => {
    if (!isFinite(value)) {
        return 'null';
    }
    return `${Math.round(value * 1e6) / 1e6}`;
};

const unifiedEngineGsplatColorAdjustModifier = {
    glsl: /* glsl */`
uniform vec3 cameraFramesTint;
uniform float cameraFramesTemperature;
uniform float cameraFramesSaturation;
uniform float cameraFramesBrightness;
uniform float cameraFramesBlackPoint;
uniform float cameraFramesWhitePoint;
uniform float cameraFramesTransparency;

vec3 cameraFramesApplySaturation(vec3 color, float saturation) {
    float grey = dot(color, vec3(0.299, 0.587, 0.114));
    return vec3(grey) + (color - vec3(grey)) * saturation;
}

void modifySplatCenter(inout vec3 center) {}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {}

void modifySplatColor(vec3 center, inout vec4 color) {
    float offset = -cameraFramesBlackPoint + cameraFramesBrightness;
    float scaleBase = 1.0 / max(1e-6, cameraFramesWhitePoint - cameraFramesBlackPoint);
    vec3 tintScale = vec3(
        scaleBase * cameraFramesTint.r * (1.0 + cameraFramesTemperature),
        scaleBase * cameraFramesTint.g,
        scaleBase * cameraFramesTint.b * (1.0 - cameraFramesTemperature)
    );

    color.rgb = cameraFramesApplySaturation(color.rgb * tintScale + vec3(offset), cameraFramesSaturation);
    color.a = clamp(color.a * cameraFramesTransparency, 0.0, 1.0);
}
`,
    wgsl: /* wgsl */`
uniform cameraFramesTint: vec3f;
uniform cameraFramesTemperature: f32;
uniform cameraFramesSaturation: f32;
uniform cameraFramesBrightness: f32;
uniform cameraFramesBlackPoint: f32;
uniform cameraFramesWhitePoint: f32;
uniform cameraFramesTransparency: f32;

fn cameraFramesApplySaturation(color: vec3f, saturation: f32) -> vec3f {
    let grey = dot(color, vec3f(0.299, 0.587, 0.114));
    return vec3f(grey) + (color - vec3f(grey)) * saturation;
}

fn modifySplatCenter(center: ptr<function, vec3f>) {}

fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {}

fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
    let offset = -uniform.cameraFramesBlackPoint + uniform.cameraFramesBrightness;
    let scaleBase = 1.0 / max(1e-6, uniform.cameraFramesWhitePoint - uniform.cameraFramesBlackPoint);
    let tintScale = vec3f(
        scaleBase * uniform.cameraFramesTint.r * (1.0 + uniform.cameraFramesTemperature),
        scaleBase * uniform.cameraFramesTint.g,
        scaleBase * uniform.cameraFramesTint.b * (1.0 - uniform.cameraFramesTemperature)
    );

    (*color).rgb = cameraFramesApplySaturation((*color).rgb * tintScale + vec3f(offset), uniform.cameraFramesSaturation);
    (*color).a = clamp((*color).a * uniform.cameraFramesTransparency, 0.0, 1.0);
}
`
} as const;

const unifiedEngineGsplatVisualModifier = {
    glsl: /* glsl */`
uniform vec3 cameraFramesTint;
uniform float cameraFramesTemperature;
uniform float cameraFramesSaturation;
uniform float cameraFramesBrightness;
uniform float cameraFramesBlackPoint;
uniform float cameraFramesWhitePoint;
uniform float cameraFramesTransparency;
uniform sampler2D cameraFramesStateTexture;
uniform highp usampler2D cameraFramesTransformTexture;
uniform sampler2D cameraFramesTransformPaletteTexture;
uniform float cameraFramesUseTransformPalette;
uniform float cameraFramesSelectionAlpha;
uniform uvec2 cameraFramesStateInfo;
uniform vec4 cameraFramesSelectedColor;
uniform vec4 cameraFramesLockedColor;

vec3 cameraFramesApplySaturation(vec3 color, float saturation) {
    float grey = dot(color, vec3(0.299, 0.587, 0.114));
    return vec3(grey) + (color - vec3(grey)) * saturation;
}

uint cameraFramesGlobalWidth() {
    return max(cameraFramesStateInfo.x, 1u);
}

uint cameraFramesGlobalIndex() {
    return cameraFramesStateInfo.y + splat.index;
}

ivec2 cameraFramesGlobalUv() {
    uint width = cameraFramesGlobalWidth();
    uint index = cameraFramesGlobalIndex();
    return ivec2(int(index % width), int(index / width));
}

uint cameraFramesReadState() {
    return uint(texelFetch(cameraFramesStateTexture, cameraFramesGlobalUv(), 0).r * 255.0 + 0.5) & 15u;
}

uint cameraFramesReadTransformIndex() {
    return texelFetch(cameraFramesTransformTexture, cameraFramesGlobalUv(), 0).r;
}

mat4 cameraFramesReadWorldTransform() {
    uint transformIndex = cameraFramesReadTransformIndex();
    if (transformIndex == 0u) {
        return matrix_model;
    }

    int u = int(transformIndex % 512u) * 3;
    int v = int(transformIndex / 512u);

    mat4 t;
    t[0] = texelFetch(cameraFramesTransformPaletteTexture, ivec2(u, v), 0);
    t[1] = texelFetch(cameraFramesTransformPaletteTexture, ivec2(u + 1, v), 0);
    t[2] = texelFetch(cameraFramesTransformPaletteTexture, ivec2(u + 2, v), 0);
    t[3] = vec4(0.0, 0.0, 0.0, 1.0);
    return transpose(t);
}

mat3 cameraFramesQuatToMat3(vec4 q) {
    vec4 q2 = q + q;
    float xx = q.x * q2.x;
    float yy = q.y * q2.y;
    float zz = q.z * q2.z;
    float xy = q.x * q2.y;
    float xz = q.x * q2.z;
    float yz = q.y * q2.z;
    float wx = q.w * q2.x;
    float wy = q.w * q2.y;
    float wz = q.w * q2.z;

    return mat3(
        1.0 - (yy + zz), xy + wz, xz - wy,
        xy - wz, 1.0 - (xx + zz), yz + wx,
        xz + wy, yz - wx, 1.0 - (xx + yy)
    );
}

vec4 cameraFramesMat3ToQuat(mat3 m) {
    float trace = m[0][0] + m[1][1] + m[2][2];
    vec4 q;

    if (trace > 0.0) {
        float s = sqrt(trace + 1.0) * 2.0;
        q = vec4(
            (m[1][2] - m[2][1]) / s,
            (m[2][0] - m[0][2]) / s,
            (m[0][1] - m[1][0]) / s,
            0.25 * s
        );
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
        float s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0;
        q = vec4(
            0.25 * s,
            (m[0][1] + m[1][0]) / s,
            (m[2][0] + m[0][2]) / s,
            (m[1][2] - m[2][1]) / s
        );
    } else if (m[1][1] > m[2][2]) {
        float s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0;
        q = vec4(
            (m[0][1] + m[1][0]) / s,
            0.25 * s,
            (m[1][2] + m[2][1]) / s,
            (m[2][0] - m[0][2]) / s
        );
    } else {
        float s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0;
        q = vec4(
            (m[2][0] + m[0][2]) / s,
            (m[1][2] + m[2][1]) / s,
            0.25 * s,
            (m[0][1] - m[1][0]) / s
        );
    }

    if (q.w < 0.0) {
        q = -q;
    }
    return normalize(q);
}

vec3 cameraFramesSafeNormalize(vec3 value, vec3 fallback) {
    float valueLength = length(value);
    return valueLength > 1e-6 ? value / valueLength : fallback;
}

vec3 cameraFramesFallbackOrtho(vec3 axis) {
    vec3 referenceAxis = abs(axis.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    return cameraFramesSafeNormalize(cross(referenceAxis, axis), vec3(0.0, 0.0, 1.0));
}

void modifySplatCenter(inout vec3 center) {
    if (cameraFramesUseTransformPalette > 0.5) {
        center = (cameraFramesReadWorldTransform() * vec4(getCenter(), 1.0)).xyz;
    }
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    uint state = cameraFramesReadState();
    if ((state & 12u) != 0u) {
        scale = vec3(0.0);
        return;
    }

    if (cameraFramesUseTransformPalette <= 0.5) {
        return;
    }

    mat3 linear = mat3(cameraFramesReadWorldTransform());
    vec4 sourceRotation = getRotation().yzwx;
    vec3 sourceScale = getScale();
    mat3 sourceBasis = cameraFramesQuatToMat3(sourceRotation);

    vec3 axis0 = linear * (sourceBasis[0] * sourceScale.x);
    vec3 axis1 = linear * (sourceBasis[1] * sourceScale.y);
    vec3 axis2 = linear * (sourceBasis[2] * sourceScale.z);

    vec3 basis0 = cameraFramesSafeNormalize(axis0, vec3(1.0, 0.0, 0.0));
    vec3 axis1Ortho = axis1 - basis0 * dot(basis0, axis1);
    vec3 basis1 = cameraFramesSafeNormalize(axis1Ortho, cameraFramesFallbackOrtho(basis0));
    vec3 basis2 = normalize(cross(basis0, basis1));
    if (dot(basis2, axis2) < 0.0) {
        basis2 = -basis2;
    }

    scale = vec3(length(axis0), length(axis1Ortho), abs(dot(axis2, basis2)));
    if (scale.x <= 1e-6 || scale.y <= 1e-6 || scale.z <= 1e-6) {
        scale = vec3(0.0);
        return;
    }

    rotation = cameraFramesMat3ToQuat(mat3(basis0, basis1, basis2));
}

void modifySplatColor(vec3 center, inout vec4 color) {
    uint state = cameraFramesReadState();
    float offset = -cameraFramesBlackPoint + cameraFramesBrightness;
    float scaleBase = 1.0 / max(1e-6, cameraFramesWhitePoint - cameraFramesBlackPoint);
    vec3 tintScale = vec3(
        scaleBase * cameraFramesTint.r * (1.0 + cameraFramesTemperature),
        scaleBase * cameraFramesTint.g,
        scaleBase * cameraFramesTint.b * (1.0 - cameraFramesTemperature)
    );

    color.rgb = cameraFramesApplySaturation(color.rgb * tintScale + vec3(offset), cameraFramesSaturation);
    color.a = clamp(color.a * cameraFramesTransparency, 0.0, 1.0);

    if ((state & 12u) != 0u) {
        color.a = 0.0;
        return;
    }

    if ((state & 2u) != 0u) {
        color *= cameraFramesLockedColor;
    } else if ((state & 1u) != 0u) {
        float selectedAlpha = cameraFramesSelectedColor.a * cameraFramesSelectionAlpha;
        color.rgb = mix(color.rgb, cameraFramesSelectedColor.rgb * 0.8, selectedAlpha);
    }
}
`,
    wgsl: /* wgsl */`
uniform cameraFramesTint: vec3f;
uniform cameraFramesTemperature: f32;
uniform cameraFramesSaturation: f32;
uniform cameraFramesBrightness: f32;
uniform cameraFramesBlackPoint: f32;
uniform cameraFramesWhitePoint: f32;
uniform cameraFramesTransparency: f32;
var cameraFramesStateTexture: texture_2d<f32>;
var cameraFramesTransformTexture: texture_2d<u32>;
var cameraFramesTransformPaletteTexture: texture_2d<f32>;
uniform cameraFramesUseTransformPalette: f32;
uniform cameraFramesSelectionAlpha: f32;
uniform cameraFramesStateInfo: vec2u;
uniform cameraFramesSelectedColor: vec4f;
uniform cameraFramesLockedColor: vec4f;

fn cameraFramesApplySaturation(color: vec3f, saturation: f32) -> vec3f {
    let grey = dot(color, vec3f(0.299, 0.587, 0.114));
    return vec3f(grey) + (color - vec3f(grey)) * saturation;
}

fn cameraFramesGlobalWidth() -> u32 {
    return max(uniform.cameraFramesStateInfo.x, 1u);
}

fn cameraFramesGlobalIndex() -> u32 {
    return uniform.cameraFramesStateInfo.y + splat.index;
}

fn cameraFramesGlobalUv() -> vec2i {
    let width = cameraFramesGlobalWidth();
    let index = cameraFramesGlobalIndex();
    return vec2i(i32(index % width), i32(index / width));
}

fn cameraFramesReadState() -> u32 {
    return u32(textureLoad(cameraFramesStateTexture, cameraFramesGlobalUv(), 0).r * 255.0 + 0.5) & 15u;
}

fn cameraFramesReadTransformIndex() -> u32 {
    return textureLoad(cameraFramesTransformTexture, cameraFramesGlobalUv(), 0).r;
}

fn cameraFramesReadWorldTransform() -> mat4x4f {
    let transformIndex = cameraFramesReadTransformIndex();
    if (transformIndex == 0u) {
        return uniform.matrix_model;
    }

    let u = i32(transformIndex % 512u) * 3;
    let v = i32(transformIndex / 512u);

    var t: mat4x4f;
    t[0] = textureLoad(cameraFramesTransformPaletteTexture, vec2i(u, v), 0);
    t[1] = textureLoad(cameraFramesTransformPaletteTexture, vec2i(u + 1, v), 0);
    t[2] = textureLoad(cameraFramesTransformPaletteTexture, vec2i(u + 2, v), 0);
    t[3] = vec4f(0.0, 0.0, 0.0, 1.0);
    return transpose(t);
}

fn cameraFramesQuatToMat3(q: vec4f) -> mat3x3f {
    let q2 = q + q;
    let xx = q.x * q2.x;
    let yy = q.y * q2.y;
    let zz = q.z * q2.z;
    let xy = q.x * q2.y;
    let xz = q.x * q2.z;
    let yz = q.y * q2.z;
    let wx = q.w * q2.x;
    let wy = q.w * q2.y;
    let wz = q.w * q2.z;

    return mat3x3f(
        vec3f(1.0 - (yy + zz), xy - wz, xz + wy),
        vec3f(xy + wz, 1.0 - (xx + zz), yz - wx),
        vec3f(xz - wy, yz + wx, 1.0 - (xx + yy))
    );
}

fn cameraFramesMat3ToQuat(m: mat3x3f) -> vec4f {
    let trace = m[0][0] + m[1][1] + m[2][2];
    var q: vec4f;

    if (trace > 0.0) {
        let s = sqrt(trace + 1.0) * 2.0;
        q = vec4f(
            (m[1][2] - m[2][1]) / s,
            (m[2][0] - m[0][2]) / s,
            (m[0][1] - m[1][0]) / s,
            0.25 * s
        );
    } else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
        let s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0;
        q = vec4f(
            0.25 * s,
            (m[0][1] + m[1][0]) / s,
            (m[2][0] + m[0][2]) / s,
            (m[1][2] - m[2][1]) / s
        );
    } else if (m[1][1] > m[2][2]) {
        let s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0;
        q = vec4f(
            (m[0][1] + m[1][0]) / s,
            0.25 * s,
            (m[1][2] + m[2][1]) / s,
            (m[2][0] - m[0][2]) / s
        );
    } else {
        let s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0;
        q = vec4f(
            (m[2][0] + m[0][2]) / s,
            (m[1][2] + m[2][1]) / s,
            0.25 * s,
            (m[0][1] - m[1][0]) / s
        );
    }

    if (q.w < 0.0) {
        q = -q;
    }
    return normalize(q);
}

fn cameraFramesSafeNormalize(value: vec3f, fallback: vec3f) -> vec3f {
    let valueLength = length(value);
    if (valueLength > 1e-6) {
        return value / valueLength;
    }
    return fallback;
}

fn cameraFramesFallbackOrtho(axis: vec3f) -> vec3f {
    let referenceAxis = if abs(axis.x) < 0.9 {
        vec3f(1.0, 0.0, 0.0)
    } else {
        vec3f(0.0, 1.0, 0.0)
    };
    return cameraFramesSafeNormalize(cross(referenceAxis, axis), vec3f(0.0, 0.0, 1.0));
}

fn modifySplatCenter(center: ptr<function, vec3f>) {
    if (uniform.cameraFramesUseTransformPalette > 0.5) {
        *center = (cameraFramesReadWorldTransform() * vec4f(getCenter(), 1.0)).xyz;
    }
}

fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
    let state = cameraFramesReadState();
    if ((state & 12u) != 0u) {
        *scale = vec3f(0.0);
        return;
    }

    if (uniform.cameraFramesUseTransformPalette <= 0.5) {
        return;
    }

    let worldTransform = cameraFramesReadWorldTransform();
    let linear = mat3x3f(worldTransform[0].xyz, worldTransform[1].xyz, worldTransform[2].xyz);
    let sourceRotation = getRotation().yzwx;
    let sourceScale = getScale();
    let sourceBasis = cameraFramesQuatToMat3(sourceRotation);

    let axis0 = linear * (sourceBasis[0] * sourceScale.x);
    let axis1 = linear * (sourceBasis[1] * sourceScale.y);
    let axis2 = linear * (sourceBasis[2] * sourceScale.z);

    let basis0 = cameraFramesSafeNormalize(axis0, vec3f(1.0, 0.0, 0.0));
    let axis1Ortho = axis1 - basis0 * dot(basis0, axis1);
    let basis1 = cameraFramesSafeNormalize(axis1Ortho, cameraFramesFallbackOrtho(basis0));
    var basis2 = normalize(cross(basis0, basis1));
    if (dot(basis2, axis2) < 0.0) {
        basis2 = -basis2;
    }

    *scale = vec3f(length(axis0), length(axis1Ortho), abs(dot(axis2, basis2)));
    if ((*scale).x <= 1e-6 || (*scale).y <= 1e-6 || (*scale).z <= 1e-6) {
        *scale = vec3f(0.0);
        return;
    }

    *rotation = cameraFramesMat3ToQuat(mat3x3f(basis0, basis1, basis2));
}

fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
    let state = cameraFramesReadState();
    let offset = -uniform.cameraFramesBlackPoint + uniform.cameraFramesBrightness;
    let scaleBase = 1.0 / max(1e-6, uniform.cameraFramesWhitePoint - uniform.cameraFramesBlackPoint);
    let tintScale = vec3f(
        scaleBase * uniform.cameraFramesTint.r * (1.0 + uniform.cameraFramesTemperature),
        scaleBase * uniform.cameraFramesTint.g,
        scaleBase * uniform.cameraFramesTint.b * (1.0 - uniform.cameraFramesTemperature)
    );

    (*color).rgb = cameraFramesApplySaturation((*color).rgb * tintScale + vec3f(offset), uniform.cameraFramesSaturation);
    (*color).a = clamp((*color).a * uniform.cameraFramesTransparency, 0.0, 1.0);

    if ((state & 12u) != 0u) {
        (*color).a = 0.0;
        return;
    }

    if ((state & 2u) != 0u) {
        *color = (*color) * uniform.cameraFramesLockedColor;
    } else if ((state & 1u) != 0u) {
        let selectedAlpha = uniform.cameraFramesSelectedColor.a * uniform.cameraFramesSelectionAlpha;
        (*color).rgb = mix((*color).rgb, uniform.cameraFramesSelectedColor.rgb * 0.8, vec3f(selectedAlpha));
    }
}
`
} as const;

const boundingPoints =
    [-1, 1].map((x) => {
        return [-1, 1].map((y) => {
            return [-1, 1].map((z) => {
                return [
                    new Vec3(x, y, z), new Vec3(x * 0.75, y, z),
                    new Vec3(x, y, z), new Vec3(x, y * 0.75, z),
                    new Vec3(x, y, z), new Vec3(x, y, z * 0.75)
                ];
            });
        });
    }).flat(3);

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    numSplats = 0;
    numDeleted = 0;
    numHidden = 0;
    numVisible = 0;
    numLocked = 0;
    numSelected = 0;
    entity: Entity;
    changedCounter = 0;
    selectionBoundStorage: BoundingBox;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;

    _visible = true;
    transformPalette: TransformPalette;

    _selectionAlpha = 1;

    _name = '';
    _tintClr = new Color(1, 1, 1);
    _temperature = 0;
    _saturation = 1;
    _brightness = 0;
    _blackPoint = 0;
    _whitePoint = 1;
    _transparency = 1;
    _engineGsplatVisualSignature = '';
    _engineGsplatVisualSyncComponent: GSplatComponent | null = null;
    _engineGsplatVisualStateTexture: Texture | null = null;
    _engineGsplatVisualTransformTexture: Texture | null = null;
    _engineGsplatVisualTransformPaletteTexture: Texture | null = null;

    _localCenters: Float32Array | null = null;

    get localCenters() {
        if (!this._localCenters) {
            const x = this.splatData.getProp('x') as Float32Array;
            const y = this.splatData.getProp('y') as Float32Array;
            const z = this.splatData.getProp('z') as Float32Array;
            const num = this.splatData.numSplats;
            this._localCenters = new Float32Array(num * 3);
            for (let i = 0; i < num; ++i) {
                this._localCenters[i * 3 + 0] = x[i];
                this._localCenters[i * 3 + 1] = y[i];
                this._localCenters[i * 3 + 2] = z[i];
            }
        }
        return this._localCenters;
    }

    measurePoints: Vec3[] = [];
    measureSelection = -1;

    constructor(asset: Asset, orientation: Vec3) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatData | GSplatResource;
        const splatData = (splatResource as any).gsplatData ? (splatResource as any).gsplatData as GSplatData : splatResource as GSplatData;
        const device = (asset.resource as any).device;

        this._name = (asset.file as any).filename;
        this.asset = asset;
        this.splatData = splatData as GSplatData;
        this.numSplats = splatData.numSplats;

        this.entity = new Entity('splatEntitiy');
        this.entity.setEulerAngles(orientation);

        // added per-splat state channel
        // bit 1: selected
        // bit 2: locked
        // bit 3: deleted
        // bit 4: hidden
        if (!this.splatData.getProp('state')) {
            this.splatData.getElement('vertex').properties.push({
                type: 'uchar',
                name: 'state',
                storage: new Uint8Array(this.splatData.numSplats),
                byteSize: 1
            });
        }

        // per-splat transform matrix
        this.splatData.getElement('vertex').properties.push({
            type: 'ushort',
            name: 'transform',
            storage: new Uint16Array(this.splatData.numSplats),
            byteSize: 2
        });

        // create the transform palette
        this.transformPalette = new TransformPalette(device);

        this.selectionBoundStorage = new BoundingBox();
        this.localBoundStorage = new BoundingBox();
        this.worldBoundStorage = new BoundingBox();
    }

    destroy() {
        super.destroy();
        this.transformPalette?.destroy();
        this.transformPalette = null as any;
        this.entity?.destroy();
        this.entity = null as any;
        if (this.asset) {
            this.asset.registry?.remove(this.asset);
            this.asset.unload();
            this.asset = null as any;
        }
        this.splatData = null as any;
        this._localCenters = null;
    }

    async updateState(changedState = State.selected) {
        const state = this.splatData.getProp('state') as Uint8Array;

        const result = this.scene.splatRenderDisplay.updateState(this);
        if (result) {
            this.numSplats = result.numSplats;
            this.numLocked = result.numLocked;
            this.numSelected = result.numSelected;
            this.numDeleted = result.numDeleted;
            this.numHidden = result.numHidden;
            this.numVisible = result.numVisible;
        }

        // handle splats being added or removed
        if (changedState & State.deleted) {
            await this.updateSorting();
        } else {
            await this.updateLocalBounds();
        }
        this.scene.forceRender = true;
        this.scene.events.fire('splat.stateChanged', this);
    }

    async updatePositions() {
        const data = await this.scene.splatRenderData.calcPositions(this);
        if (data.length === 0) {
            return;
        }

        // update the splat centers which are used for render-time sorting
        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.splatData.numSplats; ++i) {
            if ((state[i] & (State.deleted | State.hidden)) === 0) {
                this.scene.splatRenderData.writeWorldCenter(
                    this,
                    i,
                    data[i * 4 + 0],
                    data[i * 4 + 1],
                    data[i * 4 + 2]
                );
            }
        }

        await this.updateSorting();
        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    updatePositionsPartial(selectedCount: number) {
        const data = this.splatData;
        if (selectedCount > Math.min(20000, data.numSplats * 0.05)) {
            this.updatePositions().catch(() => {});
            return;
        }

        const state = data.getProp('state') as Uint8Array;
        const indices = data.getProp('transform') as Uint16Array;
        const localCenters = this.localCenters;
        const localPalette = this.transformPalette;
        const world = this.entity.getWorldTransform();
        const localMat = new Mat4();
        const worldMat = new Mat4();
        const transforms = new Map<number, Float32Array>();
        const skipMask = State.locked | State.deleted | State.hidden;

        for (let i = 0; i < data.numSplats; ++i) {
            const s = state[i];
            if ((s & State.selected) === 0 || (s & skipMask) !== 0) {
                continue;
            }
            const index = indices[i];
            let transform = transforms.get(index);
            if (!transform) {
                localPalette.getTransform(index, localMat);
                worldMat.mul2(world, localMat);
                const m = worldMat.data;
                transform = new Float32Array([
                    m[0], m[1], m[2],
                    m[4], m[5], m[6],
                    m[8], m[9], m[10],
                    m[12], m[13], m[14]
                ]);
                transforms.set(index, transform);
            }

            const x = localCenters[i * 3 + 0];
            const y = localCenters[i * 3 + 1];
            const z = localCenters[i * 3 + 2];
            this.scene.splatRenderData.writeWorldCenter(
                this,
                i,
                x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
                x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
                x * transform[2] + y * transform[5] + z * transform[8] + transform[11]
            );
        }

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    updatePositionsForIndices(indices: Uint32Array) {
        if (indices.length === 0) {
            return;
        }

        const data = this.splatData;
        if (indices.length > Math.min(20000, data.numSplats * 0.05)) {
            this.updatePositions().catch(() => {});
            return;
        }

        const state = data.getProp('state') as Uint8Array;
        const transformIndices = data.getProp('transform') as Uint16Array;
        const localCenters = this.localCenters;
        const localPalette = this.transformPalette;
        const world = this.entity.getWorldTransform();
        const localMat = new Mat4();
        const worldMat = new Mat4();
        const transforms = new Map<number, Float32Array>();
        const skipMask = State.deleted | State.hidden;

        for (let i = 0; i < indices.length; ++i) {
            const idx = indices[i];
            const s = state[idx];
            if ((s & skipMask) !== 0) {
                continue;
            }
            const transformIndex = transformIndices[idx];
            let transform = transforms.get(transformIndex);
            if (!transform) {
                localPalette.getTransform(transformIndex, localMat);
                worldMat.mul2(world, localMat);
                const m = worldMat.data;
                transform = new Float32Array([
                    m[0], m[1], m[2],
                    m[4], m[5], m[6],
                    m[8], m[9], m[10],
                    m[12], m[13], m[14]
                ]);
                transforms.set(transformIndex, transform);
            }

            const x = localCenters[idx * 3 + 0];
            const y = localCenters[idx * 3 + 1];
            const z = localCenters[idx * 3 + 2];
            this.scene.splatRenderData.writeWorldCenter(
                this,
                idx,
                x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
                x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
                x * transform[2] + y * transform[5] + z * transform[8] + transform[11]
            );
        }

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    async updateSorting() {
        await this.scene.splatRenderLifecycle.waitForSorter();
        await this.updateLocalBounds();
    }

    get worldTransform() {
        return this.entity.getWorldTransform();
    }

    set name(newName: string) {
        if (newName !== this.name) {
            this._name = newName;
            this.scene.events.fire('splat.name', this);
        }
    }

    get name() {
        return this._name;
    }

    get filename() {
        return (this.asset.file as any).filename;
    }

    private hasWholeSplatColorAdjustments() {
        return !this.tintClr.equals(Color.WHITE) ||
            this.temperature !== 0 ||
            this.saturation !== 1 ||
            this.brightness !== 0 ||
            this.blackPoint !== 0 ||
            this.whitePoint !== 1 ||
            this.transparency !== 1;
    }

    private hasPerSplatStateVisuals() {
        const wholeSplatHidden = !this.visible && this.numHidden === this.numSplats;
        return this.numSelected > 0 ||
            this.numLocked > 0 ||
            this.numDeleted > 0 ||
            (this.numHidden > 0 && !wholeSplatHidden);
    }

    private hasLocalTransformPalette() {
        const indices = this.splatData.getProp('transform') as Uint16Array | undefined;
        if (!indices) {
            return false;
        }

        for (let i = 0; i < indices.length; i++) {
            if (indices[i] !== 0) {
                return true;
            }
        }

        return false;
    }

    private resolveUnifiedEngineVisualBinding() {
        if (this.scene?.splatRenderCapabilities.resolvedMode !== 'unified-display') {
            return null;
        }

        const overlayBinding = this.scene.splatRenderOverlay.getOverlayBinding(this);
        const stateTexture = overlayBinding?.stateTexture;
        const transformTexture = overlayBinding?.transformTexture;
        const transformPaletteTexture = overlayBinding?.transformPaletteTexture;
        const width = overlayBinding?.globalParams[0] ?? 0;
        if (!stateTexture || !transformTexture || !transformPaletteTexture || width <= 0) {
            return null;
        }

        return {
            stateTexture,
            transformTexture,
            transformPaletteTexture,
            width,
            offset: overlayBinding.offset,
            selectedClr: this.scene.events.invoke('selectedClr') as Color,
            lockedClr: this.scene.events.invoke('lockedClr') as Color
        };
    }

    private getEngineGsplatVisualSignature(
        mode: 'inactive' | 'color' | 'visual',
        visualBinding: ReturnType<Splat['resolveUnifiedEngineVisualBinding']>,
        hasLocalTransformPalette: boolean
    ) {
        return [
            mode,
            roundEngineGsplatVisualValue(this.tintClr.r),
            roundEngineGsplatVisualValue(this.tintClr.g),
            roundEngineGsplatVisualValue(this.tintClr.b),
            roundEngineGsplatVisualValue(this.temperature),
            roundEngineGsplatVisualValue(this.saturation),
            roundEngineGsplatVisualValue(this.brightness),
            roundEngineGsplatVisualValue(this.blackPoint),
            roundEngineGsplatVisualValue(this.whitePoint),
            roundEngineGsplatVisualValue(this.transparency),
            roundEngineGsplatVisualValue(this.selectionAlpha),
            hasLocalTransformPalette ? '1' : '0',
            `${visualBinding?.width ?? 0}`,
            `${visualBinding?.offset ?? 0}`,
            roundEngineGsplatVisualValue(visualBinding?.selectedClr?.r),
            roundEngineGsplatVisualValue(visualBinding?.selectedClr?.g),
            roundEngineGsplatVisualValue(visualBinding?.selectedClr?.b),
            roundEngineGsplatVisualValue(visualBinding?.selectedClr?.a),
            roundEngineGsplatVisualValue(visualBinding?.lockedClr?.r),
            roundEngineGsplatVisualValue(visualBinding?.lockedClr?.g),
            roundEngineGsplatVisualValue(visualBinding?.lockedClr?.b),
            roundEngineGsplatVisualValue(visualBinding?.lockedClr?.a)
        ].join('|');
    }

    private applyEngineGsplatColorAdjustments(component: GSplatComponent) {
        component.setParameter(engineGsplatColorAdjustTintParam, [this.tintClr.r, this.tintClr.g, this.tintClr.b]);
        component.setParameter(engineGsplatColorAdjustTemperatureParam, this.temperature);
        component.setParameter(engineGsplatColorAdjustSaturationParam, this.saturation);
        component.setParameter(engineGsplatColorAdjustBrightnessParam, this.brightness);
        component.setParameter(engineGsplatColorAdjustBlackPointParam, this.blackPoint);
        component.setParameter(engineGsplatColorAdjustWhitePointParam, this.whitePoint);
        component.setParameter(engineGsplatColorAdjustTransparencyParam, this.transparency);
    }

    private clearEngineGsplatVisualAdjustments(component: GSplatComponent) {
        component.setWorkBufferModifier(null);
        component.deleteParameter(engineGsplatColorAdjustTintParam);
        component.deleteParameter(engineGsplatColorAdjustTemperatureParam);
        component.deleteParameter(engineGsplatColorAdjustSaturationParam);
        component.deleteParameter(engineGsplatColorAdjustBrightnessParam);
        component.deleteParameter(engineGsplatColorAdjustBlackPointParam);
        component.deleteParameter(engineGsplatColorAdjustWhitePointParam);
        component.deleteParameter(engineGsplatColorAdjustTransparencyParam);
        component.deleteParameter(engineGsplatStateTextureParam);
        component.deleteParameter(engineGsplatStateInfoParam);
        component.deleteParameter(engineGsplatTransformTextureParam);
        component.deleteParameter(engineGsplatTransformPaletteTextureParam);
        component.deleteParameter(engineGsplatUseTransformPaletteParam);
        component.deleteParameter(engineGsplatSelectionAlphaParam);
        component.deleteParameter(engineGsplatSelectedColorParam);
        component.deleteParameter(engineGsplatLockedColorParam);
    }

    private syncEngineGsplatVisuals(component: GSplatComponent) {
        const usingUnifiedDisplay =
            this.scene?.splatRenderCapabilities.resolvedMode === 'unified-display' &&
            component.unified === true;
        const hasWholeSplatColorAdjustments = this.hasWholeSplatColorAdjustments();
        const hasPerSplatStateVisuals = this.hasPerSplatStateVisuals();
        const hasLocalTransformPalette = this.hasLocalTransformPalette();
        const visualBinding = (hasPerSplatStateVisuals || hasLocalTransformPalette) ? this.resolveUnifiedEngineVisualBinding() : null;
        const mode: 'inactive' | 'color' | 'visual' =
            usingUnifiedDisplay ?
                (visualBinding ? 'visual' : (hasWholeSplatColorAdjustments ? 'color' : 'inactive')) :
                'inactive';
        const signature = this.getEngineGsplatVisualSignature(mode, visualBinding, hasLocalTransformPalette);
        const stateTexture = visualBinding?.stateTexture ?? null;
        const transformTexture = visualBinding?.transformTexture ?? null;
        const transformPaletteTexture = visualBinding?.transformPaletteTexture ?? null;

        if (this._engineGsplatVisualSyncComponent === component &&
            this._engineGsplatVisualSignature === signature &&
            this._engineGsplatVisualStateTexture === stateTexture &&
            this._engineGsplatVisualTransformTexture === transformTexture &&
            this._engineGsplatVisualTransformPaletteTexture === transformPaletteTexture) {
            return;
        }

        if (mode === 'visual' && visualBinding) {
            component.setWorkBufferModifier(unifiedEngineGsplatVisualModifier);
            this.applyEngineGsplatColorAdjustments(component);
            component.setParameter(engineGsplatStateTextureParam, visualBinding.stateTexture);
            component.setParameter(engineGsplatStateInfoParam, [visualBinding.width, visualBinding.offset]);
            component.setParameter(engineGsplatTransformTextureParam, visualBinding.transformTexture);
            component.setParameter(engineGsplatTransformPaletteTextureParam, visualBinding.transformPaletteTexture);
            component.setParameter(engineGsplatUseTransformPaletteParam, hasLocalTransformPalette ? 1 : 0);
            component.setParameter(engineGsplatSelectionAlphaParam, this.selectionAlpha);
            component.setParameter(engineGsplatSelectedColorParam, [
                visualBinding.selectedClr.r,
                visualBinding.selectedClr.g,
                visualBinding.selectedClr.b,
                visualBinding.selectedClr.a
            ]);
            component.setParameter(engineGsplatLockedColorParam, [
                visualBinding.lockedClr.r,
                visualBinding.lockedClr.g,
                visualBinding.lockedClr.b,
                visualBinding.lockedClr.a
            ]);
        } else if (mode === 'color') {
            component.setWorkBufferModifier(unifiedEngineGsplatColorAdjustModifier);
            this.applyEngineGsplatColorAdjustments(component);
            component.deleteParameter(engineGsplatStateTextureParam);
            component.deleteParameter(engineGsplatStateInfoParam);
            component.deleteParameter(engineGsplatTransformTextureParam);
            component.deleteParameter(engineGsplatTransformPaletteTextureParam);
            component.deleteParameter(engineGsplatUseTransformPaletteParam);
            component.deleteParameter(engineGsplatSelectionAlphaParam);
            component.deleteParameter(engineGsplatSelectedColorParam);
            component.deleteParameter(engineGsplatLockedColorParam);
        } else {
            this.clearEngineGsplatVisualAdjustments(component);
        }

        this._engineGsplatVisualSyncComponent = component;
        this._engineGsplatVisualSignature = signature;
        this._engineGsplatVisualStateTexture = stateTexture;
        this._engineGsplatVisualTransformTexture = transformTexture;
        this._engineGsplatVisualTransformPaletteTexture = transformPaletteTexture;
    }

    getDirectEngineCompatibilityIssue() {
        const visualBinding = this.resolveUnifiedEngineVisualBinding();

        if (this.hasPerSplatStateVisuals() && !visualBinding) {
            return 'per-splat state';
        }

        if (this.hasLocalTransformPalette() && !visualBinding) {
            return 'local transform palette';
        }

        return null;
    }

    isDirectEngineCompatible() {
        return this.getDirectEngineCompatibilityIssue() === null;
    }

    private resolveEngineGsplatLayers() {
        if (this.scene?.worldLayer) {
            return [this.scene.worldLayer.id];
        }

        const worldLayer = this.scene?.app.scene.layers.getLayerByName('World');
        if (worldLayer) {
            return [worldLayer.id];
        }

        if (this.scene?.splatLayer) {
            return [this.scene.splatLayer.id];
        }

        return [];
    }

    private resolveEngineGsplatCustomAabb() {
        if (this.scene?.splatRenderCapabilities.resolvedMode === 'unified-display') {
            return null;
        }
        return this.localBoundStorage;
    }

    ensureEngineGsplatComponent(state: EngineGsplatComponentState = {}): GSplatComponent | null {
        if (!this.scene) {
            return null;
        }

        const layers = this.resolveEngineGsplatLayers();
        let component = this.entity.gsplat;
        if (!component) {
            this.entity.addComponent('gsplat', {
                asset: this.asset,
                enabled: state.enabled ?? false,
                layers
            });
            component = this.entity.gsplat;
        }

        if (!component) {
            return null;
        }

        component.asset = this.asset;
        component.layers = layers;
        component.castShadows = false;
        component.customAabb = this.resolveEngineGsplatCustomAabb();

        if (state.unified !== undefined) {
            component.unified = state.unified;
        }
        if (state.enabled !== undefined) {
            component.enabled = state.enabled;
        }
        this.syncEngineGsplatVisuals(component);

        return component;
    }

    syncEngineGsplatComponent(state: EngineGsplatComponentState = {}) {
        const component = this.entity.gsplat;
        if (!component || !this.scene) {
            return null;
        }

        component.asset = this.asset;
        component.layers = this.resolveEngineGsplatLayers();
        component.castShadows = false;
        component.customAabb = this.resolveEngineGsplatCustomAabb();

        if (state.unified !== undefined) {
            component.unified = state.unified;
        }
        if (state.enabled !== undefined) {
            component.enabled = state.enabled;
        }
        this.syncEngineGsplatVisuals(component);

        return component;
    }

    disableEngineGsplatComponent() {
        this.syncEngineGsplatComponent({ enabled: false });
    }

    calcSplatWorldPosition(splatId: number, result: Vec3) {
        if (splatId >= this.splatData.numSplats) {
            return false;
        }

        return this.scene.splatRenderData.readWorldCenter(this, splatId, result);
    }

    async add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        this.scene.splatRenderDisplay.add(this);
        this.scene.splatRenderDisplay.updateSplatParams(this);
        await this.updateState();

        // 標準GSplatコンポーネントは統合レンダラーが吸収するため常時無効化。
        // ここを再有効化すると標準レンダー経路が復活してゴーストが再発する。
        if (this.scene.splatRenderCapabilities.resolvedMode === 'unified-display') {
            this.ensureEngineGsplatComponent({ unified: true, enabled: false });
        } else {
            this.disableEngineGsplatComponent();
        }
    }

    swapRuntimeDataWith(other: Splat) {
        [
            this.asset, other.asset,
            this.splatData, other.splatData,
            this.numSplats, other.numSplats,
            this.numDeleted, other.numDeleted,
            this.numHidden, other.numHidden,
            this.numVisible, other.numVisible,
            this.numLocked, other.numLocked,
            this.numSelected, other.numSelected,
            this.transformPalette, other.transformPalette,
            this._localCenters, other._localCenters
        ] = [
            other.asset, this.asset,
            other.splatData, this.splatData,
            other.numSplats, this.numSplats,
            other.numDeleted, this.numDeleted,
            other.numHidden, this.numHidden,
            other.numVisible, this.numVisible,
            other.numLocked, this.numLocked,
            other.numSelected, this.numSelected,
            other.transformPalette, this.transformPalette,
            other._localCenters, this._localCenters
        ];

        this.syncEngineGsplatComponent();
        other.syncEngineGsplatComponent();
    }

    remove() {
        this.scene.splatRenderDisplay.remove(this);
        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
        serializer.pack(this.visible);
        serializer.pack(this.tintClr.r, this.tintClr.g, this.tintClr.b);
        serializer.pack(this.temperature, this.saturation, this.brightness, this.blackPoint, this.whitePoint, this.transparency);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = this.scene.camera.renderOverlays && events.invoke('selection') === this;

        if (this.visible && selected && events.invoke('camera.bound') && !this.scene.renderFlags.hideBounds) {
            const bound = this.localBound;
            const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);

            for (let i = 0; i < boundingPoints.length / 2; i++) {
                const a = boundingPoints[i * 2];
                const b = boundingPoints[i * 2 + 1];
                scale.transformPoint(a, veca);
                scale.transformPoint(b, vecb);

                this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.debugLayer);
            }
        }

        this.entity.enabled = this.visible;
    }

    focalPoint() {
        // GSplatData has a function for calculating an weighted average of the splat positions
        // to get a focal point for the camera, but we use bound center instead
        return this.worldBound.center;
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3, skipCenterUpdate = false) {
        const entity = this.entity;
        if (position) {
            entity.setLocalPosition(position);
        }
        if (rotation) {
            entity.setLocalRotation(rotation);
        }
        if (scale) {
            entity.setLocalScale(scale);
        }

        this.scene.splatRenderDisplay.updateTransform(this, skipCenterUpdate);
        this.updateWorldBound();
        this.scene.events.fire('splat.moved', this);
    }

    // calculate both selection and local bounds (async, callers must await)
    async updateLocalBounds(): Promise<void> {
        await this.scene.splatRenderData.calcBound(this, this.selectionBoundStorage, this.localBoundStorage);
        this.syncEngineGsplatComponent();
        this.updateWorldBound();
    }

    // update world bound from local bound (synchronous)
    private updateWorldBound() {
        this.worldBoundStorage.setFromTransformedAabb(this.localBoundStorage, this.entity.getWorldTransform());
        this.scene.boundDirty = true;
    }

    // get the selection bound
    get selectionBound() {
        return this.selectionBoundStorage;
    }

    // get local space bound
    get localBound() {
        return this.localBoundStorage;
    }

    // get world space bound
    get worldBound() {
        if (!this.scene.splatRenderDisplay.hasRenderableData(this) || !this.visible) {
            return null;
        }
        return this.worldBoundStorage;
    }

    set visible(value: boolean) {
        const next = !!value;
        if (next === this._visible) {
            return;
        }

        this._visible = next;

        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < state.length; ++i) {
            if (next) {
                state[i] &= ~State.hidden;
            } else {
                state[i] |= State.hidden;
            }
        }

        this.updateState(State.hidden).catch(() => {});
        const renderSystem = this.scene.splatRenderDisplay;
        const needsImmediateRebuild = next && !renderSystem.isSplatActive(this);
        if (!next || needsImmediateRebuild) {
            renderSystem.scheduleRebuildForVisibility(needsImmediateRebuild);
        }
        this.scene.scheduleBoundRecalc();
        this.scene.events.fire('splat.visibility', this);
        this.scene.forceRender = true;
    }

    get visible() {
        return this._visible;
    }

    set tintClr(value: Color) {
        if (!this._tintClr.equals(value)) {
            this._tintClr.set(value.r, value.g, value.b);
            this.scene.events.fire('splat.tintClr', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get tintClr() {
        return this._tintClr;
    }

    set temperature(value: number) {
        if (value !== this._temperature) {
            this._temperature = value;
            this.scene.events.fire('splat.temperature', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get temperature() {
        return this._temperature;
    }

    set saturation(value: number) {
        if (value !== this._saturation) {
            this._saturation = value;
            this.scene.events.fire('splat.saturation', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get saturation() {
        return this._saturation;
    }

    set brightness(value: number) {
        if (value !== this._brightness) {
            this._brightness = value;
            this.scene.events.fire('splat.brightness', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get brightness() {
        return this._brightness;
    }

    set blackPoint(value: number) {
        if (value !== this._blackPoint) {
            this._blackPoint = value;
            this.scene.events.fire('splat.blackPoint', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get blackPoint() {
        return this._blackPoint;
    }

    set whitePoint(value: number) {
        if (value !== this._whitePoint) {
            this._whitePoint = value;
            this.scene.events.fire('splat.whitePoint', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get whitePoint() {
        return this._whitePoint;
    }

    set transparency(value: number) {
        if (value !== this._transparency) {
            this._transparency = value;
            this.scene.events.fire('splat.transparency', this);
            this.scene.splatRenderDisplay.updateSplatParams(this);
        }
    }

    get transparency() {
        return this._transparency;
    }

    set selectionAlpha(value: number) {
        if (value !== this._selectionAlpha) {
            this._selectionAlpha = value;
            if (this.scene?.splatRenderDisplay) {
                this.scene.splatRenderDisplay.updateSplatParams(this);
            }
            if (this.scene) {
                this.scene.forceRender = true;
            }
        }
    }

    get selectionAlpha() {
        return this._selectionAlpha;
    }

    // get pivot position/rotation/scale (caller should have awaited operation that changed data)
    getPivot(mode: 'center' | 'boundCenter', selection: boolean, result: Transform) {
        const { entity } = this;
        switch (mode) {
            case 'center':
                result.set(entity.getLocalPosition(), entity.getLocalRotation(), entity.getLocalScale());
                break;
            case 'boundCenter': {
                const bound = selection ? this.selectionBound : this.localBound;
                entity.getLocalTransform().transformPoint(bound.center, vec);
                result.set(vec, entity.getLocalRotation(), entity.getLocalScale());
                break;
            }
        }
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            name: this.name,
            position: pack3(this.entity.getLocalPosition()),
            rotation: pack4(this.entity.getLocalRotation()),
            scale: pack3(this.entity.getLocalScale()),
            visible: this.visible,
            tintClr: packC(this.tintClr),
            temperature: this.temperature,
            saturation: this.saturation,
            brightness: this.brightness,
            blackPoint: this.blackPoint,
            whitePoint: this.whitePoint,
            transparency: this.transparency
        };
    }

    docDeserialize(doc: any) {
        const { name, position, rotation, scale, visible, tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = doc;

        this.name = name;
        this.move(new Vec3(position), new Quat(rotation), new Vec3(scale));
        this.visible = visible;
        this.tintClr = new Color(tintClr[0], tintClr[1], tintClr[2], tintClr[3]);
        this.temperature = temperature ?? 0;
        this.saturation = saturation ?? 1;
        this.brightness = brightness;
        this.blackPoint = blackPoint;
        this.whitePoint = whitePoint;
        this.transparency = transparency;
    }
}

export { Splat };
