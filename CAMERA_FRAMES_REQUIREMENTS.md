# supersplat CAMERA FRAMES Requirements v5

## 0. Versions and references

* v1: Initial CAMERA FRAMES / Render Box requirements (coordinate system, anchored scaling math).
* v2: Requirements based on the current UI implementation (camera-frames-panel.ts).
* v3: Merged render box and display zoom strategy. Detailed formulas for Rect/Scissor viewport control.
* v4: Removed Rect/Scissor viewport control and switched to **Frustum Extrapolation**. New camera sync spec that considers zoom-out peripheral display, fixed Horizontal FOV, and PlayCanvas Camera.rect behavior.
* **v5 (this doc):**
  * **Keeps all new v4 specs unchanged** (especially: Rect/Scissor removal, horizontal FOV lock, frustum extrapolation zoom-out behavior).
  * Restores and merges **v3-level detailed formulas, coordinate transforms, behavior specs, undo granularity, and output layer structure**.
  * Rect/Scissor math stays only as an appendix; the actual spec is fully frustum-based.

---

## 1. Purpose and goals

### 1.1 Objectives

1. **Anchored scaling for the render box (reference sheet)**

   * Support 9 anchor points (left/right/top/bottom/corners/center) for one-sided expansion.
   * Keep composition fixed at the anchor while the opposite side grows (off-axis frustum).
   * Expanding width and height independently must not break composition at the anchor.

2. **Display zoom (25-100%)**

   * When zooming out, **the previous composition shrinks and surrounding 3D scene appears in the margins**.
   * WebGL image, render box, frame, and mask shrink together.
   * **Post-v4 spec:** Do not use PlayCanvas `Camera.rect` clear; **draw the 3D scene over the full canvas and reveal surroundings by frustum expansion**.

3. **Separate composition FOV vs. effective frustum**

   * The FOV shown to the user (mm display) is a stable composition baseline.
   * Actual projection (preview/export) changes dynamically with UI zoom and render box scale.
   * **Confirmed spec:** With CAMERA FRAMES enabled, always lock to **Horizontal FOV**, regardless of aspect (never auto-switch to vertical).

4. **Preview matches export**

   * The on-screen render box (camera view) must pixel-match the image produced by `render.offscreen`.
   * During export: viewZoom=100%, non-extended frustum that maps exactly to the render box.

5. **Preserve existing features**

   * Keep current behavior: frame (red outline) rotation, pivot, Alt-scale, Shift axis-lock move, frame-outside mask, PSD layer structure, etc.

---

## 2. Terms and mental model

### 2.1 Viewport

* The rectangle (px) occupied by Supersplat's WebGL `<canvas>`.
* Equivalent to Blender's "3D viewport"; PlayCanvas `app.graphicsDevice` backbuffer.

### 2.2 Render Box (reference sheet)

* Reference rectangle like an A4 sheet.
* Default logical size: `1754 x 1240 px` (A4 at 150 dpi).
* Scale percentages `scalePct.x/y` produce logical size:

  ```ts
  logicalW = baseW * scale.kx; // kx = scalePct.x / 100
  logicalH = baseH * scale.ky; // ky = scalePct.y / 100
  ```

* Represents sheet size (output resolution).

### 2.3 Frame (red outline)

* Red outline placed inside the render box.
* Default logical size: `1536 x 864 px`.
* Red stroke (2px) is drawn **outside** the rectangle in both preview and export.
  * Drawn outside so the outline is visible only as a composition guide when placed in layouts.
  * The red stroke always uses **render box logical coordinates**.

### 2.4 Anchor

* Render box divided into 3x3; 9 anchor points for scaling origin.
* `anchor.ax/ay` are 0 / 0.5 / 1 (left/center/right, top/center/bottom).
* Anchor is the "composition invariant" point; off-axis frustum keeps it fixed.

### 2.5 Two-layer FOV

**1. Composition FOV (`baseFov`)**

