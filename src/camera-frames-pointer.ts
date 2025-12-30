import { PAN_MARGIN_PX, RAD2DEG } from './camera-frames-constants';
import { normalizeDegrees, rotateOffset as rotateOffsetPoint } from './camera-frames-math';
import { getCursorForHit as getCursorForHitGeometry } from './camera-frames-frame-geometry';
import { hitTestGizmo } from './gizmo-hit';
import type { CameraFramesState, FrameState, RenderBoxState, Viewport, ViewportMapping } from './camera-frames-types';
import type { Scene } from './scene';

type DragMode = 'move' | 'resize' | 'anchor' | 'rotate' | 'pan';
type DragState = {
    frameId: string | null;
    startPos: { x: number; y: number; };
    startPointer: { x: number; y: number; };
    axisLock: 'x' | 'y' | null;
    shiftLock: boolean;
    pointerId: number;
    mode: DragMode;
    handleId?: string;
    startScaleK?: number;
    startCenterLogical?: { x: number; y: number; };
    startAnchorLogical?: { x: number; y: number; };
    startHandleLogical?: { x: number; y: number; };
    startDistance?: number;
    startRotationRad?: number;
    startAngle?: number;
    startCenterScreen?: { x: number; y: number; };
} | null;
type PointerPosition = { x: number; y: number; };

type LogicalPoint = { x: number; y: number; };
type HandleHit = { frame: FrameState; handleId?: string } | null;
type HitFrameBorder = FrameState | null;
type ComputeViewportMapping = () => ViewportMapping;
type ScreenToLogical = (x: number, y: number) => LogicalPoint;
type FrameCenterLogical = (frame: FrameState, logicalW: number, logicalH: number) => LogicalPoint;
type FrameAnchorLogical = (frame: FrameState, logicalW: number, logicalH: number) => LogicalPoint;
type FrameRotationRad = (frame: FrameState) => number;
type GetAnchorLogicalForHandle = (
    handleId: string | undefined,
    frame: FrameState,
    centerLogical: LogicalPoint,
    frameW: number,
    frameH: number,
    logicalW: number,
    logicalH: number,
    rotationRad: number
) => LogicalPoint;
type GetHandleLogicalPosition = (
    handleId: string,
    centerLogical: LogicalPoint,
    frameW: number,
    frameH: number,
    rotationRad: number
) => LogicalPoint;
type SelectFrame = (id: string) => void;
type SetDragState = (value: DragState) => void;
type SetLastPointer = (value: PointerPosition) => void;
type RequestRender = () => void;
type FireStateChanged = () => void;
type SyncCameraFrustum = () => void;
type HistoryBegin = (label: string) => void;
type HistoryCommit = (label: string) => void;
type HistoryRecord = (label: string, fn: () => void) => void;

type HoverParams = {
    event: PointerEvent;
    canvasContainer: HTMLElement;
    overlay: HTMLCanvasElement;
    scene: Scene;
    state: CameraFramesState;
    dragState: DragState;
    frustumDragState: unknown | null;
    setLastPointer: SetLastPointer;
    ensureUiTargetAvailability: () => void;
    hitTestHandle: (px: number, py: number) => { handleId?: string } | null;
    hitTestFrameBorder: (px: number, py: number) => any;
};

type UpdatePointerParams = {
    lastPointer: PointerPosition | null;
    canvasContainer: HTMLElement;
    overlay: HTMLCanvasElement;
    state: CameraFramesState;
    frustumDragState: unknown | null;
    ensureUiTargetAvailability: () => void;
    hitTestHandle: (px: number, py: number) => { handleId?: string } | null;
    hitTestFrameBorder: (px: number, py: number) => any;
};

type PointerDownParams = {
    event: PointerEvent;
    state: CameraFramesState;
    scene: Scene;
    overlay: HTMLCanvasElement;
    setDragState: SetDragState;
    selectFrame: SelectFrame;
    computeViewportMapping: ComputeViewportMapping;
    frameCenterLogical: FrameCenterLogical;
    frameRotationRad: FrameRotationRad;
    getAnchorLogicalForHandle: GetAnchorLogicalForHandle;
    frameAnchorLogical: FrameAnchorLogical;
    getHandleLogicalPosition: GetHandleLogicalPosition;
    screenToLogical: ScreenToLogical;
    hitTestHandle: (px: number, py: number) => HandleHit;
    hitTestFrameBorder: (px: number, py: number) => HitFrameBorder;
    historyBegin: HistoryBegin;
};

