# supersplat CAMERA FRAMES / Render Box Requirements v8 (aligned with current implementation)

## 0. Version and References

- Base code: `src/camera-frames.ts` / `src/ui/camera-frames-panel.ts` / `src/camera.ts` / `src/scene.ts` / `src/render.ts` (package version 2.16.0 / as of HEAD).
- CAMERA FRAMES individual version: `cameraFramesVersion` = **v2.8.0** (from `package.json`, appended as `| CAMERA FRAMES v2.8.0` to `#app-label`).
- This document replaces v7 with the **implementation-aligned v8**. Updates:
  - Added `scope: 'all' | 'selected'` to masks, reflecting scope selection and opacity (%) in UI/history/persistence (default 80% / all).
  - Made target switching explicit with radio-style buttons. When CAMERA FRAMES is ON both Main/Viewport show locked; when OFF only main can be selected (if mainCameraPose is retained). Main debug frustum colors: selected = magenta / not selected = cyan.
  - Before/after export, `syncExportFrustum` temporarily sets targetSize then restores it, returning to the preview frustum. Grid/eye level share a single toggle, and model layers render one by one per visible model (PSD only).
  - Formalized the panel header ON/OFF toggle (Main/Viewport icons) and compact mode. During timeline playback, auto-updating mainCameraPose is suppressed.

---

## 1. Purpose and Goals

1. **Render box scaling with anchors**
   - Choose a reference point from 9 anchors (left/center/right × top/center/bottom) and implement an off-axis frustum that keeps the composition on the anchor side intact while expanding or shrinking only the opposite side.
   - Even when scaling width and height independently, the composition at the anchor remains unchanged.

2. **Downscaled display for viewZoom (25-100%)**
   - When zooming out, the original composition shrinks on the canvas and surrounding 3D scene shows up as margin. No black cutoff outside the canvas.
   - Zoom out WebGL rendering, render-box outline, frame, and mask together, and extend the frustum to fill the entire screen.

3. **Separate base FOV and effective frustum**
   - Keep FOV(mm) as the **composition baseline horizontal FOV**, and only reapply when the UI value changes.
   - Recompute the actual projection each time based on render-box scale, viewZoom, and anchor.

4. **Match preview and export**
   - What you see inside the render box in preview matches PNG/PSD output pixel-for-pixel (export uses viewZoom=100% with no frustum extension).

5. **Preserve existing UX + strengthen implementation**
   - Keep existing operations such as moving/rotating/scaling/anchoring frames, Shift axis lock, Alt anchor swap, double-click reset, etc.
   - Also requirements for details in the current implementation such as adding pHYs to 150dpi PNG, PSD layer split, grid/eye-level optional output, near clip safety.

6. **Camera editing aid when CAMERA FRAMES is OFF**
   - Hold Main Camera Pose and allow pose/FOV(mm)/navMode/near edits from the UI even when CAMERA FRAMES is disabled.
   - For the viewport target provide a normal camera lens (mm) slider, and for the main target keep the composition baseline FOV(mm).

---

## 2. Terms and Mental Model

### 2.1 Viewport
- The rectangle (px) occupied by Supersplat’s WebGL `<canvas>`. UI/overlay calculations use CSS pixels, separate from `scene.targetSize` (device pixels).

### 2.2 Render Box (baseline sheet)
- Baseline resolution: `1754 × 1240 px` (A4 150dpi).
- Scale:
  ```ts
  logicalW = baseW * scale.kx; // kx = scalePct.x / 100
  logicalH = baseH * scale.ky; // ky = scalePct.y / 100
  ```
  Only allow 100% or higher, clamp each axis to 16000px or below.
- Anchor `ax/ay` = 0 | 0.5 | 1. Anchors are the “composition reference point” used for off-axis deformation during scaling. In the UI grid, ay=0 corresponds to “top.”
- `center` is screen coordinates (px). When resizing, adjust to keep the anchor’s screen position.
- `fitScale` = factor to fit the logical size into the viewport when viewZoom=100%. `viewScale = fitScale * (viewZoomPct / 100)` becomes the actual overlay scale.

