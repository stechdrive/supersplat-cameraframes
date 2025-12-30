import { DEFAULT_FRAME_BASE, DEFAULT_MASK, DEFAULT_RENDERBOX } from './camera-frames-constants';
import { cloneFrame, normalizeMaskScope } from './camera-frames-math';
import type {
    CameraFramesState,
    CameraPoseSnapshot,
    ExportFormat,
    FrameState,
    FrustumDebugCache,
    Viewport,
    ViewportMapping
} from './camera-frames-types';
import type { Events } from './events';
import type { Scene } from './scene';

type ApplyCameraPose = (pose: CameraPoseSnapshot, options: { silent: boolean; allowOrtho: boolean; }) => void;
type ApplyNearClipOverride = () => void;
type CaptureCameraPose = () => CameraPoseSnapshot | null;
type ClonePoseSnapshot = (pose: CameraPoseSnapshot | null | undefined) => CameraPoseSnapshot | null;
type ComputeSafeNearClip = (value: number | null | undefined) => number | null;
type ComputeViewportMapping = (updateFitScale: boolean) => ViewportMapping;
type FireStateChanged = () => void;
type ForceMainCameraPoseOrthoOff = (pose: CameraPoseSnapshot | null) => CameraPoseSnapshot | null;
type NormalizeFormat = (format?: ExportFormat) => ExportFormat;
type NormalizeMainRenderBoxProjection = (baseFov?: number) => void;
type NormalizeViewZoomPct = (value?: number) => number;
type RebuildBaseFrustum = () => void;
type RequestRender = () => void;
type ScheduleNearClipGuard = () => void;
type SetApplyingHistory = (value: boolean) => void;
type SetHasEnteredViewportOnce = (value: boolean) => void;
type SetSelectedId = (value: string | null) => void;
type SetState = (state: CameraFramesState) => void;
type SetViewportPoseRuntime = (value: CameraPoseSnapshot | null) => void;
type SetViewportPoseRuntimeWorldDistance = (value: number | null) => void;
type SyncCameraFrustum = () => void;
type UpdateFovInfo = () => void;
type UpdatePointerFromLast = () => void;

type SnapshotParams = {
    state: CameraFramesState;
    clonePoseSnapshot: ClonePoseSnapshot;
    normalizeFormat: NormalizeFormat;
};

type SerializeParams = {
    snapshot: () => CameraFramesState;
    selectedId: string | null;
    version: string;
};

type ApplySnapshotParams = {
    snapshot: CameraFramesState;
    sceneCameraFov?: number;
    setApplyingHistory: SetApplyingHistory;
    setState: SetState;
    normalizeMainRenderBoxProjection: NormalizeMainRenderBoxProjection;
    clonePoseSnapshot: ClonePoseSnapshot;
    forceMainCameraPoseOrthoOff: ForceMainCameraPoseOrthoOff;
    captureCameraPose: CaptureCameraPose;
    computeSafeNearClip: ComputeSafeNearClip;
    setViewportPoseRuntime: SetViewportPoseRuntime;
    setViewportPoseRuntimeWorldDistance: SetViewportPoseRuntimeWorldDistance;
    setHasEnteredViewportOnce: SetHasEnteredViewportOnce;
    setSelectedId: SetSelectedId;
    overlay: HTMLCanvasElement;
    frustumDebugCache: FrustumDebugCache;
    rebuildBaseFrustum: RebuildBaseFrustum;
    applyCameraPose: ApplyCameraPose;
    applyNearClipOverride: ApplyNearClipOverride;
    computeViewportMapping: ComputeViewportMapping;
    syncCameraFrustum: SyncCameraFrustum;
    scheduleNearClipGuard: ScheduleNearClipGuard;
    requestRender: RequestRender;
    events: Events;
    fireStateChanged: FireStateChanged;
    updatePointerFromLast: UpdatePointerFromLast;
    updateFovInfo: UpdateFovInfo;
};