* With render box at 100%, frame A (1536x864 @100%) centered, the horizontal FOV inside the frame is `baseFov`.
* 35mm equivalent (mm) and FOV slider use this as the baseline.
* Changing render box scale or UI zoom does **not** change this displayed value.

**2. Effective FOV/frustum (`effectiveFrustum`)**

* Projection matrix actually applied.
* When CAMERA FRAMES is on:
  * Export → frustum matches render box area.
  * Preview → frustum **extrapolates** from render box position and view zoom to show outside content.

### 2.6 Coordinate systems

1. **Logical Space**
   * Render box sheet coordinates.
   * Implementation favors using the logical center as (0,0) span `[-logicalW/2, logicalW/2]` etc., with screen mapping derived from viewScale.
   * Use formulas in §6.1 for exact viewScale math.

2. **RenderBox Local (0-1)**
   * Render box normalized coordinates.
   * `frame.pos` / `frame.pivot` / `frame.anchor` use this. Values may go outside [0,1].

3. **Screen Space (px)**
   * Canvas/viewport px (0..vw, 0..vh). Overlays, masks, and handles draw here.

4. **UI Space**
   * React DOM / CSS coordinates; Camera Frames panel is built here.

### 2.7 Composition invariance

* Keep the user's chosen reference point stable in screen space and composition, even after resize or zoom.

Key invariants:

* Viewport resize keeps `renderBox.center` at the same screen coordinates.
* Render box scaling keeps anchor composition unchanged (off-axis frustum).
* UI zoom scales down old composition uniformly while revealing surrounding 3D.
* Recompute from `baseFov` + current params every time to avoid accumulating error.

---

## 3. Data model

### 3.1 CameraFramesState

```ts
type CameraFramesState = {
  enabled: boolean;

  renderBox: RenderBoxState;
  frames: FrameState[];
  mask: FrameMaskState;

  nearClip?: number | null;

  exportName?: string;
  exportFormat?: 'png' | 'psd';
};
```

### 3.2 RenderBoxState

```ts
type RenderBoxState = {
  baseSize: { w: number; h: number; };      // 1754 x 1240

  scalePct: { x: number; y: number; };      // 100% baseline
  scale:    { kx: number; ky: number; };    // = scalePct / 100

  anchor: { ax: 0 | 0.5 | 1; ay: 0 | 0.5 | 1; };

  center: { cx: number; cy: number; };      // logical center (sheet center)

  fitScale: number;                         // viewScale baseline at zoom 100%

  viewZoomPct: number;                      // display zoom 25-100%

  lastViewport: { vw: number; vh: number; };

  projection?: {
    type: 'perspective' | 'ortho';
    baseFovY?: number;        // legacy compatibility; composition uses horizontal FOV lock
    orthoHalfHeight?: number;
  };
};
```

* `fitScale` is derived from viewport size and logical size.  
  `viewScale = fitScale * (viewZoomPct / 100)` drives overlay drawing.
* `center` is near the viewport center; keep its screen position stable on resize.

### 3.3 FrameState

```ts
type FrameState = {
  id: string;                               // "A", "B"... up to 20

  pos: { x: number; y: number; };           // RenderBox Local (0-1, can exceed)

  scalePct: number;
  scaleK: number;                           // = scalePct / 100

  baseSize: { w: number; h: number; };      // 1536 x 864

  order: number;
  selected?: boolean;

  rotationDeg: number;
  pivot: { x: number; y: number; };         // RenderBox Local
};
```

### 3.4 FrameMaskState

```ts
type FrameMaskState = {
  enabled: boolean;
  opacity: number; // 0.0-1.0
};
```

* v5: always mask everything **outside the union bounding box** of all frames.
* Mask is preview-only; not included in PNG/PSD.

### 3.5 Camera-side runtime

```ts
type CameraFramingRuntime = {
  baseFrustum: {
    l0: number; r0: number;
    b0: number; t0: number;
    near: number; far: number;
  };

  baseFov: number;            // composition horizontal FOV (rad)

  lockFovAxis: 'horizontal' | 'vertical';   // CAMERA FRAMES forces 'horizontal'
};
```

