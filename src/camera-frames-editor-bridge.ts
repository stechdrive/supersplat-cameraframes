import type { Events } from './events';
import type { Scene } from './scene';

const registerCameraFramesEditorBridge = (events: Events, scene: Scene) => {
    events.on('camera.setNearOverride', (value: number | null, opts?: { transient?: boolean }) => {
        scene.camera.setNearOverride(value, opts);
    });

    events.on('camera.setCustomFrustum', (frustum: { left: number; right: number; bottom: number; top: number; near: number; far: number; } | null) => {
        scene.camera.setCustomFrustum(frustum);
    });
};

export { registerCameraFramesEditorBridge };
