import { Quat, Vec3, type Color } from 'playcanvas';

import { DEG2RAD, HFOV_MAX, HFOV_MIN, RAD2DEG, W_35MM } from './camera-frames-constants';
import { clampFov } from './camera-frames-math';
import type {
    CameraBasis,
    CameraFrustum,
    CameraPoseSnapshot,
    EffectiveFrustum,
    FovInfo,
    FrustumDebugCache,
    RenderBoxState,
    Viewport,
    ViewportMapping
} from './camera-frames-types';
import { DEFAULT_NEAR_CLIP, MIN_NEAR_CLIP } from './clip-constants';
import { ElementType } from './element';
import type { Events } from './events';
import type { Scene } from './scene';

type BaseFovToHorizontalRad = (baseFovRad: number, axis: 'horizontal' | 'vertical', aspect: number) => number;
type CropFactor = (renderBox: RenderBoxState) => number;
type EmitViewportLensChanged = () => void;
type GetFovInfo = () => FovInfo | null;
type GetViewportLensMm = () => number | null;
type SetBaseFovRad = (value: number) => void;
type SetFovInfo = (value: FovInfo) => void;
type SetViewportFovRuntime = (value: number) => void;
type ViewportLensRange = () => { min: number; max: number; };
type HorizontalRadToAxisDeg = (horizontalRad: number) => number;
type GetRuntimeFrustum = () => CameraFrustum | null;
type SetRuntimeFrustum = (value: CameraFrustum | null) => void;
type ComputeEffectiveFrustum = () => EffectiveFrustum | null;
type ComputeViewportMapping = () => ViewportMapping;
type IsSamePose = (a: CameraPoseSnapshot | null, b: CameraPoseSnapshot | null) => boolean;
type IsSameFrustum = (a: EffectiveFrustum | null, b: EffectiveFrustum | null) => boolean;
type SetFrustumDebugCache = (value: FrustumDebugCache) => void;
type SetMainCameraPose = (pose: CameraPoseSnapshot | null) => void;

type CalcFovInfoParams = {
    renderBox: RenderBoxState;
    scene: Scene;
    lockFovAxis: 'horizontal' | 'vertical' | undefined;
    baseAspect: number;
    baseFovToHorizontalRad: BaseFovToHorizontalRad;
    cropFactor: CropFactor;
    setBaseFovRad: SetBaseFovRad;
};

type UpdateFovInfoParams = {
    calcFovInfo: () => FovInfo;
    getFovInfo: GetFovInfo;
    setFovInfo: SetFovInfo;
    events: Events;
};

type GetViewportLensStateParams = {
    stateEnabled: boolean;
    viewportLensRange: ViewportLensRange;
    getViewportLensMm: GetViewportLensMm;
};

type SetViewportLensMmParams = {
    mm: number;
    stateEnabled: boolean;
    viewportLensRange: ViewportLensRange;
    renderBox: RenderBoxState;
    cropFactor: CropFactor;
    setViewportFovRuntime: SetViewportFovRuntime;
    events: Events;
    emitViewportLensChanged: EmitViewportLensChanged;
};

type RebuildBaseFrustumParams = {
    renderBox: RenderBoxState;
    scene: Scene;
    events: Events;
    stateEnabled: boolean;
    lockFovAxis: 'horizontal' | 'vertical' | undefined;
    baseAspect: number;
    baseFovToHorizontalRad: BaseFovToHorizontalRad;
    horizontalRadToAxisDeg: HorizontalRadToAxisDeg;
    nearClip: number | null;
    setBaseFovRad: SetBaseFovRad;
    setRuntimeFrustum: SetRuntimeFrustum;
};

type ComputeEffectiveFrustumParams = {
    getRuntimeFrustum: GetRuntimeFrustum;
    rebuildBaseFrustum: () => void;
    renderBox: RenderBoxState;
    scene: Scene;
};

type SyncCameraFrustumParams = {
    stateEnabled: boolean;
    computeEffectiveFrustum: ComputeEffectiveFrustum;
    scene: Scene;
    events: Events;
    viewport: Viewport;
    computeViewportMapping: ComputeViewportMapping;
};

type BuildFrustumPointsParams = {
    frustum: EffectiveFrustum | null;
    basis: CameraBasis | null;
    renderBox: RenderBoxState;
    scene: Scene;
    lockFovAxis: 'horizontal' | 'vertical' | undefined;
    baseFovRad: number;
    baseFovToHorizontalRad: BaseFovToHorizontalRad;
    cropFactor: CropFactor;
};

type GetFrustumDebugPointsParams = {
    mainCameraPose: CameraPoseSnapshot | null;
    scene: Scene;
    renderBox: RenderBoxState;
    lockFovAxis: 'horizontal' | 'vertical' | undefined;
    baseFovRad: number;
    baseFovToHorizontalRad: BaseFovToHorizontalRad;
    cropFactor: CropFactor;
    frustumDebugCache: FrustumDebugCache;
    frustumDebugCacheVersion: number;
    computeEffectiveFrustum: ComputeEffectiveFrustum;
    isSamePose: IsSamePose;
    isSameFrustum: IsSameFrustum;
    setFrustumDebugCache: SetFrustumDebugCache;
};

