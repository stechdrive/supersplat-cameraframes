import { Color } from 'playcanvas';

import type { FrameMaskState, RenderBoxState } from './camera-frames-types';

export const DEFAULT_RENDERBOX = (): RenderBoxState => ({
    baseSize: { w: 1754, h: 1240 },
    scalePct: { x: 100, y: 100 },
    scale: { kx: 1, ky: 1 },
    anchor: { ax: 0.5, ay: 0.5 },
    center: { cx: 0, cy: 0 },
    fitScale: 1,
    viewZoomPct: 100,
    lastViewport: { vw: 1, vh: 1 },
    projection: { type: 'perspective', baseFov: 60 }
});

export const DEFAULT_FRAME_BASE = { w: 1536, h: 864 };

export const DEFAULT_MASK: FrameMaskState = {
    enabled: false,
    opacity: 0.8,
    scope: 'all'
};

// constants for FOV <-> 35mm conversion
export const W_35MM = 36; // 35mm film width [mm]
export const HFOV_MIN = 10; // supersplat constraint
export const HFOV_MAX = 120;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const MIN_VIEW_ZOOM_PCT = 25;
export const MAX_VIEW_ZOOM_PCT = 100;
export const PAN_MARGIN_PX = 0;
export const FRAME_OUTLINE_WIDTH_PX = 2;
export const FRUSTUM_DEBUG_COLOR = new Color(0, 1, 1, 1);
export const FRUSTUM_SELECTED_COLOR = new Color(1, 0, 1, 1);
export const FRUSTUM_DEBUG_CACHE_VERSION = 2;
