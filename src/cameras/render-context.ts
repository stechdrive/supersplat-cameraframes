import type { CameraComponent, Entity } from 'playcanvas';

// The projector receives the view that owns its targets and transient buffers.
// Scene.camera always remains the independent navigation camera.
export type RenderContext = {
    camera: CameraComponent;
    mainCamera: Entity;
    targetSize: { width: number; height: number };
    renderOverlays: boolean;
};