type DrawMainCameraFrustumParams = {
    stateEnabled: boolean;
    mainCameraPose: CameraPoseSnapshot | null;
    setMainCameraPose: SetMainCameraPose;
    scene: Scene;
    ensureUiTargetAvailability: () => void;
    captureCameraPose: () => CameraPoseSnapshot | null;
    forceMainCameraPoseOrthoOff: (pose: CameraPoseSnapshot | null) => CameraPoseSnapshot | null;
    getFrustumDebugPoints: () => Vec3[] | null;
    mainCameraSelected: boolean;
    frustumDebugColor: Color;
    frustumSelectedColor: Color;
};

type ApplyNearClipOverrideParams = {
    stateEnabled: boolean;
    nearClip: number | null;
    events: Events;
};

type SetNearClipParams = {
    value: number | null;
    suppressHistory: boolean;
    getStateEnabled: () => boolean;
    getUiTarget: () => 'viewport' | 'main';
    getMainEditMode: () => boolean;
    getNearClip: () => number | null;
    setNearClipState: (value: number | null) => void;
    applyNearClipOverride: () => void;
    rebuildBaseFrustum: () => void;
    syncCameraFrustum: () => void;
    requestRender: () => void;
    fireStateChanged: () => void;
    historyDebounced: (label: string, fn: () => void) => void;
    invalidateFrustumDebugCache: () => void;
};

type UpdateViewportNearTargetSizeStateParams = {
    scene: Scene;
    viewportNearTargetSizeActive: boolean;
    setViewportNearTargetSizeActive: (value: boolean) => void;
    clearViewportNearOverride: () => void;
    scheduleViewportNearOverride: (delayMs: number) => void;
};

type ShouldApplyViewportNearOverrideParams = {
    stateEnabled: boolean;
    uiTarget: 'viewport' | 'main';
    scene: Scene;
};

type ClearViewportNearOverrideParams = {
    viewportNearDebounceId: number | null;
    setViewportNearDebounceId: (value: number | null) => void;
    viewportNearOverrideActive: boolean;
    setViewportNearOverrideActive: (value: boolean) => void;
    viewportNearOverride: number | null;
    setViewportNearOverride: (value: number | null) => void;
    events: Events;
};

type ScheduleViewportNearOverrideParams = {
    delayMs: number;
    shouldApplyViewportNearOverride: () => boolean;
    viewportNearDebounceId: number | null;
    setViewportNearDebounceId: (value: number | null) => void;
    applyViewportNearOverride: () => void;
};

type ApplyViewportNearOverrideParams = {
    shouldApplyViewportNearOverride: () => boolean;
    viewportNearLastSampleTs: number;
    setViewportNearLastSampleTs: (value: number) => void;
    computeViewportNearCandidate: () => number | null;
    viewportNearOverride: number | null;
    setViewportNearOverride: (value: number | null) => void;
    viewportNearOverrideActive: boolean;
    setViewportNearOverrideActive: (value: boolean) => void;
    clearViewportNearOverride: () => void;
    events: Events;
};

type ComputeViewportNearCandidateParams = {
    scene: Scene;
};

type EnforceSafeNearClipParams = {
    stateEnabled: boolean;
    nearClipGuardSeed: number | null;
    nearClip: number | null;
    events: Events;
    setNearClip: (value: number | null, suppressHistory: boolean) => void;
};

type ScheduleNearClipGuardParams = {
    frames: number;
    nearClip: number | null;
    pendingNearClipGuard: number;
    setPendingNearClipGuard: (value: number) => void;
    setNearClipGuardSeed: (value: number | null) => void;
};

type RunPendingNearClipGuardParams = {
    stateEnabled: boolean;
    pendingNearClipGuard: number;
    setPendingNearClipGuard: (value: number) => void;
    enforceSafeNearClip: () => void;
};

export const clonePoseSnapshot = (pose: CameraPoseSnapshot | null | undefined): CameraPoseSnapshot | null => {
    if (!pose) {
        return null;
    }
    const vec = (v: any, fallback: { x: number; y: number; z: number }) => ({
        x: Number(v?.x ?? v?.[0] ?? fallback.x) || fallback.x,
        y: Number(v?.y ?? v?.[1] ?? fallback.y) || fallback.y,
        z: Number(v?.z ?? v?.[2] ?? fallback.z) || fallback.z
    });
    const focalPoint = vec(pose.focalPoint, { x: 0, y: 0, z: 0 });
    const fpv = pose.fpvPosition ? vec(pose.fpvPosition, focalPoint) : undefined;
    return {
        focalPoint,
        azim: Number(pose.azim ?? 0) || 0,
        elev: Number(pose.elev ?? 0) || 0,
        distance: Number(pose.distance ?? 1) || 1,
        roll: Number(pose.roll ?? 0) || 0,
        navMode: pose.navMode === 'fpv' ? 'fpv' : 'orbit',
        fpvPosition: fpv,
        ortho: pose.ortho ?? false,
        lockFraming: !!pose.lockFraming
    };
};