### 2.3 Frame (red outline)
- Baseline size: `1536 × 864 px`. `scalePct` (10-400%) scales uniformly.
- `pos` is render-box local 0-1 (values outside allowed). `rotationDeg` is normalized to 0-360.
- `anchor` is the frame’s own reference point (defaults to pos). Used as the fixed point for Alt-resize and rotation.
- Draw frames in ascending `order`; hit testing favors the frontmost.

### 2.4 Mask
- Enabled when `mask.enabled` is true. Opacity 0.0-1.0 (UI shows %).
- `scope: 'all' | 'selected'`. When set to selected, only the chosen frames are targeted (fall back to all frames if none selected).
- Fill outside the rotated screen bounding box of all frames with a black mask. Preview only; not included in PNG/PSD.

### 2.5 Two-layer FOV
1. **Composition baseline FOV (`baseFov`)**: Horizontal FOV baseline. UI FOV(mm) displays this converted to mm. Do not auto-switch axis based on aspect (always equivalent to horizontalFov=true).
2. **Effective frustum (`effectiveFrustum`)**: Frustum used for rendering. Apply render-box scale and anchor for off-axis transformation, then only in preview extrapolate based on viewZoom to fill the screen.

### 2.6 Coordinate Systems
- **Logical Space**: px on the render box (baseline sheet coordinates). Relative calculations use `renderBox.center` as origin.
- **RenderBox Local 0-1**: Used for UI inputs such as `frame.pos/anchor`. Values below 0 or above 1 allow frames to be placed outside the sheet.
- **Screen Space**: CSS px on the canvas. Overlay drawing and pointer operations occur here.
- **UI Space**: PCUI DOM coordinates. Used for UI-specific processing such as panel movement.

### 2.7 Composition Invariance
- Repeated resizing/scaling/zooming keeps the anchor-based screen coordinates and composition unchanged.
- Recompute from `baseFrustum + current parameters` each time without delta updates or accumulated error.

### 2.8 UI Target and Main Camera Pose
- **uiTarget** = `'viewport' | 'main'`. Main can be selected only when CAMERA FRAMES is disabled (if `mainCameraPose` is retained and not exporting). When enabled, uiTarget is forced to viewport.
- `mainCameraPose` is the baseline pose for CAMERA FRAMES. Keep it even when disabled, and allow editing on the main target. The viewport target directly edits the normal camera.
- When the main target is selected, draw the main frustum in the debug layer (selected color: magenta, not selected: cyan). Drawing only; not hittable.

### 2.9 Viewport Lens (for CAMERA FRAMES OFF)
- Lens (mm) slider available only when CAMERA FRAMES is disabled and uiTarget=viewport. Shows the current camera FOV converted to 35mm and applies via `camera.setFov`.
- The conversion range uses crop factor based on renderBox baseline width (equivalent to HFOV 10-120°).

---

## 3. Data Model and Defaults

### 3.1 CameraFramesState
```ts
type CameraFramesState = {
  enabled: boolean;
  renderBox: RenderBoxState;
  frames: FrameState[];
  mask: FrameMaskState;
  mainCameraPose?: CameraPoseSnapshot | null;
  nearClip?: number | null;
  exportName?: string;
  exportFormat?: 'png' | 'psd';
  exportGridOverlay?: boolean;
  exportModelLayers?: boolean;
};
```

### 3.2 RenderBoxState (defaults)
- `baseSize: { w: 1754, h: 1240 }`
- `scalePct: { x: 100, y: 100 }` → `scale: { kx: 1, ky: 1 }` (100% or higher, each axis capped at 16000px)
- `anchor: { ax: 0.5, ay: 0.5 }`
- `center: { cx: 0, cy: 0 }` (initialized to viewport center when enabled)
- `fitScale: 1` (recalculate AutoFit on first load/resize)
- `viewZoomPct: 100` (clamped to 25-100)
- `lastViewport: { vw: 1, vh: 1 }`
- `projection: { type: 'perspective', baseFov: 60 }` (supports `type: 'ortho'` / `orthoHalfHeight`, persist using horizontal baseline)

