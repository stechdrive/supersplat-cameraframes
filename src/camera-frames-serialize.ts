import { DEFAULT_FRAME_BASE, DEFAULT_MASK, DEFAULT_RENDERBOX } from './camera-frames-constants';
import { cloneFrame, normalizeMaskScope } from './camera-frames-math';
import type {
    CameraFramesState,
    CameraFramesStateBase,
    CameraPoseSnapshot,
    CameraPreset,
    ExportFormat,
    ExportTarget,
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
type SetSelectedPresetId = (value: string | null) => void;
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
    selectedPresetId: string | null;
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
    setSelectedPresetId: SetSelectedPresetId;
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
    setSelectedPresetId: SetSelectedPresetId;
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

const isObject = (value: unknown): value is Record<string, unknown> => (
    typeof value === 'object' && value !== null && !Array.isArray(value)
);

const normalizeExportTarget = (value: unknown): ExportTarget => (
    value === 'all' || value === 'selected' ? value : 'current'
);

const normalizeExportPresetIds = (value: unknown, presets: CameraPreset[]): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }
    const allowed = new Set(presets.map(preset => preset.id));
    const next: string[] = [];
    const seen = new Set<string>();
    value.forEach((id) => {
        if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) {
            return;
        }
        seen.add(id);
        next.push(id);
    });
    return next;
};

const cloneCameraFramesStateBase = (
    state: CameraFramesStateBase,
    clonePoseSnapshot: ClonePoseSnapshot,
    normalizeFormat: NormalizeFormat
): CameraFramesStateBase => ({
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
});

const cloneCameraPreset = (
    preset: CameraPreset,
    clonePoseSnapshot: ClonePoseSnapshot,
    normalizeFormat: NormalizeFormat
): CameraPreset => {
    const projection = preset.mainCamera.projection;
    const clonedProjection = projection.type === 'ortho' ? {
        type: 'ortho' as const,
        orthoHalfHeight: projection.orthoHalfHeight
    } : {
        type: 'perspective' as const,
        baseFov: projection.baseFov
    };
    return {
        id: preset.id,
        name: preset.name,
        selected: preset.selected,
        mainCamera: {
            transform: {
                position: { ...preset.mainCamera.transform.position },
                rotation: { ...preset.mainCamera.transform.rotation }
            },
            projection: clonedProjection,
            nearClip: preset.mainCamera.nearClip ?? null
        },
        cameraFramesState: cloneCameraFramesStateBase(preset.cameraFramesState, clonePoseSnapshot, normalizeFormat)
    };
};

const normalizeCameraFramesStateBase = (
    value: unknown,
    normalizeFormat: NormalizeFormat,
    clonePoseSnapshot: ClonePoseSnapshot
): CameraFramesStateBase | null => {
    if (!isObject(value)) {
        return null;
    }
    const state = value as Record<string, unknown>;
    const maskScope = normalizeMaskScope((state.mask as any)?.scope, DEFAULT_MASK.scope);
    const renderBox = isObject(state.renderBox) ? JSON.parse(JSON.stringify(state.renderBox)) : DEFAULT_RENDERBOX();
    return {
        enabled: !!state.enabled,
        renderBox,
        frames: Array.isArray(state.frames) ? (state.frames as FrameState[]).map(cloneFrame) : [],
        mask: {
            ...DEFAULT_MASK,
            ...(isObject(state.mask) ? state.mask : {}),
            scope: maskScope
        },
        mainCameraPose: clonePoseSnapshot(state.mainCameraPose as CameraPoseSnapshot | null | undefined),
        nearClip: (typeof state.nearClip === 'number' && isFinite(state.nearClip)) ? state.nearClip : null,
        exportName: typeof state.exportName === 'string' ? state.exportName : 'cf-%cam',
        exportFormat: normalizeFormat(state.exportFormat as ExportFormat | undefined),
        exportGridOverlay: !!state.exportGridOverlay,
        exportModelLayers: !!state.exportModelLayers
    };
};

