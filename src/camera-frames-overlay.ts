import { DEG2RAD, FRAME_OUTLINE_WIDTH_PX } from './camera-frames-constants';
import {
    frameRotationRad,
    handleRects,
    strokeFrameOutlinePath,
    type FrameRectScreen
} from './camera-frames-frame-geometry';
import type { FrameMaskState, FrameState, RenderBoxState, Viewport, ViewportMapping } from './camera-frames-types';

type LogicalToScreen = (x: number, y: number) => { x: number; y: number; };

type DrawOverlayParams = {
    ctx: CanvasRenderingContext2D;
    viewport: Viewport;
    enabled: boolean;
    renderBox: RenderBoxState;
    mapping: ViewportMapping | null;
    logicalToScreen: LogicalToScreen;
    frameRects?: FrameRectScreen[];
    mask: FrameMaskState | null | undefined;
};

export const drawMask = (
    ctx: CanvasRenderingContext2D,
    viewport: Viewport,
    mask: FrameMaskState | null | undefined,
    rects: FrameRectScreen[]
) => {
    if (!mask?.enabled || rects.length === 0) {
        return;
    }
    const { vw, vh } = viewport;

    const filtered = mask.scope === 'selected' ? rects.filter(r => r.frame.selected) : rects;
    const targetRects = filtered.length > 0 ? filtered : rects;
    if (targetRects.length === 0) {
        return;
    }

    // compute bounding box
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    targetRects.forEach((r) => {
        const b = r.bounding;
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w);
        maxY = Math.max(maxY, b.y + b.h);
    });

    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${mask.opacity ?? 0.8})`;
    ctx.beginPath();
    ctx.rect(0, 0, vw, vh);
    ctx.rect(minX, minY, maxX - minX, maxY - minY);
    ctx.fill('evenodd');
    ctx.restore();
};

export const drawOverlay = ({
    ctx,
    viewport,
    enabled,
    renderBox,
    mapping,
    logicalToScreen,
    frameRects,
    mask
}: DrawOverlayParams) => {
    const { vw, vh } = viewport;
    ctx.clearRect(0, 0, vw, vh);

    if (!enabled || !mapping) {
        return;
    }

    const logicalW = mapping.logicalW;
    const logicalH = mapping.logicalH;
    const leftTop = logicalToScreen(renderBox.center.cx - logicalW * 0.5, renderBox.center.cy - logicalH * 0.5);
    const rightBottom = logicalToScreen(renderBox.center.cx + logicalW * 0.5, renderBox.center.cy + logicalH * 0.5);

    // render box
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(leftTop.x, leftTop.y, rightBottom.x - leftTop.x, rightBottom.y - leftTop.y);
    ctx.restore();

    const rects = frameRects ?? [];

    // mask
    drawMask(ctx, viewport, mask, rects);

    // frames
    rects.forEach((r) => {
        const wScreen = r.frameW * r.effectiveScale;
        const hScreen = r.frameH * r.effectiveScale;
        ctx.save();
        ctx.translate(r.centerScreen.x, r.centerScreen.y);
        ctx.rotate(r.rotationRad);
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = FRAME_OUTLINE_WIDTH_PX;
        ctx.setLineDash([]);
        strokeFrameOutlinePath(ctx, -wScreen * 0.5, -hScreen * 0.5, wScreen, hScreen);
        if (r.frame.selected) {
            ctx.strokeStyle = 'rgba(255,255,255,0.7)';
            ctx.setLineDash([3, 2]);
            ctx.lineWidth = 1;
            strokeFrameOutlinePath(ctx, -wScreen * 0.5, -hScreen * 0.5, wScreen, hScreen);
        }
        ctx.restore();
    });

    // handles (選択時のみ)
    const selectedRect = rects.find(r => r.frame.selected);
    if (selectedRect) {
        const handles = handleRects(selectedRect, renderBox, logicalToScreen);
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ff0000';
        handles.forEach((h) => {
            ctx.fillRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
            ctx.strokeRect(h.rect.x, h.rect.y, h.rect.w, h.rect.h);
        });
        ctx.restore();
    }
};

const snapAxisAlignedRect = (centerX: number, centerY: number, w: number, h: number) => {
    const left = Math.round(centerX - w * 0.5);
    const right = Math.round(centerX + w * 0.5);
    const top = Math.round(centerY - h * 0.5);
    const bottom = Math.round(centerY + h * 0.5);
    return {
        x: left,
        y: top,
        w: Math.max(0, right - left),
        h: Math.max(0, bottom - top)
    };
};

export const drawFramesToCtx = (
    ctx: CanvasRenderingContext2D,
    renderBox: RenderBoxState,
    width: number,
    height: number,
    frames: FrameState[]
) => {
    const logicalW = renderBox.baseSize.w * renderBox.scale.kx;
    const logicalH = renderBox.baseSize.h * renderBox.scale.ky;
    const boxLeft = width * 0.5 - logicalW * 0.5;
    const boxTop = height * 0.5 - logicalH * 0.5;
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxLeft, boxTop, logicalW, logicalH);
    ctx.clip();

    const framesSorted = frames.slice().sort((a, b) => a.order - b.order);
    framesSorted.forEach((frame) => {
        const frameW = frame.baseSize.w * frame.scaleK;
        const frameH = frame.baseSize.h * frame.scaleK;
        const centerX = width * 0.5 + (frame.pos.x - 0.5) * logicalW;
        const centerY = height * 0.5 + (frame.pos.y - 0.5) * logicalH;
        const rotationRad = frameRotationRad(frame, DEG2RAD);
        const lineWidth = FRAME_OUTLINE_WIDTH_PX;
        ctx.save();
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = lineWidth;

        // 回転が 90 度刻み（軸揃い）の場合はピクセルグリッドにスナップしてシャープに描く
        const quarterTurn = Math.PI * 0.5;
        const nearestQuarter = Math.round(rotationRad / quarterTurn);
        const alignedRad = nearestQuarter * quarterTurn;
        const isAxisAligned = Math.abs(rotationRad - alignedRad) < 1e-3;

        if (isAxisAligned) {
            const swap = (Math.abs(nearestQuarter) % 2) === 1;
            const w = swap ? frameH : frameW;
            const h = swap ? frameW : frameH;
            const snapped = snapAxisAlignedRect(centerX, centerY, w, h);
            strokeFrameOutlinePath(ctx, snapped.x, snapped.y, snapped.w, snapped.h);
        } else {
            ctx.translate(centerX, centerY);
            ctx.rotate(rotationRad);
            strokeFrameOutlinePath(ctx, -frameW * 0.5, -frameH * 0.5, frameW, frameH);
        }
        ctx.restore();
    });

    ctx.restore();
};

export const renderFrameOverlay = (
    width: number,
    height: number,
    renderBox: RenderBoxState,
    frames: FrameState[]
) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for frame overlay');
    }

    drawFramesToCtx(ctx, renderBox, width, height, frames);
    return { canvas };
};

type FrameManagementName = (frameId: string | null | undefined) => string;

export const renderFrameOverlaysByManagement = (
    width: number,
    height: number,
    renderBox: RenderBoxState,
    frames: FrameState[],
    frameManagementName: FrameManagementName
) => {
    const framesSorted = frames.slice().sort((a, b) => a.order - b.order);
    const order: string[] = [];
    const groups = new Map<string, FrameState[]>();

    framesSorted.forEach((frame) => {
        const name = frameManagementName(frame.id);
        if (!groups.has(name)) {
            groups.set(name, []);
            order.push(name);
        }
        groups.get(name).push(frame);
    });

    return order.map((name) => {
        const groupFrames = groups.get(name) ?? [];
        const { canvas } = renderFrameOverlay(width, height, renderBox, groupFrames);
        return { name, canvas };
    });
};
