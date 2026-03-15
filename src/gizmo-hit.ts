import { Ray } from 'playcanvas';

import { Scene } from './scene';

const ray = new Ray();

export const hitTestGizmo = (scene: Scene, clientX: number, clientY: number): boolean => {
    const canvas = scene.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
        return false;
    }

    if (!scene.camera.getRay(x, y, ray, { space: 'css' })) {
        return false;
    }

    const layer = scene.app.scene.layers.getLayerById(scene.gizmoLayer.id);
    if (!layer) {
        return false;
    }

    const meshInstances = layer.meshInstances;
    for (let i = 0; i < meshInstances.length; i++) {
        const mi = meshInstances[i];
        if (!mi.visible) continue;
        if (mi.aabb.intersectsRay(ray)) {
            return true;
        }
    }

    return false;
};
