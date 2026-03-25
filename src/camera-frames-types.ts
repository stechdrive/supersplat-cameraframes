import type { Quat, Vec3 } from 'playcanvas';

import type { ReferenceImageOverrides } from './reference-images-types';

export type RenderBoxState = {
    baseSize: { w: number; h: number; };
    scalePct: { x: number; y: number; };
    scale: { kx: number; ky: number; };
    anchor: { ax: 0 | 0.5 | 1; ay: 0 | 0.5 | 1; };
    center: { cx: number; cy: number; };
    fitScale: number;
    viewZoomPct: number;
    lastViewport: { vw: number; vh: number; };
    projection: {
        type: 'perspective' | 'ortho';
        baseFov?: number;
        orthoHalfHeight?: number;
    };
};

export type FrameState = {
    id: string;
    pos: { x: number; y: number; };
    scalePct: number;
    scaleK: number;
    baseSize: { w: number; h: number; };
    order: number;
    selected?: boolean;
    rotationDeg?: number;
    anchor?: { x: number; y: number; };
};

export type FrameMaskState = {
    enabled: boolean;
    opacity: number; // 0.0 - 1.0
    scope: 'all' | 'selected';
};

export type ReferenceExportLayer = {
    group: 'back' | 'front';
    name: string;
    opacity: number;
    canvas: HTMLCanvasElement;
    bounds?: { left: number; top: number; right: number; bottom: number; };
};

export type CameraFramesStateBase = {
    enabled: boolean;
    renderBox: RenderBoxState;
    frames: FrameState[];
    mask: FrameMaskState;
    mainCameraPose?: CameraPoseSnapshot | null;
    nearClip?: number | null;
    exportName?: string;
    exportFormat?: ExportFormat;
    exportGridOverlay?: boolean;
    exportModelLayers?: boolean;
    exportSplatLayers?: boolean;
    exportReferenceImages?: boolean;
};

export type ProjectionJson =
    | { type: 'perspective'; baseFov: number; }
    | { type: 'ortho'; orthoHalfHeight: number; };

export type Vec3Json = { x: number; y: number; z: number; };

export type RotationJson = { yaw: number; pitch: number; roll: number; };

export type CameraPreset = {
    id: string;
    name: string;
    referenceImagePresetId: string;
    referenceImageOverrides?: ReferenceImageOverrides;
    selected?: boolean;
    mainCamera: {
        transform: { position: Vec3Json; rotation: RotationJson; };
        projection: ProjectionJson;
        nearClip: number | null;
    };
    cameraFramesState: CameraFramesStateBase;
};

export type CameraFramesState = CameraFramesStateBase & {
    cameraPresets: CameraPreset[];
    exportTarget?: ExportTarget;
    exportPresetIds?: string[];
    selectedPresetId?: string | null;
};

export type Viewport = { vw: number; vh: number; };

export type FovInfo = {
    crop: number;
    hfovDeg: number;
    hfovFrameDeg: number;
    eqMm: number;
    minEqMm: number;
    maxEqMm: number;
};

export type ExportFormat = 'png' | 'psd';
export type ExportTarget = 'current' | 'all' | 'selected';

export type ViewportMapping = {
    fitScale: number;
    viewScale: number;
    logicalW: number;
    logicalH: number;
    rectPx: { x: number; y: number; w: number; h: number; };
    rectNorm: { x: number; y: number; w: number; h: number; };
    rectPxRaw: { x: number; y: number; w: number; h: number; };
    rectNormRaw: { x: number; y: number; w: number; h: number; };
};

export type CameraFrustum = {
    l0: number;
    r0: number;
    b0: number;
    t0: number;
    near: number;
    far: number;
};

export type CameraPoseSnapshot = {
    focalPoint: { x: number; y: number; z: number; };
    azim: number;
    elev: number;
    distance: number;
    roll: number;
    navMode: 'orbit' | 'fpv';
    fpvPosition?: { x: number; y: number; z: number; };
    ortho?: boolean;
    lockFraming?: boolean;
};

export type CameraBasis = {
    position: Vec3;
    focalPoint: Vec3;
    rotation: Quat;
    forward: Vec3;
    right: Vec3;
    up: Vec3;
};

export type EffectiveFrustum = {
    left: number;
    right: number;
    bottom: number;
    top: number;
    near: number;
    far: number;
};

export type FrustumDebugCache = {
    pose: CameraPoseSnapshot | null;
    frustum: EffectiveFrustum | null;
    points: Vec3[] | null;
    version: number;
};