### 3.3 FrameState (defaults)
- `id`: A, B, C… up to 20.
- `pos: { 0.5, 0.5 }`
- `scalePct: 100` → `scaleK: 1`
- `baseSize: { w: 1536, h: 864 }`
- `order`: increases from 0 in added order.
- `rotationDeg: 0`
- `anchor`: same as `pos`.

### 3.4 FrameMaskState (defaults)
- `enabled: false`
- `opacity: 0.8`
- `scope: 'all'`

### 3.5 Other defaults
- `mainCameraPose`: snapshot and keep the current camera pose (if missing, capture on enable).
- `nearClip`: null (calculate a safe value from the camera on enable and fix it)
- `exportName`: `'cf-output'`
- `exportFormat`: initial state is `psd`. When initializing from unsaved document (`docState=null`), set to `png` and overwrite through UI sync.
- `exportGridOverlay`: false
- `exportModelLayers`: false
- Constants: `HFOV_MIN=10`, `HFOV_MAX=120`, `W_35MM=36` (35mm equivalent width)
- `cameraFramesVersion`: save and display `cameraFramesVersion` from `package.json` (include in docSerialize).

---

## 4. Projection and Calculation Specs

### 4.1 Viewport Mapping (`computeViewportMapping`)
1. **Mode detection**: If `scene.camera.targetSize` exists, it is export mode; otherwise preview.
2. **Size choice**: `vw/vh` are targetSize in export, canvas CSS px in preview.
3. **Logical size**: `logicalW/H = baseSize * scale` (values <= 1e-6 are corrected to 1e-6).
4. **Auto Fit**: `autoFit = min(vw/logicalW, vh/logicalH)` (use 1 if vw/vh are 0).
5. **viewZoom**: 100 fixed during export; clamp to 25-100 in preview.
6. **fitScale update**: In preview, when `updateFitScale` is requested adopt `autoFit`. Always 1.0 in export.
7. **viewScale**: 1.0 during export; otherwise `fitScale * viewZoom/100`, fixed to at least 1e-6.
8. **center**: Screen center for export. In preview use `renderBox.center`. On resize with `updateFitScale && viewportChanged`, adjust `center` to keep the anchor’s screen position.
9. **Rectangles**: `rectPxRaw` is unclipped; `rectPx` / `rectNorm` are clipped for display. Use **Raw** for frustum extension.

### 4.2 Baseline Frustum (`rebuildBaseFrustum`)
- Aspect: use **render-box baseSize** (A4 ratio for A4). Do not use frame ratio (16:9).
- FOV:
  ```ts
  baseFovDeg = projection.baseFov ?? scene.camera.fov ?? HFOV_MIN;
  horizontalRad = clampFov(baseFovDeg -> horizontal, aspect); // 10-120°
  halfW = near * tan(horizontalRad / 2);
  halfH = halfW / aspect;
  l0=-halfW, r0=halfW, b0=-halfH, t0=halfH;
  ```
- `lockFovAxis` is fixed to `'horizontal'` (when CAMERA FRAMES is enabled). Set `camera.horizontalFov` to horizontal lock as well.
- For ortho, use `orthoHalfHeight` to determine left/right/bottom/top.

### 4.3 Off-axis via render-box scale and anchor
```ts
width1  = (r0 - l0) * kx;
height1 = (t0 - b0) * ky;
left1   = l0 + ax * ((r0 - l0) - width1);
right1  = left1 + width1;
// ay=0 points to "top", so use (1 - ay) for Y-up frustum
bottom1 = b0 + (1 - ay) * ((t0 - b0) - height1);
top1    = bottom1 + height1;
```
- This is also the **export frustum** (no extension).

