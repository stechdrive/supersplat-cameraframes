import { RotateGizmo } from 'playcanvas';

import { createGizmoCamera } from './gizmo-camera-adapter';
import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { Scene } from '../scene';

class RotateTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new RotateGizmo(createGizmoCamera(scene.camera.entity.camera), scene.gizmoLayer);
        gizmo.rotationMode = 'orbit';

        super(gizmo, events, scene);
    }
}

export { RotateTool };
