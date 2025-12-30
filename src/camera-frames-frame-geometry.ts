import { FRAME_OUTLINE_WIDTH_PX } from './camera-frames-constants';
import { rotateOffset } from './camera-frames-math';
import type { FrameState, RenderBoxState } from './camera-frames-types';

type Rect = { x: number; y: number; w: number; h: number; };

export type FrameRectScreen = {
    frame: FrameState;
    logicalW: number;
    logicalH: number;
    frameW: number;
    frameH: number;
    centerLogical: { x: number; y: number; };
    centerScreen: { x: number; y: number; };
    rotationRad: number;
    cornersLogical: { x: number; y: number; }[];
    cornersScreen: { x: number; y: number; }[];
    effectiveScale: number;
    bounding: Rect;
};

type LogicalToScreen = (x: number, y: number) => { x: number; y: number; };
type ScreenToLogical = (x: number, y: number) => { x: number; y: number; };

export const frameRotationRad = (frame: FrameState, degToRad: number) => {
    const deg = frame.rotationDeg ?? 0;
    return deg * degToRad;
};

export const frameCenterLogical = (
    frame: FrameState,
    renderBox: RenderBoxState,
    logicalW: number,
    logicalH: number
) => ({
    x: renderBox.center.cx + (frame.pos.x - 0.5) * logicalW,
    y: renderBox.center.cy + (frame.pos.y - 0.5) * logicalH
});