### 4.4 Preview-time frustum extension (extrapolation)
1. From `rectPxRaw` (render-box rectangle on screen, unclipped) and `rbW/rbH` (width on near plane), derive world width per pixel:
   ```ts
   pxToWorldX = rbW / rectPxRaw.w;
   pxToWorldY = rbH / rectPxRaw.h;
   ```
2. Left/right/top/bottom covering the entire screen:
   ```ts
   left   = rbLeft  - rectPxRaw.x * pxToWorldX;
   right  = left + vw * pxToWorldX;
   top    = rbTop   + rectPxRaw.y * pxToWorldY;   // DOM Y=top, frustum Y-up
   bottom = top - vh * pxToWorldY;
   ```
3. Apply this to `camera.setCustomFrustum`, and always reset PlayCanvas Rect/Scissor to 0,0,1,1.

### 4.5 Frustum during export
- While `scene.camera.targetSize` is set, fix viewZoom=100%, center=screen center, fitScale=1 and use `left1/right1/bottom1/top1` as is.
- Before export, explicitly apply the export frustum with `syncExportFrustum()` (temporarily set targetSize). After finishing, restore targetSize and resync to the preview frustum.

### 4.6 FOV(mm) calculation
- Crop factor: `crop = renderBox.baseSize.w / 1536`.
- Conversion:
  ```ts
  eqMm = (W_35MM / (2 * tan(hfovRad/2))) * crop;
  hfovFrameDeg = 2 * atan(tan(hfovRad/2) / crop);
  ```
- UI slider range is dynamically determined by converting `HFOV_MIN/HFOV_MAX` to mm. Use `DEFAULT_FRAME_BASE` (16:9) aspect for calculation. Update `baseFov` and recompute only when changed.
- When CAMERA FRAMES is disabled and uiTarget=viewport, the viewport lens (mm) uses the same conversion to display/edit the current camera FOV (main target edits baseFov instead).

### 4.7 Safe near clip
- `computeSafeNearClip`: requires `near > 0` and `near < far`, capped by `far*0.1` / `boundRadius*0.5`. If invalid, use `DEFAULT_NEAR_CLIP=0.01`.
- Schedule a guard on enable/scene change, recheck a few frames later, and force correction if needed.

---

## 5. UI Specs (Panel & Overlay)

### 5.1 Panel common
- PCUI-based. Header includes **CAMERA FRAMES ON/OFF toggle (Main/Viewport icons)** and **compact mode toggle** (fold all contents). Header draggable; clamped to the window. Adjust position on resize.
- Prevent panel pointer events from propagating to canvas (stopPropagation). `pointerenter` clears overlay hit testing.
- Compact mode shows header only. ON/OFF toggled by the header Main/Viewport buttons (Main=ON, Viewport=OFF).

### 5.2 Layout (Render Box)
- Collapsible header (default collapsed). Anchor 3×3 buttons, width% / height% (min 100 / max 1000 in UI, actually clamped to 16000px), viewZoom 25-100, output resolution display.
- Output resolution display includes logical size (outW/outH), scale (kx/ky), and viewport overflow warning.
- FOV(mm) slider shows eqMm. Enabled only when framesActive (CAMERA FRAMES ON or uiTarget=main). Place **Target button (Main)** to the right; enabled only when main is selected (locked and not selectable when CAMERA FRAMES is ON).
- Viewport lens(mm) slider is enabled only when **CAMERA FRAMES is OFF and uiTarget=viewport**. Place **Target button (Viewport)** to the right; locked display when CF is ON.

### 5.3 Frame management
- Add (+), delete (trash) buttons, list shows A/B/C… Text shows effective pixel size (including render-box scale) and %.
- Click list to select / click again to deselect. Only selected frames show handles / are deletion targets.
- Scale% numeric input for selected frame (UI 1-500, actual clamp 10-400).

