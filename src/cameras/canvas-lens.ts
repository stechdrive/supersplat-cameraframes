export type CanvasLens = {
    aspect: number;
    fovY: number;
    orthoHalfHeight: number;
    offsetX: number;
    offsetY: number;
};

// Express a pane's projection in full-canvas coordinates using the standard
// lens fields. Engine screenToWorld, gizmos and selection masks then share the
// same coordinate system without modifying Engine matrices or callbacks.
export const canvasLens = (lens: CanvasLens, rect: { x: number; y: number; z: number; w: number }): CanvasLens => {
    if (![rect.x, rect.y, rect.z, rect.w].every(Number.isFinite) || rect.z <= 0 || rect.w <= 0) throw new Error('ビューポート矩形が不正です');
    return {
        aspect: lens.aspect * rect.w / rect.z,
        fovY: Math.atan(Math.tan(lens.fovY * Math.PI / 360) / rect.w) * 360 / Math.PI,
        orthoHalfHeight: lens.orthoHalfHeight / rect.w,
        offsetX: lens.offsetX * rect.z + 1 - 2 * rect.x - rect.z,
        offsetY: lens.offsetY * rect.w + 1 - 2 * rect.y - rect.w
    };
};