export const captureCameraPose = (scene: Scene): CameraPoseSnapshot | null => {
    const serialized = scene?.camera?.docSerialize?.();
    if (!serialized) {
        return null;
    }
    const vec = (v: any, fallback: { x: number; y: number; z: number }) => ({
        x: Number(v?.x ?? v?.[0] ?? fallback.x) || fallback.x,
        y: Number(v?.y ?? v?.[1] ?? fallback.y) || fallback.y,
        z: Number(v?.z ?? v?.[2] ?? fallback.z) || fallback.z
    });
    const focalPoint = vec(serialized.focalPoint, { x: 0, y: 0, z: 0 });
    const pose: CameraPoseSnapshot = {
        focalPoint,
        azim: Number(serialized.azim ?? 0) || 0,
        elev: Number(serialized.elev ?? 0) || 0,
        distance: Number(serialized.distance ?? 1) || 1,
        roll: Number(serialized.roll ?? 0) || 0,
        navMode: serialized.navMode === 'fpv' ? 'fpv' : 'orbit',
        ortho: !!serialized.ortho,
        lockFraming: !!scene.camera.lockFraming
    };
    if (serialized.fpvPosition) {
        pose.fpvPosition = vec(serialized.fpvPosition, focalPoint);
    }
    return clonePoseSnapshot(pose);
};

export const normalizeViewportPose = (pose: CameraPoseSnapshot, allowOrtho: boolean) => {
    pose.navMode = pose.navMode === 'fpv' ? 'fpv' : 'orbit';
    pose.ortho = !!pose.ortho;
    if (pose.navMode === 'fpv') {
        pose.ortho = false;
    }
    if (pose.ortho) {
        pose.navMode = 'orbit';
    }
    if (!allowOrtho) {
        pose.ortho = false;
    }
};

export const calcForwardVec = (result: Vec3, azim: number, elev: number) => {
    const ex = elev * DEG2RAD;
    const ey = azim * DEG2RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    result.set(-c1 * s2, s1, c1 * c2);
};

export const buildCameraBasis = (scene: Scene, pose: CameraPoseSnapshot | null): CameraBasis | null => {
    const snap = clonePoseSnapshot(pose);
    if (!snap) {
        return null;
    }
    const forward = new Vec3();
    calcForwardVec(forward, snap.azim, snap.elev);
    if (forward.lengthSq() > 0) {
        forward.normalize();
    }
    const yawPitch = new Quat();
    yawPitch.setFromEulerAngles(snap.elev, snap.azim, 0);
    const rollAxis = new Vec3(0, 0, -1);
    yawPitch.transformVector(rollAxis, rollAxis);
    const rollQuat = new Quat();
    rollQuat.setFromAxisAngle(rollAxis, snap.roll ?? 0);
    const rotation = new Quat();
    rotation.mul2(rollQuat, yawPitch);

    const right = new Vec3(1, 0, 0);
    rotation.transformVector(right, right);
    const up = new Vec3(0, 1, 0);
    rotation.transformVector(up, up);
    const forwardWorld = new Vec3(0, 0, -1);
    rotation.transformVector(forwardWorld, forwardWorld);

    const focalPoint = new Vec3(snap.focalPoint.x, snap.focalPoint.y, snap.focalPoint.z);
    const framingFactor = snap.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const worldDist = (snap.distance || 1) * (scene.camera.sceneRadius || 1) / (framingFactor || 1e-6);
    const position = new Vec3();
    if (snap.navMode === 'fpv') {
        const fpv = snap.fpvPosition ? new Vec3(snap.fpvPosition.x, snap.fpvPosition.y, snap.fpvPosition.z) : focalPoint.clone();
        position.copy(fpv);
    } else {
        position.copy(forward.mulScalar(worldDist).add(focalPoint));
    }

    return {
        position,
        focalPoint,
        rotation,
        forward: forwardWorld,
        right,
        up
    };
};

export const getPoseWorldDistance = (scene: Scene, pose: CameraPoseSnapshot | null) => {
    const snap = clonePoseSnapshot(pose);
    if (!snap) {
        return 0;
    }
    const framingFactor = snap.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const sceneRadius = scene.camera.sceneRadius || 1;
    return Math.max(1e-6, (snap.distance || 1) * sceneRadius / (framingFactor || 1e-6));
};

export const worldDistanceToNormalized = (scene: Scene, distance: number, pose: CameraPoseSnapshot | null) => {
    const snap = clonePoseSnapshot(pose);
    const framingFactor = snap?.lockFraming ? 1 : (scene.camera.fovFactor || 1);
    const sceneRadius = scene.camera.sceneRadius || 1;
    return Math.max(1e-6, distance * (framingFactor || 1e-6) / (sceneRadius || 1e-6));
};

export const poseToTransform = (scene: Scene, pose: CameraPoseSnapshot | null) => {
    const basis = buildCameraBasis(scene, pose);
    const snap = clonePoseSnapshot(pose);
    if (!basis || !snap) {
        return null;
    }
    return {
        position: { x: basis.position.x, y: basis.position.y, z: basis.position.z },
        rotation: { yaw: snap.azim ?? 0, pitch: snap.elev ?? 0, roll: snap.roll ?? 0 }
    };
};

