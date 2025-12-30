import { Quat, Ray, Vec3 } from 'playcanvas';

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
    PAN_MARGIN_PX,
    RAD2DEG,
    W_35MM
} from './camera-frames-constants';
import {
    clampFov,
    cloneFrame,
    normalizeDegrees,
    normalizeMaskScope,
    rotateOffset as rotateOffsetPoint
} from './camera-frames-math';
import {
    computeViewportMapping as computeViewportMappingViewport,
    logicalToScreen as logicalToScreenViewport,
    screenToLogical as screenToLogicalViewport
} from './camera-frames-viewport';
import {
    frameRectsScreen as frameRectsScreenGeometry,
    frameAnchorLogical as frameAnchorLogicalGeometry,
    frameCenterLogical as frameCenterLogicalGeometry,
    frameRotationRad as frameRotationRadGeometry,
    getAnchorLogicalForHandle as getAnchorLogicalForHandleGeometry,
    getHandleLogicalOffset as getHandleLogicalOffsetGeometry,
    getHandleLogicalPosition as getHandleLogicalPositionGeometry,
    getCursorForHit as getCursorForHitGeometry,
    hitTestFrameBorder as hitTestFrameBorderGeometry,
    hitTestHandle as hitTestHandleGeometry
} from './camera-frames-frame-geometry';
import {
    drawOverlay as drawOverlayOverlay,
    renderFrameOverlay as renderFrameOverlayOverlay,
    renderFrameOverlaysByManagement as renderFrameOverlaysByManagementOverlay
} from './camera-frames-overlay';
import {
    addPngDpi,
    downloadArrayBuffer,
    flipForCompressor,
    mergeOverlayCanvases,
    renderBase,
    renderModelLayers,
    renderOverlayLayers,
    renderReferenceLayers
} from './camera-frames-export';
import { cameraFramesVersion } from './camera-frames-version';
import { DEFAULT_NEAR_CLIP, MIN_NEAR_CLIP } from './clip-constants';
import { ElementType } from './element';
import { Events } from './events';
import { hitTestGizmo } from './gizmo-hit';
import { PngCompressor } from './png-compressor';
import { exportPsd, type PsdOverlayLayer } from './psd-export';
import { Scene } from './scene';
import { localize } from './ui/localization';
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
    ReferenceExportLayer,
    RenderBoxState,
    Viewport,
    ViewportMapping
} from './camera-frames-types';

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
    private workRay: Ray = new Ray();
    private workVec: Vec3 = new Vec3();

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
    }

    private captureCameraPose(): CameraPoseSnapshot | null {
        const serialized = this.scene?.camera?.docSerialize?.();
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
            lockFraming: !!this.scene.camera.lockFraming
        };
        if (serialized.fpvPosition) {
            pose.fpvPosition = vec(serialized.fpvPosition, focalPoint);
        }
        return this.clonePoseSnapshot(pose);
    }

    private normalizeViewportPose(pose: CameraPoseSnapshot, allowOrtho: boolean) {
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
        const ex = elev * DEG2RAD;
        const ey = azim * DEG2RAD;
        const s1 = Math.sin(-ex);
        const c1 = Math.cos(-ex);
        const s2 = Math.sin(-ey);
        const c2 = Math.cos(-ey);
        result.set(-c1 * s2, s1, c1 * c2);
    }

    private buildCameraBasis(pose: CameraPoseSnapshot | null): CameraBasis | null {
        const snap = this.clonePoseSnapshot(pose);
        if (!snap) {
            return null;
        }
        const forward = new Vec3();
        this.calcForwardVec(forward, snap.azim, snap.elev);
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
        const framingFactor = snap.lockFraming ? 1 : (this.scene.camera.fovFactor || 1);
        const worldDist = (snap.distance || 1) * (this.scene.camera.sceneRadius || 1) / (framingFactor || 1e-6);
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
    }

    private getPoseWorldDistance(pose: CameraPoseSnapshot | null) {
        const snap = this.clonePoseSnapshot(pose);
        if (!snap) {
            return 0;
        }
        const framingFactor = snap.lockFraming ? 1 : (this.scene.camera.fovFactor || 1);
        const sceneRadius = this.scene.camera.sceneRadius || 1;
        return Math.max(1e-6, (snap.distance || 1) * sceneRadius / (framingFactor || 1e-6));
    }

    private worldDistanceToNormalized(distance: number, pose: CameraPoseSnapshot | null) {
        const snap = this.clonePoseSnapshot(pose);
        const framingFactor = snap?.lockFraming ? 1 : (this.scene.camera.fovFactor || 1);
        const sceneRadius = this.scene.camera.sceneRadius || 1;
        return Math.max(1e-6, distance * (framingFactor || 1e-6) / (sceneRadius || 1e-6));
    }

    private poseToTransform(pose: CameraPoseSnapshot | null) {
        const basis = this.buildCameraBasis(pose);
        const snap = this.clonePoseSnapshot(pose);
        if (!basis || !snap) {
            return null;
        }
        return {
            position: { x: basis.position.x, y: basis.position.y, z: basis.position.z },
            rotation: { yaw: snap.azim ?? 0, pitch: snap.elev ?? 0, roll: snap.roll ?? 0 }
        };
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
            // フラスタム情報が取れない場合のフォールバック（レンダーボックスのアスペクトだけ維持）
            const rb = this.state.renderBox;
            const aspect = (rb.baseSize.w * rb.scale.kx) / (rb.baseSize.h * rb.scale.ky || 1);
            const baseFovDeg = rb.projection?.baseFov ?? this.scene.camera?.fov ?? 60;
            const baseFovRad = baseFovDeg * DEG2RAD;
            const horizontalRad = this.baseFovToHorizontalRad(baseFovRad, this.lockFovAxis ?? 'horizontal', aspect);
            const halfW = Math.tan(horizontalRad * 0.5);
            const halfH = halfW / aspect;
            left = -halfW;
            right = halfW;
            bottom = -halfH;
            top = halfH;
            near = 1;
        }

        const nearSafe = Math.max(near, 1e-4);

        // 視覚化用距離: 「レンズmm -> メートル換算 * 12倍」で計算し、0.2m〜2mにクランプ
        const hfovRadForMm = (() => {
            if (frustum) {
                const width = right - left;
                return 2 * Math.atan(width / (2 * nearSafe));
            }
            return this.baseFovRad || ((this.state.renderBox.projection?.baseFov ?? 60) * DEG2RAD);
        })();
        const crop = this.cropFactor(this.state.renderBox);
        const eqMm = this.eqMmForFov(hfovRadForMm * RAD2DEG, crop);
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
        const pose = this.clonePoseSnapshot(this.state.mainCameraPose);
        if (!pose) {
            return null;
        }
        const frustum = this.computeEffectiveFrustum();
        const cache = this.frustumDebugCache;
        const poseChanged = !cache.pose || !this.isSamePose(cache.pose, pose) || cache.version !== FRUSTUM_DEBUG_CACHE_VERSION;
        const frustumChanged = !cache.frustum || !frustum || !this.isSameFrustum(cache.frustum, frustum);
        if (poseChanged || frustumChanged || !cache.points) {
            const basis = this.buildCameraBasis(pose);
            if (!basis) {
                return null;
            }
            const points = this.buildFrustumPoints(frustum, basis);
            if (!points) {
                return null;
            }
            this.frustumDebugCache = {
                pose,
                frustum: frustum ? { ...frustum } : null,
                points,
                version: FRUSTUM_DEBUG_CACHE_VERSION
            };
        }
        return this.frustumDebugCache.points;
    }

    private drawMainCameraFrustum() {
        this.ensureUiTargetAvailability();
        if (this.state.enabled) {
            return;
        }
        if (!this.state.mainCameraPose) {
            // 空シーンなどで mainCameraPose が消えている場合は現在のカメラを初期値として確保する
            const fallback = this.captureCameraPose();
            if (fallback) {
                this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(fallback);
            } else {
                return;
            }
        }
        if (this.scene.camera.targetSize) {
            return;
        }
        const points = this.getFrustumDebugPoints();
        if (!points || points.length < 5) {
            return;
        }
        const color = this.mainCameraSelected ? FRUSTUM_SELECTED_COLOR : FRUSTUM_DEBUG_COLOR;
        const draw = (a: number, b: number) => this.scene.app.drawLine(points[a], points[b], color, true, this.scene.debugLayer);
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
    }

    private projectFrustumToScreen(points: Vec3[]) {
        if (!points || points.length === 0) {
            return null;
        }
        const targetSize = this.scene?.targetSize ?? { width: this.viewport.vw, height: this.viewport.vh };
        const width = targetSize.width || this.viewport.vw;
        const height = targetSize.height || this.viewport.vh;
        const projected: { x: number; y: number; z: number; }[] = [];
        const screen = new Vec3();
        points.forEach((p) => {
            this.scene.camera.worldToScreen(p, screen);
            projected.push({
                x: screen.x * width,
                y: screen.y * height,
                z: screen.z
            });
        });
        return projected;
    }

    private distanceToSegment(px: number, py: number, a: { x: number; y: number; }, b: { x: number; y: number; }) {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const wx = px - a.x;
        const wy = py - a.y;
        const lenSq = vx * vx + vy * vy;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lenSq)) : 0;
        const projX = a.x + t * vx;
        const projY = a.y + t * vy;
        return Math.hypot(px - projX, py - projY);
    }

    private intersectPointerWithPlane(clientX: number, clientY: number, planePoint: Vec3, planeNormal: Vec3) {
        if (!planeNormal || planeNormal.lengthSq() < 1e-6) {
            return null;
        }
        const normal = planeNormal.clone();
        normal.normalize();
        const ray = this.workRay;
        const rect = this.canvasContainer.getBoundingClientRect();
        const targetSize = this.scene?.targetSize ?? { width: rect.width, height: rect.height };
        const scaleX = rect.width > 0 ? targetSize.width / rect.width : 1;
        const scaleY = rect.height > 0 ? targetSize.height / rect.height : 1;
        const sx = (clientX - rect.left) * scaleX;
        const sy = (clientY - rect.top) * scaleY;
        if (!this.scene.camera.getRay(sx, sy, ray, { space: 'target' })) {
            return null;
        }
        const denom = ray.direction.dot(normal);
        if (Math.abs(denom) < 1e-6) {
            return null;
        }
        const toPoint = this.workVec.copy(planePoint).sub(ray.origin);
        const t = toPoint.dot(normal) / denom;
        if (!isFinite(t)) {
            return null;
        }
        const hit = ray.direction.clone().mulScalar(t).add(ray.origin);
        return hit;
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
            await this.renderImage(options);
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
        if (!this.state.enabled) {
            return;
        }
        const near = this.state.nearClip;
        if (typeof near === 'number' && isFinite(near)) {
            this.events.fire('camera.setNearOverride', near);
        } else {
            this.events.fire('camera.setNearOverride', null);
        }
    }

    private setNearClip(value: number | null, suppressHistory = false) {
        const apply = () => {
            const sanitized = this.computeSafeNearClip(value);
            if (this.state.nearClip === sanitized) return;
            this.state.nearClip = sanitized;
            if (this.state.enabled) {
                this.applyNearClipOverride();
                this.rebuildBaseFrustum();
                this.syncCameraFrustum();
            } else if (this.uiTarget === 'main') {
                this.rebuildBaseFrustum();
                this.frustumDebugCache.points = null;
                this.frustumDebugCache.pose = null;
            }
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
        };

        if (suppressHistory) {
            apply();
        } else {
            this.historyDebounced('cameraFrames.nearClip', apply);
        }
    }

    private computeSafeNearClip(value: number | null | undefined) {
        const raw = (typeof value === 'number' && isFinite(value)) ? value : NaN;
        if (!isFinite(raw) || raw <= 0) {
            return DEFAULT_NEAR_CLIP;
        }
        return Math.max(MIN_NEAR_CLIP, raw);
    }

    private updateViewportNearTargetSizeState() {
        const active = !!this.scene.camera.targetSize;
        if (active === this.viewportNearTargetSizeActive) {
            return;
        }
        this.viewportNearTargetSizeActive = active;
        this.clearViewportNearOverride();
        if (!active) {
            this.scheduleViewportNearOverride(0);
        }
    }

    private shouldApplyViewportNearOverride() {
        return !this.state.enabled && this.uiTarget === 'viewport' && !this.scene.camera.targetSize && !this.scene.camera.ortho;
    }

    private clearViewportNearOverride() {
        if (this.viewportNearDebounceId !== null) {
            window.clearTimeout(this.viewportNearDebounceId);
            this.viewportNearDebounceId = null;
        }
        if (this.viewportNearOverrideActive || this.viewportNearOverride !== null) {
            this.viewportNearOverrideActive = false;
            this.viewportNearOverride = null;
            this.events.fire('camera.setNearOverride', null, { transient: true });
        }
    }

    private scheduleViewportNearOverride(delayMs = 200) {
        if (!this.shouldApplyViewportNearOverride()) {
            return;
        }
        if (this.viewportNearDebounceId !== null) {
            window.clearTimeout(this.viewportNearDebounceId);
        }
        this.viewportNearDebounceId = window.setTimeout(() => {
            this.viewportNearDebounceId = null;
            this.applyViewportNearOverride();
        }, delayMs);
    }

    private applyViewportNearOverride() {
        if (!this.shouldApplyViewportNearOverride()) {
            return;
        }
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (now - this.viewportNearLastSampleTs < 100) {
            return;
        }
        this.viewportNearLastSampleTs = now;

        const candidate = this.computeViewportNearCandidate();
        if (candidate === null) {
            if (this.viewportNearOverrideActive) {
                this.clearViewportNearOverride();
            }
            return;
        }

        const prev = this.viewportNearOverride;
        if (prev !== null) {
            const absDelta = Math.abs(candidate - prev);
            const relDelta = absDelta / Math.max(prev, MIN_NEAR_CLIP);
            if (absDelta < 1e-3 && relDelta < 0.2) {
                return;
            }
        }

        this.viewportNearOverride = candidate;
        this.viewportNearOverrideActive = true;
        this.events.fire('camera.setNearOverride', candidate, { transient: true });
    }

    private computeViewportNearCandidate(): number | null {
        const canvas = this.scene?.canvas;
        const targetSize = this.scene?.targetSize;
        if (!canvas || !targetSize || targetSize.width <= 0 || targetSize.height <= 0) {
            return null;
        }
        const w = canvas.clientWidth ?? 0;
        const h = canvas.clientHeight ?? 0;
        if (!(w > 0 && h > 0)) {
            return null;
        }
        if (this.scene.getElementsByType(ElementType.splat).length === 0) {
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
            const hit = this.scene.camera.intersect(x, y);
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

        const far = this.scene.camera.far;
        const sceneRadius = this.scene.camera.sceneRadius;
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
    }

    private enforceSafeNearClip() {
        if (!this.state.enabled) {
            return;
        }
        if (this.nearClipGuardSeed !== this.state.nearClip) {
            return;
        }
        const currentNear = this.state.nearClip ?? this.events.invoke('camera.near');
        const safeNear = this.computeSafeNearClip(currentNear);
        if (this.state.nearClip !== safeNear) {
            this.setNearClip(safeNear, true);
        }
    }

    private scheduleNearClipGuard(frames = 2) {
        this.nearClipGuardSeed = this.state.nearClip ?? null;
        this.pendingNearClipGuard = Math.max(this.pendingNearClipGuard, frames);
    }

    private runPendingNearClipGuard() {
        if (!this.state.enabled || this.pendingNearClipGuard <= 0) {
            return;
        }
        this.pendingNearClipGuard--;
        if (this.pendingNearClipGuard === 0) {
            this.enforceSafeNearClip();
        }
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
        const rb = this.state.renderBox;
        const projection = rb.projection ?? { type: 'perspective' as const };
        const axis = this.lockFovAxis ?? 'horizontal';

        // CAMERA FRAMES v6 では水平FOVを基準に保持し、縦横スケールやズームに左右されない土台を再生成する。
        // 修正: 構図基準(Base Frustum)のアスペクト比は RenderBox の Base Size に合わせる
        // これにより、RenderBoxがA4ならA4のフラスタム、16:9なら16:9のフラスタムが生成され、
        // ピクセルマッピング時の縦横比歪みを防止する。
        const rbW = rb.baseSize.w;
        const rbH = rb.baseSize.h;
        const aspect = (rbW > 0 && rbH > 0) ? rbW / rbH : this.baseAspect();

        const baseFovDeg = projection.baseFov ?? this.scene.camera.fov ?? HFOV_MIN;
        const baseFovRadAxis = baseFovDeg * DEG2RAD;
        const horizontalRad = this.baseFovToHorizontalRad(baseFovRadAxis, axis, aspect);
        const clampedHorizontalDeg = clampFov(horizontalRad * RAD2DEG);
        const clampedHorizontalRad = clampedHorizontalDeg * DEG2RAD;
        this.baseFovRad = clampedHorizontalRad;
        const axisBaseFovDeg = this.horizontalRadToAxisDeg(clampedHorizontalRad);

        const nearRaw = this.state.nearClip ?? this.events.invoke('camera.near') ?? this.scene.camera.near;
        const farRaw = this.scene.camera.far;
        const near = (typeof nearRaw === 'number' && isFinite(nearRaw)) ? Math.max(MIN_NEAR_CLIP, nearRaw) : DEFAULT_NEAR_CLIP;
        const far = (typeof farRaw === 'number' && isFinite(farRaw)) ? farRaw : 1000;

        if (projection.type === 'ortho') {
            const halfHeight = projection.orthoHalfHeight ?? 1;
            this.runtimeFrustum = {
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
            this.runtimeFrustum = {
                l0: -halfW,
                r0: halfW,
                b0: -halfH,
                t0: halfH,
                near,
                far
            };
        }

        rb.projection = {
            ...projection,
            baseFov: axisBaseFovDeg
        };
        if (this.state.enabled) {
            this.events.fire('camera.setFov', rb.projection.baseFov);
        }
    }

    private computeEffectiveFrustum() {
        if (!this.runtimeFrustum) {
            this.rebuildBaseFrustum();
        }
        const frustum = this.runtimeFrustum;
        if (!frustum) {
            return null;
        }
        const rb = this.state.renderBox;
        const { kx, ky } = rb.scale;
        const { ax, ay } = rb.anchor;

        // BaseFrustum (構図基準) を レンダーボックスのスケールとアンカーで変形 (Off-axis)
        // ここでは View Zoom (UI倍率) は適用せず、純粋な「レンダーボックス領域」のフラスタムを計算する。

        const width1 = (frustum.r0 - frustum.l0) * kx;
        const height1 = (frustum.t0 - frustum.b0) * ky;
        const left1 = frustum.l0 + ax * ((frustum.r0 - frustum.l0) - width1);
        const right1 = left1 + width1;
        // Y軸 (Bottom -> Top): PlayCanvasはY-up。ay=0はUI上でTop(上)を指すため、
        // フラスタム(Y-up)計算においては (1.0 - ay) として反転させる必要がある。
        // ay=0(上) -> 係数1.0 -> bottom = t0 - h -> top = t0 (上辺固定: 正解)
        // ay=1(下) -> 係数0.0 -> bottom = b0 -> 下辺固定 (正解)
        const bottom1 = frustum.b0 + (1.0 - ay) * ((frustum.t0 - frustum.b0) - height1);
        const top1 = bottom1 + height1;

        const camFarRaw = this.scene.camera.far;
        const far = (typeof camFarRaw === 'number' && isFinite(camFarRaw) && camFarRaw > frustum.near) ? camFarRaw : Math.max(frustum.near * 2, frustum.far);

        // これは「レンダーボックスの四隅」に対応するフラスタム
        return {
            left: left1,
            right: right1,
            bottom: bottom1,
            top: top1,
            near: frustum.near,
            far
        };
    }

    private syncCameraFrustum() {
        if (!this.state.enabled) {
            return null;
        }

        // targetSize 切替も含めて毎回再計算し、既存のフラスタムに依存しない。
        // 書き出し時は先に targetSize をセットし、ここで setCustomFrustum を上書きする順序を維持する。
        // 1. 基本となるレンダーボックスのフラスタム (Zoomなし)
        const rbFrustum = this.computeEffectiveFrustum();
        if (!rbFrustum) {
            this.events.fire('camera.setCustomFrustum', null);
            return null;
        }

        // 2. 書き出しモード判定
        const targetSize = this.scene.camera.targetSize;
        const isExporting = !!targetSize;

        let finalFrustum = rbFrustum;

        if (isExporting) {
            // 書き出し時: レンダーボックスのフラスタムをそのまま使う
            // (出力画像サイズ == レンダーボックスサイズ なので一致する)
            finalFrustum = rbFrustum;
        } else {
            // プレビュー時: ビューポート全体をカバーするようにフラスタムを拡張 (Extrapolate)

            // 現在の画面上のレンダーボックス位置 (rectPxRaw) を取得
            // computeViewportMapping はプレビュー設定で計算される
            const mapping = this.computeViewportMapping(false);
            const { rectPxRaw } = mapping;
            const { vw, vh } = this.viewport;

            // レンダーボックスのフラスタム幅・高さ (Near平面上)
            const rbW = rbFrustum.right - rbFrustum.left;
            const rbH = rbFrustum.top - rbFrustum.bottom;

            // 1ピクセルあたりのワールド幅 (Near平面上)
            // rectPxRaw.w が極端に小さい(0)場合の保護を入れる
            const pxToWorldX = rectPxRaw.w > 0 ? rbW / rectPxRaw.w : 0;
            const pxToWorldY = rectPxRaw.h > 0 ? rbH / rectPxRaw.h : 0;

            if (pxToWorldX === 0 || pxToWorldY === 0) {
                this.events.fire('camera.setCustomFrustum', null);
                return null;
            }

            // フラスタム拡張 (Extrapolation)
            // 画面左端 (x=0) に対応する left
            // left_screen = rb_left - (レンダーボックス左端までの距離) * スケール
            const leftScreen = rbFrustum.left - (rectPxRaw.x) * pxToWorldX;
            const rightScreen = leftScreen + vw * pxToWorldX;

            // 画面上端 (y=0) に対応する top
            // 注意: DOMのY=0は上、PlayCanvasのProjectionのTopは上 (+Y)
            // rectPxRaw.y は「上からのピクセル距離」
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

        this.events.fire('camera.setCustomFrustum', finalFrustum);
        return finalFrustum;
    }

    private eqMmForFov(hfovDeg: number, crop: number) {
        const hfovRad = hfovDeg * DEG2RAD;
        const focalVirtual = W_35MM / (2 * Math.tan(hfovRad * 0.5));
        return focalVirtual * crop;
    }

    private eqMmToHfov(eqMm: number, crop: number) {
        const safeEq = Math.max(eqMm, 1e-6);
        const hfovRad = 2 * Math.atan((W_35MM * crop) / (2 * safeEq));
        return hfovRad * RAD2DEG;
    }

    private calcFovInfo(): FovInfo {
        const rb = this.state.renderBox;
        const crop = this.cropFactor(rb);
        const axis = this.lockFovAxis ?? 'horizontal';
        const baseAspect = this.baseAspect();
        const baseFovDeg = rb.projection?.baseFov ?? this.scene.camera.fov;
        const baseFovRadAxis = (baseFovDeg ?? HFOV_MIN) * DEG2RAD;
        const hfovRad = this.baseFovToHorizontalRad(baseFovRadAxis, axis, baseAspect);
        const hfovClamped = clampFov(hfovRad * RAD2DEG);
        const hfovClampedRad = hfovClamped * DEG2RAD;
        this.baseFovRad = hfovClampedRad;

        const focalVirtual = W_35MM / (2 * Math.tan(hfovClampedRad * 0.5));
        const eqMm = focalVirtual * crop;

        const hfovFrame = 2 * Math.atan(Math.tan(hfovClampedRad * 0.5) / crop) * RAD2DEG;

        const minEqMm = this.eqMmForFov(HFOV_MAX, crop);
        const maxEqMm = this.eqMmForFov(HFOV_MIN, crop);

        return {
            crop,
            hfovDeg: hfovClamped,
            hfovFrameDeg: hfovFrame,
            eqMm,
            minEqMm,
            maxEqMm
        };
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
        if (this.state.enabled) {
            return;
        }
        const range = this.viewportLensRange();
        const clamped = Math.min(range.max, Math.max(range.min, mm));
        const rb = this.state.renderBox;
        const crop = this.cropFactor(rb);
        const hfovDeg = this.eqMmToHfov(clamped, crop);
        this.viewportFovRuntime = hfovDeg;
        this.events.fire('camera.setFov', hfovDeg);
        this.emitViewportLensChanged();
    }

    private getViewportLensState() {
        const range = this.viewportLensRange();
        const mm = this.getViewportLensMm();
        return {
            enabled: !this.state.enabled,
            mm: mm ?? range.max,
            min: range.min,
            max: range.max
        };
    }

    private emitViewportLensChanged() {
        this.events.fire('cameraFrames.viewportLensChanged', this.getViewportLensState());
    }

    private updateFovInfo() {
        const next = this.calcFovInfo();
        const prev = this.fovInfo;
        this.fovInfo = next;
        const changed =
            !prev ||
            Math.abs(prev.eqMm - next.eqMm) > 1e-4 ||
            Math.abs(prev.hfovDeg - next.hfovDeg) > 1e-4 ||
            Math.abs(prev.crop - next.crop) > 1e-4;
        if (changed) {
            this.events.fire('cameraFrames.fovInfoChanged', next);
        }
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

    private getCursorForHit(handleId: string | undefined, borderHit: any) {
        return getCursorForHitGeometry(handleId, borderHit);
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
        this.lastPointer = { x: e.clientX, y: e.clientY };
        this.ensureUiTargetAvailability();

        const rect = this.canvasContainer.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;

        if (this.frustumDragState) {
            this.overlay.style.pointerEvents = 'auto';
            this.overlay.style.cursor = 'grabbing';
            return;
        }

        // Gizmo優先チェック: ギズモにヒットしたらオーバーレイは透過する
        if (hitTestGizmo(this.scene, e.clientX, e.clientY)) {
            this.overlay.style.pointerEvents = 'none';
            this.overlay.style.cursor = '';
            return;
        }

        if (!this.state.enabled) {
            this.overlay.style.pointerEvents = 'none';
            this.overlay.style.cursor = '';
            return;
        }
        if (this.dragState) {
            this.overlay.style.pointerEvents = 'auto';
            this.overlay.style.cursor = this.dragState.mode === 'pan' ? 'grabbing' : '';
            return;
        }

        if (e.shiftKey) {
            this.overlay.style.pointerEvents = 'auto';
            this.overlay.style.cursor = 'grab';
            return;
        }

        const handleHit = this.hitTestHandle(px, py);
        const borderHit = !handleHit && this.hitTestFrameBorder(px, py);

        this.overlay.style.pointerEvents = (handleHit || borderHit) ? 'auto' : 'none';
        this.overlay.style.cursor = this.getCursorForHit(handleHit?.handleId, borderHit);
    }

    private onContainerPointerDown(_e: PointerEvent) {
        // クリックでの対象切り替えは行わない（パネルUI経由でのみ操作対象を変更）
    }

    private updatePointerFromLast() {
        if (!this.lastPointer) {
            this.overlay.style.pointerEvents = 'none';
            return;
        }
        this.ensureUiTargetAvailability();
        const rect = this.canvasContainer.getBoundingClientRect();
        const px = this.lastPointer.x - rect.left;
        const py = this.lastPointer.y - rect.top;
        if (this.frustumDragState) {
            this.overlay.style.pointerEvents = 'auto';
            this.overlay.style.cursor = 'grabbing';
            return;
        }
        if (!this.state.enabled) {
            this.overlay.style.pointerEvents = 'none';
            this.overlay.style.cursor = '';
            return;
        }
        const handleHit = this.hitTestHandle(px, py);
        const borderHit = !handleHit && this.hitTestFrameBorder(px, py);
        this.overlay.style.pointerEvents = (handleHit || borderHit) && this.state.enabled ? 'auto' : 'none';
        this.overlay.style.cursor = this.getCursorForHit(handleHit?.handleId, borderHit);
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

    private handleFrustumPointerDown(_e: PointerEvent) {
        // フラスタムクリックによる対象切替・ドラッグは行わない
        return false;
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
        if (!this.state.enabled) {
            return;
        }

        // Gizmo優先チェック: ギズモにヒットしたら操作開始しない
        if (hitTestGizmo(this.scene, e.clientX, e.clientY)) {
            return;
        }

        const handleHit = this.hitTestHandle(e.offsetX, e.offsetY);
        const frame = handleHit?.frame ?? this.hitTestFrameBorder(e.offsetX, e.offsetY);
        if (e.shiftKey && e.button === 0 && !handleHit && !frame) {
            this.overlay.setPointerCapture(e.pointerId);
            this.dragState = {
                frameId: null,
                startPos: { x: 0, y: 0 },
                startPointer: { x: e.offsetX, y: e.offsetY },
                axisLock: null,
                shiftLock: false,
                pointerId: e.pointerId,
                mode: 'pan',
                startCenterScreen: { x: this.state.renderBox.center.cx, y: this.state.renderBox.center.cy }
            };
            this.historyBegin('cameraFrames.renderBoxPan');
            this.overlay.style.cursor = 'grabbing';
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        if (!frame) {
            return;
        }

        this.selectFrame(frame.id);
        this.overlay.setPointerCapture(e.pointerId);

        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const logicalW = mapping.logicalW;
        const logicalH = mapping.logicalH;
        const centerLogical = this.frameCenterLogical(frame, logicalW, logicalH);
        const frameW = frame.baseSize.w * frame.scaleK;
        const frameH = frame.baseSize.h * frame.scaleK;
        const rotationRad = this.frameRotationRad(frame);

        const handleId = handleHit?.handleId;
        const mode: 'move' | 'resize' | 'anchor' | 'rotate' =
            handleId === 'anchor' ? 'anchor' :
                (handleId === 'rotate' ? 'rotate' : (handleId ? 'resize' : 'move'));

        const anchorLogicalDefault = this.getAnchorLogicalForHandle(handleId, frame, centerLogical, frameW, frameH, logicalW, logicalH, rotationRad);
        const anchorLogical = (mode === 'resize' && e.altKey) ? this.frameAnchorLogical(frame, logicalW, logicalH) : anchorLogicalDefault;
        const handleLogical = handleId ? this.getHandleLogicalPosition(handleId, centerLogical, frameW, frameH, rotationRad) : null;
        const startDistance = (mode === 'resize' && handleLogical) ? Math.hypot(handleLogical.x - anchorLogical.x, handleLogical.y - anchorLogical.y) : null;
        const pointerLogical = this.screenToLogical(e.offsetX, e.offsetY);
        const startAngle = (mode === 'rotate') ? Math.atan2(pointerLogical.y - anchorLogical.y, pointerLogical.x - anchorLogical.x) : undefined;

        this.dragState = {
            frameId: frame.id,
            startPos: { ...frame.pos },
            startPointer: { x: e.offsetX, y: e.offsetY },
            axisLock: null,
            shiftLock: e.shiftKey,
            pointerId: e.pointerId,
            mode,
            handleId,
            startScaleK: frame.scaleK,
            startCenterLogical: centerLogical,
            startAnchorLogical: anchorLogical,
            startHandleLogical: handleLogical,
            startDistance,
            startRotationRad: mode === 'rotate' ? rotationRad : undefined,
            startAngle
        };
        this.historyBegin(`cameraFrames.${mode}`);
        this.overlay.style.cursor = mode === 'rotate' ? 'grabbing' : this.getCursorForHit(handleId, true);

        e.stopPropagation();
        e.preventDefault();
    }

    private onPointerMove(e: PointerEvent) {
        if (!this.state.enabled) {
            if (this.handleFrustumPointerMove(e)) {
                return;
            }
            return;
        }
        if (!this.dragState || e.pointerId !== this.dragState.pointerId) return;
        if (this.dragState.mode === 'pan') {
            this.handlePanDrag(e);
            this.overlay.style.cursor = 'grabbing';
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        const frame = this.state.frames.find(f => f.id === this.dragState.frameId);
        if (!frame) return;

        const rb = this.state.renderBox;
        const mapping = this.computeViewportMapping();
        const logicalW = mapping.logicalW;
        const logicalH = mapping.logicalH;

        if (this.dragState.mode === 'move') {
            const dx = e.offsetX - this.dragState.startPointer.x;
            const dy = e.offsetY - this.dragState.startPointer.y;

            if (this.dragState.shiftLock && !this.dragState.axisLock) {
                if (Math.abs(dx) + Math.abs(dy) > 5) {
                    this.dragState.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
                }
            }

            const effectiveScale = mapping.viewScale;
            const deltaLocalX = dx / (effectiveScale * logicalW);
            const deltaLocalY = dy / (effectiveScale * logicalH);

            frame.pos.x = this.dragState.startPos.x + (this.dragState.axisLock === 'y' ? 0 : deltaLocalX);
            frame.pos.y = this.dragState.startPos.y + (this.dragState.axisLock === 'x' ? 0 : deltaLocalY);
        } else if (this.dragState.mode === 'anchor') {
            const logical = this.screenToLogical(e.offsetX, e.offsetY);
            frame.anchor = {
                x: 0.5 + (logical.x - rb.center.cx) / logicalW,
                y: 0.5 + (logical.y - rb.center.cy) / logicalH
            };
        } else if (this.dragState.mode === 'resize') {
            const start = this.dragState;
            const logical = this.screenToLogical(e.offsetX, e.offsetY);
            const handleLogical = logical;
            if (!start.startHandleLogical || !start.startAnchorLogical || !start.startCenterLogical || !start.startScaleK || !start.startDistance) {
                return;
            }
            const d1 = Math.hypot(handleLogical.x - start.startAnchorLogical.x, handleLogical.y - start.startAnchorLogical.y);
            if (d1 <= 1e-6 || start.startDistance <= 1e-6) return;
            const s = d1 / start.startDistance;

            const newScaleK = start.startScaleK * s;
            const MIN_K = 0.10;  // 10%
            const MAX_K = 4.0;   // 400%
            const clampedK = Math.min(MAX_K, Math.max(MIN_K, newScaleK));
            frame.scaleK = clampedK;
            frame.scalePct = clampedK * 100;

            const newCenter = {
                x: start.startAnchorLogical.x + (start.startCenterLogical.x - start.startAnchorLogical.x) * s,
                y: start.startAnchorLogical.y + (start.startCenterLogical.y - start.startAnchorLogical.y) * s
            };

            frame.pos.x = 0.5 + (newCenter.x - rb.center.cx) / logicalW;
            frame.pos.y = 0.5 + (newCenter.y - rb.center.cy) / logicalH;
        } else if (this.dragState.mode === 'rotate') {
            this.overlay.style.cursor = 'grabbing';
            const start = this.dragState;
            if (!start.startAnchorLogical || !start.startCenterLogical || start.startRotationRad === undefined || start.startAngle === undefined) {
                return;
            }
            const anchorLogical = start.startAnchorLogical;
            const logical = this.screenToLogical(e.offsetX, e.offsetY);
            const angle = Math.atan2(logical.y - anchorLogical.y, logical.x - anchorLogical.x);
            const delta = angle - start.startAngle;
            const unsnappedNextRad = start.startRotationRad + delta;
            const useSnap = start.shiftLock || e.shiftKey;
            const snap = Math.PI / 12; // 15deg snap
            const nextRad = useSnap ? Math.round(unsnappedNextRad / snap) * snap : unsnappedNextRad;
            this.applyFrameRotationFromStart(frame, start, nextRad, logicalW, logicalH);
        }

        this.requestRender();
        this.events.fire('cameraFrames.stateChanged', this.snapshot());

        e.stopPropagation();
        e.preventDefault();
    }

    private clampCenterToViewport(cx: number, cy: number, rectW: number, rectH: number, vw: number, vh: number) {
        const halfW = rectW * 0.5;
        const halfH = rectH * 0.5;
        let minCx = -PAN_MARGIN_PX + halfW;
        let maxCx = vw + PAN_MARGIN_PX - halfW;
        if (minCx > maxCx) {
            const mid = (minCx + maxCx) * 0.5;
            minCx = mid;
            maxCx = mid;
        }
        let minCy = -PAN_MARGIN_PX + halfH;
        let maxCy = vh + PAN_MARGIN_PX - halfH;
        if (minCy > maxCy) {
            const mid = (minCy + maxCy) * 0.5;
            minCy = mid;
            maxCy = mid;
        }
        return {
            cx: Math.min(maxCx, Math.max(minCx, cx)),
            cy: Math.min(maxCy, Math.max(minCy, cy))
        };
    }

    private handlePanDrag(e: PointerEvent) {
        const mapping = this.computeViewportMapping();
        const rectW = mapping.logicalW * mapping.viewScale;
        const rectH = mapping.logicalH * mapping.viewScale;
        const vw = this.scene.camera.targetSize?.width ?? this.viewport.vw;
        const vh = this.scene.camera.targetSize?.height ?? this.viewport.vh;
        const startCenter = this.dragState.startCenterScreen ?? { x: this.state.renderBox.center.cx, y: this.state.renderBox.center.cy };
        const dx = e.offsetX - (this.dragState.startPointer?.x ?? e.offsetX);
        const dy = e.offsetY - (this.dragState.startPointer?.y ?? e.offsetY);
        const nextCenter = this.clampCenterToViewport(
            startCenter.x + dx,
            startCenter.y + dy,
            rectW,
            rectH,
            vw,
            vh
        );

        this.state.renderBox.center = nextCenter;
        this.syncCameraFrustum();
        this.requestRender();
        this.events.fire('cameraFrames.stateChanged', this.snapshot());
    }

    private applyFrameRotationFromStart(frame: FrameState, start: { startCenterLogical?: { x: number; y: number; }; startAnchorLogical?: { x: number; y: number; }; startRotationRad?: number; }, nextRad: number, logicalW: number, logicalH: number) {
        if (!start.startCenterLogical || !start.startAnchorLogical) {
            return;
        }
        const rb = this.state.renderBox;
        const baseRad = start.startRotationRad ?? 0;
        const delta = nextRad - baseRad;
        const offset = {
            x: start.startCenterLogical.x - start.startAnchorLogical.x,
            y: start.startCenterLogical.y - start.startAnchorLogical.y
        };
        const rotatedOffset = rotateOffsetPoint(offset, delta);
        const newCenter = {
            x: start.startAnchorLogical.x + rotatedOffset.x,
            y: start.startAnchorLogical.y + rotatedOffset.y
        };
        frame.rotationDeg = normalizeDegrees(nextRad * RAD2DEG);
        frame.pos.x = 0.5 + (newCenter.x - rb.center.cx) / logicalW;
        frame.pos.y = 0.5 + (newCenter.y - rb.center.cy) / logicalH;
    }

    private onPointerUp(e: PointerEvent) {
        if (this.handleFrustumPointerUp(e)) {
            return;
        }
        if (this.dragState && e.pointerId === this.dragState.pointerId) {
            this.historyCommit('cameraFrames.drag');
            this.overlay.releasePointerCapture(e.pointerId);
            this.dragState = null;
            this.lastPointer = { x: e.clientX, y: e.clientY };
            this.updatePointerFromLast();
            this.overlay.style.cursor = e.shiftKey ? 'grab' : '';
            e.stopPropagation();
            e.preventDefault();
        }
    }

    private onDoubleClick(e: MouseEvent) {
        if (!this.state.enabled) return;
        const handleHit = this.hitTestHandle(e.offsetX, e.offsetY);
        if (handleHit?.handleId === 'anchor') {
            this.resetAnchorToCenter(handleHit.frame);
        } else if (handleHit?.handleId === 'rotate') {
            this.resetFrameRotation(handleHit.frame);
        } else {
            return;
        }
        e.stopPropagation();
        e.preventDefault();
    }

    private resetFrameRotation(frame: FrameState | null) {
        this.historyRecord('cameraFrames.resetRotation', () => {
            if (!frame) {
                return;
            }
            const rb = this.state.renderBox;
            const logicalW = rb.baseSize.w * rb.scale.kx;
            const logicalH = rb.baseSize.h * rb.scale.ky;
            const start = {
                startCenterLogical: this.frameCenterLogical(frame, logicalW, logicalH),
                startAnchorLogical: this.frameAnchorLogical(frame, logicalW, logicalH),
                startRotationRad: this.frameRotationRad(frame)
            };
            this.applyFrameRotationFromStart(frame, start, 0, logicalW, logicalH);
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
        });
    }

    private resetAnchorToCenter(frame: FrameState | null) {
        this.historyRecord('cameraFrames.resetAnchor', () => {
            if (!frame) {
                return;
            }
            frame.anchor = { x: frame.pos.x, y: frame.pos.y };
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
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
            (frameId) => this.frameManagementName(frameId)
        );
    }

    private getCompressor() {
        if (!this.compressor) {
            this.compressor = new PngCompressor();
        }
        return this.compressor;
    }

    private async renderPng(params: { basePixels: Uint8Array; referenceLayers?: ReferenceExportLayer[]; frameOverlay: HTMLCanvasElement; gridOverlay?: HTMLCanvasElement | null; eyeLevelOverlay?: HTMLCanvasElement | null; width: number; height: number; filename: string; }) {
        const { basePixels, referenceLayers, frameOverlay, gridOverlay, eyeLevelOverlay, width, height, filename } = params;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error('Failed to acquire 2D context for PNG render');
        }

        const imgData = new ImageData(new Uint8ClampedArray(basePixels), width, height);
        ctx.putImageData(imgData, 0, 0);
        if (gridOverlay) {
            ctx.globalCompositeOperation = 'destination-over';
            ctx.drawImage(gridOverlay, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }
        const refLayers = Array.isArray(referenceLayers) ? referenceLayers : [];
        const backLayers = refLayers.filter(l => l?.group === 'back');
        const frontLayers = refLayers.filter(l => l?.group === 'front');
        if (backLayers.length > 0) {
            ctx.globalCompositeOperation = 'destination-over';
            backLayers.slice().reverse().forEach((layer) => {
                const bounds = layer.bounds;
                ctx.drawImage(layer.canvas, bounds?.left ?? 0, bounds?.top ?? 0);
            });
            ctx.globalCompositeOperation = 'source-over';
        }
        frontLayers.forEach((layer) => {
            const bounds = layer.bounds;
            ctx.drawImage(layer.canvas, bounds?.left ?? 0, bounds?.top ?? 0);
        });
        if (eyeLevelOverlay) {
            ctx.drawImage(eyeLevelOverlay, 0, 0);
        }
        ctx.drawImage(frameOverlay, 0, 0);

        const merged = new Uint32Array(ctx.getImageData(0, 0, width, height).data.buffer);
        const flipped = flipForCompressor(merged, width, height);

        const compressor = this.getCompressor();
        let arrayBuffer = await compressor.compress(flipped, width, height);
        arrayBuffer = addPngDpi(arrayBuffer, 150);
        downloadArrayBuffer(arrayBuffer, filename);
    }

    private async renderPsd(params: { basePixels: Uint8ClampedArray; underlays?: PsdOverlayLayer[]; overlays: PsdOverlayLayer[]; width: number; height: number; filename: string; }) {
        const { basePixels, underlays, overlays, width, height, filename } = params;
        await exportPsd({
            basePixels,
            underlays,
            overlays,
            width,
            height,
            filename
        });
    }

    private async renderImage(options?: { format?: ExportFormat; filename?: string }) {
        const rb = this.state.renderBox;
        const width = Math.round(rb.baseSize.w * rb.scale.kx);
        const height = Math.round(rb.baseSize.h * rb.scale.ky);

        if (width <= 0 || height <= 0) {
            return;
        }

        if (this.state.enabled && this.state.mainCameraPose) {
            this.applyCameraPose(this.state.mainCameraPose, { silent: true, allowOrtho: false });
        }

        const format = this.normalizeFormat(options?.format ?? this.state.exportFormat);
        const filename = this.resolveFilename(options?.filename ?? this.state.exportName, format);

        try {
            // 書き出し前に明示的にエクスポート用フラスタムを適用し、副作用イベント(camera.resize)頼りを排除
            this.syncExportFrustum(width, height);
            const basePixels = await renderBase(this.events, width, height);
            const debugOverlays = await renderOverlayLayers(this.events, width, height, this.state.exportGridOverlay);
            const referenceLayers = await renderReferenceLayers(this.events, width, height, { applyOpacity: format !== 'psd' });

            if (format === 'psd') {
                const referenceUnderlays: PsdOverlayLayer[] = referenceLayers
                .filter(layer => layer.group === 'back')
                .map(layer => ({ name: layer.name, canvas: layer.canvas, opacity: layer.opacity, bounds: layer.bounds }));
                const referenceOverlays: PsdOverlayLayer[] = referenceLayers
                .filter(layer => layer.group === 'front')
                .map(layer => ({ name: layer.name, canvas: layer.canvas, opacity: layer.opacity, bounds: layer.bounds }));
                const modelOverlays = await renderModelLayers(this.events, this.scene, width, height, this.state.exportModelLayers);
                const frameOverlays = this.renderFrameOverlaysByManagement(width, height);
                const overlayLayers = [
                    ...(debugOverlays?.grid ? [{ name: localize('panel.camera-frames.export.grid-layer.grid'), canvas: debugOverlays.grid }] : []),
                    ...(debugOverlays?.eyeLevel ? [{ name: localize('panel.camera-frames.export.grid-layer.eye-level'), canvas: debugOverlays.eyeLevel }] : []),
                    ...modelOverlays,
                    ...referenceOverlays,
                    ...frameOverlays
                ];
                await this.renderPsd({
                    basePixels: basePixels instanceof Uint8ClampedArray ? basePixels : new Uint8ClampedArray(basePixels),
                    underlays: referenceUnderlays.length > 0 ? referenceUnderlays : undefined,
                    overlays: overlayLayers,
                    width,
                    height,
                    filename
                });
            } else {
                const overlay = this.renderFrameOverlay(width, height);
                const gridOverlay = mergeOverlayCanvases(width, height, [debugOverlays?.grid]);
                const eyeLevelOverlay = mergeOverlayCanvases(width, height, [debugOverlays?.eyeLevel]);
                await this.renderPng({
                    basePixels,
                    referenceLayers,
                    frameOverlay: overlay.canvas,
                    gridOverlay,
                    eyeLevelOverlay,
                    width,
                    height,
                    filename
                });
            }
        } catch (error) {
            console.error('cameraFrames.render failed', error);
            await this.events.invoke('showPopup', {
                type: 'error',
                header: 'Camera Frames',
                message: `'${(error as Error)?.message ?? error}'`
            });
        } finally {
            // --- 修正箇所: ビューの復元 ---
            // render.offscreen が終了し、scene.camera.targetSize は null に戻っている。
            // ここで syncCameraFrustum を呼ぶことで、「Exportモード」から「Previewモード」の計算に戻り、
            // 元の ViewZoomPct が適用されたフラスタムがカメラに再設定される。
            if (this.state.enabled) {
                this.syncCameraFrustum();
                this.requestRender();
            }
        }
    }

    // 書き出し開始前に、指定サイズを前提としたエクスポート用フラスタムを明示的にカメラへ適用する
    // camera.resize などの副作用イベントに依存しない安全策。
    private syncExportFrustum(width: number, height: number) {
        // 一時的に targetSize を設定して export モードの計算を行い、終わったら戻す
        // targetSize の切替はここに集約し、モード混在や累積誤差を防ぐ。
        this.clearViewportNearOverride();
        const prevTarget = this.scene.camera.targetSize ? { ...this.scene.camera.targetSize } : null;
        this.scene.camera.targetSize = { width, height };
        this.syncCameraFrustum();
        this.scene.camera.targetSize = prevTarget;
    }

    // serialization --------------------------------------------------------

    public snapshot(): CameraFramesState {
        return {
            enabled: this.state.enabled,
            renderBox: JSON.parse(JSON.stringify(this.state.renderBox)),
            frames: this.state.frames.map(cloneFrame),
            mask: { ...this.state.mask },
            mainCameraPose: this.clonePoseSnapshot(this.state.mainCameraPose),
            nearClip: this.state.nearClip,
            exportName: this.state.exportName,
            exportFormat: this.normalizeFormat(this.state.exportFormat),
            exportGridOverlay: !!this.state.exportGridOverlay,
            exportModelLayers: !!this.state.exportModelLayers
        };
    }

    public applySnapshot(snapshot: CameraFramesState) {
        this.applyingHistory = true;
        try {
            this.state = JSON.parse(JSON.stringify(snapshot));
            this.normalizeMainRenderBoxProjection(this.scene.camera.fov);
            this.state.mask = {
                ...DEFAULT_MASK,
                ...(this.state.mask ?? {}),
                scope: normalizeMaskScope(this.state.mask?.scope, DEFAULT_MASK.scope)
            };
            this.state.mainCameraPose = this.clonePoseSnapshot(this.state.mainCameraPose);
            this.forceMainCameraPoseOrthoOff(this.state.mainCameraPose);
            if (!this.state.mainCameraPose) {
                this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(this.captureCameraPose()));
            }
            this.viewportPoseRuntime = null;
            this.viewportPoseRuntimeWorldDistance = null;
            if (!this.state.enabled) {
                this.hasEnteredViewportOnce = true;
            }
            this.selectedId = this.state.frames.find(f => f.selected)?.id ?? null;
            this.state.nearClip = this.computeSafeNearClip(this.state.nearClip);
            this.state.exportGridOverlay = !!this.state.exportGridOverlay;
            this.state.exportModelLayers = !!this.state.exportModelLayers;
            this.overlay.style.pointerEvents = 'none';
            this.rebuildBaseFrustum();
            if (this.state.enabled) {
                if (this.state.mainCameraPose) {
                    this.applyCameraPose(this.state.mainCameraPose, { silent: true, allowOrtho: false });
                }
                this.applyNearClipOverride();
                this.computeViewportMapping(true);
                this.syncCameraFrustum();
                this.scheduleNearClipGuard();
            } else {
                this.events.fire('camera.setNearOverride', null);
                this.events.fire('camera.setCustomFrustum', null);
            }
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            this.updatePointerFromLast();
            this.updateFovInfo();
            this.frustumDebugCache.points = null;
            this.frustumDebugCache.pose = null;
        } finally {
            this.applyingHistory = false;
        }
    }

    private serialize() {
        const snap = this.snapshot();
        return {
            ...snap,
            selectedId: this.selectedId,
            version: cameraFramesVersion
        };
    }

    private deserialize(docState: any) {
        if (!docState) {
            const initialPose = this.captureCameraPose();
            this.state = {
                enabled: false,
                renderBox: DEFAULT_RENDERBOX(),
                frames: [],
                mask: { ...DEFAULT_MASK },
                mainCameraPose: this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(initialPose)),
                nearClip: null,
                exportName: 'cf-output',
                exportFormat: 'png',
                exportGridOverlay: false,
                exportModelLayers: false
            };
            this.normalizeMainRenderBoxProjection(this.scene.camera.fov);
            this.selectedId = null;
            this.viewportPoseRuntime = null;
            this.viewportPoseRuntimeWorldDistance = null;
            this.hasEnteredViewportOnce = false;
            this.rebuildBaseFrustum();
            if (this.state.enabled && this.state.mainCameraPose) {
                this.applyCameraPose(this.state.mainCameraPose, { silent: true, allowOrtho: false });
                this.syncCameraFrustum();
            }
            this.updateFovInfo();
            this.requestRender();
            this.events.fire('cameraFrames.stateChanged', this.snapshot());
            return;
        }

        const _stateVersion = docState.version ?? 0; // reserved for future migrations

        const rb = docState.renderBox ?? DEFAULT_RENDERBOX();
        const exportName = typeof docState.exportName === 'string' ? docState.exportName : 'cf-output';
        const exportFormat = this.normalizeFormat(docState.exportFormat ?? 'psd');
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
        const viewZoomPct = this.normalizeViewZoomPct(rb.viewZoomPct ?? (legacyUiScale !== undefined ? legacyUiScale * 100 : undefined));
        const lastViewport = rb.lastViewport ?? { ...this.viewport };
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
            let baseFov = this.scene.camera.fov;
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
        const mainCameraPose = this.clonePoseSnapshot(docState.mainCameraPose);

        this.state = {
            enabled: !!docState.enabled,
            renderBox: {
                ...DEFAULT_RENDERBOX(),
                baseSize,
                scalePct,
                scale,
                anchor: rb.anchor ?? { ax: 0.5, ay: 0.5 },
                center: rb.center ?? { cx: this.viewport.vw / 2, cy: this.viewport.vh / 2 },
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

        this.normalizeMainRenderBoxProjection(this.scene.camera.fov);
        this.forceMainCameraPoseOrthoOff(this.state.mainCameraPose);
        this.state.nearClip = this.computeSafeNearClip(this.state.nearClip);
        if (!this.state.mainCameraPose) {
            this.state.mainCameraPose = this.forceMainCameraPoseOrthoOff(this.clonePoseSnapshot(this.captureCameraPose()));
        }

        this.overlay.style.pointerEvents = 'none';
        this.viewportPoseRuntime = null;
        this.viewportPoseRuntimeWorldDistance = null;
        this.hasEnteredViewportOnce = !this.state.enabled;

        this.selectedId = (docState && Object.prototype.hasOwnProperty.call(docState, 'selectedId')) ?
            docState.selectedId :
            (frames[0]?.id ?? null);
        this.state.frames.forEach((f) => {
            f.selected = f.id === this.selectedId;
        });

        // 現在の viewport に合わせて rect を整合
        this.computeViewportMapping(false);
        this.rebuildBaseFrustum();
        if (this.state.enabled) {
            if (this.state.mainCameraPose) {
                this.applyCameraPose(this.state.mainCameraPose, { silent: true, allowOrtho: false });
            }
            this.applyNearClipOverride();
            this.syncCameraFrustum();
        } else {
            this.events.fire('camera.setNearOverride', null);
            this.events.fire('camera.setCustomFrustum', null);
        }

        this.scheduleNearClipGuard();
        this.requestRender();
        this.events.fire('cameraFrames.stateChanged', this.snapshot());
        this.updatePointerFromLast();
        this.updateFovInfo();
    }
}

const registerCameraFrames = (events: Events, scene: Scene, canvasContainer: HTMLElement) => {
    const controller = new CameraFramesController(events, scene, canvasContainer);
    controller.attachPointerHandlers();
    return controller;
};

export { registerCameraFrames };
