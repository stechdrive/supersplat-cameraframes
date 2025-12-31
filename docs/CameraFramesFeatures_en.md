# CAMERA FRAMES Features Overview

CAMERA FRAMES v2.9.8 lets you lay out multiple frames on an A4-like master sheet and keep the composition stable with anchored off-axis frustums so preview and export match. It unifies zoomable previews, frame editing, camera pose control, and PSD/PNG export.

## 1. What it offers
- **Anchored render box scaling**: 3×3 anchors drive off-axis frustums so horizontal/vertical scale and viewZoom never drift the anchored composition.
- **Preview = export**: Aside from viewZoom, what you see in preview matches PNG/PSD pixels. Export forces viewZoom=100% and centered mapping, then restores the preview frustum.
- **Multi-frame management**: Add/move/rotate/scale/change anchors for up to 20 frames; mask and draw order are preserved.
- **Dual camera handling**: When CAMERA FRAMES is on, the main pose is held while the viewport camera is locked. When off, switch between main/viewport to edit lenses (mm) and poses separately.
- **Export options**: PNG/PSD, grid+eye-level combined toggle, PSD model layers, 150dpi pHYs, unpremultiply, and per-frame layers.

## 2. Panel and toggles
- Header provides **CAMERA FRAMES ON/OFF** (Main=ON, Viewport=OFF icons) and **Compact** toggle. Compact mode shows only the header.
- ON locks uiTarget=viewport and shows the Main button as locked. OFF allows choosing Main only when a mainCameraPose exists.
- Panel can be dragged and is clamped inside the window; pointer events on the panel do not fall through to the canvas.
- Label shows `| CAMERA FRAMES v2.9.8`.

## 3. Render Box (Layout)
- Master sheet `1754 × 1240px` (A4 at 150dpi). `Width/Height (%)` are clamped to 100%+ up to 16000px equivalent. 3×3 anchor sets the pivot for future scaling.
- On viewport resize, AutoFit updates `fitScale` and adjusts center so the anchored screen position stays fixed.
- **Canvas Zoom (25–100%)**: Preview-only magnification. Zooming out shrinks the sheet and frames evenly and reveals more of the scene.
- **FOV (mm)**: Edits the composition base horizontal FOV in 35mm equivalent (HFOV 10–120°). Enabled only when frames are active (CF ON or uiTarget=main).
- **Viewport lens (mm)**: When CF is OFF and uiTarget=viewport, edits the normal camera FOV in mm (same range conversion). Locked while CF is ON.
- Output resolution readout shows logical size, scale, and viewport overflow warnings.

## 4. Frame management and interactions
- Base size `1536 × 864px`. Add/delete buttons and list manage up to 20 frames; the list shows effective pixel size and scale.
- Handles are active only when selected. Scale% input (10–400%, UI 1–500%) scales uniformly.
- Drag handles to move/scale; drag the rotation handle to rotate (Shift snaps to 15°). Alt+drag scales symmetrically around the frame anchor.
- Drag the center handle to change the frame anchor; double-click to reset to center. Double-click the rotation handle to reset to 0°.
- Higher `order` frames draw and hit-test in front. Selection state is saved with snapshots.

## 5. Mask
- Toggle to enable; set opacity 0–100%.
- `scope: all / selected` chooses whether to mask all frames or only the selected frame bounds (falls back to all when nothing is selected).
- Preview-only; excluded from PNG/PSD. Included in history and saves.

## 6. Export
- Filename and format (PSD/PNG, default PSD). Blank names fall back to `camera-frames`. Export settings are not part of history.
- **Grid/Eye-level**: Single toggle outputs both overlays. Composited for PNG; separate layers for PSD.
- **Model layers**: PSD-only; each visible model renders into its own layer with localized names (toggle is always shown).
- Render button starts export; shows spinner and disables while busy.
- Export locks viewZoom=100% and centers the frustum; preview frustum is restored afterward.
- PSD layer order: grid → eye-level → models → frames (grouped by leading frame letter) → Render. PNG is compressed with 150dpi pHYs.

## 7. Camera / target / transform
- Switch uiTarget between viewport/main via header buttons (viewport locked while CF is ON). Even when CF is OFF, mainPose is kept; selecting Main draws the debug frustum in cyan/magenta.
- Transform section edits position XYZ, yaw/pitch/roll (with roll lock), local move sliders, and nearClip; Alt enables fine adjustment.
- Toggle navMode between Orbit/FPV. While an input has focus, automatic syncing pauses until blur.
- When frames are active, composition FOV and nearClip apply to mainPose. With CF off, viewport edits affect the normal camera; re-enabling reapplies mainPose.
- nearClip is auto-guarded to safe values (≥0.01, within far×0.1 and sceneRadius×0.5). mainPose auto-updates are paused during timeline playback.

## 8. Viewport interactions
- Select: click frame outline or list; click again to deselect.
- Move: drag inside the frame; Shift locks axis.
- Scale: drag edge/corner handles; Alt scales symmetrically around the anchor.
- Rotate: drag the top handle; Shift snaps to 15°, double-click resets to 0°.
- Edit anchor: drag the center handle; double-click to reset.
- Render box pan: Shift+drag outside frames to move the sheet (clamped inside the screen).
- Lost pointer capture commits drag history. Overlay enables pointerEvents only on hit; `grabbing` cursor while dragging.

## 9. Save and history
- Document saves include full CAMERA FRAMES state (renderBox, frames, mask, nearClip, export options, selectedId, mainCameraPose, cameraFramesVersion, etc.).
- Undo/Redo tracks enable/disable, render box scale/anchor/pan/viewZoom, FOV, frame add/delete/select/edit, mask, nearClip, and mainPose edits. Export settings are excluded.

## 10. Display and drawing notes
- Render box is white dashed; frames are 2px red with white dashed overlay when selected; handles are 10px white with red stroke; rotation handle sits 30px above. 90° multiples snap frame strokes for export.
- Mask darkens outside the target frame bounds and is preview-only.
- With CF ON, rendering uses custom frustums (rect/scissor reset) and overlays scale with devicePixelRatio.