export const eqMmForFov = (hfovDeg: number, crop: number) => {
    const hfovRad = hfovDeg * DEG2RAD;
    const focalVirtual = W_35MM / (2 * Math.tan(hfovRad * 0.5));
    return focalVirtual * crop;
};

export const eqMmToHfov = (eqMm: number, crop: number) => {
    const safeEq = Math.max(eqMm, 1e-6);
    const hfovRad = 2 * Math.atan((W_35MM * crop) / (2 * safeEq));
    return hfovRad * RAD2DEG;
};

export const calcFovInfo = ({
    renderBox,
    scene,
    lockFovAxis,
    baseAspect,
    baseFovToHorizontalRad,
    cropFactor,
    setBaseFovRad
}: CalcFovInfoParams): FovInfo => {
    const crop = cropFactor(renderBox);
    const axis = lockFovAxis ?? 'horizontal';
    const baseFovDeg = renderBox.projection?.baseFov ?? scene.camera.fov;
    const baseFovRadAxis = (baseFovDeg ?? HFOV_MIN) * DEG2RAD;
    const hfovRad = baseFovToHorizontalRad(baseFovRadAxis, axis, baseAspect);
    const hfovClamped = clampFov(hfovRad * RAD2DEG);
    const hfovClampedRad = hfovClamped * DEG2RAD;
    setBaseFovRad(hfovClampedRad);

    const focalVirtual = W_35MM / (2 * Math.tan(hfovClampedRad * 0.5));
    const eqMm = focalVirtual * crop;

    const hfovFrame = 2 * Math.atan(Math.tan(hfovClampedRad * 0.5) / crop) * RAD2DEG;

    const minEqMm = eqMmForFov(HFOV_MAX, crop);
    const maxEqMm = eqMmForFov(HFOV_MIN, crop);

    return {
        crop,
        hfovDeg: hfovClamped,
        hfovFrameDeg: hfovFrame,
        eqMm,
        minEqMm,
        maxEqMm
    };
};

export const updateFovInfo = ({ calcFovInfo, getFovInfo, setFovInfo, events }: UpdateFovInfoParams) => {
    const next = calcFovInfo();
    const prev = getFovInfo();
    setFovInfo(next);
    const changed =
        !prev ||
        Math.abs(prev.eqMm - next.eqMm) > 1e-4 ||
        Math.abs(prev.hfovDeg - next.hfovDeg) > 1e-4 ||
        Math.abs(prev.crop - next.crop) > 1e-4;
    if (changed) {
        events.fire('cameraFrames.fovInfoChanged', next);
    }
};

export const setViewportLensMm = ({
    mm,
    stateEnabled,
    viewportLensRange,
    renderBox,
    cropFactor,
    setViewportFovRuntime,
    events,
    emitViewportLensChanged
}: SetViewportLensMmParams) => {
    if (stateEnabled) {
        return;
    }
    const range = viewportLensRange();
    const clamped = Math.min(range.max, Math.max(range.min, mm));
    const crop = cropFactor(renderBox);
    const hfovDeg = eqMmToHfov(clamped, crop);
    setViewportFovRuntime(hfovDeg);
    events.fire('camera.setFov', hfovDeg);
    emitViewportLensChanged();
};

export const getViewportLensState = ({
    stateEnabled,
    viewportLensRange,
    getViewportLensMm
}: GetViewportLensStateParams) => {
    const range = viewportLensRange();
    const mm = getViewportLensMm();
    return {
        enabled: !stateEnabled,
        mm: mm ?? range.max,
        min: range.min,
        max: range.max
    };
};

export const rebuildBaseFrustum = ({
    renderBox,
    scene,
    events,
    stateEnabled,
    lockFovAxis,
    baseAspect,
    baseFovToHorizontalRad,
    horizontalRadToAxisDeg,
    nearClip,
    setBaseFovRad,
    setRuntimeFrustum
}: RebuildBaseFrustumParams) => {
    const rb = renderBox;
    const projection = rb.projection ?? { type: 'perspective' as const };
    const axis = lockFovAxis ?? 'horizontal';

    // CAMERA FRAMES v6 keeps horizontal FOV as the base so scale/zoom do not affect the base frustum.
    // The base frustum aspect follows the RenderBox base size to avoid pixel mapping distortion.
    const rbW = rb.baseSize.w;
    const rbH = rb.baseSize.h;
    const aspect = (rbW > 0 && rbH > 0) ? rbW / rbH : baseAspect;

    const baseFovDeg = projection.baseFov ?? scene.camera.fov ?? HFOV_MIN;
    const baseFovRadAxis = baseFovDeg * DEG2RAD;
    const horizontalRad = baseFovToHorizontalRad(baseFovRadAxis, axis, aspect);
    const clampedHorizontalDeg = clampFov(horizontalRad * RAD2DEG);
    const clampedHorizontalRad = clampedHorizontalDeg * DEG2RAD;
    setBaseFovRad(clampedHorizontalRad);
    const axisBaseFovDeg = horizontalRadToAxisDeg(clampedHorizontalRad);

    const nearRaw = nearClip ?? events.invoke('camera.near') ?? scene.camera.near;
    const farRaw = scene.camera.far;
    const near = (typeof nearRaw === 'number' && isFinite(nearRaw)) ? Math.max(MIN_NEAR_CLIP, nearRaw) : DEFAULT_NEAR_CLIP;
    const far = (typeof farRaw === 'number' && isFinite(farRaw)) ? farRaw : 1000;

    let runtimeFrustum: CameraFrustum;
    if (projection.type === 'ortho') {
        const halfHeight = projection.orthoHalfHeight ?? 1;
        runtimeFrustum = {
            l0: -halfHeight * aspect,
            r0: halfHeight * aspect,
            b0: -halfHeight,
            t0: halfHeight,
            near,
            far
        };
    } else {
        const halfW = near * Math.tan(clampedHorizontalRad * 0.5);
        const halfH = halfW / aspect;
        runtimeFrustum = {
            l0: -halfW,
            r0: halfW,
            b0: -halfH,
            t0: halfH,
            near,
            far
        };
    }
    setRuntimeFrustum(runtimeFrustum);

    rb.projection = {
        ...projection,
        baseFov: axisBaseFovDeg
    };
    if (stateEnabled) {
        events.fire('camera.setFov', rb.projection.baseFov);
    }
    return runtimeFrustum;
};

