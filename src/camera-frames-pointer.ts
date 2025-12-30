import { getCursorForHit as getCursorForHitGeometry } from './camera-frames-frame-geometry';
import { hitTestGizmo } from './gizmo-hit';
import type { CameraFramesState } from './camera-frames-types';
import type { Scene } from './scene';

type DragMode = 'move' | 'resize' | 'anchor' | 'rotate' | 'pan';
type DragState = { mode: DragMode } | null;
type PointerPosition = { x: number; y: number; };

type HoverParams = {
    event: PointerEvent;
    canvasContainer: HTMLElement;
    overlay: HTMLCanvasElement;
    scene: Scene;
    state: CameraFramesState;
    dragState: DragState;
    frustumDragState: unknown | null;
    setLastPointer: (value: PointerPosition) => void;
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
