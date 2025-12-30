import { HFOV_MAX, HFOV_MIN } from './camera-frames-constants';
import type { FrameState } from './camera-frames-types';

export const normalizeMaskScope = (scope: unknown, fallback: 'all' | 'selected' = 'all'): 'all' | 'selected' => {
    if (scope === 'selected') return 'selected';
    if (scope === 'all') return 'all';
    return fallback;
};

export const cloneFrame = (f: FrameState): FrameState => ({
    ...f,
    rotationDeg: f.rotationDeg ?? 0,
    pos: { ...f.pos },
    baseSize: { ...f.baseSize },
    anchor: f.anchor ? { ...f.anchor } : undefined
});

export const clampFov = (hfov: number) => Math.min(HFOV_MAX, Math.max(HFOV_MIN, hfov));

export const rotateOffset = (offset: { x: number; y: number; }, rad: number) => {
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    return {
        x: offset.x * c - offset.y * s,
        y: offset.x * s + offset.y * c
    };
};

export const normalizeDegrees = (deg: number) => {
    const wrapped = ((deg % 360) + 360) % 360;
    return Math.abs(wrapped - 360) < 1e-6 ? 0 : wrapped;
};