export const computeEffectiveFrustum = ({
    getRuntimeFrustum,
    rebuildBaseFrustum,
    renderBox,
    scene
}: ComputeEffectiveFrustumParams) => {
    let frustum = getRuntimeFrustum();
    if (!frustum) {
        rebuildBaseFrustum();
        frustum = getRuntimeFrustum();
    }
    if (!frustum) {
        return null;
    }
    const rb = renderBox;
    const { kx, ky } = rb.scale;
    const { ax, ay } = rb.anchor;

    // Transform the base frustum by render-box scale/anchor (off-axis).
    // View zoom (UI scale) is not applied here.

    const width1 = (frustum.r0 - frustum.l0) * kx;
    const height1 = (frustum.t0 - frustum.b0) * ky;
    const left1 = frustum.l0 + ax * ((frustum.r0 - frustum.l0) - width1);
    const right1 = left1 + width1;
    // Y axis (bottom -> top): PlayCanvas is Y-up. UI ay=0 is "top", so flip with (1.0 - ay).
    // ay=0 -> bottom=t0-h, top=t0; ay=1 -> bottom=b0 (bottom anchored).
    const bottom1 = frustum.b0 + (1.0 - ay) * ((frustum.t0 - frustum.b0) - height1);
    const top1 = bottom1 + height1;

    const camFarRaw = scene.camera.far;
    const far = (typeof camFarRaw === 'number' && isFinite(camFarRaw) && camFarRaw > frustum.near) ? camFarRaw : Math.max(frustum.near * 2, frustum.far);

    // Frustum that matches the render box corners.
    return {
        left: left1,
        right: right1,
        bottom: bottom1,
        top: top1,
        near: frustum.near,
        far
    };
};

export const syncCameraFrustum = ({
    stateEnabled,
    computeEffectiveFrustum,
    scene,
    events,
    viewport,
    computeViewportMapping
}: SyncCameraFrustumParams) => {
    if (!stateEnabled) {
        return null;
    }

    // Always recompute (including targetSize switches).
    // Export sets targetSize first, then overwrites setCustomFrustum here.
    // 1) Base render-box frustum (no zoom).
    const rbFrustum = computeEffectiveFrustum();
    if (!rbFrustum) {
        events.fire('camera.setCustomFrustum', null);
        return null;
    }

    // 2) Export mode check.
    const targetSize = scene.camera.targetSize;
    const isExporting = !!targetSize;

    let finalFrustum = rbFrustum;

    if (isExporting) {
        // Export: use the render-box frustum as-is (output size matches render box).
        finalFrustum = rbFrustum;
    } else {
        // Preview: extrapolate frustum to cover the full viewport.
        // computeViewportMapping uses preview settings.
        const mapping = computeViewportMapping();
        const { rectPxRaw } = mapping;
        const { vw, vh } = viewport;

        // Render-box frustum size on the near plane.
        const rbW = rbFrustum.right - rbFrustum.left;
        const rbH = rbFrustum.top - rbFrustum.bottom;

        // World size per pixel on the near plane. Guard against zero rectPxRaw.
        const pxToWorldX = rectPxRaw.w > 0 ? rbW / rectPxRaw.w : 0;
        const pxToWorldY = rectPxRaw.h > 0 ? rbH / rectPxRaw.h : 0;

        if (pxToWorldX === 0 || pxToWorldY === 0) {
            events.fire('camera.setCustomFrustum', null);
            return null;
        }

        // Extrapolate to screen edges.
        const leftScreen = rbFrustum.left - (rectPxRaw.x) * pxToWorldX;
        const rightScreen = leftScreen + vw * pxToWorldX;

        // Screen top (y=0): DOM Y=0 is top, PlayCanvas top is +Y.
        const topScreen = rbFrustum.top + (rectPxRaw.y) * pxToWorldY;
        const bottomScreen = topScreen - vh * pxToWorldY;

        finalFrustum = {
            ...rbFrustum,
            left: leftScreen,
            right: rightScreen,
            bottom: bottomScreen,
            top: topScreen
        };
    }

    events.fire('camera.setCustomFrustum', finalFrustum);
    return finalFrustum;
};

