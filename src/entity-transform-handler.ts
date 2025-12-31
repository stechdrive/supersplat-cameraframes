import { Mat4, Quat, Vec3 } from 'playcanvas';

import { PlacePivotOp, EntityTransformOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { LightRig } from './light-rig';
import { Model } from './model';
import { Pivot } from './pivot';
import { Splat } from './splat';
import { Transform } from './transform';
import { TransformHandler } from './transform-handler';

const mat = new Mat4();
const quat = new Quat();
const transform = new Transform();

class EntityTransformHandler implements TransformHandler {
    events: Events;
    target: Splat | Model | LightRig;
    top: EntityTransformOp;
    pop: PlacePivotOp;
    bindMat = new Mat4();

    constructor(events: Events) {
        this.events = events;

        events.on('pivot.started', (pivot: Pivot) => {
            if (this.target) {
                this.start();
            }
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (this.target) {
                this.update(pivot.transform);
            }
        });

        events.on('pivot.ended', (pivot: Pivot) => {
            if (this.target) {
                this.end();
            }
        });

        events.on('pivot.origin', (mode: 'center' | 'boundCenter') => {
            if (this.target) {
                this.placePivot();
            }
        });

        events.on('camera.focalPointPicked', (details: { splat?: Splat, model?: Model, position: Vec3 }) => {
            if (this.target && ['move', 'rotate', 'scale'].includes(this.events.invoke('tool.active'))) {
                const pivot = events.invoke('pivot') as Pivot;
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                const op = new PlacePivotOp({ pivot, oldt: pivot.transform.clone(), newt });
                events.fire('edit.add', op);
            }
        });
    }

    placePivot() {
        // place initial pivot point
        const origin = this.events.invoke('pivot.origin');
        this.target.getPivot(origin === 'center' ? 'center' : 'boundCenter', false, transform);
        this.events.invoke('pivot').place(transform);
    }

    activate() {
        const selection = this.events.invoke('selection');
        this.target = (selection instanceof Splat || selection instanceof Model || selection instanceof LightRig) ? selection : null;
        if (this.target) {
            this.placePivot();
        }
    }

    deactivate() {
        this.target = null;
    }

    start() {
        const pivot = this.events.invoke('pivot') as Pivot;
        const { transform } = pivot;
        const { entity } = this.target;

        // calculate bind matrix
        this.bindMat.setTRS(transform.position, transform.rotation, transform.scale);
        this.bindMat.invert();
        this.bindMat.mul2(this.bindMat, entity.getLocalTransform());

        const p = entity.getLocalPosition();
        const r = entity.getLocalRotation();
        const s = entity.getLocalScale();

        // create op
        this.top = new EntityTransformOp({
            splat: this.target,
            oldt: new Transform(p, r, s),
            newt: new Transform(p, r, s)
        });

        this.pop = new PlacePivotOp({
            pivot,
            oldt: transform.clone(),
            newt: transform.clone()
        });

        this.target.scene.beginBoundPreview(this.target);
    }

    update(transform: Transform) {
        mat.setTRS(transform.position, transform.rotation, transform.scale);
        mat.mul2(mat, this.bindMat);
        quat.setFromMat4(mat);

        const t = mat.getTranslation();
        const r = quat;
        const s = mat.getScale();

        this.target.move(t, r, s);
        this.top.newt.set(t, r, s);
        this.pop.newt.copy(transform);
        this.target.scene.updateBoundPreview(this.target);
    }

    end() {
        this.target.scene.endBoundPreview(this.target);

        // if anything changed then register the op with undo/redo system
        const { oldt, newt } = this.top;

        if (!oldt.equals(newt)) {
            this.events.fire('edit.add', new MultiOp([this.top, this.pop]));
        }

        this.top = null;
        this.pop = null;
    }
}

export { EntityTransformHandler };