### 5.4 Mask
- Toggle, opacity (0-100%), scope selection (all / selected). With scope=selected and no selection, fall back to all frames.
- Preview only. Included in history and persistence.

### 5.5 FOV / Zoom / Lens
- FOV(mm) slider uses eqMm. Enabled only when framesActive.
- Canvas Zoom input is 25-100%. Update viewZoom immediately on input.
- Viewport lens(mm) slider is for the normal camera when CAMERA FRAMES is OFF. Enabled only when uiTarget=viewport and framesEnabled=false. Range covers HFOV 10-120° considering render-box crop.

### 5.6 Export
- Filename text (extension auto-added, use `camera-frames` when blank). Format selection (PSD/PNG). Two toggles:
  - Grid/Eye-level overlay output toggle (one button controls both. PNG composites, PSD adds layers).
  - Model layers toggle (PSD only). UI always visible; ignored when PNG is selected.
- Render button and progress spinner (disable button while rendering). Default selection is PSD.

### 5.7 Camera Transform / Navigation
- Collapsible section (default collapsed). Orbit/FPV toggle icons, position XYZ, rotation yaw/pitch/roll (with roll lock), local move sliders (right/up/forward, revert to 0 after use), near clip input.
- Alt for slow edit (nearClip step=0.1, precision=3; pose/position changes at 0.1x).
- While a numeric input is focused, pause transform auto-sync; resume on blur.
- With uiTarget=main edit mainCameraPose; with uiTarget=viewport edit the normal camera. When CAMERA FRAMES is ON, uiTarget is locked to viewport (target button shows lock).
- nearClip input is shown/enabled only when framesActive.

### 5.8 Overlay drawing
- Insert `#camera-frames-overlay` right after the canvas. Scale by devicePixelRatio. Default pointerEvents=none.
- Render box: white dashed 1px. Frame: red 2px, with white dotted 1px overlay when selected. Handles: white fill + red edge 10px; rotation handle is 30px above the frame.
- Mask: Fill outside bounding boxes of target frames with black at specified opacity.
- For 90° step rotations, pixel-snap export outlines to draw sharply.
- Even when CAMERA FRAMES is OFF, draw the main frustum in the debug layer when the main target is selected (selected=magenta, not selected=cyan). Non-interactive.

---

## 6. Behavior Details

### 6.1 Enable / Disable
- Enable:
  - Keep current viewport pose/FOV, set `camera.setLockFraming(true)` and `camera.setLockFovAxis('horizontal')`. Force uiTarget to viewport.
  - If `mainCameraPose` is empty, capture current camera as baseline and apply it. Inherit baseFov from the camera and sync to UI.
  - Correct current near to a safe value and override. Through `initDefaultsIfNeeded`, fill center to viewport center, compute fitScale, and add one frame if none exist.
  - Rebuild baseFrustum → sync frustum → redraw overlay → schedule near guard and update viewport lens state.
- Disable:
  - Save current pose to mainCameraPose, release near override and customFrustum, release lockFovAxis.
  - If viewportPoseRuntime/viewportFovRuntime exist, restore them to the normal camera.
  - Keep the state but stop follow logic. Selecting the main target becomes possible again.

### 6.2 Viewport resize / force refresh
- Detect via `ResizeObserver` and `camera.resize` / `cameraFrames.forceRefreshViewport`. Update overlay size and scale in CSS px, run `computeViewportMapping(true)` to do AutoFit and center correction. Keep anchor screen position.

### 6.3 ViewZoomPct (25-100)
- On change: update viewScale → recalc frustum (extrapolate) → redraw overlay. Do not change fitScale.
- Visual behavior: lower viewZoom shrinks the render box and frames evenly, showing more scene around without black bars.

### 6.4 Render-box scale (scalePct.x/y)
- Clamp to 100% or higher, each axis capped so baseSize does not exceed 16000px. Changes recorded as `cameraFrames.renderBoxScale` in history (debounced).
- Recalculate center based on anchor and update fitScale. Remap `frame.pos` so the logical center stays the same on screen.
- When CAMERA FRAMES is enabled, update the camera aspect lock.

