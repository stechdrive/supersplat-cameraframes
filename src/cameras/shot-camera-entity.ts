import { Color, Entity, Layer, Mat4, Quat, Vec3 } from 'playcanvas';

import { Element, ElementType } from '../element';
import type { Events } from '../events';
import type { Scene } from '../scene';
import type { Transform } from '../transform';
import type { CameraEditor } from './camera-editor';
import { resolveView } from './render-view';

// A scene object derived from a camera record. It owns no CameraComponent,
// splat projection buffers, or independent saved pose.
export class ShotCameraEntity extends Element {
    readonly entity = new Entity();
    readonly visible = true;
    constructor(readonly cameraId: string, readonly editor: CameraEditor, private layer: Layer) {
        super(ElementType.other);
        this.sync();
    }
    get name() {
        return this.editor.views.store.get(this.cameraId)?.name ?? '';
    }
    get worldBound(): null {
        return null;
    }
    add() {
        this.scene.contentRoot.addChild(this.entity);
    }
    remove() {
        this.entity.remove();
    }
    destroy() {
        super.destroy(); this.entity.destroy();
    }
    getPivot(result: Transform) {
        result.set(this.entity.getPosition(), this.entity.getRotation(), Vec3.ONE);
    }
    sync() {
        const record = this.editor.views.store.get(this.cameraId);
        if (!record) return;
        this.entity.setPosition(new Vec3(...record.camera.position));
        this.entity.setRotation(new Quat(...record.camera.rotation));
        this.entity.name = record.name;
    }
    onPreRender() {
        if (!this.scene.camera.active || !this.scene.camera.renderOverlays) return;
        const record = this.editor.views.store.get(this.cameraId);
        if (!record) return;
        const view = resolveView(record.camera, record.composition);
        const f = view.outputFrustum;
        const distance = 1;
        const scale = record.camera.projection === 'ortho' ? 1 : distance / f.near;
        const transform = new Mat4().setTRS(new Vec3(...record.camera.position), new Quat(...record.camera.rotation), Vec3.ONE);
        const local = [new Vec3(), new Vec3(f.left * scale, f.bottom * scale, -distance), new Vec3(f.right * scale, f.bottom * scale, -distance),
            new Vec3(f.right * scale, f.top * scale, -distance), new Vec3(f.left * scale, f.top * scale, -distance)];
        const points = local.map(point => transform.transformPoint(point));
        const color = this.scene.events.invoke('selection') === this ? new Color(1, 0.25, 0.85) : new Color(0.2, 0.85, 1);
        for (let i = 1; i <= 4; i++) {
            this.scene.app.drawLine(points[i], points[i === 4 ? 1 : i + 1], color, true, this.layer);
            this.scene.app.drawLine(points[0], points[i], color, true, this.layer);
        }
    }
}

export const registerShotCameraEntities = (scene: Scene, events: Events, editor: CameraEditor) => {
    const layer = new Layer({ name: 'ShotCameraObjects' });
    scene.app.scene.layers.push(layer);
    scene.camera.overlayLayers.push(layer);
    scene.camera.camera.layers = [...scene.camera.camera.layers, layer.id];
    const objects = new Map<string, ShotCameraEntity>();
    const sync = () => {
        const records = editor.views.store.state.cameras;
        for (const [id, object] of objects) {
            if (!records.some(record => record.id === id)) {
                objects.delete(id);
                object.destroy();
            }
        }
        for (const record of records) {
            let object = objects.get(record.id);
            if (!object) {
                object = new ShotCameraEntity(record.id, editor, layer);
                objects.set(record.id, object);
                scene.add(object);
            } else object.sync();
        }
        events.fire('shotCameras.objectsChanged');
    };
    editor.views.store.subscribe(sync);
    sync();
    events.function('shotCameras.objects', () => [...objects.values()]);
    events.on('shotCameras.select', (id: string | null) => {
        if (id) events.fire('selection', objects.get(id));
        else if (events.invoke('selection') instanceof ShotCameraEntity) events.fire('selection.clear');
    });
};