export const buildFrustumPoints = ({
    frustum,
    basis,
    renderBox,
    scene,
    lockFovAxis,
    baseFovRad,
    baseFovToHorizontalRad,
    cropFactor
}: BuildFrustumPointsParams): Vec3[] | null => {
    if (!basis) {
        return null;
    }

    let left: number;
    let right: number;
    let top: number;
    let bottom: number;
    let near: number;

    if (frustum) {
        left = frustum.left;
        right = frustum.right;
        top = frustum.top;
        bottom = frustum.bottom;
        near = frustum.near;
    } else {
        // Fallback when frustum is unavailable (keep render-box aspect only).
        const rb = renderBox;
        const aspect = (rb.baseSize.w * rb.scale.kx) / (rb.baseSize.h * rb.scale.ky || 1);
        const baseFovDeg = rb.projection?.baseFov ?? scene.camera?.fov ?? 60;
        const baseFovRadAxis = baseFovDeg * DEG2RAD;
        const horizontalRad = baseFovToHorizontalRad(baseFovRadAxis, lockFovAxis ?? 'horizontal', aspect);
        const halfW = Math.tan(horizontalRad * 0.5);
        const halfH = halfW / aspect;
        left = -halfW;
        right = halfW;
        bottom = -halfH;
        top = halfH;
        near = 1;
    }

    const nearSafe = Math.max(near, 1e-4);

    // Visualization distance: lens mm -> meters * 12, clamped to 0.2m-2m.
    const hfovRadForMm = (() => {
        if (frustum) {
            const width = right - left;
            return 2 * Math.atan(width / (2 * nearSafe));
        }
        return baseFovRad || ((renderBox.projection?.baseFov ?? 60) * DEG2RAD);
    })();
    const crop = cropFactor(renderBox);
    const eqMm = eqMmForFov(hfovRadForMm * RAD2DEG, crop);
    const distanceRaw = (eqMm / 1000) * 12;
    const baseDistance = Math.min(2, Math.max(0.2, (isFinite(distanceRaw) && distanceRaw > 0) ? distanceRaw : 0.5));

    const forward = basis.forward.clone();
    if (forward.lengthSq() > 0) {
        forward.normalize();
    }
    const camRight = basis.right.clone();
    const camUp = basis.up.clone();
    const scale = baseDistance / nearSafe;
    const scaledLeft = left * scale;
    const scaledRight = right * scale;
    const scaledTop = top * scale;
    const scaledBottom = bottom * scale;

    const apex = basis.position.clone();
    const baseCenter = apex.clone().add(forward.mulScalar(baseDistance));
    const makeBaseCorner = (x: number, y: number) => {
        const p = baseCenter.clone();
        p.add(camRight.clone().mulScalar(x));
        p.add(camUp.clone().mulScalar(y));
        return p;
    };
    const baseTl = makeBaseCorner(scaledLeft, scaledTop);
    const baseTr = makeBaseCorner(scaledRight, scaledTop);
    const baseBr = makeBaseCorner(scaledRight, scaledBottom);
    const baseBl = makeBaseCorner(scaledLeft, scaledBottom);
    // 0: apex, 1-4: base (TL, TR, BR, BL)
    return [apex, baseTl, baseTr, baseBr, baseBl];
};

export const getFrustumDebugPoints = ({
    mainCameraPose,
    scene,
    renderBox,
    lockFovAxis,
    baseFovRad,
    baseFovToHorizontalRad,
    cropFactor,
    frustumDebugCache,
    frustumDebugCacheVersion,
    computeEffectiveFrustum,
    isSamePose,
    isSameFrustum,
    setFrustumDebugCache
}: GetFrustumDebugPointsParams) => {
    const pose = clonePoseSnapshot(mainCameraPose);
    if (!pose) {
        return null;
    }
    const frustum = computeEffectiveFrustum();
    const cache = frustumDebugCache;
    const poseChanged = !cache.pose || !isSamePose(cache.pose, pose) || cache.version !== frustumDebugCacheVersion;
    const frustumChanged = !cache.frustum || !frustum || !isSameFrustum(cache.frustum, frustum);
    if (poseChanged || frustumChanged || !cache.points) {
        const basis = buildCameraBasis(scene, pose);
        if (!basis) {
            return null;
        }
        const points = buildFrustumPoints({
            frustum,
            basis,
            renderBox,
            scene,
            lockFovAxis,
            baseFovRad,
            baseFovToHorizontalRad,
            cropFactor
        });
        if (!points) {
            return null;
        }
        setFrustumDebugCache({
            pose,
            frustum: frustum ? { ...frustum } : null,
            points,
            version: frustumDebugCacheVersion
        });
        return points;
    }
    return cache.points;
};