* Not persisted; rebuilt when CAMERA FRAMES is enabled.

---

## 4. Two-layer FOV and projection spec

### 4.1 Composition FOV (`baseFov`) definition

* Render box 100%, anchor center, frame A (1536x864 @100%) centered; horizontal FOV inside the frame is `baseFov`.
* 35mm equivalent uses existing `calcFovInfo`, but CAMERA FRAMES always treats it as horizontal FOV.
* UI display/slider:
  * FOV (mm) slider/display always uses `baseFov`.
  * Changing render box scale or viewZoom does not change the shown FOV(mm).
  * Only user edits to FOV(mm) update `baseFov`, then recalc effective frustum.

### 4.2 Building the baseline near plane (`baseFrustum`)

```ts
const halfW = near * Math.tan(baseFov / 2);
const halfH = halfW / aspect; // horizontal basis, aspect = width / height

const l0 = -halfW;
const r0 =  halfW;
const b0 = -halfH;
const t0 =  halfH;
```

* Recompute `baseFrustum` when CAMERA FRAMES turns on or FOV(mm) changes.
* `lockFovAxis` is always `'horizontal'` under CAMERA FRAMES; do not use PlayCanvas auto-flip.

### 4.3 Off-axis deformation from render box scale and anchor

Render box scales `kx, ky` and anchor `(ax, ay)` define the frustum corresponding to the sheet. This is also the **export frustum**.

```ts
const width1  = (r0 - l0) * kx;
const height1 = (t0 - b0) * ky;

const left1   = l0 + ax * ((r0 - l0) - width1);
const right1  = left1 + width1;

const bottom1 = b0 + ay * ((t0 - b0) - height1);
const top1    = bottom1 + height1;
```

* `(ax, ay)` = (0,0) → top-left anchor, (1,1) → bottom-right anchor.
* Example: bottom-left anchor + 150% width → bottom-left composition stays fixed; view expands to top-right.

### 4.4 Frustum Extrapolation for preview

During preview, expand the frustum based on render box screen rect and view zoom to draw beyond the box.

1. **Screen rect of render box (rectPx)**

   ```ts
   const logicalW = baseW * kx;
   const logicalH = baseH * ky;

   const zoomScale = viewZoomPct / 100;
   const fitScale  = min(vw / logicalW, vh / logicalH); // at init or Auto Fit

   const viewScale = fitScale * zoomScale;

   const screenCx = vw / 2;
   const screenCy = vh / 2;

   const rectW = logicalW * viewScale;
   const rectH = logicalH * viewScale;

   const rectX = screenCx - rectW / 2;
   const rectY = screenCy - rectH / 2;
   ```

   * Add `center` offset in the actual implementation; above is the base formula.

2. **World width per screen px (pxToWorld)**

   Near-plane width for the render box is `(right1 - left1)`. It spans `rectW` px on screen:

   ```ts
   const pxToWorld = (right1 - left1) / rectW;
   ```

3. **Frustum edges covering the whole screen**

   For screen left (x=0) and right (x=vw):

   ```ts
   const leftScreen  = left1  - (rectX - 0)      * pxToWorld;
   const rightScreen = right1 + (vw - (rectX + rectW)) * pxToWorld;
   ```

   Vertical:

   ```ts
   const pyToWorld   = (top1 - bottom1) / rectH;
   const bottomScreen = bottom1 - ( (rectY + rectH) - vh ) * pyToWorld;
   const topScreen    = top1    + ( rectY - 0 ) * pyToWorld;
   ```

4. **Interpreting view zoom as FOV expansion**

   Above extrapolation matches the v3 formula:

   ```ts
   const kZoom = viewZoomPct / 100;
   const fovZoomed = 2 * Math.atan((1 / kZoom) * Math.tan(baseFov / 2));
   ```

   Implementation can focus on **adjusting pxToWorld based on render box width and viewZoom**.

