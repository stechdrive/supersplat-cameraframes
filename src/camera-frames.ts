import { Vec3 } from 'playcanvas';

import {
    applyNearClipOverride as applyNearClipOverrideCamera,
    applyViewportNearOverride as applyViewportNearOverrideCamera,
    buildCameraBasis as buildCameraBasisCamera,
    buildFrustumPoints as buildFrustumPointsCamera,
    calcFovInfo as calcFovInfoCamera,
    calcForwardVec as calcForwardVecCamera,
    captureCameraPose as captureCameraPoseCamera,
    clearViewportNearOverride as clearViewportNearOverrideCamera,
    clonePoseSnapshot as clonePoseSnapshotCamera,
    computeEffectiveFrustum as computeEffectiveFrustumCamera,
    computeSafeNearClip as computeSafeNearClipCamera,
    computeViewportNearCandidate as computeViewportNearCandidateCamera,
    drawMainCameraFrustum as drawMainCameraFrustumCamera,
    enforceSafeNearClip as enforceSafeNearClipCamera,
    eqMmForFov as eqMmForFovCamera,
    eqMmToHfov as eqMmToHfovCamera,
    getFrustumDebugPoints as getFrustumDebugPointsCamera,
    getViewportLensState as getViewportLensStateCamera,
    getPoseWorldDistance as getPoseWorldDistanceCamera,
    normalizeViewportPose as normalizeViewportPoseCamera,
    poseToTransform as poseToTransformCamera,
    rebuildBaseFrustum as rebuildBaseFrustumCamera,
    runPendingNearClipGuard as runPendingNearClipGuardCamera,
    scheduleNearClipGuard as scheduleNearClipGuardCamera,
    scheduleViewportNearOverride as scheduleViewportNearOverrideCamera,
    setNearClip as setNearClipCamera,
    setViewportLensMm as setViewportLensMmCamera,
    shouldApplyViewportNearOverride as shouldApplyViewportNearOverrideCamera,
    syncCameraFrustum as syncCameraFrustumCamera,
    updateFovInfo as updateFovInfoCamera,
    updateViewportNearTargetSizeState as updateViewportNearTargetSizeStateCamera,
    worldDistanceToNormalized as worldDistanceToNormalizedCamera
} from './camera-frames-camera';
import {
    DEFAULT_FRAME_BASE,
    DEFAULT_MASK,
    DEFAULT_RENDERBOX,
    DEG2RAD,
    FRUSTUM_DEBUG_CACHE_VERSION,
    FRUSTUM_DEBUG_COLOR,
    FRUSTUM_SELECTED_COLOR,
    HFOV_MAX,
    HFOV_MIN,
    MAX_VIEW_ZOOM_PCT,
    MIN_VIEW_ZOOM_PCT,
    RAD2DEG
} from './camera-frames-constants';
import { renderImage } from './camera-frames-export';
import {
    frameRectsScreen as frameRectsScreenGeometry,
    frameAnchorLogical as frameAnchorLogicalGeometry,
    frameCenterLogical as frameCenterLogicalGeometry,
    frameRotationRad as frameRotationRadGeometry,
    getAnchorLogicalForHandle as getAnchorLogicalForHandleGeometry,
    getHandleLogicalOffset as getHandleLogicalOffsetGeometry,
    getHandleLogicalPosition as getHandleLogicalPositionGeometry,
    hitTestFrameBorder as hitTestFrameBorderGeometry,
    hitTestHandle as hitTestHandleGeometry
} from './camera-frames-frame-geometry';
import { clampFov, normalizeMaskScope } from './camera-frames-math';
import {
    drawOverlay as drawOverlayOverlay,
    renderFrameOverlay as renderFrameOverlayOverlay,
    renderFrameOverlaysByManagement as renderFrameOverlaysByManagementOverlay
} from './camera-frames-overlay';
import {
    onContainerPointerDown as onContainerPointerDownPointer,
    onDoubleClick as onDoubleClickPointer,
    onHover as onHoverPointer,
    onPointerDown as onPointerDownPointer,
    onPointerMove as onPointerMovePointer,
    onPointerUp as onPointerUpPointer,
    resetAnchorToCenter as resetAnchorToCenterPointer,
    resetFrameRotation as resetFrameRotationPointer,
    updatePointerFromLast as updatePointerFromLastPointer
} from './camera-frames-pointer';
import {
    applySnapshot as applySnapshotSerialize,
    deserialize as deserializeSerialize,
    serialize as serializeSerialize,
    snapshot as snapshotSerialize
} from './camera-frames-serialize';
import type {
    CameraBasis,
    CameraFrustum,
    CameraFramesState,
    CameraPoseSnapshot,
    EffectiveFrustum,
    ExportFormat,
    FovInfo,
    FrameMaskState,
    FrameState,
    FrustumDebugCache,
    RenderBoxState,
    Viewport,
    ViewportMapping
} from './camera-frames-types';
import { cameraFramesVersion } from './camera-frames-version';
import {
    computeViewportMapping as computeViewportMappingViewport,
    logicalToScreen as logicalToScreenViewport,
    screenToLogical as screenToLogicalViewport
} from './camera-frames-viewport';
import { DEFAULT_NEAR_CLIP } from './clip-constants';
import { ElementType } from './element';
import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';

export type { CameraFramesState } from './camera-frames-types';

export class CameraFramesController {
    private events: Events;
    private scene: Scene;
    private overlay: HTMLCanvasElement;
    private overlayCtx: CanvasRenderingContext2D;
    private viewport: Viewport = { vw: 1, vh: 1 };
    private canvasContainer: HTMLElement;
    private state: CameraFramesState = {
        enabled: false,
        renderBox: DEFAULT_RENDERBOX(),
        frames: [],
        mask: { ...DEFAULT_MASK },
        mainCameraPose: null,
        nearClip: null,
        exportName: 'cf-output',
        exportFormat: 'psd',
        exportGridOverlay: false,
        exportModelLayers: false
    };
    private selectedId: string = null;
    private compressor: PngCompressor | null = null;
    private resizeObserver: ResizeObserver;
    private lastPointer: { x: number; y: number } | null = null;
    private dragState: {
        frameId: string | null;
        startPos: { x: number; y: number; };
        startPointer: { x: number; y: number; };
        axisLock: 'x' | 'y' | null;
        shiftLock: boolean;
        pointerId: number;
        mode: 'move' | 'resize' | 'anchor' | 'rotate' | 'pan';
        handleId?: string;
        startScaleK?: number;
        startCenterLogical?: { x: number; y: number; };
        startAnchorLogical?: { x: number; y: number; };
        startHandleLogical?: { x: number; y: number; };
        startDistance?: number;
        startRotationRad?: number;
        startAngle?: number;
        startCenterScreen?: { x: number; y: number; };
    } = null;
    private addedCount = 0;
    private fovInfo: FovInfo | null = null;
    // CAMERA FRAMES は水平FOV基準で固定し、フォーマット互換を保つ（垂直運用に切り替えない）。
    private lockFovAxis: 'vertical' | 'horizontal' | undefined = 'horizontal';
    private runtimeFrustum: CameraFrustum | null = null;
    private baseFovRad: number = 60 * DEG2RAD;
    private pendingNearClipGuard = 0;
    private nearClipGuardSeed: number | null = null;
    private viewportNearOverride: number | null = null;
    private viewportNearOverrideActive = false;
    private viewportNearDebounceId: number | null = null;
    private viewportNearLastSampleTs = 0;
    private viewportNearTargetSizeActive = false;
    private history: {
        begin(label: string): void;
        commit(label?: string): void;
        record(label: string, fn: () => void): void;
        debounced(label: string, fn: () => void): void;
        isApplying(): boolean;
    } | null = null;
    private applyingHistory = false;
    private viewportPoseRuntime: CameraPoseSnapshot | null = null;
    private viewportPoseRuntimeWorldDistance: number | null = null;
    private hasEnteredViewportOnce = false;
    private applyingPose = false;
    private orthoGuardActive = false;
    private uiTarget: 'viewport' | 'main' = 'viewport';
    private mainCameraSelected = false;
    private frustumDebugCache: FrustumDebugCache = {
        pose: null,
        frustum: null,
        points: null,
        version: FRUSTUM_DEBUG_CACHE_VERSION
    };
    private viewportFovRuntime: number | null = null;
    private frustumDragState: {
        pointerId: number;
        startPointer: { x: number; y: number; };
        startPose: CameraPoseSnapshot | null;
        startHit: Vec3 | null;
        planePoint: Vec3;
        planeNormal: Vec3;
        mode: 'translate' | 'rotate';
    } | null = null;

    constructor(events: Events, scene: Scene, canvasContainer: HTMLElement) {
        this.events = events;
        this.scene = scene;
        this.canvasContainer = canvasContainer;

        // overlay canvas
        this.overlay = document.createElement('canvas');
        this.overlay.id = 'camera-frames-overlay';
        this.overlayCtx = this.overlay.getContext('2d');
        this.overlay.style.position = 'absolute';
        this.overlay.style.inset = '0';
        this.overlay.style.pointerEvents = 'none'; // 初期状態では既存UI操作を阻害しない
        // WebGLキャンバスの直後に挿入してUI要素より下に配置
        const baseCanvas = canvasContainer.querySelector<HTMLCanvasElement>('#canvas');
        if (baseCanvas && baseCanvas.parentElement === canvasContainer) {
            canvasContainer.insertBefore(this.overlay, baseCanvas.nextSibling);
        } else {
            canvasContainer.appendChild(this.overlay);
        }

        this.applyCameraFramesVersionLabel();

        // initial viewport update (forces fit & center)
        this.updateViewportFromContainer();

        // observe canvas container resize (css pixels)
        this.resizeObserver = new ResizeObserver(() => {
            // Resize: always force fit & recenter to avoid losing the box
            this.updateViewportFromContainer();
            if (!this.state.enabled) {
                return;
            }
            this.requestRender();
        });
        this.resizeObserver.observe(canvasContainer);

        // hover判定で必要なときだけポインターイベントを有効化
        canvasContainer.addEventListener('pointermove', e => this.onHover(e));
        // フラスタム選択中にキャンバス外をクリックした場合の解除用フォールバック
        canvasContainer.addEventListener('pointerdown', e => this.onContainerPointerDown(e));

        // events wiring
        this.registerEvents();

        // draw each frame
        this.events.on('postrender', () => {
            this.updateViewportNearTargetSizeState();
            this.runPendingNearClipGuard();
            this.drawMainCameraFrustum();
            this.drawOverlay();
        });

        const initialBaseFov = this.scene.camera?.fov ?? this.state.renderBox.projection.baseFov ?? 60;
        this.state.renderBox.projection.baseFov = initialBaseFov;
        this.baseFovRad = initialBaseFov * DEG2RAD;
        this.rebuildBaseFrustum();
        this.viewportFovRuntime = initialBaseFov;
        this.updateFovInfo();

        this.updateFovInfo();

        this.scheduleNearClipGuard();

        // 初期化は有効化時に行う
    }