type PointerMoveParams = {
    event: PointerEvent;
    state: CameraFramesState;
    dragState: DragState;
    overlay: HTMLCanvasElement;
    scene: Scene;
    viewport: Viewport;
    handleFrustumPointerMove: (event: PointerEvent) => boolean;
    computeViewportMapping: ComputeViewportMapping;
    screenToLogical: ScreenToLogical;
    syncCameraFrustum: SyncCameraFrustum;
    requestRender: RequestRender;
    fireStateChanged: FireStateChanged;
};

type PointerUpParams = {
    event: PointerEvent;
    dragState: DragState;
    overlay: HTMLCanvasElement;
    setDragState: SetDragState;
    handleFrustumPointerUp: (event: PointerEvent) => boolean;
    historyCommit: HistoryCommit;
    setLastPointer: SetLastPointer;
    updatePointerFromLast: () => void;
};

type DoubleClickParams = {
    event: MouseEvent;
    state: CameraFramesState;
    hitTestHandle: (px: number, py: number) => HandleHit;
    resetAnchorToCenter: (frame: FrameState | null) => void;
    resetFrameRotation: (frame: FrameState | null) => void;
};

type ResetFrameRotationParams = {
    frame: FrameState | null;
    state: CameraFramesState;
    historyRecord: HistoryRecord;
    frameCenterLogical: FrameCenterLogical;
    frameAnchorLogical: FrameAnchorLogical;
    frameRotationRad: FrameRotationRad;
    requestRender: RequestRender;
    fireStateChanged: FireStateChanged;
    updatePointerFromLast: () => void;
};

type ResetAnchorParams = {
    frame: FrameState | null;
    historyRecord: HistoryRecord;
    requestRender: RequestRender;
    fireStateChanged: FireStateChanged;
    updatePointerFromLast: () => void;
};

type PanDragParams = {
    event: PointerEvent;
    dragState: DragState;
    state: CameraFramesState;
    scene: Scene;
    viewport: Viewport;
    computeViewportMapping: ComputeViewportMapping;
    syncCameraFrustum: SyncCameraFrustum;
    requestRender: RequestRender;
    fireStateChanged: FireStateChanged;
};

export const getCursorForHit = (handleId: string | undefined, borderHit: any) => {
    return getCursorForHitGeometry(handleId, borderHit);
};

export const onHover = ({
    event,
    canvasContainer,
    overlay,
    scene,
    state,
    dragState,
    frustumDragState,
    setLastPointer,
    ensureUiTargetAvailability,
    hitTestHandle,
    hitTestFrameBorder
}: HoverParams) => {
    setLastPointer({ x: event.clientX, y: event.clientY });
    ensureUiTargetAvailability();

    const rect = canvasContainer.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    if (frustumDragState) {
        overlay.style.pointerEvents = 'auto';
        overlay.style.cursor = 'grabbing';
        return;
    }

    // Gizmo優先チェック: ギズモにヒットしたらオーバーレイは透過する
    if (hitTestGizmo(scene, event.clientX, event.clientY)) {
        overlay.style.pointerEvents = 'none';
        overlay.style.cursor = '';
        return;
    }

    if (!state.enabled) {
        overlay.style.pointerEvents = 'none';
        overlay.style.cursor = '';
        return;
    }
    if (dragState) {
        overlay.style.pointerEvents = 'auto';
        overlay.style.cursor = dragState.mode === 'pan' ? 'grabbing' : '';
        return;
    }

    if (event.shiftKey) {
        overlay.style.pointerEvents = 'auto';
        overlay.style.cursor = 'grab';
        return;
    }

    const handleHit = hitTestHandle(px, py);
    const borderHit = !handleHit && hitTestFrameBorder(px, py);

    overlay.style.pointerEvents = (handleHit || borderHit) ? 'auto' : 'none';
    overlay.style.cursor = getCursorForHit(handleHit?.handleId, borderHit);
};

export const onContainerPointerDown = (_event: PointerEvent) => {
    // クリックでの対象切り替えは行わない（パネルUI経由でのみ操作対象を変更）
};

