import { TranslateGizmo } from 'playcanvas';

import { createGizmoCamera } from './gizmo-camera-adapter';
import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { Scene } from '../scene';

class MoveTool extends TransformTool {
    constructor(events: Events, scene: Scene) {
        const gizmo = new TranslateGizmo(createGizmoCamera(scene.camera.camera), scene.gizmoLayer);

        super(gizmo, events, scene);
    }
}

export { MoveTool };