    setHistory(history: {
        begin(label: string): void;
        commit(label?: string): void;
        record(label: string, fn: () => void): void;
        debounced(label: string, fn: () => void): void;
        isApplying(): boolean;
    } | null) {
        this.history = history;
    }

    private historyBegin(label: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            return;
        }
        this.history.begin(label);
    }

    private historyCommit(label: string) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            return;
        }
        this.history.commit(label);
    }

    private historyRecord(label: string, fn: () => void) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            fn();
            return;
        }
        this.history.record(label, fn);
    }

    private historyDebounced(label: string, fn: () => void) {
        if (!this.history || this.history.isApplying() || this.applyingHistory) {
            fn();
            return;
        }
        this.history.debounced(label, fn);
    }

    private clonePoseSnapshot(pose: CameraPoseSnapshot | null | undefined): CameraPoseSnapshot | null {
        return clonePoseSnapshotCamera(pose);
    }

    private captureCameraPose(): CameraPoseSnapshot | null {
        return captureCameraPoseCamera(this.scene);
    }

    private normalizeViewportPose(pose: CameraPoseSnapshot, allowOrtho: boolean) {
        normalizeViewportPoseCamera(pose, allowOrtho);
    }

    private forceMainCameraPoseOrthoOff(pose: CameraPoseSnapshot | null) {
        if (pose) {
            pose.ortho = false;
        }
        return pose;
    }

    private normalizeMainRenderBoxProjection(baseFov?: number) {
        const fallbackFov = (typeof baseFov === 'number' && isFinite(baseFov)) ? baseFov : (this.scene.camera?.fov ?? 60);
        const raw = this.state.renderBox?.projection;
        const baseFovValue = (typeof raw?.baseFov === 'number' && isFinite(raw.baseFov)) ? raw.baseFov : fallbackFov;
        this.state.renderBox.projection = {
            type: 'perspective',
            baseFov: baseFovValue
        };
    }

    private orthoToggleAllowed() {
        return !this.state.enabled && this.uiTarget === 'viewport' && !this.scene.camera.targetSize;
    }

    private orthoBlocked() {
        return this.state.enabled;
    }

    private allowViewCube() {
        return !this.scene.camera.targetSize;
    }

    private withCameraHistorySuppressed(fn: () => void) {
        if (this.events.functions?.has('cameraHistory.suppress')) {
            this.events.invoke('cameraHistory.suppress', fn);
            return;
        }
        fn();
    }

    private refreshViewportRuntime() {
        const pose = this.captureCameraPose();
        if (!pose) {
            return;
        }
        this.viewportPoseRuntime = pose;
        this.viewportPoseRuntimeWorldDistance = (pose.navMode === 'orbit') ? this.getPoseWorldDistance(pose) : null;
        this.emitViewportLensChanged();
    }

    private applyCameraPose(pose: CameraPoseSnapshot | null | undefined, opts?: { damp?: number; silent?: boolean; allowOrtho?: boolean; }) {
        const target = this.clonePoseSnapshot(pose);
        if (!target) {
            return;
        }
        const camera = this.scene.camera;
        const allowOrtho = opts?.allowOrtho !== false;
        this.normalizeViewportPose(target, allowOrtho);
        const damping = opts?.damp ?? 0;
        const rollDamping = damping * (this.scene.config?.controls?.dampingFactor ?? 1);
        const navModeChanged = target.navMode !== camera.navMode;
        const useDamping = damping > 0 && !navModeChanged;
        this.applyingPose = true;
        try {
            this.withCameraHistorySuppressed(() => {
                if (useDamping) {
                    camera.setFocalPoint(new Vec3(target.focalPoint.x, target.focalPoint.y, target.focalPoint.z), damping);
                    camera.setAzimElev(target.azim, target.elev, damping, { dropOrtho: !target.ortho });
                    camera.setDistance(target.distance, damping);
                    if (target.navMode === 'fpv' && target.fpvPosition) {
                        camera.setPositionWorld(new Vec3(target.fpvPosition.x, target.fpvPosition.y, target.fpvPosition.z));
                    }
                    if (target.roll !== undefined) {
                        camera.rollTween.goto({ roll: target.roll }, rollDamping);
                    }
                    if (allowOrtho) {
                        camera.ortho = !!target.ortho;
                    } else {
                        camera.ortho = false;
                    }
                } else {
                    camera.docDeserialize({
                        focalPoint: target.focalPoint,
                        azim: target.azim,
                        elev: target.elev,
                        distance: target.distance,
                        roll: target.roll,
                        navMode: target.navMode,
                        fpvPosition: target.fpvPosition,
                        ortho: target.ortho
                    }, { allowOrtho, preserveNavMode: true, source: 'cameraFrames' });
                }
                if (target.navMode === 'orbit') {
                    camera.syncOrbitCache(target.distance, new Vec3(target.focalPoint.x, target.focalPoint.y, target.focalPoint.z));
                }
            });
        } finally {
            this.applyingPose = false;
        }
        if (!opts?.silent) {
            this.requestRender();
        }
    }

    private calcForwardVec(result: Vec3, azim: number, elev: number) {
        calcForwardVecCamera(result, azim, elev);
    }

    private buildCameraBasis(pose: CameraPoseSnapshot | null): CameraBasis | null {
        return buildCameraBasisCamera(this.scene, pose);
    }

    private getPoseWorldDistance(pose: CameraPoseSnapshot | null) {
        return getPoseWorldDistanceCamera(this.scene, pose);
    }

    private worldDistanceToNormalized(distance: number, pose: CameraPoseSnapshot | null) {
        return worldDistanceToNormalizedCamera(this.scene, distance, pose);
    }

    private poseToTransform(pose: CameraPoseSnapshot | null) {
        return poseToTransformCamera(this.scene, pose);
    }

    private getMainCameraTransform() {
        return this.poseToTransform(this.ensureMainCameraPose());
    }

    private ensureMainCameraPose(): CameraPoseSnapshot | null {
        if (!this.state.mainCameraPose) {
            const fallback = this.captureCameraPose();
            if (fallback) {
                this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(fallback);
            }
        }
        this.forceMainCameraPoseOrthoOff(this.state.mainCameraPose);
        return this.clonePoseSnapshot(this.state.mainCameraPose);
    }

    private canSelectMainTarget() {
        return !this.state.enabled && !!this.state.mainCameraPose && !this.scene.camera.targetSize;
    }

    private setUiTarget(target: 'viewport' | 'main') {
        const canSelectMain = this.canSelectMainTarget();
        const resolved = (target === 'main' && canSelectMain) ? 'main' : 'viewport';
        const changed = this.uiTarget !== resolved;
        const nextSelected = resolved === 'main';
        const selectionChanged = this.mainCameraSelected !== nextSelected;
        this.uiTarget = resolved;
        this.mainCameraSelected = nextSelected;
        if (changed) {
            this.events.fire('cameraFrames.uiTargetChanged', this.uiTarget);
        }
        if (selectionChanged) {
            this.requestRender();
        }
        if (resolved === 'main') {
            this.clearViewportNearOverride();
        } else if (!this.state.enabled && changed) {
            this.applyViewportNearOverride();
        }
    }

    private ensureUiTargetAvailability() {
        if (this.uiTarget === 'main' && !this.canSelectMainTarget()) {
            this.setUiTarget('viewport');
        }
    }

    private updateMainCameraPose(mutator: (pose: CameraPoseSnapshot) => void) {
        const apply = () => {
            const basePose = this.ensureMainCameraPose();
            if (!basePose) {
                this.setUiTarget('viewport');
                return;
            }
            const next = this.clonePoseSnapshot(basePose);
            if (!next) {
                return;
            }
            mutator(next);
            this.forceMainCameraPoseOrthoOff(next);
            this.state.mainCameraPose = next;
            this.frustumDebugCache.points = null;
            this.frustumDebugCache.pose = null;
            if (this.state.enabled) {
                this.applyCameraPose(this.state.mainCameraPose, { silent: true, allowOrtho: false });
                this.syncCameraFrustum();
            }
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        };
        this.historyDebounced('cameraFrames.mainCameraPose', apply);
    }

    private setMainCameraPosition(position: { x: number; y: number; z: number }) {
        this.updateMainCameraPose((pose) => {
            const worldPos = new Vec3(position.x, position.y, position.z);
            const forward = new Vec3();
            this.calcForwardVec(forward, pose.azim, pose.elev);
            if (forward.lengthSq() < 1e-6) {
                forward.set(0, 0, -1);
            } else {
                forward.normalize();
            }
            const worldDist = this.getPoseWorldDistance(pose);
            const pivot = worldPos.clone().add(forward.mulScalar(worldDist || 1));
            pose.focalPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
            if (pose.navMode === 'fpv') {
                pose.fpvPosition = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
            }
            pose.distance = this.worldDistanceToNormalized(worldDist || 1, pose);
        });
    }

    private setMainCameraRotation(rot: { yaw: number; pitch: number; roll: number; lockRoll?: boolean; }) {
        this.updateMainCameraPose((pose) => {
            const basis = this.buildCameraBasis(pose);
            const position = basis?.position ?? new Vec3(pose.focalPoint.x, pose.focalPoint.y, pose.focalPoint.z);
            const worldDist = this.getPoseWorldDistance(pose) || 1;
            const yaw = rot.yaw ?? pose.azim ?? 0;
            const pitch = Math.max(-89.9, Math.min(89.9, rot.pitch ?? pose.elev ?? 0));
            const roll = rot.lockRoll ? (pose.roll ?? 0) : (rot.roll ?? pose.roll ?? 0);
            pose.azim = yaw;
            pose.elev = pitch;
            pose.roll = roll;
            const forward = new Vec3();
            this.calcForwardVec(forward, yaw, pitch);
            if (forward.lengthSq() < 1e-6) {
                forward.set(0, 0, -1);
            } else {
                forward.normalize();
            }
            if (pose.navMode === 'orbit') {
                const pivot = position.clone().add(forward.mulScalar(worldDist));
                pose.focalPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
            } else {
                const pivot = position.clone().add(forward.mulScalar(worldDist));
                pose.focalPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
                pose.fpvPosition = pose.fpvPosition ?? { x: position.x, y: position.y, z: position.z };
            }
            pose.distance = this.worldDistanceToNormalized(worldDist, pose);
        });
    }

    private setMainCameraPose(transform: { position: { x: number; y: number; z: number; }; rotation: { yaw: number; pitch: number; roll: number; }; lockRoll?: boolean; }) {
        this.updateMainCameraPose((pose) => {
            const worldDist = this.getPoseWorldDistance(pose) || 1;
            const yaw = transform.rotation?.yaw ?? pose.azim ?? 0;
            const pitch = Math.max(-89.9, Math.min(89.9, transform.rotation?.pitch ?? pose.elev ?? 0));
            const lockRoll = transform.lockRoll ?? (transform.rotation as any)?.lockRoll;
            const roll = lockRoll ? (pose.roll ?? 0) : (transform.rotation?.roll ?? pose.roll ?? 0);
            const worldPos = new Vec3(transform.position.x, transform.position.y, transform.position.z);
            pose.azim = yaw;
            pose.elev = pitch;
            pose.roll = roll;
            const forward = new Vec3();
            this.calcForwardVec(forward, yaw, pitch);
            if (forward.lengthSq() < 1e-6) {
                forward.set(0, 0, -1);
            } else {
                forward.normalize();
            }
            const pivot = worldPos.clone().add(forward.mulScalar(worldDist));
            pose.focalPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
            pose.distance = this.worldDistanceToNormalized(worldDist, pose);
            if (pose.navMode === 'fpv') {
                pose.fpvPosition = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
            }
        });
    }

    private nudgeMainCamera(delta: { right?: number; up?: number; forward?: number; scale?: number; }) {
        this.updateMainCameraPose((pose) => {
            const basis = this.buildCameraBasis(pose);
            if (!basis) {
                return;
            }
            const dx = delta.right ?? 0;
            const dy = delta.up ?? 0;
            const dz = delta.forward ?? 0;
            const scale = delta.scale ?? 1;
            if (dx === 0 && dy === 0 && dz === 0) {
                return;
            }
            const offset = basis.right.clone().mulScalar(dx * scale);
            offset.add(basis.up.clone().mulScalar(dy * scale));
            offset.add(basis.forward.clone().mulScalar(dz * scale));
            const worldPos = basis.position.clone().add(offset);
            const worldDist = this.getPoseWorldDistance(pose) || 1;
            const forward = basis.forward.clone();
            if (forward.lengthSq() < 1e-6) {
                forward.set(0, 0, -1);
            } else {
                forward.normalize();
            }
            const pivot = worldPos.clone().add(forward.mulScalar(worldDist));
            pose.focalPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
            pose.distance = this.worldDistanceToNormalized(worldDist, pose);
            if (pose.navMode === 'fpv') {
                pose.fpvPosition = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
            }
        });
    }

    private setMainNavMode(mode: 'orbit' | 'fpv') {
        const target = mode === 'fpv' ? 'fpv' : 'orbit';
        this.updateMainCameraPose((pose) => {
            if (pose.navMode === target) {
                pose.navMode = target;
                return;
            }
            const basis = this.buildCameraBasis(pose);
            if (!basis) {
                pose.navMode = target;
                return;
            }
            if (target === 'fpv') {
                pose.navMode = 'fpv';
                pose.fpvPosition = { x: basis.position.x, y: basis.position.y, z: basis.position.z };
            } else {
                const worldDist = this.getPoseWorldDistance(pose) || 1;
                const forward = basis.forward.clone();
                if (forward.lengthSq() < 1e-6) {
                    forward.set(0, 0, -1);
                } else {
                    forward.normalize();
                }
                const pivot = basis.position.clone().add(forward.mulScalar(worldDist));
                pose.navMode = 'orbit';
                pose.focalPoint = { x: pivot.x, y: pivot.y, z: pivot.z };
                pose.distance = this.worldDistanceToNormalized(worldDist, pose);
                pose.ortho = false;
            }
        });
    }

    private setViewportOrtho(value: boolean, options?: { source?: string }) {
        if (!this.orthoToggleAllowed()) {
            return;
        }
        const camera = this.scene.camera;
        const next = !!value;
        if (next === camera.ortho) {
            return;
        }

        const currentPose = this.captureCameraPose();
        if (!currentPose) {
            return;
        }
        this.normalizeViewportPose(currentPose, true);

        if (next) {
            const worldDistRaw = (currentPose.navMode === 'orbit') ?
                this.getPoseWorldDistance(currentPose) :
                camera.getLastOrbitWorldDistance();
            const worldDist = (typeof worldDistRaw === 'number' && isFinite(worldDistRaw) && worldDistRaw > 0) ?
                worldDistRaw :
                (camera.sceneRadius || 1) * 2;
            const forward = camera.entity.forward.clone();
            if (forward.lengthSq() < 1e-6) {
                forward.set(0, 0, -1);
            } else {
                forward.normalize();
            }
            const position = camera.entity.getPosition().clone();
            const pivot = position.clone().add(forward.mulScalar(worldDist));
            const distNorm = this.worldDistanceToNormalized(worldDist, currentPose);
            camera.setFocalPoint(pivot, 0);
            camera.setDistance(distNorm, 0);
            if (currentPose.navMode !== 'orbit') {
                camera.setNavMode('orbit', { preservePose: true, source: options?.source });
            }
            camera.syncOrbitCache(distNorm, pivot);
            camera.ortho = true;
        } else {
            camera.ortho = false;
        }
    }

    private buildFrustumPoints(frustum: EffectiveFrustum | null, basis: CameraBasis): Vec3[] | null {
        return buildFrustumPointsCamera({
            frustum,
            basis,
            renderBox: this.state.renderBox,
            scene: this.scene,
            lockFovAxis: this.lockFovAxis,
            baseFovRad: this.baseFovRad,
            baseFovToHorizontalRad: (baseFovRad, axis, aspect) => this.baseFovToHorizontalRad(baseFovRad, axis, aspect),
            cropFactor: renderBox => this.cropFactor(renderBox)
        });
    }

    private isSamePose(a: CameraPoseSnapshot | null, b: CameraPoseSnapshot | null) {
        if (!a || !b) return false;
        const eq = (x: number, y: number) => Math.abs(x - y) < 1e-4;
        const fpvEq = () => {
            if (a.navMode !== 'fpv' && b.navMode !== 'fpv') return true;
            if (!a.fpvPosition || !b.fpvPosition) return false;
            return eq(a.fpvPosition.x, b.fpvPosition.x) &&
                eq(a.fpvPosition.y, b.fpvPosition.y) &&
                eq(a.fpvPosition.z, b.fpvPosition.z);
        };
        return eq(a.focalPoint.x, b.focalPoint.x) &&
            eq(a.focalPoint.y, b.focalPoint.y) &&
            eq(a.focalPoint.z, b.focalPoint.z) &&
            eq(a.azim, b.azim) &&
            eq(a.elev, b.elev) &&
            eq(a.distance, b.distance) &&
            eq(a.roll ?? 0, b.roll ?? 0) &&
            a.navMode === b.navMode &&
            (!!a.ortho === !!b.ortho) &&
            (!!a.lockFraming === !!b.lockFraming) &&
            fpvEq();
    }

    private isSameFrustum(a: EffectiveFrustum | null, b: EffectiveFrustum | null) {
        if (!a || !b) return false;
        const eq = (x: number, y: number) => Math.abs(x - y) < 1e-4;
        return eq(a.left, b.left) &&
            eq(a.right, b.right) &&
            eq(a.top, b.top) &&
            eq(a.bottom, b.bottom) &&
            eq(a.near, b.near) &&
            eq(a.far, b.far);
    }

    private getFrustumDebugPoints() {
        return getFrustumDebugPointsCamera({
            mainCameraPose: this.state.mainCameraPose,
            scene: this.scene,
            renderBox: this.state.renderBox,
            lockFovAxis: this.lockFovAxis,
            baseFovRad: this.baseFovRad,
            baseFovToHorizontalRad: (baseFovRad, axis, aspect) => this.baseFovToHorizontalRad(baseFovRad, axis, aspect),
            cropFactor: renderBox => this.cropFactor(renderBox),
            frustumDebugCache: this.frustumDebugCache,
            frustumDebugCacheVersion: FRUSTUM_DEBUG_CACHE_VERSION,
            computeEffectiveFrustum: () => this.computeEffectiveFrustum(),
            isSamePose: (a, b) => this.isSamePose(a, b),
            isSameFrustum: (a, b) => this.isSameFrustum(a, b),
            setFrustumDebugCache: (value) => {
                this.frustumDebugCache = value;
            }
        });
    }

    private drawMainCameraFrustum() {
        drawMainCameraFrustumCamera({
            stateEnabled: this.state.enabled,
            mainCameraPose: this.state.mainCameraPose,
            setMainCameraPose: (pose) => {
                this.state.mainCameraPose = pose;
            },
            scene: this.scene,
            ensureUiTargetAvailability: () => this.ensureUiTargetAvailability(),
            captureCameraPose: () => this.captureCameraPose(),
            forceMainCameraPoseOrthoOff: pose => this.forceMainCameraPoseOrthoOff(pose),
            getFrustumDebugPoints: () => this.getFrustumDebugPoints(),
            mainCameraSelected: this.mainCameraSelected,
            frustumDebugColor: FRUSTUM_DEBUG_COLOR,
            frustumSelectedColor: FRUSTUM_SELECTED_COLOR
        });
    }

    private registerEvents() {
        this.events.on('scene.elementAdded', (element: any) => {
            if (element?.type === ElementType.splat) {
                this.scheduleNearClipGuard();
                this.scheduleViewportNearOverride();
            }
        });
        this.events.on('scene.elementRemoved', (element: any) => {
            if (element?.type === ElementType.splat) {
                this.scheduleViewportNearOverride();
            }
        });
        this.events.on('scene.boundChanged', () => {
            if (!this.state.enabled) {
                this.scheduleViewportNearOverride();
                return;
            }
            this.syncCameraFrustum();
            this.requestRender();
        });

        // カメラ操作でクリップが変わった場合も追従
        this.events.on('camera.transform', () => {
            if (this.applyingPose) {
                return;
            }
            const pose = this.captureCameraPose();
            if (pose) {
                if (this.state.enabled) {
                    const playing = !!this.events.invoke('timeline.playing');
                    if (!playing) {
                        this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(pose);
                        this.frustumDebugCache.points = null;
                        this.frustumDebugCache.pose = null;
                    }
                } else {
                    this.viewportPoseRuntime = pose;
                    this.viewportPoseRuntimeWorldDistance = (pose.navMode === 'orbit') ? this.getPoseWorldDistance(pose) : null;
                    this.emitViewportLensChanged();
                }
            }
            if (!this.state.enabled) {
                this.emitViewportLensChanged();
                this.scheduleViewportNearOverride();
                return;
            }
            this.syncCameraFrustum();
        });
        this.events.on('camera.navMode', () => {
            if (this.applyingPose) {
                return;
            }
            if (this.state.enabled) {
                return;
            }
            this.refreshViewportRuntime();
        });
        this.events.on('camera.ortho', (value: boolean) => {
            if (this.applyingPose) {
                return;
            }
            if (value && this.orthoBlocked()) {
                if (this.orthoGuardActive) {
                    return;
                }
                this.orthoGuardActive = true;
                try {
                    this.withCameraHistorySuppressed(() => {
                        this.scene.camera.ortho = false;
                    });
                } finally {
                    this.orthoGuardActive = false;
                }
                return;
            }
            if (!this.state.enabled) {
                if (value && this.scene.camera.navMode === 'fpv') {
                    this.scene.camera.setNavMode('orbit', { preservePose: true, source: 'cameraFrames' });
                }
                this.refreshViewportRuntime();
                if (value) {
                    this.clearViewportNearOverride();
                } else {
                    this.scheduleViewportNearOverride(0);
                }
            }
        });
        this.events.on('scene.clear', () => {
            this.state.mainCameraPose = null;
            this.viewportPoseRuntime = null;
            this.viewportPoseRuntimeWorldDistance = null;
            this.hasEnteredViewportOnce = !this.state.enabled;
            this.setUiTarget('viewport');
            this.frustumDragState = null;
            this.frustumDebugCache = {
                pose: null,
                frustum: null,
                points: null,
                version: FRUSTUM_DEBUG_CACHE_VERSION
            };
            this.clearViewportNearOverride();
        });

        // enable / disable
        this.events.function('cameraFrames.enabled', () => this.state.enabled);
        this.events.on('cameraFrames.setEnabled', (value: boolean) => this.setEnabled(value));
        this.events.on('cameraFrames.toggleEnabled', () => this.setEnabled(!this.state.enabled));
        this.events.function('cameraFrames.viewportLens', () => this.getViewportLensState());
        this.events.on('cameraFrames.setViewportLens', (mm: number) => this.setViewportLensMm(mm));
        this.events.function('cameraFrames.uiTarget', () => this.uiTarget);
        this.events.function('cameraFrames.uiTargetAvailability', () => ({
            uiTarget: this.uiTarget,
            canSelectMain: this.canSelectMainTarget()
        }));
        this.events.on('cameraFrames.setUiTarget', (target: 'viewport' | 'main') => {
            this.setUiTarget(target);
            this.updatePointerFromLast();
        });
        this.events.function('cameraFrames.mainTransform', () => this.getMainCameraTransform());
        this.events.function('cameraFrames.orthoToggleAllowed', () => this.orthoToggleAllowed());
        this.events.function('cameraFrames.orthoBlocked', () => this.orthoBlocked());
        this.events.function('cameraFrames.allowViewCube', () => this.allowViewCube());
        this.events.on('cameraFrames.setViewportOrtho', (value: boolean, options?: { source?: string }) => {
            this.setViewportOrtho(value, options);
        });

        // 提供: 現在のレンダーボックスに基づくアスペクトロック情報
        this.events.function('cameraFrames.aspectLock', () => {
            if (!this.state.enabled) {
                return null;
            }
            // 引数 false (fitScale更新なし) で呼び出す。
            // 内部で targetSize をチェックするため、書き出し時には正しい出力用Rectが計算される。
            const mapping = this.computeViewportMapping(false);
            const aspect = mapping.logicalW / mapping.logicalH;
            return {
                aspect,
                logicalW: mapping.logicalW,
                logicalH: mapping.logicalH,
                rectNorm: mapping.rectNorm,
                rectPx: mapping.rectPx,
                rectNormRaw: mapping.rectNormRaw,
                rectPxRaw: mapping.rectPxRaw
            };
        });

        // 提供: レンダーボックスのビューポート情報（アンカー含む）
        this.events.function('cameraFrames.viewportMapping', () => {
            if (!this.state.enabled) {
                return null;
            }
            const mapping = this.computeViewportMapping(false);
            return {
                ...mapping,
                anchor: this.state.renderBox.anchor
            };
        });

        // 提供: View Zoom / View Scale (CAMERA FRAMES 有効時のみ)
        this.events.function('cameraFrames.viewZoom', () => {
            if (!this.state.enabled) {
                return null;
            }
            const mapping = this.computeViewportMapping(false);
            const rb = this.state.renderBox;
            const zoomPct = this.normalizeViewZoomPct(rb.viewZoomPct);
            return {
                viewScale: mapping.viewScale,
                viewZoomPct: zoomPct
            };
        });

        // 提供: グリッド用フラスタム / ビューポート情報（CAMERA FRAMES 有効時のみ）
        this.events.function('cameraFrames.gridViewportInfo', () => {
            if (!this.state.enabled) {
                return null;
            }
            const mapping = this.computeViewportMapping(false);
            // effective frustum (render box基準)
            const rbFrustum = this.computeEffectiveFrustum();
            // previewか書き出しかでviewportを切り替え
            const targetSize = this.scene.camera.targetSize;
            const vw = targetSize ? targetSize.width : this.viewport.vw;
            const vh = targetSize ? targetSize.height : this.viewport.vh;

            // 最終的に camera.setCustomFrustum に渡しているのは syncCameraFrustum の戻り値
            // ここでは外挿後のフラスタム（画面全体をカバーするもの）を計算し直す
            let finalFrustum = rbFrustum;
            if (rbFrustum && mapping && vw > 0 && vh > 0) {
                const rbW = rbFrustum.right - rbFrustum.left;
                const rbH = rbFrustum.top - rbFrustum.bottom;
                const pxToWorldX = mapping.rectPxRaw.w > 0 ? rbW / mapping.rectPxRaw.w : 0;
                const pxToWorldY = mapping.rectPxRaw.h > 0 ? rbH / mapping.rectPxRaw.h : 0;
                if (pxToWorldX > 0 && pxToWorldY > 0) {
                    const left = rbFrustum.left - mapping.rectPxRaw.x * pxToWorldX;
                    const right = left + vw * pxToWorldX;
                    const top = rbFrustum.top + mapping.rectPxRaw.y * pxToWorldY;
                    const bottom = top - vh * pxToWorldY;
                    finalFrustum = {
                        ...rbFrustum,
                        left,
                        right,
                        bottom,
                        top
                    };
                }
            }

            return {
                rectPxRaw: { x: 0, y: 0, w: vw, h: vh },
                viewport: { vw, vh },
                frustum: finalFrustum
            };
        });

        // 提供: FOV / 35mm換算情報
        this.events.function('cameraFrames.fovInfo', () => this.fovInfo ?? this.calcFovInfo());

        // near clip override (CAMERA FRAMES 有効時にのみ適用)
        this.events.function('cameraFrames.nearClip', () => this.state.nearClip ?? null);
        this.events.on('cameraFrames.setNearClip', (value: number | null) => this.setNearClip(value));

        // main camera pose editing (CAMERA FRAMES OFF 時の UI ターゲット切替で使用)
        this.events.on('cameraFrames.setMainCameraPosition', (pos: { x: number; y: number; z: number }) => this.setMainCameraPosition(pos));
        this.events.on('cameraFrames.setMainCameraRotation', (rot: { yaw: number; pitch: number; roll: number; lockRoll?: boolean; }) => this.setMainCameraRotation(rot));
        this.events.on('cameraFrames.setMainCameraPose', (transform: { position: { x: number; y: number; z: number; }; rotation: { yaw: number; pitch: number; roll: number; }; lockRoll?: boolean; }) => this.setMainCameraPose(transform));
        this.events.on('cameraFrames.nudgeMainCamera', (delta: { right?: number; up?: number; forward?: number; scale?: number; }) => this.nudgeMainCamera(delta));
        this.events.on('cameraFrames.setMainNavMode', (mode: 'orbit' | 'fpv') => this.setMainNavMode(mode));

        // render box scale and anchor
        this.events.on('cameraFrames.setScalePct', (values: { x?: number; y?: number }) => {
            const x = values.x ?? this.state.renderBox.scalePct.x;
            const y = values.y ?? this.state.renderBox.scalePct.y;
            this.setRenderBoxScale(x, y);
        });
        this.events.on('cameraFrames.setAnchor', (anchor: { ax: 0 | 0.5 | 1; ay: 0 | 0.5 | 1 }) => {
            const rb = this.state.renderBox;
            const prev = rb.anchor;
            if (prev.ax === anchor.ax && prev.ay === anchor.ay) {
                return;
            }

            this.historyRecord('cameraFrames.anchor', () => {
                rb.anchor = anchor;
                // アンカー変更は「次の拡縮用の基準点」を差し替えるだけとし、
                // 現在のフラスタム／表示を変えない（v4: 構図維持）
                this.requestRender(); // UI/オーバーレイだけ更新
                this.events.fire('cameraFrames.stateChanged', this.snapshot());
            });
        });

        // view zoom
        this.events.on('cameraFrames.setViewZoomPct', (pct: number) => {
            this.setViewZoomPct(pct);
        });

        // frames
        this.events.on('cameraFrames.addFrame', () => this.addFrame());
        this.events.on('cameraFrames.deleteSelected', () => this.deleteSelectedFrame());
        this.events.on('cameraFrames.selectFrame', (id: string | null) => this.selectFrame(id));
        this.events.on('cameraFrames.setFrameScale', (data: { id: string; scalePct: number }) => {
            this.setFrameScale(data.id, data.scalePct);
        });
        this.events.on('cameraFrames.setEqFovMm', (eqMm: number) => {
            this.setEqFovMm(eqMm);
        });

        // mask
        this.events.on('cameraFrames.setMask', (mask: Partial<FrameMaskState>) => {
            this.historyRecord('cameraFrames.mask', () => {
                const nextScope = Object.prototype.hasOwnProperty.call(mask ?? {}, 'scope') ?
                    normalizeMaskScope(mask.scope, this.state.mask.scope ?? 'all') :
                    normalizeMaskScope(this.state.mask.scope ?? 'all');
                this.state.mask = {
                    ...this.state.mask,
                    ...mask,
                    scope: nextScope
                };
                this.requestRender();
                this.events.fire('cameraFrames.stateChanged', this.snapshot());
            });
        });

        // export settings
        this.events.on('cameraFrames.setExportName', (name: string) => {
            const value = (name ?? '').toString();
            if (this.state.exportName === value) return;
            this.state.exportName = value;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        this.events.on('cameraFrames.setExportFormat', (format: ExportFormat) => {
            const next = this.normalizeFormat(format);
            if (this.state.exportFormat === next) return;
            this.state.exportFormat = next;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        this.events.on('cameraFrames.setExportGridOverlay', (value: boolean) => {
            const next = !!value;
            if (this.state.exportGridOverlay === next) return;
            this.state.exportGridOverlay = next;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        this.events.on('cameraFrames.setExportModelLayers', (value: boolean) => {
            const next = !!value;
            if (this.state.exportModelLayers === next) return;
            this.state.exportModelLayers = next;
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });

        // overlay解除（UI操作時に安全側で無効化）
        this.events.on('cameraFrames.overlay.release', () => {
            this.overlay.style.pointerEvents = 'none';
        });

        // render output
        this.events.function('cameraFrames.render', async (options?: { format?: ExportFormat; filename?: string }) => {
            if (!this.state.enabled) {
                return;
            }
            await renderImage({
                events: this.events,
                scene: this.scene,
                getState: () => this.state,
                applyCameraPose: (pose, opts) => this.applyCameraPose(pose, opts),
                normalizeFormat: format => this.normalizeFormat(format),
                resolveFilename: (name, format) => this.resolveFilename(name, format),
                renderFrameOverlay: (width, height) => this.renderFrameOverlay(width, height),
                renderFrameOverlaysByManagement: (width, height) => this.renderFrameOverlaysByManagement(width, height),
                getCompressor: () => this.getCompressor(),
                requestRender: () => this.requestRender(),
                syncCameraFrustum: () => this.syncCameraFrustum(),
                clearViewportNearOverride: () => this.clearViewportNearOverride(),
                options
            });
        });

        // doc serialize / deserialize
        this.events.function('docSerialize.cameraFrames', () => {
            return this.serialize();
        });

        this.events.function('docDeserialize.cameraFrames', (docState: any) => {
            this.deserialize(docState);
        });

        // camera fov -> update fov info
        this.events.on('camera.fov', (value?: number) => {
            const currentFov = (typeof value === 'number' && isFinite(value)) ? value : this.events.invoke('camera.fov');
            if (!this.state.enabled) {
                if (typeof currentFov === 'number' && isFinite(currentFov)) {
                    this.viewportFovRuntime = currentFov;
                }
                this.updateFovInfo();
                return;
            }
            if (typeof currentFov === 'number' && isFinite(currentFov)) {
                const projection = this.state.renderBox.projection ?? { type: 'perspective' as const };
                projection.baseFov = currentFov;
                this.state.renderBox.projection = projection;
                this.rebuildBaseFrustum();
                if (this.state.enabled) {
                    this.syncCameraFrustum();
                }
            }
            this.updateFovInfo();
        });

        // camera resize -> just update viewport-based overlay
        this.events.on('camera.resize', () => {
            if (!this.state.enabled) {
                return;
            }
            // Scene camera resize event: update viewport and refit based on the new size
            this.updateViewportFromContainer();
            this.requestRender();
        });

        // モデルロード直後など、強制リフレッシュ要求に応じてビューポートを再計算する
        this.events.on('cameraFrames.forceRefreshViewport', () => {
            this.updateViewportFromContainer();
            this.requestRender();
        });

        // Undo / Redo 適用後に UI を最新状態へ同期
        this.events.on('edit.apply', (op: any) => {
            if (!op?.name || typeof op.name !== 'string') {
                return;
            }
            if (!op.name.startsWith('cameraFrames')) {
                return;
            }
            // 履歴適用直後の状態を通知してパネル数値を更新
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private normalizeFormat(format?: ExportFormat): ExportFormat {
        return format === 'psd' ? 'psd' : 'png';
    }

    private resolveFilename(name: string | undefined, format: ExportFormat) {
        const fallback = 'cf-output';
        const trimmed = name?.trim();
        const base = trimmed && trimmed.length > 0 ? trimmed : fallback;
        const hasExtension = /\.[^./\\]+$/.test(base);
        return hasExtension ? base : `${base}.${format}`;
    }

    private updateViewportFromContainer() {
        if (!this.canvasContainer) return;
        const rect = this.canvasContainer.getBoundingClientRect();
        const newVw = rect.width;
        const newVh = rect.height;

        if (newVw !== this.viewport.vw || newVh !== this.viewport.vh) {
            this.viewport = { vw: newVw, vh: newVh };

            const dpr = window.devicePixelRatio || 1;
            this.overlay.width = Math.max(1, Math.floor(newVw * dpr));
            this.overlay.height = Math.max(1, Math.floor(newVh * dpr));
            this.overlay.style.width = `${newVw}px`;
            this.overlay.style.height = `${newVh}px`;
            const ctx = this.overlayCtx;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
        }

        // viewport が変わったらフィットと rect を再計算
        this.computeViewportMapping(true);
        if (this.state.enabled) {
            this.syncCameraFrustum();
        }
    }

    private initDefaultsIfNeeded() {
        const { vw, vh } = this.viewport;
        const renderBox = this.state.renderBox;

        // center が未セット（初期値）ならビューポート中央で初期化
        if (renderBox.center.cx === 0 && renderBox.center.cy === 0) {
            renderBox.center = { cx: vw / 2, cy: vh / 2 };
        }

        renderBox.viewZoomPct = this.normalizeViewZoomPct(renderBox.viewZoomPct);
        if (!isFinite(renderBox.fitScale) || renderBox.fitScale <= 0) {
            const logicalW = renderBox.baseSize.w * renderBox.scale.kx;
            const logicalH = renderBox.baseSize.h * renderBox.scale.ky;
            renderBox.fitScale = Math.min(
                vw > 0 ? vw / logicalW : 1,
                vh > 0 ? vh / logicalH : 1
            );
        }
        // 初期化時は現ビューポート基準でフィットを再計算
        this.computeViewportMapping(true);

        // フレーム未生成ならデフォルト 1 枚を追加（非選択）
        if (this.state.frames.length === 0) {
            this.addFrame(false);
        }
    }

    private setEnabled(value: boolean) {
        this.historyRecord('cameraFrames.enabled', () => {
            if (value === this.state.enabled) return;
            this.clearViewportNearOverride();
            const currentPose = this.captureCameraPose();
            this.normalizeMainRenderBoxProjection(this.scene.camera.fov);

            this.setUiTarget('viewport');
            if (value) {
                // OFF -> ON
                this.viewportPoseRuntime = this.clonePoseSnapshot(currentPose);
                this.viewportPoseRuntimeWorldDistance = (this.viewportPoseRuntime?.navMode === 'orbit') ? this.getPoseWorldDistance(this.viewportPoseRuntime) : null;
                if (this.viewportFovRuntime === null || this.viewportFovRuntime === undefined) {
                    const currentFov = this.events.invoke('camera.fov');
                    if (typeof currentFov === 'number' && isFinite(currentFov)) {
                        this.viewportFovRuntime = currentFov;
                    }
                }
                if (!this.state.mainCameraPose) {
                    this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(currentPose));
                }
                this.forceMainCameraPoseOrthoOff(this.state.mainCameraPose);
                this.frustumDragState = null;
                this.state.enabled = true;
                // CAMERA FRAMES 有効時はカメラフレーミングと水平画角をロック
                this.events.fire('camera.setLockFraming', true);
                this.events.fire('camera.setLockFovAxis', this.lockFovAxis ?? 'horizontal');
                this.overlay.style.pointerEvents = 'none';
                const poseToApply = this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(this.state.mainCameraPose ?? currentPose));
                if (poseToApply) {
                    // フラスタム同期前にポーズを適用
                    this.applyCameraPose(poseToApply, { silent: true, allowOrtho: false });
                }
                this.withCameraHistorySuppressed(() => {
                    this.scene.camera.ortho = false;
                });
                const mainFov = this.state.renderBox.projection?.baseFov ?? this.scene.camera.fov;
                if (typeof mainFov === 'number' && isFinite(mainFov)) {
                    this.state.renderBox.projection.baseFov = mainFov;
                    this.withCameraHistorySuppressed(() => {
                        this.events.fire('camera.setFov', mainFov);
                    });
                }
                // ニアクリップの初期値を現在のカメラから引き継ぎ、固定値として適用
                const baseNear = (this.state.nearClip === null || this.state.nearClip === undefined) ?
                    DEFAULT_NEAR_CLIP :
                    this.state.nearClip;
                this.state.nearClip = this.computeSafeNearClip(baseNear);
                this.applyNearClipOverride();
                this.initDefaultsIfNeeded();
                // 有効化時は現ビューポートに合わせてフィットを再計算
                this.computeViewportMapping(true);
                this.rebuildBaseFrustum();
                this.syncCameraFrustum();
                this.requestRender();
                this.scheduleNearClipGuard();
                this.emitViewportLensChanged();
            } else {
                // ON -> OFF
                if (currentPose) {
                    this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(currentPose));
                }
                this.state.enabled = false;
                // 復元のため、viewport pose 適用前にフレーミングロックを解除しておく（orbit の揺れ抑止）
                this.events.fire('camera.setLockFraming', false);
                // ビューポート表示用にフラスタムを再計算しておく
                this.rebuildBaseFrustum();
                this.frustumDebugCache.points = null;
                this.frustumDebugCache.pose = null;
                // 無効化時はニアクリップ固定を解除
                this.events.fire('camera.setNearOverride', null);
                this.events.fire('camera.setCustomFrustum', null);
                this.events.fire('camera.setLockFovAxis', undefined);
                this.overlay.style.pointerEvents = 'none';
                this.frustumDragState = null;
                if (this.viewportFovRuntime === null || this.viewportFovRuntime === undefined) {
                    const currentFov = this.events.invoke('camera.fov');
                    if (typeof currentFov === 'number' && isFinite(currentFov)) {
                        this.viewportFovRuntime = currentFov;
                    }
                }
                const vpFov = this.viewportFovRuntime ?? this.events.invoke('camera.fov');
                if (typeof vpFov === 'number' && isFinite(vpFov)) {
                    this.withCameraHistorySuppressed(() => {
                        this.events.fire('camera.setFov', vpFov);
                    });
                }
                if (!this.state.mainCameraPose) {
                    this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(currentPose));
                }
                // ビューポート用ポーズがあれば戻す
                const isFirstViewportEntry = !this.hasEnteredViewportOnce;
                this.hasEnteredViewportOnce = true;

                let viewportPose = this.clonePoseSnapshot(this.viewportPoseRuntime);
                if (isFirstViewportEntry && currentPose) {
                    const initPose = this.clonePoseSnapshot(currentPose);
                    if (initPose) {
                        initPose.lockFraming = false;
                        this.viewportPoseRuntime = initPose;
                        this.viewportPoseRuntimeWorldDistance = (initPose.navMode === 'orbit') ? this.getPoseWorldDistance(currentPose) : null;
                        viewportPose = this.clonePoseSnapshot(this.viewportPoseRuntime);
                    }
                }
                if (!viewportPose && currentPose) {
                    // undo/load 等で runtime pose が失われた場合は、少なくとも視点が崩れないよう現 pose を確保する
                    const fallbackPose = this.clonePoseSnapshot(currentPose);
                    if (fallbackPose) {
                        fallbackPose.lockFraming = false;
                        this.viewportPoseRuntime = fallbackPose;
                        this.viewportPoseRuntimeWorldDistance = (fallbackPose.navMode === 'orbit') ? this.getPoseWorldDistance(currentPose) : null;
                    } else {
                        this.viewportPoseRuntime = null;
                        this.viewportPoseRuntimeWorldDistance = null;
                    }
                    viewportPose = this.clonePoseSnapshot(this.viewportPoseRuntime);
                }
                if (viewportPose) {
                    const worldDistance = this.viewportPoseRuntimeWorldDistance;
                    if (viewportPose.navMode === 'orbit' && typeof worldDistance === 'number' && isFinite(worldDistance) && worldDistance > 0) {
                        viewportPose.lockFraming = false;
                        viewportPose.distance = this.worldDistanceToNormalized(worldDistance, viewportPose);
                    }
                    this.applyCameraPose(viewportPose, { silent: true, allowOrtho: true });
                }
                // 無効化中は追従ロジックを停止するが状態は保持
                this.requestRender();
                this.emitViewportLensChanged();
                this.applyViewportNearOverride();
            }
            this.events.fire('cameraFrames.enabled', this.state.enabled);
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updateFovInfo();
            this.frustumDebugCache.points = null;
            this.frustumDebugCache.pose = null;
        });
    }

    private applyNearClipOverride() {
        applyNearClipOverrideCamera({
            stateEnabled: this.state.enabled,
            nearClip: this.state.nearClip,
            events: this.events
        });
    }

    private setNearClip(value: number | null, suppressHistory = false) {
        setNearClipCamera({
            value,
            suppressHistory,
            getStateEnabled: () => this.state.enabled,
            getUiTarget: () => this.uiTarget,
            getNearClip: () => this.state.nearClip,
            setNearClipState: (next) => {
                this.state.nearClip = next;
            },
            applyNearClipOverride: () => this.applyNearClipOverride(),
            rebuildBaseFrustum: () => this.rebuildBaseFrustum(),
            syncCameraFrustum: () => this.syncCameraFrustum(),
            requestRender: () => this.requestRender(),
            events: this.events,
            snapshot: () => this.snapshot(),
            historyDebounced: (label, fn) => this.historyDebounced(label, fn),
            invalidateFrustumDebugCache: () => {
                this.frustumDebugCache.points = null;
                this.frustumDebugCache.pose = null;
            }
        });
    }

    private computeSafeNearClip(value: number | null | undefined) {
        return computeSafeNearClipCamera(value);
    }

    private updateViewportNearTargetSizeState() {
        updateViewportNearTargetSizeStateCamera({
            scene: this.scene,
            viewportNearTargetSizeActive: this.viewportNearTargetSizeActive,
            setViewportNearTargetSizeActive: (value) => {
                this.viewportNearTargetSizeActive = value;
            },
            clearViewportNearOverride: () => this.clearViewportNearOverride(),
            scheduleViewportNearOverride: delayMs => this.scheduleViewportNearOverride(delayMs)
        });
    }

    private shouldApplyViewportNearOverride() {
        return shouldApplyViewportNearOverrideCamera({
            stateEnabled: this.state.enabled,
            uiTarget: this.uiTarget,
            scene: this.scene
        });
    }

    private clearViewportNearOverride() {
        clearViewportNearOverrideCamera({
            viewportNearDebounceId: this.viewportNearDebounceId,
            setViewportNearDebounceId: (value) => {
                this.viewportNearDebounceId = value;
            },
            viewportNearOverrideActive: this.viewportNearOverrideActive,
            setViewportNearOverrideActive: (value) => {
                this.viewportNearOverrideActive = value;
            },
            viewportNearOverride: this.viewportNearOverride,
            setViewportNearOverride: (value) => {
                this.viewportNearOverride = value;
            },
            events: this.events
        });
    }

    private scheduleViewportNearOverride(delayMs = 200) {
        scheduleViewportNearOverrideCamera({
            delayMs,
            shouldApplyViewportNearOverride: () => this.shouldApplyViewportNearOverride(),
            viewportNearDebounceId: this.viewportNearDebounceId,
            setViewportNearDebounceId: (value) => {
                this.viewportNearDebounceId = value;
            },
            applyViewportNearOverride: () => this.applyViewportNearOverride()
        });
    }

    private applyViewportNearOverride() {
        applyViewportNearOverrideCamera({
            shouldApplyViewportNearOverride: () => this.shouldApplyViewportNearOverride(),
            viewportNearLastSampleTs: this.viewportNearLastSampleTs,
            setViewportNearLastSampleTs: (value) => {
                this.viewportNearLastSampleTs = value;
            },
            computeViewportNearCandidate: () => this.computeViewportNearCandidate(),
            viewportNearOverride: this.viewportNearOverride,
            setViewportNearOverride: (value) => {
                this.viewportNearOverride = value;
            },
            viewportNearOverrideActive: this.viewportNearOverrideActive,
            setViewportNearOverrideActive: (value) => {
                this.viewportNearOverrideActive = value;
            },
            clearViewportNearOverride: () => this.clearViewportNearOverride(),
            events: this.events
        });
    }

    private computeViewportNearCandidate(): number | null {
        return computeViewportNearCandidateCamera({ scene: this.scene });
    }

    private enforceSafeNearClip() {
        enforceSafeNearClipCamera({
            stateEnabled: this.state.enabled,
            nearClipGuardSeed: this.nearClipGuardSeed,
            nearClip: this.state.nearClip,
            events: this.events,
            setNearClip: (value, suppressHistory) => this.setNearClip(value, suppressHistory)
        });
    }

    private scheduleNearClipGuard(frames = 2) {
        scheduleNearClipGuardCamera({
            frames,
            nearClip: this.state.nearClip,
            pendingNearClipGuard: this.pendingNearClipGuard,
            setPendingNearClipGuard: (value) => {
                this.pendingNearClipGuard = value;
            },
            setNearClipGuardSeed: (value) => {
                this.nearClipGuardSeed = value;
            }
        });
    }

    private runPendingNearClipGuard() {
        runPendingNearClipGuardCamera({
            stateEnabled: this.state.enabled,
            pendingNearClipGuard: this.pendingNearClipGuard,
            setPendingNearClipGuard: (value) => {
                this.pendingNearClipGuard = value;
            },
            enforceSafeNearClip: () => this.enforceSafeNearClip()
        });
    }

    private setRenderBoxScale(xPct: number, yPct: number) {
        this.historyDebounced('cameraFrames.renderBoxScale', () => {
            const rb = this.state.renderBox;
            const baseW = rb.baseSize.w;
            const baseH = rb.baseSize.h;

            const oldKx = rb.scale.kx;
            const oldKy = rb.scale.ky;

            // 元の論理サイズと center（仮想スクリーン座標）
            const logicalW0 = baseW * oldKx;
            const logicalH0 = baseH * oldKy;
            const cx0 = rb.center.cx;
            const cy0 = rb.center.cy;

            // スケール変更前のフレーム中心（仮想スクリーン上の論理座標）を保存
            const frameCentersLogical = new Map<string, { x: number; y: number }>();
            for (const f of this.state.frames) {
                const gx = cx0 + (f.pos.x - 0.5) * logicalW0;
                const gy = cy0 + (f.pos.y - 0.5) * logicalH0;
                frameCentersLogical.set(f.id, { x: gx, y: gy });
            }

            // --- スケール値のクランプ（100%以上 ＆ 各軸16000px以下） ---
            const MIN_PCT = 100;
            const MAX_DIM = 16000;

            const maxPctX = baseW > 0 ? Math.floor((MAX_DIM / baseW) * 100) : MIN_PCT;
            const maxPctY = baseH > 0 ? Math.floor((MAX_DIM / baseH) * 100) : MIN_PCT;

            const newPctX = Math.min(maxPctX, Math.max(MIN_PCT, xPct));
            const newPctY = Math.min(maxPctY, Math.max(MIN_PCT, yPct));

            const newKx = newPctX / 100;
            const newKy = newPctY / 100;

            if (Math.abs(newKx - oldKx) < 1e-6 && Math.abs(newKy - oldKy) < 1e-6) {
                return;
            }

            // --- 新しいレンダーボックス矩形をアンカー基準で計算 ---
            const logicalW1 = baseW * newKx;
            const logicalH1 = baseH * newKy;

            const { ax, ay } = rb.anchor;

            const left0 = cx0 - logicalW0 * 0.5;
            const top0 = cy0 - logicalH0 * 0.5;
            const anchorX = left0 + ax * logicalW0;
            const anchorY = top0 + ay * logicalH0;

            const left1 = anchorX - ax * logicalW1;
            const top1 = anchorY - ay * logicalH1;
            const cx1 = left1 + logicalW1 * 0.5;
            const cy1 = top1 + logicalH1 * 0.5;

            rb.scalePct = { x: newPctX, y: newPctY };
            rb.scale = { kx: newKx, ky: newKy };
            rb.center = { cx: cx1, cy: cy1 };

            // 変更中: アンカー基準で変形しつつ、fitScale は維持する
            // これにより、ドラッグ中はアンカー位置が固定され、そこを中心に拡大縮小する自然な挙動になる
            this.computeViewportMapping(true);
            this.syncCameraFrustum();

            // --- フレームの pos を更新して、論理中心を元と同じに保つ ---
            for (const f of this.state.frames) {
                const c = frameCentersLogical.get(f.id);
                if (!c) continue;
                // 更新された rb.center (cx1, cy1) を使用する
                f.pos = {
                    x: 0.5 + (c.x - cx1) / logicalW1,
                    y: 0.5 + (c.y - cy1) / logicalH1
                };
            }

            if (this.state.enabled) {
                // 現在のレンダーボックス比率でカメラのアスペクトを再適用
                this.events.fire('camera.setLockFraming', true);
            }

            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updateFovInfo();
        });
    }

    private setViewZoomPct(viewZoomPct: number) {
        this.historyDebounced('cameraFrames.viewZoom', () => {
            const rb = this.state.renderBox;
            const clamped = this.normalizeViewZoomPct(viewZoomPct);
            if (rb.viewZoomPct === clamped) {
                return;
            }
            rb.viewZoomPct = clamped;
            this.computeViewportMapping(false);
            this.syncCameraFrustum();
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        });
    }

    private setEqFovMm(eqMm: number) {
        this.historyDebounced('cameraFrames.fov', () => {
            const info = this.calcFovInfo();
            const crop = info.crop;
            const minMm = info.minEqMm;
            const maxMm = info.maxEqMm;
            const clampedMm = Math.min(maxMm, Math.max(minMm, eqMm));
            const targetHfovDeg = clampFov(this.eqMmToHfov(clampedMm, crop));
            const targetHfovRad = targetHfovDeg * DEG2RAD;
            const axisFovDeg = this.horizontalRadToAxisDeg(targetHfovRad);
            const projection = this.state.renderBox.projection ?? { type: 'perspective' as const };
            projection.baseFov = axisFovDeg;
            this.state.renderBox.projection = projection;
            this.rebuildBaseFrustum();
            this.syncCameraFrustum();
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updateFovInfo();
        });
    }

    private addFrame(select = true) {
        this.historyRecord('cameraFrames.addFrame', () => {
            const frames = this.state.frames;
            if (frames.length >= 20) {
                console.warn('cameraFrames: maximum 20 frames reached');
                return;
            }
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const id = letters[this.addedCount % letters.length] ?? `Frame ${this.addedCount + 1}`;
            this.addedCount++;
            const order = frames.reduce((m, f) => Math.max(m, f.order), -1) + 1;
            const pos = { x: 0.5, y: 0.5 };
            const frame: FrameState = {
                id,
                pos,
                scalePct: 100,
                scaleK: 1,
                baseSize: { ...DEFAULT_FRAME_BASE },
                order,
                rotationDeg: 0,
                anchor: { ...pos }
            };
            frames.push(frame);
            if (select) {
                this.selectFrame(id);
            }
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
        });
    }

    private deleteSelectedFrame() {
        this.historyRecord('cameraFrames.deleteFrame', () => {
            if (!this.selectedId) return;
            this.state.frames = this.state.frames.filter(f => f.id !== this.selectedId);
            this.selectedId = this.state.frames.length ? this.state.frames[this.state.frames.length - 1].id : null;
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private selectFrame(id: string | null) {
        this.historyRecord('cameraFrames.selectFrame', () => {
            this.selectedId = id;
            this.state.frames.forEach((f) => {
                f.selected = f.id === id;
            });
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private setFrameScale(id: string, scalePct: number) {
        this.historyRecord('cameraFrames.frameScale', () => {
            const frame = this.state.frames.find(f => f.id === id);
            if (!frame) return;
            const MIN_PCT = 10;
            const MAX_PCT = 400;
            const clamped = Math.min(MAX_PCT, Math.max(MIN_PCT, scalePct));
            frame.scalePct = clamped;
            frame.scaleK = frame.scalePct / 100;
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
        });
    }

    private requestRender() {
        this.scene.forceRender = true;
    }

    private logicalToScreen(x: number, y: number) {
        const mapping = this.computeViewportMapping();
        return logicalToScreenViewport(x, y, this.state.renderBox, mapping);
    }

    private screenToLogical(px: number, py: number) {
        const mapping = this.computeViewportMapping();
        return screenToLogicalViewport(px, py, this.state.renderBox, mapping);
    }

    private normalizeViewZoomPct(value?: number) {
        const raw = (typeof value === 'number' && isFinite(value)) ? value : MAX_VIEW_ZOOM_PCT;
        return Math.min(MAX_VIEW_ZOOM_PCT, Math.max(MIN_VIEW_ZOOM_PCT, raw));
    }

    // 毎回状態から再計算し、ズームやスケールの累積誤差を持たせない。
    // camera.targetSize が設定されている間だけ書き出しモードの 1:1 計算に切り替わる。
    private computeViewportMapping(updateFitScale: boolean = false): ViewportMapping {
        return computeViewportMappingViewport(
            this.state.renderBox,
            this.viewport,
            this.scene.camera.targetSize,
            updateFitScale,
            (value?: number) => this.normalizeViewZoomPct(value)
        );
    }

    private cropFactor(renderBox: RenderBoxState) {
        // 基準: デフォルトフレーム (1536px) に対するレンダーボックス基準幅
        const rbW = renderBox.baseSize.w || 1;
        const frameW = DEFAULT_FRAME_BASE.w;
        const crop = rbW / frameW;
        return isFinite(crop) && crop > 0 ? crop : 1;
    }

    private baseAspect() {
        return DEFAULT_FRAME_BASE.w / DEFAULT_FRAME_BASE.h;
    }

    private baseFovToHorizontalRad(baseFovRad: number, axis: 'horizontal' | 'vertical', aspect: number) {
        if (axis === 'vertical') {
            return 2 * Math.atan(Math.tan(baseFovRad * 0.5) * aspect);
        }
        return baseFovRad;
    }

    private horizontalRadToAxisDeg(horizontalRad: number) {
        const aspect = this.baseAspect();
        if ((this.lockFovAxis ?? 'horizontal') === 'vertical') {
            const vertical = 2 * Math.atan(Math.tan(horizontalRad * 0.5) / aspect);
            return vertical * RAD2DEG;
        }
        return horizontalRad * RAD2DEG;
    }

    private rebuildBaseFrustum() {
        rebuildBaseFrustumCamera({
            renderBox: this.state.renderBox,
            scene: this.scene,
            events: this.events,
            stateEnabled: this.state.enabled,
            lockFovAxis: this.lockFovAxis,
            baseAspect: this.baseAspect(),
            baseFovToHorizontalRad: (baseFovRad, axis, aspect) => this.baseFovToHorizontalRad(baseFovRad, axis, aspect),
            horizontalRadToAxisDeg: horizontalRad => this.horizontalRadToAxisDeg(horizontalRad),
            nearClip: this.state.nearClip,
            setBaseFovRad: (value) => {
                this.baseFovRad = value;
            },
            setRuntimeFrustum: (value) => {
                this.runtimeFrustum = value;
            }
        });
    }

    private computeEffectiveFrustum() {
        return computeEffectiveFrustumCamera({
            getRuntimeFrustum: () => this.runtimeFrustum,
            rebuildBaseFrustum: () => this.rebuildBaseFrustum(),
            renderBox: this.state.renderBox,
            scene: this.scene
        });
    }

    private syncCameraFrustum() {
        return syncCameraFrustumCamera({
            stateEnabled: this.state.enabled,
            computeEffectiveFrustum: () => this.computeEffectiveFrustum(),
            scene: this.scene,
            events: this.events,
            viewport: this.viewport,
            computeViewportMapping: () => this.computeViewportMapping(false)
        });
    }

    private eqMmForFov(hfovDeg: number, crop: number) {
        return eqMmForFovCamera(hfovDeg, crop);
    }

    private eqMmToHfov(eqMm: number, crop: number) {
        return eqMmToHfovCamera(eqMm, crop);
    }

    private calcFovInfo(): FovInfo {
        return calcFovInfoCamera({
            renderBox: this.state.renderBox,
            scene: this.scene,
            lockFovAxis: this.lockFovAxis,
            baseAspect: this.baseAspect(),
            baseFovToHorizontalRad: (baseFovRad, axis, aspect) => this.baseFovToHorizontalRad(baseFovRad, axis, aspect),
            cropFactor: renderBox => this.cropFactor(renderBox),
            setBaseFovRad: (value) => {
                this.baseFovRad = value;
            }
        });
    }

    private viewportLensRange() {
        const rb = this.state.renderBox;
        const crop = this.cropFactor(rb);
        const minEqMm = this.eqMmForFov(HFOV_MAX, crop);
        const maxEqMm = this.eqMmForFov(HFOV_MIN, crop);
        return {
            min: Math.min(minEqMm, maxEqMm),
            max: Math.max(minEqMm, maxEqMm)
        };
    }

    private getViewportLensMm(): number | null {
        const rb = this.state.renderBox;
        const crop = this.cropFactor(rb);
        const fov = (typeof this.viewportFovRuntime === 'number' && isFinite(this.viewportFovRuntime)) ? this.viewportFovRuntime : this.events.invoke('camera.fov');
        if (typeof fov !== 'number' || !isFinite(fov)) {
            return null;
        }
        return this.eqMmForFov(fov, crop);
    }

    private setViewportLensMm(mm: number) {
        setViewportLensMmCamera({
            mm,
            stateEnabled: this.state.enabled,
            viewportLensRange: () => this.viewportLensRange(),
            renderBox: this.state.renderBox,
            cropFactor: renderBox => this.cropFactor(renderBox),
            setViewportFovRuntime: (value) => {
                this.viewportFovRuntime = value;
            },
            events: this.events,
            emitViewportLensChanged: () => this.emitViewportLensChanged()
        });
    }

    private getViewportLensState() {
        return getViewportLensStateCamera({
            stateEnabled: this.state.enabled,
            viewportLensRange: () => this.viewportLensRange(),
            getViewportLensMm: () => this.getViewportLensMm()
        });
    }

    private emitViewportLensChanged() {
        this.events.fire('cameraFrames.viewportLensChanged', this.getViewportLensState());
    }

    private updateFovInfo() {
        updateFovInfoCamera({
            calcFovInfo: () => this.calcFovInfo(),
            getFovInfo: () => this.fovInfo,
            setFovInfo: (value) => {
                this.fovInfo = value;
            },
            events: this.events
        });
    }

    private frameRotationRad(frame: FrameState) {
        return frameRotationRadGeometry(frame, DEG2RAD);
    }

    private frameCenterLogical(frame: FrameState, logicalW: number, logicalH: number) {
        return frameCenterLogicalGeometry(frame, this.state.renderBox, logicalW, logicalH);
    }

    private frameRectsScreen() {
        const mapping = this.computeViewportMapping();
        return frameRectsScreenGeometry(
            this.state.frames,
            this.state.renderBox,
            mapping.logicalW,
            mapping.logicalH,
            mapping.viewScale,
            (x, y) => logicalToScreenViewport(x, y, this.state.renderBox, mapping),
            DEG2RAD
        );
    }

    private frameAnchorLogical(frame: FrameState, logicalW: number, logicalH: number) {
        return frameAnchorLogicalGeometry(frame, this.state.renderBox, logicalW, logicalH);
    }

    private getHandleLogicalOffset(handleId: string, frameW: number, frameH: number) {
        return getHandleLogicalOffsetGeometry(handleId, frameW, frameH);
    }

    private getHandleLogicalPosition(handleId: string, center: { x: number; y: number; }, frameW: number, frameH: number, rotationRad: number) {
        return getHandleLogicalPositionGeometry(handleId, center, frameW, frameH, rotationRad);
    }

    private getAnchorLogicalForHandle(handleId: string | undefined, frame: FrameState, center: { x: number; y: number; }, frameW: number, frameH: number, logicalW: number, logicalH: number, rotationRad: number) {
        return getAnchorLogicalForHandleGeometry(
            handleId,
            frame,
            this.state.renderBox,
            center,
            frameW,
            frameH,
            logicalW,
            logicalH,
            rotationRad
        );
    }

    private hitTestHandle(px: number, py: number) {
        return hitTestHandleGeometry(
            px,
            py,
            this.frameRectsScreen(),
            this.selectedId,
            this.state.renderBox,
            (x, y) => this.logicalToScreen(x, y)
        );
    }

    private hitTestFrameBorder(px: number, py: number) {
        return hitTestFrameBorderGeometry(
            px,
            py,
            this.frameRectsScreen(),
            (x, y) => this.screenToLogical(x, y)
        );
    }

    private drawOverlay() {
        const enabled = this.state.enabled;
        const mapping = enabled ? this.computeViewportMapping() : null;
        const rects = enabled ? this.frameRectsScreen() : [];
        drawOverlayOverlay({
            ctx: this.overlayCtx,
            viewport: this.viewport,
            enabled,
            renderBox: this.state.renderBox,
            mapping,
            logicalToScreen: (x, y) => this.logicalToScreen(x, y),
            frameRects: rects,
            mask: this.state.mask
        });
    }

    // pointer interactions --------------------------------------------------

    private onHover(e: PointerEvent) {
        onHoverPointer({
            event: e,
            canvasContainer: this.canvasContainer,
            overlay: this.overlay,
            scene: this.scene,
            state: this.state,
            dragState: this.dragState,
            frustumDragState: this.frustumDragState,
            setLastPointer: (value) => {
                this.lastPointer = value;
            },
            ensureUiTargetAvailability: () => this.ensureUiTargetAvailability(),
            hitTestHandle: (px, py) => this.hitTestHandle(px, py),
            hitTestFrameBorder: (px, py) => this.hitTestFrameBorder(px, py)
        });
    }

    private onContainerPointerDown(e: PointerEvent) {
        onContainerPointerDownPointer(e);
    }

    private updatePointerFromLast() {
        updatePointerFromLastPointer({
            lastPointer: this.lastPointer,
            canvasContainer: this.canvasContainer,
            overlay: this.overlay,
            state: this.state,
            frustumDragState: this.frustumDragState,
            ensureUiTargetAvailability: () => this.ensureUiTargetAvailability(),
            hitTestHandle: (px, py) => this.hitTestHandle(px, py),
            hitTestFrameBorder: (px, py) => this.hitTestFrameBorder(px, py)
        });
    }

    private applyCameraFramesVersionLabel() {
        const appLabel = document.getElementById('app-label');
        if (!appLabel) {
            return;
        }
        const EXISTING_CLASS = 'camera-frames-version';
        const existing = appLabel.querySelector(`.${EXISTING_CLASS}`);
        const text = ` | CAMERA FRAMES ${cameraFramesVersion}`;
        if (existing) {
            existing.textContent = text;
            return;
        }
        const span = document.createElement('span');
        span.className = EXISTING_CLASS;
        span.textContent = text;
        appLabel.appendChild(span);
    }

    attachPointerHandlers() {
        this.overlay.addEventListener('pointerdown', e => this.onPointerDown(e));
        this.overlay.addEventListener('pointermove', e => this.onPointerMove(e));
        this.overlay.addEventListener('pointerup', e => this.onPointerUp(e));
        this.overlay.addEventListener('pointercancel', e => this.onPointerUp(e));
        this.overlay.addEventListener('dblclick', e => this.onDoubleClick(e));
        this.overlay.addEventListener('lostpointercapture', () => {
            if (this.dragState) {
                this.historyCommit('cameraFrames.drag');
                this.dragState = null;
            }
            if (this.frustumDragState) {
                this.historyCommit('cameraFrames.mainCameraPose');
                this.frustumDragState = null;
            }
        });
    }

    private handleFrustumPointerMove(_e: PointerEvent) {
        // フラスタムドラッグは無効化
        return false;
    }

    private handleFrustumPointerUp(_e: PointerEvent) {
        // フラスタムドラッグは無効化
        return false;
    }

    private onPointerDown(e: PointerEvent) {
        onPointerDownPointer({
            event: e,
            state: this.state,
            scene: this.scene,
            overlay: this.overlay,
            setDragState: (value) => {
                this.dragState = value;
            },
            selectFrame: id => this.selectFrame(id),
            computeViewportMapping: () => this.computeViewportMapping(),
            frameCenterLogical: (frame, logicalW, logicalH) => this.frameCenterLogical(frame, logicalW, logicalH),
            frameRotationRad: frame => this.frameRotationRad(frame),
            getAnchorLogicalForHandle: (handleId, frame, centerLogical, frameW, frameH, logicalW, logicalH, rotationRad) => {
                return this.getAnchorLogicalForHandle(handleId, frame, centerLogical, frameW, frameH, logicalW, logicalH, rotationRad);
            },
            frameAnchorLogical: (frame, logicalW, logicalH) => this.frameAnchorLogical(frame, logicalW, logicalH),
            getHandleLogicalPosition: (handleId, centerLogical, frameW, frameH, rotationRad) => {
                return this.getHandleLogicalPosition(handleId, centerLogical, frameW, frameH, rotationRad);
            },
            screenToLogical: (x, y) => this.screenToLogical(x, y),
            hitTestHandle: (px, py) => this.hitTestHandle(px, py),
            hitTestFrameBorder: (px, py) => this.hitTestFrameBorder(px, py),
            historyBegin: label => this.historyBegin(label)
        });
    }

    private onPointerMove(e: PointerEvent) {
        onPointerMovePointer({
            event: e,
            state: this.state,
            dragState: this.dragState,
            overlay: this.overlay,
            scene: this.scene,
            viewport: this.viewport,
            handleFrustumPointerMove: event => this.handleFrustumPointerMove(event),
            computeViewportMapping: () => this.computeViewportMapping(),
            screenToLogical: (x, y) => this.screenToLogical(x, y),
            syncCameraFrustum: () => this.syncCameraFrustum(),
            requestRender: () => this.requestRender(),
            fireStateChanged: () => this.events.fire('cameraFrames.stateChanged', this.snapshot())
        });
    }

    private onPointerUp(e: PointerEvent) {
        onPointerUpPointer({
            event: e,
            dragState: this.dragState,
            overlay: this.overlay,
            setDragState: (value) => {
                this.dragState = value;
            },
            handleFrustumPointerUp: event => this.handleFrustumPointerUp(event),
            historyCommit: label => this.historyCommit(label),
            setLastPointer: (value) => {
                this.lastPointer = value;
            },
            updatePointerFromLast: () => this.updatePointerFromLast()
        });
    }

    private onDoubleClick(e: MouseEvent) {
        const fireStateChanged = () => {
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        };
        onDoubleClickPointer({
            event: e,
            state: this.state,
            hitTestHandle: (px, py) => this.hitTestHandle(px, py),
            resetAnchorToCenter: (frame) => {
                resetAnchorToCenterPointer({
                    frame,
                    historyRecord: (label, fn) => this.historyRecord(label, fn),
                    requestRender: () => this.requestRender(),
                    fireStateChanged,
                    updatePointerFromLast: () => this.updatePointerFromLast()
                });
            },
            resetFrameRotation: (frame) => {
                resetFrameRotationPointer({
                    frame,
                    state: this.state,
                    historyRecord: (label, fn) => this.historyRecord(label, fn),
                    frameCenterLogical: (target, logicalW, logicalH) => this.frameCenterLogical(target, logicalW, logicalH),
                    frameAnchorLogical: (target, logicalW, logicalH) => this.frameAnchorLogical(target, logicalW, logicalH),
                    frameRotationRad: target => this.frameRotationRad(target),
                    requestRender: () => this.requestRender(),
                    fireStateChanged,
                    updatePointerFromLast: () => this.updatePointerFromLast()
                });
            }
        });
    }

    // rendering to image ---------------------------------------------------

    private renderFrameOverlay(width: number, height: number, frames?: FrameState[]) {
        const framesToDraw = frames ?? this.state.frames;
        return renderFrameOverlayOverlay(width, height, this.state.renderBox, framesToDraw);
    }

    private frameManagementName(frameId: string | null | undefined) {
        const raw = (frameId ?? '').toString();
        const match = raw.match(/[a-z]+/i);
        const name = (match?.[0] ?? raw).trim();
        return name.length > 0 ? name.toUpperCase() : 'Frames';
    }

    private renderFrameOverlaysByManagement(width: number, height: number) {
        return renderFrameOverlaysByManagementOverlay(
            width,
            height,
            this.state.renderBox,
            this.state.frames,
            frameId => this.frameManagementName(frameId)
        );
    }

    private getCompressor() {
        if (!this.compressor) {
            this.compressor = new PngCompressor();
        }
        return this.compressor;
    }

    // serialization --------------------------------------------------------

    public snapshot(): CameraFramesState {
        return snapshotSerialize({
            state: this.state,
            clonePoseSnapshot: pose => this.clonePoseSnapshot(pose),
            normalizeFormat: format => this.normalizeFormat(format)
        });
    }

    public applySnapshot(snapshot: CameraFramesState) {
        applySnapshotSerialize({
            snapshot,
            sceneCameraFov: this.scene.camera.fov,
            setApplyingHistory: (value) => {
                this.applyingHistory = value;
            },
            setState: (value) => {
                this.state = value;
            },
            normalizeMainRenderBoxProjection: baseFov => this.normalizeMainRenderBoxProjection(baseFov),
            clonePoseSnapshot: pose => this.clonePoseSnapshot(pose),
            forceMainCameraPoseOrthoOff: pose => this.forceMainCameraPoseOrthoOff(pose),
            captureCameraPose: () => this.captureCameraPose(),
            computeSafeNearClip: value => this.computeSafeNearClip(value),
            setViewportPoseRuntime: (value) => {
                this.viewportPoseRuntime = value;
            },
            setViewportPoseRuntimeWorldDistance: (value) => {
                this.viewportPoseRuntimeWorldDistance = value;
            },
            setHasEnteredViewportOnce: (value) => {
                this.hasEnteredViewportOnce = value;
            },
            setSelectedId: (value) => {
                this.selectedId = value;
            },
            overlay: this.overlay,
            frustumDebugCache: this.frustumDebugCache,
            rebuildBaseFrustum: () => this.rebuildBaseFrustum(),
            applyCameraPose: (pose, options) => this.applyCameraPose(pose, options),
            applyNearClipOverride: () => this.applyNearClipOverride(),
            computeViewportMapping: updateFitScale => this.computeViewportMapping(updateFitScale),
            syncCameraFrustum: () => this.syncCameraFrustum(),
            scheduleNearClipGuard: () => this.scheduleNearClipGuard(),
            requestRender: () => this.requestRender(),
            events: this.events,
            fireStateChanged: () => this.events.fire('cameraFrames.stateChanged', this.snapshot()),
            updatePointerFromLast: () => this.updatePointerFromLast(),
            updateFovInfo: () => this.updateFovInfo()
        });
    }

    private serialize() {
        return serializeSerialize({
            snapshot: () => this.snapshot(),
            selectedId: this.selectedId,
            version: cameraFramesVersion
        });
    }

    private deserialize(docState: any) {
        deserializeSerialize({
            docState,
            scene: this.scene,
            viewport: this.viewport,
            events: this.events,
            normalizeFormat: format => this.normalizeFormat(format),
            normalizeViewZoomPct: value => this.normalizeViewZoomPct(value),
            clonePoseSnapshot: pose => this.clonePoseSnapshot(pose),
            forceMainCameraPoseOrthoOff: pose => this.forceMainCameraPoseOrthoOff(pose),
            captureCameraPose: () => this.captureCameraPose(),
            normalizeMainRenderBoxProjection: baseFov => this.normalizeMainRenderBoxProjection(baseFov),
            computeSafeNearClip: value => this.computeSafeNearClip(value),
            setState: (value) => {
                this.state = value;
            },
            setSelectedId: (value) => {
                this.selectedId = value;
            },
            setViewportPoseRuntime: (value) => {
                this.viewportPoseRuntime = value;
            },
            setViewportPoseRuntimeWorldDistance: (value) => {
                this.viewportPoseRuntimeWorldDistance = value;
            },
            setHasEnteredViewportOnce: (value) => {
                this.hasEnteredViewportOnce = value;
            },
            overlay: this.overlay,
            rebuildBaseFrustum: () => this.rebuildBaseFrustum(),
            applyCameraPose: (pose, options) => this.applyCameraPose(pose, options),
            applyNearClipOverride: () => this.applyNearClipOverride(),
            computeViewportMapping: updateFitScale => this.computeViewportMapping(updateFitScale),
            syncCameraFrustum: () => this.syncCameraFrustum(),
            scheduleNearClipGuard: () => this.scheduleNearClipGuard(),
            requestRender: () => this.requestRender(),
            fireStateChanged: () => this.events.fire('cameraFrames.stateChanged', this.snapshot()),
            updatePointerFromLast: () => this.updatePointerFromLast(),
            updateFovInfo: () => this.updateFovInfo()
        });
    }
}

const registerCameraFrames = (events: Events, scene: Scene, canvasContainer: HTMLElement) => {
    const controller = new CameraFramesController(events, scene, canvasContainer);
    controller.attachPointerHandlers();
    return controller;
};

export { registerCameraFrames };