export const updatePointerFromLast = ({
    lastPointer,
    canvasContainer,
    overlay,
    state,
    frustumDragState,
    ensureUiTargetAvailability,
    hitTestHandle,
    hitTestFrameBorder
}: UpdatePointerParams) => {
    if (!lastPointer) {
        overlay.style.pointerEvents = 'none';
        return;
    }
    ensureUiTargetAvailability();
    const rect = canvasContainer.getBoundingClientRect();
    const px = lastPointer.x - rect.left;
    const py = lastPointer.y - rect.top;
    if (frustumDragState) {
        overlay.style.pointerEvents = 'auto';
        overlay.style.cursor = 'grabbing';
        return;
    }
    if (!state.enabled) {
        overlay.style.pointerEvents = 'none';
        overlay.style.cursor = '';
        return;
    }
    const handleHit = hitTestHandle(px, py);
    const borderHit = !handleHit && hitTestFrameBorder(px, py);
    overlay.style.pointerEvents = (handleHit || borderHit) && state.enabled ? 'auto' : 'none';
    overlay.style.cursor = getCursorForHit(handleHit?.handleId, borderHit);
};

const clampCenterToViewport = (cx: number, cy: number, rectW: number, rectH: number, vw: number, vh: number) => {
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
};

const applyFrameRotationFromStart = (
    frame: FrameState,
    start: { startCenterLogical?: LogicalPoint; startAnchorLogical?: LogicalPoint; startRotationRad?: number; },
    nextRad: number,
    logicalW: number,
    logicalH: number,
    renderBox: RenderBoxState
) => {
    if (!start.startCenterLogical || !start.startAnchorLogical) {
        return;
    }
    const rb = renderBox;
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
};

export const handlePanDrag = ({
    event,
    dragState,
    state,
    scene,
    viewport,
    computeViewportMapping,
    syncCameraFrustum,
    requestRender,
    fireStateChanged
}: PanDragParams) => {
    if (!dragState) {
        return;
    }
    const mapping = computeViewportMapping();
    const rectW = mapping.logicalW * mapping.viewScale;
    const rectH = mapping.logicalH * mapping.viewScale;
    const vw = scene.camera.targetSize?.width ?? viewport.vw;
    const vh = scene.camera.targetSize?.height ?? viewport.vh;
    const startCenter = dragState.startCenterScreen ?? { x: state.renderBox.center.cx, y: state.renderBox.center.cy };
    const dx = event.offsetX - (dragState.startPointer?.x ?? event.offsetX);
    const dy = event.offsetY - (dragState.startPointer?.y ?? event.offsetY);
    const nextCenter = clampCenterToViewport(
        startCenter.x + dx,
        startCenter.y + dy,
        rectW,
        rectH,
        vw,
        vh
    );

    state.renderBox.center = nextCenter;
    syncCameraFrustum();
    requestRender();
    fireStateChanged();
};

