import { Ray, Vec3 } from 'playcanvas';

import { Scene } from './scene';
import { createGizmoCamera } from './tools/gizmo-camera-adapter';

const ray = new Ray();
const start = new Vec3();
const end = new Vec3();

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

    const camera = scene.camera.entity.camera;
    const gizmoCamera = createGizmoCamera(camera, scene.camera);

    gizmoCamera.screenToWorld(x, y, 0, start);
    gizmoCamera.screenToWorld(x, y, camera.farClip - camera.nearClip, end);

    ray.origin.copy(start);
    ray.direction.sub2(end, start).normalize();

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
