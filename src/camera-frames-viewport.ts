import type { RenderBoxState, Viewport, ViewportMapping } from './camera-frames-types';

type NormalizeViewZoomPct = (value?: number) => number;

export const computeViewportMapping = (
    renderBox: RenderBoxState,
    viewport: Viewport,
    targetSize: { width: number; height: number } | null | undefined,
    updateFitScale: boolean,
    normalizeViewZoomPct: NormalizeViewZoomPct
): ViewportMapping => {
    const rb = renderBox;

    const isExporting = !!targetSize;

    const vw = targetSize ? targetSize.width : viewport.vw;
    const vh = targetSize ? targetSize.height : viewport.vh;

    const logicalW = Math.max(1e-6, rb.baseSize.w * rb.scale.kx);
    const logicalH = Math.max(1e-6, rb.baseSize.h * rb.scale.ky);

    const autoFit = Math.min(
        vw > 0 ? vw / logicalW : 1,
        vh > 0 ? vh / logicalH : 1
    ) || 1;

    const prevViewport = rb.lastViewport ?? { vw, vh };
    const viewportChanged = prevViewport.vw !== vw || prevViewport.vh !== vh;

    const viewZoomPct = isExporting ? 100 : normalizeViewZoomPct(rb.viewZoomPct);
    const zoomScale = viewZoomPct / 100;

    let fitScale = rb.fitScale;
    const prevFitScaleRaw = rb.fitScale;
    const prevFitScaleSafe = (isFinite(prevFitScaleRaw) && prevFitScaleRaw > 0) ? prevFitScaleRaw : autoFit;

    const shouldUpdateFitScale = !isExporting && (updateFitScale || !isFinite(prevFitScaleRaw) || prevFitScaleRaw <= 0);
    if (shouldUpdateFitScale) {
        fitScale = autoFit;
        rb.fitScale = fitScale;
    }

    const prevViewScale = Math.max(1e-6, prevFitScaleSafe * zoomScale);
    const viewScale = isExporting ? 1.0 : Math.max(1e-6, fitScale * zoomScale);

    let cx = isExporting ? vw / 2 : rb.center.cx;
    let cy = isExporting ? vh / 2 : rb.center.cy;

    const shouldPreserveAnchor = !isExporting && updateFitScale && viewportChanged;
    if (shouldPreserveAnchor) {
        const anchor = rb.anchor ?? { ax: 0.5, ay: 0.5 };
        if (isFinite(anchor.ax) && isFinite(anchor.ay)) {
            const anchorOffsetX = (anchor.ax - 0.5) * logicalW * prevViewScale;
            const anchorOffsetY = (anchor.ay - 0.5) * logicalH * prevViewScale;
            const anchorPx = rb.center.cx + anchorOffsetX;
            const anchorPy = rb.center.cy + anchorOffsetY;

            const newAnchorOffsetX = (anchor.ax - 0.5) * logicalW * viewScale;
            const newAnchorOffsetY = (anchor.ay - 0.5) * logicalH * viewScale;

            cx = anchorPx - newAnchorOffsetX;
            cy = anchorPy - newAnchorOffsetY;
            rb.center = { cx, cy };
        }
    }
    if (!isExporting && updateFitScale) {
        rb.lastViewport = { vw, vh };
    }

    const displayW = logicalW * viewScale;
    const displayH = logicalH * viewScale;

    const rectXRaw = cx - displayW * 0.5;
    const rectYRaw = cy - displayH * 0.5;

    const rectPxRaw = { x: rectXRaw, y: rectYRaw, w: displayW, h: displayH };

    const clippedX = Math.max(0, Math.min(vw, rectXRaw));
    const clippedY = Math.max(0, Math.min(vh, rectYRaw));
    const clippedW = Math.max(0, Math.min(vw, rectXRaw + displayW) - clippedX);
    const clippedH = Math.max(0, Math.min(vh, rectYRaw + displayH) - clippedY);

    const rectPx = { x: clippedX, y: clippedY, w: clippedW, h: clippedH };
    const rectNorm = {
        x: vw > 0 ? rectPx.x / vw : 0,
        y: vh > 0 ? rectPx.y / vh : 0,
        w: vw > 0 ? rectPx.w / vw : 1,
        h: vh > 0 ? rectPx.h / vh : 1
    };
    const rectNormRaw = {
        x: vw > 0 ? rectXRaw / vw : 0,
        y: vh > 0 ? rectYRaw / vh : 0,
        w: vw > 0 ? displayW / vw : 1,
        h: vh > 0 ? displayH / vh : 1
    };

    return {
        fitScale,
        viewScale,
        logicalW,
        logicalH,
        rectPx,
        rectNorm,
        rectPxRaw,
        rectNormRaw
    };
};

export const logicalToScreen = (
    x: number,
    y: number,
    renderBox: RenderBoxState,
    mapping: ViewportMapping
) => {
    const effectiveScale = mapping.viewScale;
    const leftLogical = renderBox.center.cx - mapping.logicalW * 0.5;
    const topLogical = renderBox.center.cy - mapping.logicalH * 0.5;
    const sx = mapping.rectPxRaw.x + (x - leftLogical) * effectiveScale;
    const sy = mapping.rectPxRaw.y + (y - topLogical) * effectiveScale;
    return { x: sx, y: sy };
};

export const screenToLogical = (
    px: number,
    py: number,
    renderBox: RenderBoxState,
    mapping: ViewportMapping
) => {
    const effectiveScale = mapping.viewScale;
    const leftLogical = renderBox.center.cx - mapping.logicalW * 0.5;
    const topLogical = renderBox.center.cy - mapping.logicalH * 0.5;
    const lx = leftLogical + (px - mapping.rectPxRaw.x) / effectiveScale;
    const ly = topLogical + (py - mapping.rectPxRaw.y) / effectiveScale;
    return { x: lx, y: ly };
};