export const onPointerDown = ({
    event,
    state,
    scene,
    overlay,
    setDragState,
    selectFrame,
    computeViewportMapping,
    frameCenterLogical,
    frameRotationRad,
    getAnchorLogicalForHandle,
    frameAnchorLogical,
    getHandleLogicalPosition,
    screenToLogical,
    hitTestHandle,
    hitTestFrameBorder,
    historyBegin
}: PointerDownParams) => {
    if (!state.enabled) {
        return;
    }

    // Gizmo優先チェック: ギズモにヒットしたら操作開始しない
    if (hitTestGizmo(scene, event.clientX, event.clientY)) {
        return;
    }

    const handleHit = hitTestHandle(event.offsetX, event.offsetY);
    const frame = handleHit?.frame ?? hitTestFrameBorder(event.offsetX, event.offsetY);
    if (event.shiftKey && event.button === 0 && !handleHit && !frame) {
        overlay.setPointerCapture(event.pointerId);
        setDragState({
            frameId: null,
            startPos: { x: 0, y: 0 },
            startPointer: { x: event.offsetX, y: event.offsetY },
            axisLock: null,
            shiftLock: false,
            pointerId: event.pointerId,
            mode: 'pan',
            startCenterScreen: { x: state.renderBox.center.cx, y: state.renderBox.center.cy }
        });
        historyBegin('cameraFrames.renderBoxPan');
        overlay.style.cursor = 'grabbing';
        event.stopPropagation();
        event.preventDefault();
        return;
    }
    if (!frame) {
        return;
    }

    selectFrame(frame.id);
    overlay.setPointerCapture(event.pointerId);

    const mapping = computeViewportMapping();
    const logicalW = mapping.logicalW;
    const logicalH = mapping.logicalH;
    const centerLogical = frameCenterLogical(frame, logicalW, logicalH);
    const frameW = frame.baseSize.w * frame.scaleK;
    const frameH = frame.baseSize.h * frame.scaleK;
    const rotationRad = frameRotationRad(frame);

    const handleId = handleHit?.handleId;
    const mode: 'move' | 'resize' | 'anchor' | 'rotate' =
        handleId === 'anchor' ? 'anchor' :
            (handleId === 'rotate' ? 'rotate' : (handleId ? 'resize' : 'move'));

    const anchorLogicalDefault = getAnchorLogicalForHandle(handleId, frame, centerLogical, frameW, frameH, logicalW, logicalH, rotationRad);
    const anchorLogical = (mode === 'resize' && event.altKey) ? frameAnchorLogical(frame, logicalW, logicalH) : anchorLogicalDefault;
    const handleLogical = handleId ? getHandleLogicalPosition(handleId, centerLogical, frameW, frameH, rotationRad) : null;
    const startDistance = (mode === 'resize' && handleLogical) ? Math.hypot(handleLogical.x - anchorLogical.x, handleLogical.y - anchorLogical.y) : null;
    const pointerLogical = screenToLogical(event.offsetX, event.offsetY);
    const startAngle = (mode === 'rotate') ? Math.atan2(pointerLogical.y - anchorLogical.y, pointerLogical.x - anchorLogical.x) : undefined;

    setDragState({
        frameId: frame.id,
        startPos: { ...frame.pos },
        startPointer: { x: event.offsetX, y: event.offsetY },
        axisLock: null,
        shiftLock: event.shiftKey,
        pointerId: event.pointerId,
        mode,
        handleId,
        startScaleK: frame.scaleK,
        startCenterLogical: centerLogical,
        startAnchorLogical: anchorLogical,
        startHandleLogical: handleLogical,
        startDistance,
        startRotationRad: mode === 'rotate' ? rotationRad : undefined,
        startAngle
    });
    historyBegin(`cameraFrames.${mode}`);
    overlay.style.cursor = mode === 'rotate' ? 'grabbing' : getCursorForHit(handleId, true);

    event.stopPropagation();
    event.preventDefault();
};

export const onPointerMove = ({
    event,
    state,
    dragState,
    overlay,
    scene,
    viewport,
    handleFrustumPointerMove,
    computeViewportMapping,
    screenToLogical,
    syncCameraFrustum,
    requestRender,
    fireStateChanged
}: PointerMoveParams) => {
    if (!state.enabled) {
        if (handleFrustumPointerMove(event)) {
            return;
        }
        return;
    }
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    if (dragState.mode === 'pan') {
        handlePanDrag({
            event,
            dragState,
            state,
            scene,
            viewport,
            computeViewportMapping,
            syncCameraFrustum,
            requestRender,
            fireStateChanged
        });
        overlay.style.cursor = 'grabbing';
        event.stopPropagation();
        event.preventDefault();
        return;
    }
    const frame = state.frames.find(f => f.id === dragState.frameId);
    if (!frame) return;

    const mapping = computeViewportMapping();
    const logicalW = mapping.logicalW;
    const logicalH = mapping.logicalH;

    if (dragState.mode === 'move') {
        const dx = event.offsetX - dragState.startPointer.x;
        const dy = event.offsetY - dragState.startPointer.y;

        if (dragState.shiftLock && !dragState.axisLock) {
            if (Math.abs(dx) + Math.abs(dy) > 5) {
                dragState.axisLock = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
            }
        }

        const effectiveScale = mapping.viewScale;
        const deltaLocalX = dx / (effectiveScale * logicalW);
        const deltaLocalY = dy / (effectiveScale * logicalH);

        frame.pos.x = dragState.startPos.x + (dragState.axisLock === 'y' ? 0 : deltaLocalX);
        frame.pos.y = dragState.startPos.y + (dragState.axisLock === 'x' ? 0 : deltaLocalY);
    } else if (dragState.mode === 'anchor') {
        const logical = screenToLogical(event.offsetX, event.offsetY);
        frame.anchor = {
            x: 0.5 + (logical.x - state.renderBox.center.cx) / logicalW,
            y: 0.5 + (logical.y - state.renderBox.center.cy) / logicalH
        };
    } else if (dragState.mode === 'resize') {
        const start = dragState;
        const logical = screenToLogical(event.offsetX, event.offsetY);
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

        frame.pos.x = 0.5 + (newCenter.x - state.renderBox.center.cx) / logicalW;
        frame.pos.y = 0.5 + (newCenter.y - state.renderBox.center.cy) / logicalH;
    } else if (dragState.mode === 'rotate') {
        overlay.style.cursor = 'grabbing';
        const start = dragState;
        if (!start.startAnchorLogical || !start.startCenterLogical || start.startRotationRad === undefined || start.startAngle === undefined) {
            return;
        }
        const anchorLogical = start.startAnchorLogical;
        const logical = screenToLogical(event.offsetX, event.offsetY);
        const angle = Math.atan2(logical.y - anchorLogical.y, logical.x - anchorLogical.x);
        const delta = angle - start.startAngle;
        const unsnappedNextRad = start.startRotationRad + delta;
        const useSnap = start.shiftLock || event.shiftKey;
        const snap = Math.PI / 12; // 15deg snap
        const nextRad = useSnap ? Math.round(unsnappedNextRad / snap) * snap : unsnappedNextRad;
        applyFrameRotationFromStart(frame, start, nextRad, logicalW, logicalH, state.renderBox);
    }

    requestRender();
    fireStateChanged();

    event.stopPropagation();
    event.preventDefault();
};