export const drawMainCameraFrustum = ({
    stateEnabled,
    mainCameraPose,
    setMainCameraPose,
    scene,
    ensureUiTargetAvailability,
    captureCameraPose,
    forceMainCameraPoseOrthoOff,
    getFrustumDebugPoints,
    mainCameraSelected,
    frustumDebugColor,
    frustumSelectedColor
}: DrawMainCameraFrustumParams) => {
    ensureUiTargetAvailability();
    if (stateEnabled) {
        return;
    }
    if (!mainCameraPose) {
        // If mainCameraPose is missing (e.g. empty scene), capture the current camera pose.
        const fallback = captureCameraPose();
        if (fallback) {
            setMainCameraPose(forceMainCameraPoseOrthoOff(fallback));
        } else {
            return;
        }
    }
    if (scene.camera.targetSize) {
        return;
    }
    const points = getFrustumDebugPoints();
    if (!points || points.length < 5) {
        return;
    }
    const color = mainCameraSelected ? frustumSelectedColor : frustumDebugColor;
    const draw = (a: number, b: number) => scene.app.drawLine(points[a], points[b], color, true, scene.debugLayer);
    // base rectangle
    draw(1, 2);
    draw(2, 3);
    draw(3, 4);
    draw(4, 1);
    // sides
    draw(0, 1);
    draw(0, 2);
    draw(0, 3);
    draw(0, 4);
};

export const applyNearClipOverride = ({ stateEnabled, nearClip, events }: ApplyNearClipOverrideParams) => {
    if (!stateEnabled) {
        return;
    }
    if (typeof nearClip === 'number' && isFinite(nearClip)) {
        events.fire('camera.setNearOverride', nearClip);
    } else {
        events.fire('camera.setNearOverride', null);
    }
};

export const computeSafeNearClip = (value: number | null | undefined) => {
    const raw = (typeof value === 'number' && isFinite(value)) ? value : NaN;
    if (!isFinite(raw) || raw <= 0) {
        return DEFAULT_NEAR_CLIP;
    }
    return Math.max(MIN_NEAR_CLIP, raw);
};

export const setNearClip = ({
    value,
    suppressHistory,
    getStateEnabled,
    getUiTarget,
    getMainEditMode,
    getNearClip,
    setNearClipState,
    applyNearClipOverride,
    rebuildBaseFrustum,
    syncCameraFrustum,
    requestRender,
    fireStateChanged,
    historyDebounced,
    invalidateFrustumDebugCache
}: SetNearClipParams) => {
    const apply = () => {
        const stateEnabled = getStateEnabled();
        const uiTarget = getUiTarget();
        const mainEditMode = getMainEditMode();
        const sanitized = computeSafeNearClip(value);
        if (getNearClip() === sanitized) return;
        setNearClipState(sanitized);
        if (stateEnabled) {
            applyNearClipOverride();
            rebuildBaseFrustum();
            syncCameraFrustum();
        } else if (uiTarget === 'main' || mainEditMode) {
            rebuildBaseFrustum();
            invalidateFrustumDebugCache();
        }
        requestRender();
        fireStateChanged();
    };

    if (suppressHistory) {
        apply();
    } else {
        historyDebounced('cameraFrames.nearClip', apply);
    }
};

export const updateViewportNearTargetSizeState = ({
    scene,
    viewportNearTargetSizeActive,
    setViewportNearTargetSizeActive,
    clearViewportNearOverride,
    scheduleViewportNearOverride
}: UpdateViewportNearTargetSizeStateParams) => {
    const active = !!scene.camera.targetSize;
    if (active === viewportNearTargetSizeActive) {
        return;
    }
    setViewportNearTargetSizeActive(active);
    clearViewportNearOverride();
    if (!active) {
        scheduleViewportNearOverride(0);
    }
};

export const shouldApplyViewportNearOverride = ({
    stateEnabled,
    uiTarget,
    scene
}: ShouldApplyViewportNearOverrideParams) => {
    return !stateEnabled && uiTarget === 'viewport' && !scene.camera.targetSize && !scene.camera.ortho;
};

export const clearViewportNearOverride = ({
    viewportNearDebounceId,
    setViewportNearDebounceId,
    viewportNearOverrideActive,
    setViewportNearOverrideActive,
    viewportNearOverride,
    setViewportNearOverride,
    events
}: ClearViewportNearOverrideParams) => {
    if (viewportNearDebounceId !== null) {
        window.clearTimeout(viewportNearDebounceId);
        setViewportNearDebounceId(null);
    }
    if (viewportNearOverrideActive || viewportNearOverride !== null) {
        setViewportNearOverrideActive(false);
        setViewportNearOverride(null);
        events.fire('camera.setNearOverride', null, { transient: true });
    }
};

export const scheduleViewportNearOverride = ({
    delayMs,
    shouldApplyViewportNearOverride,
    viewportNearDebounceId,
    setViewportNearDebounceId,
    applyViewportNearOverride
}: ScheduleViewportNearOverrideParams) => {
    if (!shouldApplyViewportNearOverride()) {
        return;
    }
    if (viewportNearDebounceId !== null) {
        window.clearTimeout(viewportNearDebounceId);
    }
    const debounceId = window.setTimeout(() => {
        setViewportNearDebounceId(null);
        applyViewportNearOverride();
    }, delayMs);
    setViewportNearDebounceId(debounceId);
};

