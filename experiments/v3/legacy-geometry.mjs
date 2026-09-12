// 7a02e11以前のWebGL版から抽出した構図互換の固定fixture。
// 本番コードとして使用しない。旧実装の代数的な挙動との比較専用。
export const computeEffectiveFrustum = ({ getRuntimeFrustum, rebuildBaseFrustum, renderBox, scene }) => {
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
export const syncCameraFrustum = ({ stateEnabled, computeEffectiveFrustum, scene, events, viewport, computeViewportMapping }) => {
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
    }
    else {
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
export const computeViewportMapping = (renderBox, viewport, targetSize, updateFitScale, normalizeViewZoomPct) => {
    const rb = renderBox;
    const isExporting = !!targetSize;
    const vw = targetSize ? targetSize.width : viewport.vw;
    const vh = targetSize ? targetSize.height : viewport.vh;
    const logicalW = Math.max(1e-6, rb.baseSize.w * rb.scale.kx);
    const logicalH = Math.max(1e-6, rb.baseSize.h * rb.scale.ky);
    const autoFit = Math.min(vw > 0 ? vw / logicalW : 1, vh > 0 ? vh / logicalH : 1) || 1;
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