5. **Preview effective frustum**

   Final preview frustum:

   ```ts
   const left   = leftScreen;
   const right  = rightScreen;
   const bottom = bottomScreen;
   const top    = topScreen;
   ```

   Apply via `camera.setCustomFrustum(left, right, bottom, top, near, far)`.

### 4.5 Export frustum

* If `scene.camera.targetSize` is set, treat as **export mode**.
* Export mode:
  * `viewZoomPct = 100` fixed.
  * Render box fits the output image center.
  * Use **non-extended `(left1, right1, bottom1, top1)`** directly.
* Ensures preview content inside the render box matches the exported image pixel-for-pixel.

### 4.6 Always recompute from baseline

* On every change (render box scale, view zoom, viewport resize), recompute `effectiveFrustum` from `baseFrustum + current params` to avoid error accumulation.

---

## 5. UI spec (outline)

UI keeps the v2 skeleton and v3 detail, updated for v5.

1. **Header**
   * CAMERA FRAMES label
   * Enable toggle

2. **Render box (sheet)**
   * Anchor 3x3 buttons
   * Width(%) / Height(%) inputs + sliders (100..upper)
   * Display zoom (%) (viewZoom: 25-100)
   * Output resolution display (`outW x outH`)

3. **Frames**
   * Frame list (add/remove/click select)
   * Labels (A, B, C...), order, selection
   * Scale(%), rotation(deg), pivot (numeric + handles)

4. **Mask**
   * ON/OFF
   * Opacity (%) for out-of-frame mask

5. **Camera**
   * Nav mode (Orbit / FPV)
   * Position / rotation / roll lock
   * Local move sliders (dolly / truck / pedestal etc.)
   * Near clip
   * FOV(mm) slider (= baseFov)

6. **Export**
   * Filename
   * PNG / PSD
   * Render button

---

## 6. Behavior spec

### 6.1 Viewport resize

Action: window size changes → canvas px changes.

* Update:
  * `renderBox.lastViewport`
  * `renderBox.fitScale` (if Auto Fit)
* Do not change:
  * `renderBox.center` (screen position stays by recomputation)
  * `renderBox.scalePct/scale`
  * `renderBox.anchor`
  * `renderBox.viewZoomPct`
  * `frames[].pos, scalePct, rotationDeg, pivot`
  * `baseFov` (composition baseline)

`fitScale` example (Auto Fit):

```ts
logicalW = baseW * scale.kx;
logicalH = baseH * scale.ky;
fitScale = Math.min(vw / logicalW, vh / logicalH);
```

Overlay mapping:

```ts
const zoomScale = viewZoomPct / 100;
const viewScale = fitScale * zoomScale;

const screenX = vw / 2 + (logicalX - center.cx) * viewScale;
const screenY = vh / 2 + (logicalY - center.cy) * viewScale;
```

* Screen coords of `center` stay unchanged after resize.

### 6.2 Display zoom (viewZoomPct)

* Range: 25-100 (%).
* When updated:
  * `renderBox.viewZoomPct` changes.
  * `syncCameraFrustum` recomputes frustum expansion.
  * Overlay `viewScale` updates to `fitScale * (viewZoomPct/100)`.

**Visual behavior:**

* viewZoom=100: standard size.
* viewZoom=50: render box and frames shrink 50%; frustum widens to show surroundings (no black bars).
* viewZoom=25: same behavior; old composition shrinks uniformly, more 3D appears around.

### 6.3 Render box scaling (anchored)

Action: change width% / height% (`scalePct.x/y`).

* Update:
  * `renderBox.scalePct/scale`
  * `renderBox.fitScale` (if Auto Fit)
  * `effectiveFrustum` (off-axis + extrapolation as needed)
* Do not change:
  * `frames[].pos/scalePct/rotationDeg/pivot`
  * `renderBox.viewZoomPct`
  * `baseFov`