export const onPointerUp = ({
    event,
    dragState,
    overlay,
    setDragState,
    handleFrustumPointerUp,
    historyCommit,
    setLastPointer,
    updatePointerFromLast
}: PointerUpParams) => {
    if (handleFrustumPointerUp(event)) {
        return;
    }
    if (dragState && event.pointerId === dragState.pointerId) {
        historyCommit('cameraFrames.drag');
        overlay.releasePointerCapture(event.pointerId);
        setDragState(null);
        setLastPointer({ x: event.clientX, y: event.clientY });
        updatePointerFromLast();
        overlay.style.cursor = event.shiftKey ? 'grab' : '';
        event.stopPropagation();
        event.preventDefault();
    }
};

export const resetFrameRotation = ({
    frame,
    state,
    historyRecord,
    frameCenterLogical,
    frameAnchorLogical,
    frameRotationRad,
    requestRender,
    fireStateChanged,
    updatePointerFromLast
}: ResetFrameRotationParams) => {
    historyRecord('cameraFrames.resetRotation', () => {
        if (!frame) {
            return;
        }
        const rb = state.renderBox;
        const logicalW = rb.baseSize.w * rb.scale.kx;
        const logicalH = rb.baseSize.h * rb.scale.ky;
        const start = {
            startCenterLogical: frameCenterLogical(frame, logicalW, logicalH),
            startAnchorLogical: frameAnchorLogical(frame, logicalW, logicalH),
            startRotationRad: frameRotationRad(frame)
        };
        applyFrameRotationFromStart(frame, start, 0, logicalW, logicalH, rb);
        requestRender();
        fireStateChanged();
        updatePointerFromLast();
    });
};

export const resetAnchorToCenter = ({
    frame,
    historyRecord,
    requestRender,
    fireStateChanged,
    updatePointerFromLast
}: ResetAnchorParams) => {
    historyRecord('cameraFrames.resetAnchor', () => {
        if (!frame) {
            return;
        }
        frame.anchor = { x: frame.pos.x, y: frame.pos.y };
        requestRender();
        fireStateChanged();
        updatePointerFromLast();
    });
};

export const onDoubleClick = ({
    event,
    state,
    hitTestHandle,
    resetAnchorToCenter,
    resetFrameRotation
}: DoubleClickParams) => {
    if (!state.enabled) return;
    const handleHit = hitTestHandle(event.offsetX, event.offsetY);
    if (handleHit?.handleId === 'anchor') {
        resetAnchorToCenter(handleHit.frame);
    } else if (handleHit?.handleId === 'rotate') {
        resetFrameRotation(handleHit.frame);
    } else {
        return;
    }
    event.stopPropagation();
    event.preventDefault();
};