### 6.5 Anchor change
- Changing render-box anchor **only switches the reference point for the next scale change**. Does not alter current frustum or display (composition stays). UI/overlay updates immediately.

### 6.6 Frame operations
- **Hit priority**: Higher `order` is front. Handles active only when selected.
- **Move**: Drag outline to update `pos`. Hold Shift for axis lock (confirm after a certain distance). Convert between local and screen based on scale.
- **Scale**: Drag handles for uniform scale. Hold Alt for symmetrical scaling around the frame’s anchor. Clamp to 10-400%.
- **Rotate**: Rotation handle 30px above. Shift for 15° snap. Double-click rotation handle to reset to 0°.
- **Frame anchor edit**: Drag anchor handle to update `frame.anchor`. Double-click anchor handle to reset to frame center.
- **Selection**: Click outline or list to select; click again to deselect. Selection is saved in snapshots.

### 6.7 Render-box pan
- Shift + drag empty area to move the entire render box within the screen (`renderBox.center` update). Clamp overflow beyond viewport with `PAN_MARGIN_PX=0`.

### 6.8 Mask
- Draw only when enabled. With `scope='selected'`, use only the bounding boxes of selected frames; if none, fall back to all frames. Preview only.

### 6.9 Pointer events
- Pass through overlay when gizmo is hit. Disable overlay when CAMERA FRAMES is off.
- Overlay pointerEvents=auto only while hit. During drag show `grabbing` cursor. Hold Shift to show `grab` even when no handle is selected.
- On `lostpointercapture`, commit drag history. Dragging/selecting the frustum itself is disabled.

### 6.10 Near clip
- When set from UI, record to history with debounce (apply near override immediately when framesActive). Input shown only when framesActive.
- Use `computeSafeNearClip` to ensure 0.01 or above, within `far*0.1` and `boundRadius*0.5`, and less than `far`. Schedule a guard to recheck a few frames later.

### 6.11 FOV(mm) / Viewport Lens(mm)
- When framesActive and FOV slider changes, update `baseFov`, rebuild baseFrustum. Display value is unaffected by renderBox scale or viewZoom.
- When CAMERA FRAMES is OFF and uiTarget=viewport, the viewport lens slider edits the normal camera FOV in mm (does not change baseFov). Range covers HFOV 10-120° considering render-box crop.
- eqMm calculation uses `DEFAULT_FRAME_BASE` aspect. Use viewportFovRuntime to restore FOV when toggling CF ON/OFF.

### 6.12 Main Camera Pose management
- Camera operations while CAMERA FRAMES is enabled reflect into mainCameraPose (suppress updates during timeline playback). When disabled, camera operations are stored in viewportPoseRuntime and viewport lens display is updated.
- With uiTarget=main, edits to Transform/FOV/near/navMode apply only to mainCameraPose and are used when CAMERA FRAMES is enabled. While CAMERA FRAMES is OFF, draw the main frustum in debug.
- Main target selectable only when `!enabled` and `mainCameraPose` exists and not exporting. If not allowed, switch uiTarget back to viewport.

---

## 7. Export Specs (PNG / PSD / Grid / Model)

### 7.1 Output resolution
```ts
outW = baseSize.w * scale.kx;
outH = baseSize.h * scale.ky;
```
Independent of viewZoom and viewport size.

### 7.2 Rendering pipeline
1. Explicitly apply export frustum with `syncExportFrustum(width,height)` (temporarily set targetSize). After finishing, restore targetSize/preview frustum.
2. Use `render.offscreen(width,height, options)` for base render. With `options.overlaysOnly=true`, disable World / shadow / gizmo / overlay to output only grid etc. Use `unpremultiplyAlpha` to remove premultiplication.
3. Draw frame overlays (red outlines) on a separate canvas for PNG/PSD. Pixel-snap for 90° steps.
4. Options: Grid/eye-level overlay (`exportGridOverlay`). PNG composites; PSD adds layers (`export.grid-layer.grid` / `export.grid-layer.eye-level` names).
5. Options: Model layers (PSD when `exportModelLayers`). Render each visible model individually, add with localized layer name `panel.camera-frames.export.model-layer`.
6. For PSD, group frame layers per management name (capitalize first letter of frame ID, or `Frames` if none).
7. After export, return to preview mode frustum (`syncCameraFrustum`).

