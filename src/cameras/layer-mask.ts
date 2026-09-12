// Solve the opacity of an unoccluded source over the layers below it. Inputs
// are premultiplied RGBA readbacks. A single PSD mask cannot exactly represent
// arbitrary interleaving of differently coloured Gaussians; this keeps the
// existing colour/alpha reconstruction without altering the native projector.
export const reconstructLayerMask = (source: Uint8Array, composite: Uint8Array, lower: Uint8Array) => {
    if (source.length !== composite.length || source.length !== lower.length || source.length % 4) {
        throw new Error('レイヤーマスクの画像サイズが不一致です');
    }
    const mask = new Uint8ClampedArray(source.length);
    for (let i = 0; i < source.length; i += 4) {
        const alpha = source[i + 3] / 255;
        let weighted = 0;
        let weights = 0;
        for (let c = 0; c < 4; ++c) {
            const denominator = c === 3 ? alpha * (1 - lower[i + 3] / 255) :
                (source[i + c] - alpha * lower[i + c]) / 255;
            if (Math.abs(denominator) < 1 / 255) continue;
            const weight = Math.abs(denominator) * (c === 3 ? 2 : 1);
            const estimate = (composite[i + c] - lower[i + c]) / 255 / denominator;
            weighted += Math.max(0, Math.min(1, estimate)) * weight;
            weights += weight;
        }
        const value = alpha === 0 ? 0 : weights > 0 ? Math.round(255 * weighted / weights) : 255;
        mask.set([value, value, value, 255], i);
    }
    return mask;
};