export const applyViewportNearOverride = ({
    shouldApplyViewportNearOverride,
    viewportNearLastSampleTs,
    setViewportNearLastSampleTs,
    computeViewportNearCandidate,
    viewportNearOverride,
    setViewportNearOverride,
    viewportNearOverrideActive,
    setViewportNearOverrideActive,
    clearViewportNearOverride,
    events
}: ApplyViewportNearOverrideParams) => {
    if (!shouldApplyViewportNearOverride()) {
        return;
    }
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - viewportNearLastSampleTs < 100) {
        return;
    }
    setViewportNearLastSampleTs(now);

    const candidate = computeViewportNearCandidate();
    if (candidate === null) {
        if (viewportNearOverrideActive) {
            clearViewportNearOverride();
        }
        return;
    }

    if (viewportNearOverride !== null) {
        const absDelta = Math.abs(candidate - viewportNearOverride);
        const relDelta = absDelta / Math.max(viewportNearOverride, MIN_NEAR_CLIP);
        if (absDelta < 1e-3 && relDelta < 0.2) {
            return;
        }
    }

    setViewportNearOverride(candidate);
    setViewportNearOverrideActive(true);
    events.fire('camera.setNearOverride', candidate, { transient: true });
};

export const computeViewportNearCandidate = ({ scene }: ComputeViewportNearCandidateParams): number | null => {
    const canvas = scene?.canvas;
    const targetSize = scene?.targetSize;
    if (!canvas || !targetSize || targetSize.width <= 0 || targetSize.height <= 0) {
        return null;
    }
    const w = canvas.clientWidth ?? 0;
    const h = canvas.clientHeight ?? 0;
    if (!(w > 0 && h > 0)) {
        return null;
    }
    if (scene.getElementsByType(ElementType.splat).length === 0) {
        return null;
    }

    const cx = w * 0.5;
    const cy = h * 0.5;
    const dx = w * 0.35;
    const dy = h * 0.35;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const samples = [
        { x: cx, y: cy },
        { x: cx + dx, y: cy },
        { x: cx - dx, y: cy },
        { x: cx, y: cy + dy },
        { x: cx, y: cy - dy }
    ];

    let minDist: number | null = null;
    for (const sample of samples) {
        const x = clamp(sample.x, 0, w - 1);
        const y = clamp(sample.y, 0, h - 1);
        const hit = scene.camera.intersect(x, y);
        const distance = hit?.distance;
        if (typeof distance !== 'number' || !isFinite(distance) || distance <= 0) {
            continue;
        }
        if (minDist === null || distance < minDist) {
            minDist = distance;
        }
    }
    if (minDist === null) {
        return null;
    }

    const far = scene.camera.far;
    const sceneRadius = scene.camera.sceneRadius;
    const maxCandidates: number[] = [];
    if (typeof far === 'number' && isFinite(far) && far > 0) {
        maxCandidates.push(far * 0.1);
    }
    if (typeof sceneRadius === 'number' && isFinite(sceneRadius) && sceneRadius > 0) {
        maxCandidates.push(sceneRadius * 0.1);
    }
    const maxNear = maxCandidates.length ? Math.min(...maxCandidates) : null;

    let near = minDist * 0.05;
    if (maxNear !== null && near > maxNear) {
        near = maxNear;
    }
    near = Math.max(MIN_NEAR_CLIP, near);
    if (!isFinite(near) || near <= 0) {
        return null;
    }
    return near;
};

export const enforceSafeNearClip = ({
    stateEnabled,
    nearClipGuardSeed,
    nearClip,
    events,
    setNearClip
}: EnforceSafeNearClipParams) => {
    if (!stateEnabled) {
        return;
    }
    if (nearClipGuardSeed !== nearClip) {
        return;
    }
    const currentNear = nearClip ?? events.invoke('camera.near');
    const safeNear = computeSafeNearClip(currentNear);
    if (nearClip !== safeNear) {
        setNearClip(safeNear, true);
    }
};

export const scheduleNearClipGuard = ({
    frames,
    nearClip,
    pendingNearClipGuard,
    setPendingNearClipGuard,
    setNearClipGuardSeed
}: ScheduleNearClipGuardParams) => {
    setNearClipGuardSeed(nearClip ?? null);
    setPendingNearClipGuard(Math.max(pendingNearClipGuard, frames));
};

export const runPendingNearClipGuard = ({
    stateEnabled,
    pendingNearClipGuard,
    setPendingNearClipGuard,
    enforceSafeNearClip
}: RunPendingNearClipGuardParams) => {
    if (!stateEnabled || pendingNearClipGuard <= 0) {
        return;
    }
    const nextPending = pendingNearClipGuard - 1;
    setPendingNearClipGuard(nextPending);
    if (nextPending === 0) {
        enforceSafeNearClip();
    }
};