export const frameRectsScreen = (
    frames: FrameState[],
    renderBox: RenderBoxState,
    logicalW: number,
    logicalH: number,
    effectiveScale: number,
    logicalToScreen: LogicalToScreen,
    degToRad: number
): FrameRectScreen[] => {
    const framesSorted = frames.slice().sort((a, b) => a.order - b.order);
    return framesSorted.map((frame) => {
        const frameW = frame.baseSize.w * frame.scaleK;
        const frameH = frame.baseSize.h * frame.scaleK;
        const centerLogical = frameCenterLogical(frame, renderBox, logicalW, logicalH);
        const centerScreen = logicalToScreen(centerLogical.x, centerLogical.y);
        const rotationRad = frameRotationRad(frame, degToRad);
        const hw = frameW * 0.5;
        const hh = frameH * 0.5;
        const cornersLogical = [
            { x: -hw, y: -hh },
            { x: hw, y: -hh },
            { x: hw, y: hh },
            { x: -hw, y: hh }
        ].map((off) => {
            const rotated = rotateOffset(off, rotationRad);
            return { x: centerLogical.x + rotated.x, y: centerLogical.y + rotated.y };
        });
        const cornersScreen = cornersLogical.map(p => logicalToScreen(p.x, p.y));
        let minX = Number.POSITIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        cornersScreen.forEach((p) => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        const bounding = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        return {
            frame,
            logicalW,
            logicalH,
            frameW,
            frameH,
            centerLogical,
            centerScreen,
            rotationRad,
            cornersLogical,
            cornersScreen,
            effectiveScale,
            bounding
        };
    });
};

export const frameAnchorLogical = (
    frame: FrameState,
    renderBox: RenderBoxState,
    logicalW: number,
    logicalH: number
) => {
    const anchor = frame.anchor ?? { x: frame.pos?.x ?? 0.5, y: frame.pos?.y ?? 0.5 };
    return {
        x: renderBox.center.cx + (anchor.x - 0.5) * logicalW,
        y: renderBox.center.cy + (anchor.y - 0.5) * logicalH
    };
};

export const getHandleLogicalOffset = (handleId: string, frameW: number, frameH: number) => {
    const hw = frameW * 0.5;
    const hh = frameH * 0.5;
    switch (handleId) {
        case 'nw': return { x: -hw, y: -hh };
        case 'n': return { x: 0, y: -hh };
        case 'ne': return { x: hw, y: -hh };
        case 'e': return { x: hw, y: 0 };
        case 'se': return { x: hw, y: hh };
        case 's': return { x: 0, y: hh };
        case 'sw': return { x: -hw, y: hh };
        case 'w': return { x: -hw, y: 0 };
        default: return { x: 0, y: 0 };
    }
};

export const getHandleLogicalPosition = (
    handleId: string,
    center: { x: number; y: number; },
    frameW: number,
    frameH: number,
    rotationRad: number
) => {
    const off = getHandleLogicalOffset(handleId, frameW, frameH);
    const rotated = rotateOffset(off, rotationRad);
    return { x: center.x + rotated.x, y: center.y + rotated.y };
};

export const getAnchorLogicalForHandle = (
    handleId: string | undefined,
    frame: FrameState,
    renderBox: RenderBoxState,
    center: { x: number; y: number; },
    frameW: number,
    frameH: number,
    logicalW: number,
    logicalH: number,
    rotationRad: number
) => {
    if (!handleId) {
        return center;
    }
    if (handleId === 'anchor' || handleId === 'rotate') {
        return frameAnchorLogical(frame, renderBox, logicalW, logicalH);
    }
    const off = getHandleLogicalOffset(handleId, frameW, frameH);
    const rotated = rotateOffset(off, rotationRad);
    return { x: center.x - rotated.x, y: center.y - rotated.y };
};

export const handleRects = (
    frameRect: FrameRectScreen,
    renderBox: RenderBoxState,
    logicalToScreen: LogicalToScreen
) => {
    const size = 10;
    const { centerLogical, frameW, frameH, rotationRad, effectiveScale } = frameRect;
    const anchorLogical = frameAnchorLogical(frameRect.frame, renderBox, frameRect.logicalW, frameRect.logicalH);
    const anchorScreen = logicalToScreen(anchorLogical.x, anchorLogical.y);
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((id) => {
        const pos = getHandleLogicalPosition(id, centerLogical, frameW, frameH, rotationRad);
        const screen = logicalToScreen(pos.x, pos.y);
        return { id, x: screen.x, y: screen.y };
    });
    handles.push({ id: 'anchor', x: anchorScreen.x, y: anchorScreen.y });
    const gapPx = 30;
    const logicalGap = gapPx / Math.max(1e-6, effectiveScale);
    const rotateHandleOffset = rotateOffset({ x: 0, y: -(frameH * 0.5 + logicalGap) }, rotationRad);
    const rotateLogical = { x: centerLogical.x + rotateHandleOffset.x, y: centerLogical.y + rotateHandleOffset.y };
    const rotateScreen = logicalToScreen(rotateLogical.x, rotateLogical.y);
    handles.push({ id: 'rotate', x: rotateScreen.x, y: rotateScreen.y });
    return handles.map(h => ({
        ...h,
        rect: { x: h.x - size * 0.5, y: h.y - size * 0.5, w: size, h: size }
    }));
};

export const getCursorForHit = (handleId: string | undefined, borderHit: unknown) => {
    if (handleId) {
        switch (handleId) {
            case 'nw':
            case 'se':
                return 'nwse-resize';
            case 'ne':
            case 'sw':
                return 'nesw-resize';
            case 'n':
            case 's':
                return 'ns-resize';
            case 'e':
            case 'w':
                return 'ew-resize';
            case 'anchor':
                return 'move';
            case 'rotate':
                return 'grab';
            default:
                return 'default';
        }
    }
    if (borderHit) {
        return 'move';
    }
    return '';
};

export const isPointInRect = (px: number, py: number, r: Rect) => (
    px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
);

export const hitTestHandle = (
    px: number,
    py: number,
    rects: FrameRectScreen[],
    selectedId: string | null,
    renderBox: RenderBoxState,
    logicalToScreen: LogicalToScreen
) => {
    const sorted = rects.slice().sort((a, b) => a.frame.order - b.frame.order);
    for (let i = sorted.length - 1; i >= 0; i--) {
        const r = sorted[i];
        if (r.frame.id !== selectedId) {
            continue;
        }
        const handles = handleRects(r, renderBox, logicalToScreen);
        const hit = handles.find(h => isPointInRect(px, py, h.rect));
        if (hit) {
            return { frame: r.frame, handleId: hit.id, frameRect: r, handle: hit };
        }
    }
    return null;
};

export const hitTestFrameBorder = (
    px: number,
    py: number,
    rects: FrameRectScreen[],
    screenToLogical: ScreenToLogical
) => {
    const HIT = 8;
    const sorted = rects.slice().sort((a, b) => a.frame.order - b.frame.order);
    const logical = screenToLogical(px, py);
    for (let i = sorted.length - 1; i >= 0; i--) {
        const r = sorted[i];
        const margin = HIT / Math.max(1e-6, r.effectiveScale);
        const dx = logical.x - r.centerLogical.x;
        const dy = logical.y - r.centerLogical.y;
        const local = rotateOffset({ x: dx, y: dy }, -r.rotationRad);
        const inside = Math.abs(local.x) <= r.frameW * 0.5 + margin && Math.abs(local.y) <= r.frameH * 0.5 + margin;
        const inner = Math.abs(local.x) <= Math.max(0, r.frameW * 0.5 - margin) && Math.abs(local.y) <= Math.max(0, r.frameH * 0.5 - margin);
        if (inside && !inner) {
            return r.frame;
        }
    }
    return null;
};

export const strokeFrameOutlinePath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const expand = FRAME_OUTLINE_WIDTH_PX * 0.5;
    ctx.strokeRect(x - expand, y - expand, w + expand * 2, h + expand * 2);
};