type DeserializeParams = {
    docState: any;
    scene: Scene;
    viewport: Viewport;
    events: Events;
    normalizeFormat: NormalizeFormat;
    normalizeViewZoomPct: NormalizeViewZoomPct;
    clonePoseSnapshot: ClonePoseSnapshot;
    forceMainCameraPoseOrthoOff: ForceMainCameraPoseOrthoOff;
    captureCameraPose: CaptureCameraPose;
    normalizeMainRenderBoxProjection: NormalizeMainRenderBoxProjection;
    computeSafeNearClip: ComputeSafeNearClip;
    setState: SetState;
    setSelectedId: SetSelectedId;
    setViewportPoseRuntime: SetViewportPoseRuntime;
    setViewportPoseRuntimeWorldDistance: SetViewportPoseRuntimeWorldDistance;
    setHasEnteredViewportOnce: SetHasEnteredViewportOnce;
    overlay: HTMLCanvasElement;
    rebuildBaseFrustum: RebuildBaseFrustum;
    applyCameraPose: ApplyCameraPose;
    applyNearClipOverride: ApplyNearClipOverride;
    computeViewportMapping: ComputeViewportMapping;
    syncCameraFrustum: SyncCameraFrustum;
    scheduleNearClipGuard: ScheduleNearClipGuard;
    requestRender: RequestRender;
    fireStateChanged: FireStateChanged;
    updatePointerFromLast: UpdatePointerFromLast;
    updateFovInfo: UpdateFovInfo;
};

export const snapshot = ({ state, clonePoseSnapshot, normalizeFormat }: SnapshotParams): CameraFramesState => {
    return {
        enabled: state.enabled,
        renderBox: JSON.parse(JSON.stringify(state.renderBox)),
        frames: state.frames.map(cloneFrame),
        mask: { ...state.mask },
        mainCameraPose: clonePoseSnapshot(state.mainCameraPose),
        nearClip: state.nearClip,
        exportName: state.exportName,
        exportFormat: normalizeFormat(state.exportFormat),
        exportGridOverlay: !!state.exportGridOverlay,
        exportModelLayers: !!state.exportModelLayers
    };
};

export const applySnapshot = ({
    snapshot: target,
    sceneCameraFov,
    setApplyingHistory,
    setState,
    normalizeMainRenderBoxProjection,
    clonePoseSnapshot,
    forceMainCameraPoseOrthoOff,
    captureCameraPose,
    computeSafeNearClip,
    setViewportPoseRuntime,
    setViewportPoseRuntimeWorldDistance,
    setHasEnteredViewportOnce,
    setSelectedId,
    overlay,
    frustumDebugCache,
    rebuildBaseFrustum,
    applyCameraPose,
    applyNearClipOverride,
    computeViewportMapping,
    syncCameraFrustum,
    scheduleNearClipGuard,
    requestRender,
    events,
    fireStateChanged,
    updatePointerFromLast,
    updateFovInfo
}: ApplySnapshotParams) => {
    setApplyingHistory(true);
    try {
        const nextState = JSON.parse(JSON.stringify(target)) as CameraFramesState;
        setState(nextState);
        const state = nextState;
        normalizeMainRenderBoxProjection(sceneCameraFov);
        state.mask = {
            ...DEFAULT_MASK,
            ...(state.mask ?? {}),
            scope: normalizeMaskScope(state.mask?.scope, DEFAULT_MASK.scope)
        };
        state.mainCameraPose = clonePoseSnapshot(state.mainCameraPose);
        forceMainCameraPoseOrthoOff(state.mainCameraPose);
        if (!state.mainCameraPose) {
            state.mainCameraPose = forceMainCameraPoseOrthoOff(clonePoseSnapshot(captureCameraPose()));
        }
        setViewportPoseRuntime(null);
        setViewportPoseRuntimeWorldDistance(null);
        if (!state.enabled) {
            setHasEnteredViewportOnce(true);
        }
        setSelectedId(state.frames.find(f => f.selected)?.id ?? null);
        state.nearClip = computeSafeNearClip(state.nearClip);
        state.exportGridOverlay = !!state.exportGridOverlay;
        state.exportModelLayers = !!state.exportModelLayers;
        overlay.style.pointerEvents = 'none';
        rebuildBaseFrustum();
        if (state.enabled) {
            if (state.mainCameraPose) {
                applyCameraPose(state.mainCameraPose, { silent: true, allowOrtho: false });
            }
            applyNearClipOverride();
            computeViewportMapping(true);
            syncCameraFrustum();
            scheduleNearClipGuard();
        } else {
            events.fire('camera.setNearOverride', null);
            events.fire('camera.setCustomFrustum', null);
        }
        requestRender();
        fireStateChanged();
        updatePointerFromLast();
        updateFovInfo();
        frustumDebugCache.points = null;
        frustumDebugCache.pose = null;
    } finally {
        setApplyingHistory(false);
    }
};

