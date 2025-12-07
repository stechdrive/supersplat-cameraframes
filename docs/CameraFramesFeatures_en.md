# CAMERA FRAMES Features Overview

CAMERA FRAMES is a feature that allows you to place multiple "frames" within a scene, layout them, and export them as a single image. It also provides functions to assist with camera Field of View (FOV) and alignment.

## 1. UI Panel Operations

### Layout
Configures the overall drawing area (Render Box).
*   **Anchor**: 3x3 grid buttons. Specifies the reference point (center, corners, midpoints of edges) when resizing the Render Box.
*   **Width (%)**: Specifies the width of the Render Box as a percentage (100% - 1000%).
*   **Height (%)**: Specifies the height of the Render Box as a percentage (100% - 1000%).
*   **Canvas Zoom (%)**: Specifies the display magnification of the working view (25% - 100%). This does not affect the export size.
*   **Lens (mm) (FOV)**: Specifies the camera's field of view in 35mm equivalent focal length (mm). You can intuitively change the FOV using the slider. This value assumes the frame placed within the layout is at 100% scale.

### Export
*   **Filename**: Enter the filename for export.
*   **PSD/PNG (Format)**: Select the export format.
    *   **PSD**: Exports with layer structure preserved (Grid, each Frame group).
    *   **PNG**: Exports as a single merged image.
*   **Grid / Eye Level**: Toggle button to include overlays such as grid lines and eye-level lines in the exported image.
*   **Render**: Executes the image export.

### Frames
*   **Add Frame**: Adds a new frame. Up to 20 frames.
*   **Delete Frame**: Deletes the currently selected frame.
*   **List**: List of frames. Click to select.
*   **Frame Scale (%)**: Specifies the scale of the selected frame as a percentage.

### Mask Outside Frame
*   **Toggle**: Toggles the mask that darkens the area outside the frames.
*   **Opacity (%)**: Specifies the opacity of the mask (0% - 100%).

### Camera Transform
Precise control of camera position and rotation using numerical values.
*   **X, Y, Z**: Camera world coordinates.
*   **Yaw, Pitch, Roll**: Camera rotation angles.
    *   **Roll Lock**: Button to lock the roll value.
*   **R/L (Right-Left)**: Moves left/right relative to the camera's own orientation.
*   **U/D (Up-Down)**: Moves up/down relative to the camera's own orientation.
*   **F/B (Forward-Back)**: Moves forward/back relative to the camera's own orientation.
*   **Near Clip**: Adjusts the camera's near clip distance. Slider or numerical input.
    *   **Alt Key**: Holding the Alt key while operating allows for fine adjustments (Slow mode).

### Navigation Mode
*   **Main Camera**: The filming camera for the final output. This view determines exactly what gets rendered.
*   **Viewport Camera**: A working camera to move freely in 3D space. You can explore optimal arrangements and compositions while viewing objects and the Main Camera's position from an easy-to-see perspective.
    *   **Eye Icon**: In Viewport Camera mode, clicking the "Eye" icon next to the Main Camera enables adjustment of the Main Camera's focal length and position. To return to operating the Viewport Camera, click the "Eye" icon on the Viewport Camera side.
*   **Orbit / FPV**: Standard camera operation modes. When CAMERA FRAMES is enabled, it defaults to FPV mode.

#### Quick Switch
Use the green toggle switch in the top-right corner of the Camera Frames panel to instantly switch between Main Camera operation and Viewport Camera operation.

---

## 2. Mouse & Viewport Operations

You can directly manipulate overlays (such as red frames) on the viewport.

### Frame Operations
*   **Select**: Click inside a frame to select it (the red border becomes dotted and handles appear).
*   **Move**: Drag inside the frame to move it.
    *   **Shift + Drag**: Restricts movement to vertical or horizontal (Axis Lock).
*   **Resize**: Drag the white handles (□) on the corners or edges of the frame to resize.
    *   **Alt + Drag**: Resizes around the Anchor (reference point). Usually, the opposite handle is fixed.
*   **Rotate**: Drag the rotation handle (○) displayed at the top of the frame to rotate it.
    *   **Shift + Drag**: Snaps rotation in 15-degree increments.
*   **Move Anchor**: Drag the anchor point (◎) in the center of the frame to change the reference point for rotation and scaling.

### Render Box Operations
*   **Pan**: **Shift + Left Drag** (area outside frames) to move (pan) the entire Render Box within the screen.

### Reset Operations
*   **Reset Rotation**: **Double-click** the rotation handle to reset rotation to 0 degrees.
*   **Reset Anchor**: **Double-click** the anchor point to reset it to the center of the frame.

### FPV Camera Operations
Camera controls when CAMERA FRAMES is enabled (or in FPV mode).

*   **Look**: **Left Drag** to rotate the view (Yaw/Pitch).
*   **Move**: **Mouse Wheel** to move forward and backward.
    *   **Alt + Wheel**: Move slowly.
*   **Strafe**: **Right Drag** to move up, down, left, or right.
    *   **Alt + Right Drag**: Move slowly.
*   **Pivot Orbit**: **Ctrl + Left Drag** to orbit around the clicked point (or a point in space).
    *   Useful when you want to rotate around a specific subject.

---

## 3. Others / Notes

*   **Auto Fit**: When resizing the window or opening/closing panels, the display magnification (Fit Scale) is automatically adjusted so that the Render Box fits within the screen.
*   **Aspect Ratio Lock**: While CAMERA FRAMES is enabled, the camera framing is locked to the aspect ratio of the Render Box.
*   **Near Clip Guard**: A guard function automatically adjusts the near clip to prevent display clipping when getting too close to splats.
*   **Merged PLY Rendering**: Base Supersplat draws newly loaded PLY files always on top without occlusion. CAMERA FRAMES merges multiple PLY files and renders them with proper depth, so both viewport and exported images respect occlusion across files.
*   **GLB Import & Mesh Management**: Use the Scene panel's import button to load GLB files. Imported meshes appear in the Mesh list where you can select, rename, toggle visibility, or remove them while checking layouts alongside splats.
*   **Lighting Controls**: The Lighting header lets you toggle the model light, select the light rig to rotate its direction with the transform gizmo (reset with the reset button), and adjust both direct and ambient intensity when evaluating GLB shading.
