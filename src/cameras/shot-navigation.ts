import { Quat, Vec3 } from 'playcanvas';

import type { Scene } from '../scene';
import type { CameraEditor } from './camera-editor';

// A navigation gesture owns one persistent camera ID. Orbit's pivot is local
// to the gesture; saved shot poses never depend on scene radius or a controller.
export const registerShotNavigation = (scene: Scene, editor: CameraEditor) => {
    const container = document.getElementById('canvas-container');
    const keys = new Set<string>();
    let gesture: { id: string; pointerId: number; x: number; y: number; rotation: Quat; pivot: Vec3; distance: number; orbit: boolean } | null = null;
    const end = () => {
        if (!gesture) return;
        const pointerId = gesture.pointerId;
        gesture = null;
        keys.clear();
        editor.history.end();
        if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId);
    };
    container.addEventListener('contextmenu', (event) => {
        if (editor.views.activeCamera === editor.views.shot) event.preventDefault();
    });
    container.addEventListener('pointerdown', (event) => {
        if (event.button !== 2 || editor.views.activeCamera !== editor.views.shot || !editor.record ||
            (event.target as HTMLElement).closest('button, input, select, .panel, .pcui-panel')) return;
        if (scene.events.invokeOptional('cameraFrames.exportBusy')) return;
        const record = editor.record;
        const position = new Vec3(...record.camera.position);
        const rotation = new Quat(...record.camera.rotation);
        const forward = rotation.transformVector(new Vec3(0, 0, -1));
        const distance = Math.max(0.1, new Vec3().sub2(scene.bound.center, position).dot(forward));
        gesture = { id: record.id,
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            rotation,
            pivot: forward.mulScalar(distance).add(position),
            distance,
            orbit: editor.navigationMode === 'orbit' };
        editor.history.begin();
        container.setPointerCapture(event.pointerId);
        event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    container.addEventListener('pointermove', (event) => {
        if (!gesture || event.pointerId !== gesture.pointerId) return;
        const owner = gesture;
        const yaw = new Quat().setFromAxisAngle(Vec3.UP, -(event.clientX - owner.x) * 0.15);
        const pitch = new Quat().setFromAxisAngle(Vec3.RIGHT, -(event.clientY - owner.y) * 0.15);
        const rotation = yaw.mul(owner.rotation).mul(pitch).normalize();
        editor.change((record) => {
            record.camera.rotation = rotation.toArray() as [number, number, number, number];
            if (owner.orbit) record.camera.position = rotation.transformVector(new Vec3(0, 0, owner.distance)).add(owner.pivot).toArray() as [number, number, number];
        }, owner.id);
        event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    const endPointer = (event: PointerEvent) => {
        if (gesture?.pointerId === event.pointerId) end();
    };
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);
    container.addEventListener('lostpointercapture', endPointer);
    window.addEventListener('blur', end);
    window.addEventListener('keydown', (event) => {
        if (!gesture || !['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight'].includes(event.code)) return;
        keys.add(event.code); event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    window.addEventListener('keyup', (event) => {
        keys.delete(event.code);
    }, true);
    scene.events.on('update', (dt: number) => {
        if (!gesture || !keys.size || gesture.orbit) return;
        const local = new Vec3(Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
            Number(keys.has('KeyE')) - Number(keys.has('KeyQ')), Number(keys.has('KeyS')) - Number(keys.has('KeyW')));
        if (local.lengthSq() === 0) return;
        local.normalize().mulScalar(Math.min(dt, 0.1) * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1));
        editor.change((record) => {
            const offset = new Quat(...record.camera.rotation).transformVector(local);
            record.camera.position = new Vec3(...record.camera.position).add(offset).toArray() as [number, number, number];
        }, gesture.id);
    });
    scene.events.on('scene.clear', end);
    editor.views.store.subscribe(() => {
        if (gesture && (editor.record?.id !== gesture.id || !editor.enabled)) end();
    });
};