const normalizeCameraPreset = (
    value: unknown,
    normalizeFormat: NormalizeFormat,
    clonePoseSnapshot: ClonePoseSnapshot,
    fallbackBaseFov: number
): CameraPreset | null => {
    if (!isObject(value)) {
        return null;
    }
    const id = typeof value.id === 'string' ? value.id : null;
    const name = typeof value.name === 'string' ? value.name : null;
    if (!id || !name) {
        return null;
    }
    if (!isObject(value.mainCamera) || !isObject((value.mainCamera as any).transform)) {
        return null;
    }
    const transform = (value.mainCamera as any).transform;
    if (!isObject(transform.position) || !isObject(transform.rotation)) {
        return null;
    }
    const position = transform.position as any;
    const rotation = transform.rotation as any;
    const projectionRaw = isObject((value.mainCamera as any).projection) ? (value.mainCamera as any).projection : null;
    const projection = (projectionRaw && projectionRaw.type === 'ortho') ? {
        type: 'ortho' as const,
        orthoHalfHeight: (typeof projectionRaw.orthoHalfHeight === 'number' && isFinite(projectionRaw.orthoHalfHeight)) ?
            projectionRaw.orthoHalfHeight :
            1
    } : {
        type: 'perspective' as const,
        baseFov: (projectionRaw && typeof projectionRaw.baseFov === 'number' && isFinite(projectionRaw.baseFov)) ?
            projectionRaw.baseFov :
            fallbackBaseFov
    };
    const mainCamera = {
        transform: {
            position: {
                x: (typeof position.x === 'number' && isFinite(position.x)) ? position.x : 0,
                y: (typeof position.y === 'number' && isFinite(position.y)) ? position.y : 0,
                z: (typeof position.z === 'number' && isFinite(position.z)) ? position.z : 0
            },
            rotation: {
                yaw: (typeof rotation.yaw === 'number' && isFinite(rotation.yaw)) ? rotation.yaw : 0,
                pitch: (typeof rotation.pitch === 'number' && isFinite(rotation.pitch)) ? rotation.pitch : 0,
                roll: (typeof rotation.roll === 'number' && isFinite(rotation.roll)) ? rotation.roll : 0
            }
        },
        projection,
        nearClip: (typeof (value.mainCamera as any).nearClip === 'number' && isFinite((value.mainCamera as any).nearClip)) ?
            (value.mainCamera as any).nearClip :
            null
    };
    const cameraFramesState = normalizeCameraFramesStateBase(value.cameraFramesState, normalizeFormat, clonePoseSnapshot);
    if (!cameraFramesState) {
        return null;
    }
    return {
        id,
        name,
        selected: !!value.selected,
        mainCamera,
        cameraFramesState
    };
};

export const snapshot = ({ state, clonePoseSnapshot, normalizeFormat }: SnapshotParams): CameraFramesState => {
    const baseState = cloneCameraFramesStateBase(state, clonePoseSnapshot, normalizeFormat);
    const exportTarget = normalizeExportTarget(state.exportTarget);
    const exportPresetIds = normalizeExportPresetIds(state.exportPresetIds, state.cameraPresets ?? []);
    return {
        ...baseState,
        exportTarget,
        exportPresetIds,
        cameraPresets: state.cameraPresets.map(preset => cloneCameraPreset(preset, clonePoseSnapshot, normalizeFormat))
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
    setSelectedPresetId,
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
        if (!Array.isArray(state.cameraPresets)) {
            state.cameraPresets = [];
        }
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
        setSelectedPresetId(state.cameraPresets.find(preset => preset.selected)?.id ?? null);
        state.nearClip = computeSafeNearClip(state.nearClip);
        state.exportGridOverlay = !!state.exportGridOverlay;
        state.exportModelLayers = !!state.exportModelLayers;
        state.exportTarget = normalizeExportTarget(state.exportTarget);
        state.exportPresetIds = normalizeExportPresetIds(state.exportPresetIds, state.cameraPresets);
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

export const serialize = ({ snapshot, selectedId, selectedPresetId, version }: SerializeParams) => {
    const snap = snapshot();
    return {
        ...snap,
        selectedId,
        selectedPresetId,
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
    setSelectedPresetId,
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
            exportName: 'cf-%cam',
            exportFormat: 'png',
            exportGridOverlay: false,
            exportModelLayers: false,
            exportTarget: 'current',
            exportPresetIds: [],
            cameraPresets: []
        };
        setState(nextState);
        normalizeMainRenderBoxProjection(scene.camera.fov);
        setSelectedId(null);
        setSelectedPresetId(null);
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
    const exportName = typeof docState.exportName === 'string' ? docState.exportName : 'cf-%cam';
    const exportFormat = normalizeFormat(docState.exportFormat ?? 'psd');
    const exportGridOverlay = !!docState.exportGridOverlay;
    const exportModelLayers = !!docState.exportModelLayers;
    const exportTarget = normalizeExportTarget(docState.exportTarget);
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
    const fallbackBaseFov = (typeof scene.camera?.fov === 'number' && isFinite(scene.camera.fov)) ? scene.camera.fov : 60;
    let cameraPresets: CameraPreset[] = [];
    if (Array.isArray(docState.cameraPresets)) {
        cameraPresets = (docState.cameraPresets as unknown[])
        .map(preset => normalizeCameraPreset(preset, normalizeFormat, clonePoseSnapshot, fallbackBaseFov))
        .filter((preset): preset is CameraPreset => !!preset);
    }
    const exportPresetIds = normalizeExportPresetIds(docState.exportPresetIds, cameraPresets);

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
        exportTarget,
        exportPresetIds,
        mainCameraPose,
        cameraPresets
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
    const rawSelectedPresetId = (docState && Object.prototype.hasOwnProperty.call(docState, 'selectedPresetId')) ?
        docState.selectedPresetId :
        null;
    const resolvedSelectedPresetId = (typeof rawSelectedPresetId === 'string' && cameraPresets.some(p => p.id === rawSelectedPresetId)) ?
        rawSelectedPresetId :
        (cameraPresets[0]?.id ?? null);
    setSelectedPresetId(resolvedSelectedPresetId);
    nextState.cameraPresets.forEach((preset) => {
        preset.selected = preset.id === resolvedSelectedPresetId;
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
