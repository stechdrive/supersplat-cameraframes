import { Mat4, Quat, Vec3 } from 'playcanvas';

import type { Events } from '../events';
import type { Pivot } from '../pivot';
import { Transform } from '../transform';
import { ShotCameraEntity } from './shot-camera-entity';

export class ShotCameraTransformHandler {
    private target: ShotCameraEntity | null = null;
    private dragging = false;
    private bind = new Mat4();
    constructor(private events: Events) {
        events.on('pivot.started', (pivot: Pivot) => {
            if (!this.target) return;
            this.dragging = true;
            this.target.editor.history.begin();
            this.bind.setTRS(pivot.transform.position, pivot.transform.rotation, Vec3.ONE).invert();
            this.bind.mul2(this.bind, this.target.entity.getWorldTransform());
        });
        events.on('pivot.moved', (pivot: Pivot) => {
            if (!this.target || !this.dragging) return;
            const matrix = new Mat4().setTRS(pivot.transform.position, pivot.transform.rotation, Vec3.ONE).mul(this.bind);
            const position = matrix.getTranslation().toArray() as [number, number, number];
            const rotation = new Quat().setFromMat4(matrix).normalize().toArray() as [number, number, number, number];
            this.target.editor.change(record => Object.assign(record.camera, { position, rotation }), this.target.cameraId);
        });
        events.on('pivot.ended', () => {
            if (!this.target) return;
            this.target.editor.history.end();
            this.dragging = false;
        });
        events.on('shotCameras.objectsChanged', () => {
            if (!this.dragging) this.place();
        });
    }
    private place() {
        if (this.target) {
            const transform = new Transform();
            this.target.getPivot(transform);
            this.events.invoke('pivot').place(transform);
        }
    }
    activate() {
        const target = this.events.invoke('selection');
        this.target = target instanceof ShotCameraEntity ? target : null;
        this.place();
    }
    deactivate() {
        this.target?.editor.history.end();
        this.target = null;
        this.dragging = false;
    }
}