### 7.3 PNG
- Composite Base + (optional) grid/eye-level + frames. Composite grid with `destination-over` so it sits behind. Add DPI=150 via pHYs chunk. Compress with `PngCompressor` and download.
- To avoid double flip in `render.offscreen`, flip bottom-up once before compression.

### 7.4 PSD
- Layer order top to bottom:
  1. Grid (when enabled)
  2. Eye level (when enabled)
  3. Model layers (when enabled, per visible model)
  4. Frame layer groups (grouped by management name, each layer is red outline only)
  5. Render (base render)
- PSD includes 150 PPI info and thumbnail. Mask is not included.

---

## 8. Persistence and History

### 8.1 Document save
- Save/restore via `docSerialize.cameraFrames` / `docDeserialize.cameraFrames`.
- Fields to save: `enabled`, `renderBox` (baseSize/scalePct/scale/anchor/center/fitScale/viewZoom/lastViewport/projection), `frames`, `mask` (including scope), `nearClip`, `exportName`, `exportFormat`, `exportGridOverlay`, `exportModelLayers`, `selectedId`, `mainCameraPose`, `version` (cameraFramesVersion).
- On load:
  - Support legacy `uiScale/viewScale/fovY`.
  - Clamp scale to 100% or higher and 16000px or below. Normalize viewZoom to 25-100.
  - Correct nearClip to a safe value. Reset selected according to `selectedId` (first item if none).
  - If viewport info is missing, estimate AutoFit from current viewport.
  - If projection.baseFov is missing, supplement from camera FOV. If mainCameraPose is missing, supplement from current camera.

### 8.2 Undo / Redo (`CameraFramesHistory`)
- Snapshot-based history. begin/commit on drag start/end; continuous edits are `debounced` (250ms).
- Targets:
  - enabled toggle
  - renderBox: scalePct/scale, anchor, center, fitScale, viewZoomPct, projection.baseFov
  - frames: add/delete/select/pos/scalePct/rotationDeg/anchor/order, anchor & rotation reset
  - mask: enabled/opacity/scope
  - nearClip
  - mainCameraPose (including uiTarget=main transform/nav/fov/near edits)
  - render-box pan (Shift+drag)
- Export settings (exportName/exportFormat/exportGridOverlay/exportModelLayers) are not included in history.
- After applying history, resend `cameraFrames.stateChanged` to sync UI and recalc overlay cursor.

---

## 9. Implementation Responsibilities and Module Split

### 9.1 CameraFramesController (`src/camera-frames.ts`)
- Handles state management, viewport mapping, frustum calculation, overlay drawing, pointer interactions, and export pipeline.
- Passes extrapolated frustum to `camera.setCustomFrustum`; when CAMERA FRAMES is enabled, do not use `camera.rect/scissorRect`.
- Applies near override, attaches cameraFramesVersion display, hooks History, switches mainCameraPose/viewportPose, restores viewport lens.
- When CAMERA FRAMES is OFF, draws the main frustum in debugLayer (selection reflected by uiTarget). Suppress mainPose auto-update during timeline playback.

### 9.2 UI Panel (`src/ui/camera-frames-panel.ts`)
- Builds PCUI panel, validates inputs and fires events, handles panel move/collapse, render button and spinner control.
- Updates ranges for FOV(mm) / Viewport lens(mm), shows output resolution and viewport overflow warnings, manages grid/model layer toggles, handles uiTarget switching and transform input target switching (show lock when CF ON).

