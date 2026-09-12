import { ASPECT_MANUAL, Entity, PROJECTION_ORTHOGRAPHIC, PROJECTION_PERSPECTIVE, Vec2 } from 'playcanvas';

import type { RenderView } from './render-view';

export const applyView = (entity: Entity, view: RenderView) => {
    const { shot, lens } = view;
    entity.setPosition(...shot.position);
    entity.setRotation(...shot.rotation);
    const camera = entity.camera;
    camera.projection = shot.projection === 'ortho' ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
    camera.aspectRatioMode = ASPECT_MANUAL;
    camera.horizontalFov = false;
    camera.aspectRatio = lens.aspect;
    camera.fov = lens.fovY;
    camera.orthoHeight = lens.orthoHalfHeight;
    camera.nearClip = shot.near;
    camera.farClip = shot.far;
    camera.projectionOffset = new Vec2(lens.offsetX, lens.offsetY);
};