**Anchor invariance:**

* Screen position corresponding to anchor `(ax, ay)` stays fixed.
* Example: bottom-left anchor + width 150% → bottom-left composition intact; view grows to top-right.

### 6.4 Viewport and frustum expansion

* **Confirmed spec:** do **not** use `camera.rect` / `camera.scissorRect` during CAMERA FRAMES (keep `0,0,1,1`).
* Control projection matrix instead, so the render box can be placed anywhere on screen while the whole canvas renders 3D.
* Use px→world math from §4.4 (`pxToWorld` / `pyToWorld`).

### 6.5 Frame (red outline) operations

Current implementation is the reference (from v2/v3, reconfirmed in v5).

**Move:**

* Drag outline to change `pos` (RenderBox Local).
* Record mouse and pos at drag start; convert deltas to RenderBox Local.
* Shift drag → axis lock: choose axis after threshold; update only that axis.

**Scale:**

* Handles on corners/edges.
* Corner: uniform scale (aspect locked).
* Edge: one-axis scale; may still store as uniform `scalePct`.
* Default pivot: opposite handle of the dragged edge/corner.
* Alt: use `pivot` as fixed point (Photoshop-like).
* Clamp `scalePct` to 10-400%.

**Rotate:**

* Rotation handle 30px above top edge center.
* Drag updates `rotationDeg` from mouse angle about center.
* Shift snap at 15°.
* Double-click resets to 0°.

**Pivot:**

* Pivot handle near frame center.
* Drag updates `pivot` (RenderBox Local).
* Double-click resets to center.

### 6.6 Mask

* When `mask.enabled`:
  * Compute each frame's screen-space corners (after rotation).
  * Find bounding rectangle of all frames.
  * Fill outside that bounding box with `rgba(0,0,0, opacity)`.
* Mask is preview-only; not in PNG/PSD.

---

## 7. Export spec (PNG / PSD)

### 7.1 Output resolution

* Resolution `(outW, outH)` depends only on `renderBox.scale`:

```ts
outW = renderBox.baseSize.w * renderBox.scale.kx;
outH = renderBox.baseSize.h * renderBox.scale.ky;
```

* Not affected by viewport size, viewScale, or viewZoom.

### 7.2 Projection and frustum for export

* During offscreen render (`render.offscreen`), `scene.camera.targetSize` is set.
* Detect this and treat as export mode:
  * `viewZoomPct = 100`.
  * `center = viewport center` (offscreen treated as a viewport).
  * Frustum uses §4.3 `(left1, right1, bottom1, top1)` (no expansion).
* Ensures exported PNG/PSD matches the previewed red frame contents.

### 7.3 PNG