export const serialize = ({ snapshot, selectedId, version }: SerializeParams) => {
    const snap = snapshot();
    return {
        ...snap,
        selectedId,
        version
    };
};

export const deserialize = ({
    docState,
    scene,
    viewport,
    events,
    normalizeFormat,
    normalizeViewZoomPct,
    clonePoseSnapshot,
    forceMainCameraPoseOrthoOff,
    captureCameraPose,
    normalizeMainRenderBoxProjection,
    computeSafeNearClip,
    setState,
    setSelectedId,
    setViewportPoseRuntime,
    setViewportPoseRuntimeWorldDistance,
    setHasEnteredViewportOnce,
    overlay,
    rebuildBaseFrustum,
    applyCameraPose,
    applyNearClipOverride,
    computeViewportMapping,
    syncCameraFrustum,
    scheduleNearClipGuard,
    requestRender,
    fireStateChanged,
    updatePointerFromLast,
    updateFovInfo
}: DeserializeParams) => {
    if (!docState) {
        const initialPose = captureCameraPose();
        const nextState: CameraFramesState = {
            enabled: false,
            renderBox: DEFAULT_RENDERBOX(),
            frames: [],
            mask: { ...DEFAULT_MASK },
            mainCameraPose: forceMainCameraPoseOrthoOff(clonePoseSnapshot(initialPose)),
            nearClip: null,
            exportName: 'cf-output',
            exportFormat: 'png',
            exportGridOverlay: false,
            exportModelLayers: false
        };
        setState(nextState);
        normalizeMainRenderBoxProjection(scene.camera.fov);
        setSelectedId(null);
        setViewportPoseRuntime(null);
        setViewportPoseRuntimeWorldDistance(null);
        setHasEnteredViewportOnce(false);
        rebuildBaseFrustum();
        if (nextState.enabled && nextState.mainCameraPose) {
            applyCameraPose(nextState.mainCameraPose, { silent: true, allowOrtho: false });
            syncCameraFrustum();
        }
        updateFovInfo();
        requestRender();
        fireStateChanged();
        return;
    }

    const _stateVersion = docState.version ?? 0; // reserved for future migrations

    const rb = docState.renderBox ?? DEFAULT_RENDERBOX();
    const exportName = typeof docState.exportName === 'string' ? docState.exportName : 'cf-output';
    const exportFormat = normalizeFormat(docState.exportFormat ?? 'psd');
    const exportGridOverlay = !!docState.exportGridOverlay;
    const exportModelLayers = !!docState.exportModelLayers;
    const maskScope = normalizeMaskScope(docState.mask?.scope, DEFAULT_MASK.scope);
    const frames = (docState.frames ?? []).map((f: FrameState) => ({
        id: f.id,
        pos: { ...f.pos },
        scalePct: f.scalePct ?? 100,
        scaleK: (f.scalePct ?? 100) / 100,
        baseSize: f.baseSize ?? { ...DEFAULT_FRAME_BASE },
        order: f.order ?? 0,
        rotationDeg: (typeof f.rotationDeg === 'number' && isFinite(f.rotationDeg)) ? f.rotationDeg : 0,
        anchor: f.anchor ? { ...f.anchor } : { x: f.pos?.x ?? 0.5, y: f.pos?.y ?? 0.5 }
    }));

    const baseSize = rb.baseSize ?? DEFAULT_RENDERBOX().baseSize;
    const MIN_PCT = 100;
    const MAX_DIM = 16000;
    const rawScalePctX = rb.scalePct?.x ?? 100;
    const rawScalePctY = rb.scalePct?.y ?? 100;
    const maxScalePctX = baseSize.w > 0 ? Math.floor((MAX_DIM / baseSize.w) * 100) : MIN_PCT;
    const maxScalePctY = baseSize.h > 0 ? Math.floor((MAX_DIM / baseSize.h) * 100) : MIN_PCT;
    const clampedScalePctX = Math.min(maxScalePctX, Math.max(MIN_PCT, rawScalePctX));
    const clampedScalePctY = Math.min(maxScalePctY, Math.max(MIN_PCT, rawScalePctY));
    const scalePct = { x: clampedScalePctX, y: clampedScalePctY };
    const scale = {
        kx: rb.scale?.kx ?? scalePct.x / 100,
        ky: rb.scale?.ky ?? scalePct.y / 100
    };
    const legacyUiScale = (typeof rb.uiScale === 'number' && isFinite(rb.uiScale)) ? rb.uiScale : undefined;
    const viewZoomPct = normalizeViewZoomPct(rb.viewZoomPct ?? (legacyUiScale !== undefined ? legacyUiScale * 100 : undefined));
    const lastViewport = rb.lastViewport ?? { ...viewport };
    const logicalW = baseSize.w * scale.kx;
    const logicalH = baseSize.h * scale.ky;
    const autoFit = Math.min(
        lastViewport.vw > 0 ? lastViewport.vw / logicalW : 1,
        lastViewport.vh > 0 ? lastViewport.vh / logicalH : 1
    ) || 1;
    const legacyViewScale = (typeof rb.viewScale === 'number' && isFinite(rb.viewScale)) ? rb.viewScale : null;
    const fitScale = (() => {
        if (legacyViewScale) {
            const divisor = legacyUiScale ?? (viewZoomPct / 100);
            if (divisor > 0) {
                const fit = legacyViewScale / divisor;
                if (isFinite(fit) && fit > 0) {
                    return fit;
                }
            }
        }
        if (isFinite(rb.fitScale) && rb.fitScale > 0) {
            return rb.fitScale;
        }
        return autoFit;
    })();
    const projection = (() => {
        const raw = rb.projection ?? {};
        let baseFov = scene.camera.fov;
        if (typeof raw.baseFov === 'number' && isFinite(raw.baseFov)) {
            baseFov = raw.baseFov;
        } else if (typeof (raw as any).fovY === 'number' && isFinite((raw as any).fovY)) {
            baseFov = (raw as any).fovY;
        }
        return {
            type: raw.type ?? 'perspective',
            baseFov,
            orthoHalfHeight: raw.orthoHalfHeight
        };
    })();
    const mainCameraPose = clonePoseSnapshot(docState.mainCameraPose);

    const nextState: CameraFramesState = {
        enabled: !!docState.enabled,
        renderBox: {
            ...DEFAULT_RENDERBOX(),
            baseSize,
            scalePct,
            scale,
            anchor: rb.anchor ?? { ax: 0.5, ay: 0.5 },
            center: rb.center ?? { cx: viewport.vw / 2, cy: viewport.vh / 2 },
            fitScale,
            viewZoomPct,
            lastViewport,
            projection
        },
        frames,
        mask: {
            ...DEFAULT_MASK,
            ...(docState.mask ?? {}),
            scope: maskScope
        },
        nearClip: (typeof docState.nearClip === 'number' && isFinite(docState.nearClip)) ? docState.nearClip : null,
        exportName,
        exportFormat,
        exportGridOverlay,
        exportModelLayers,
        mainCameraPose
    };

    setState(nextState);
    normalizeMainRenderBoxProjection(scene.camera.fov);
    forceMainCameraPoseOrthoOff(nextState.mainCameraPose);
    nextState.nearClip = computeSafeNearClip(nextState.nearClip);
    if (!nextState.mainCameraPose) {
        nextState.mainCameraPose = forceMainCameraPoseOrthoOff(clonePoseSnapshot(captureCameraPose()));
    }

    overlay.style.pointerEvents = 'none';
    setViewportPoseRuntime(null);
    setViewportPoseRuntimeWorldDistance(null);
    setHasEnteredViewportOnce(!nextState.enabled);

    const selectedId = (docState && Object.prototype.hasOwnProperty.call(docState, 'selectedId')) ?
        docState.selectedId :
        (frames[0]?.id ?? null);
    setSelectedId(selectedId);
    nextState.frames.forEach((f) => {
        f.selected = f.id === selectedId;
    });

    computeViewportMapping(false);
    rebuildBaseFrustum();
    if (nextState.enabled) {
        if (nextState.mainCameraPose) {
            applyCameraPose(nextState.mainCameraPose, { silent: true, allowOrtho: false });
        }
        applyNearClipOverride();
        syncCameraFrustum();
    } else {
        events.fire('camera.setNearOverride', null);
        events.fire('camera.setCustomFrustum', null);
    }

    scheduleNearClipGuard();
    requestRender();
    fireStateChanged();
    updatePointerFromLast();
    updateFovInfo();
};