### 9.3 Camera / Scene (`src/camera.ts`, `src/scene.ts`)
- Apply values passed via `camera.setCustomFrustum` to the projection matrix. When CAMERA FRAMES is enabled, lock aspect/horizontal FOV, and reset Rect/Scissor to 0,0,1,1 every frame.
- `camera.setLockFraming` locks aspectRatio and reallocates render targets when targetSize changes.
- In `scene.onPreRender`, refer to aspectLock info; in postrender, resend `cameraFrames.forceRefreshViewport` to fix initial layout drift.

### 9.4 render.offscreen (`src/render.ts`)
- Handles offscreen rendering and extraction of grid/eye-level overlays, premultiplied alpha removal (unpremultiplyAlpha option), and flip processing.
- With overlaysOnly, disable background/shadow/overlay/gizmo/World to return pure overlays.

---

## 10. Acceptance Tests (updated)

1. **Resize invariance**: Changing window width/height keeps anchor-based screen coordinates matching and composition fixed. `renderBox.center` is corrected.
2. **Zoom back to 50%**: Going from viewZoom 100 → 50 shrinks render box and frames evenly, shows surrounding scene without black bars.
3. **Anchor-based enlargement**: With top-left anchor + width 150%, composition at top-left stays, FOV expands only to bottom-right. Y-inversion logic keeps vertical orientation correct.
4. **Repeated zoom × scale**: Alternating render-box scale and viewZoom does not cause composition drift (recalculate every time).
5. **Preview = export**: Export PNG/PSD with arbitrary settings; viewport render-box area matches pixels. viewZoom fixed at 100% for export. After export, frustum returns to preview.
6. **FOV display**: Changing scale/zoom does not change FOV(mm) display; composition changes only when FOV is adjusted. HFOV clamped to 10-120°.
7. **Portrait composition**: Changing baseSize to portrait still keeps FOV axis locked to horizontal. PlayCanvas does not auto switch to vertical.
8. **Frame operations**: Move with Shift axis lock, Alt symmetric scale, 15° snap rotation, double-click to reset rotation/frame anchor. Hit priority is frontmost.
9. **Mask**: With scope=selected only outside selected frames is darkened (fall back to all when none). Not included in export.
10. **Grid/eye-level output**: When enabled at export, PNG composites overlays, PSD adds dedicated layers with no premultiply mismatch.
11. **Model layer output (PSD)**: With multiple visible models, PSD export adds per-model layers without mixing World/grid/gizmo.
12. **Undo/Redo**: One step per drag start/end, continuous input combined every 250ms. Render box/viewZoom/FOV/nearClip/frame edits/mask/mainCameraPose are tracked; export settings are not.
13. **CAMERA FRAMES OFF lens/pose**: With uiTarget=viewport, moving viewport lens(mm) changes normal camera FOV. With uiTarget=main, editing pose/FOV/near draws main frustum for debug and applies when enabled (target button only usable when OFF).

---

## Appendix A: Rect/Scissor model (reference)
Switched to frustum extension, so always reset `camera.rect` / `camera.scissorRect` to `0,0,1,1`.  
The normalized coordinate calculations using Rect/Scissor used until v3 are kept only as reference for px→world conversion validation.
```ts
rectNorm.x = rectPx.x / vw;
rectNorm.y = rectPx.y / vh;
rectNorm.w = rectPx.w / vw;
rectNorm.h = rectPx.h / vh;
```

---

## Appendix B: Clamp values and UI display summary
- viewZoom: 25-100 (%)
- renderBox scalePct: minimum 100%, maximum baseSize up to 16000px per axis
- frame scalePct: 10-400% (UI input 1-500% but actually clamped to 10-400)
- FOV: HFOV 10-120° clamp, eqMm varies with crop
- nearClip: 0 < near < far, corrected within far×0.1 / scene radius×0.5
- Frames: up to 20
- Handle size: 10px, rotation handle 30px above the frame