1. `render.offscreen(outW, outH)` for base render (no frame stroke).
2. Draw 2px red stroke (#FF0000) for each frame inside the render box; stroke sits outside the rectangle.
3. Add pHYs chunk with DPI=150.
4. Do not include mask.

### 7.4 PSD

* Layer stack (top to bottom):

  1. **Frame layers**: each frame's red outline as a separate layer (`Frame A`, `Frame B`, ...). 2px red stroke only.
  2. **Composite preview**: optional merged preview layer (base + frames).
  3. **Base layer**: 3D scene from `render.offscreen`, no strokes.
  4. **Thumbnail**: optional downscaled thumbnail.

* Document resolution: 150 PPI.
* Mask not included.

---

## 8. Persistence and Undo/Redo

### 8.1 Scene save

* In `doc.ts`, save under `cameraFrames`:

```ts
cameraFrames = {
  enabled,
  renderBox: {
    baseSize,
    scalePct,
    scale,
    anchor,
    center,
    fitScale,
    viewZoomPct,
    lastViewport,
    projection?,  // baseFovY etc. (composition baseline)
  },
  frames,
  mask,
  nearClip,
  exportName,
  exportFormat,
};
```

* Ignore unknown fields on load.
* `CameraFramingRuntime.baseFrustum` is runtime-only; do not persist.

### 8.2 Undo / Redo

Undo targets:

* `enabled`
* `renderBox.scalePct/scale`
* `renderBox.anchor`
* `renderBox.center` (as affected by anchor/scale changes)
* `renderBox.viewZoomPct`
* Frame add/remove/select/`pos`/`scalePct`/`rotationDeg`/`pivot`/`order`
* `mask.enabled/opacity`
* `nearClip`
* FOV(mm) (`baseFov`)
* Camera position/rotation/navMode, etc. from the Camera Frames panel

Granularity:

* One step per drag start-end.
* Numeric inputs: one step on confirm (Enter or blur).
* Toggles/selects: one step per click.

---

## 9. Implementation responsibilities and flow

### 9.1 camera-frames.ts

* `CameraFramesController` responsibilities:
  * Manage CameraFramesState.
  * Handle viewZoom, render box scaling, anchor changes.
  * `computeViewportMapping`:
    * Detect export mode (`scene.camera.targetSize`).
    * Derive `fitScale` and `viewScale` from render box logical size and viewport.
  * `syncCameraFrustum`:
    * Export mode → apply non-extended frustum.
    * Preview mode → do frustum extrapolation (§4.4) and pass to Camera.
  * Overlay drawing: render box, frames, mask, handles.

### 9.2 camera.ts / scene.ts

* `Scene.onPreRender`:
  * With CAMERA FRAMES: reset `camera.rect` / `camera.scissorRect` to `0,0,1,1`.
  * Call `CameraFramesController.syncCameraFrustum()` and apply custom frustum.
* `Camera`:
  * Implement `setCustomFrustum` to accept projection overrides.
  * Before `_updateProjectionMatrix`, set matrix from `effectiveFrustum`.
  * With CAMERA FRAMES enabled, force `horizontalFov = true` and disable PlayCanvas auto switching.

---

## 10. Acceptance tests (excerpt)

1. **Browser resize**
   * Resizing window does not change composition inside the render box.
   * Screen position of `renderBox.center` stays unchanged.

2. **Zoom back (50%)**
   * viewZoom 100% → 50% shrinks render box and frame uniformly.
   * Content shrinks but composition stays; surrounding scene appears (no black outside).

3. **Render box expansion (bottom-left anchor)**
   * Set anchor bottom-left, expand width to 150%; bottom-left composition matches, view grows to top-right only.

4. **Zoom + expansion mix**
   * Apply width 200% → zoom 50% → height 150% repeatedly; composition must not drift (always recompute from baseline).

5. **Preview vs export**
   * For any zoom/render box settings, exported PNG/PSD pixels match the previewed render box contents.

6. **FOV(mm) display**
   * Changing render box scale or viewZoom does not change displayed FOV(mm).
   * Editing FOV(mm) changes baseFov and composition accordingly.

7. **Portrait aspect**
   * Vertical render box still uses horizontal FOV; never flips to vertical axis.

8. **Undo / Redo**
   * Frame move/scale/rotate/pivot are one step per drag.
   * FOV, viewZoom, render box scale also undoable per action.

---

## Appendix A: Rect/Scissor math model (reference)

Rect/Scissor viewport control from v3 is **removed** after v4, but remains as math reference for understanding render box ↔ screen mapping. Do not implement Rect/Scissor; use frustum extrapolation (§4.4).

1. With Rect/Scissor, render box screen rect `rectPx` maps to normalized:

   ```ts
   rectNorm.x = rectPx.x / vw;
   rectNorm.y = rectPx.y / vh;
   rectNorm.w = rectPx.w / vw;
   rectNorm.h = rectPx.h / vh;
   ```

2. In v5, use these equations only to reason about screen placement and to verify `pxToWorld` / `pyToWorld`.

3. Because PlayCanvas does not auto-clear outside Rect, the implementation relies on frustum + overlays instead of Rect/Scissor. The normalized rect concept remains useful as a coordinate reference.
