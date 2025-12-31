import { BoundingBox, Mat4, Quat, Vec3 } from 'playcanvas';

import { EntityTransformOp, MultiOp, PlacePivotOp } from './edit-ops';
import { Element } from './element';
import { Events } from './events';
import { Model } from './model';
import { Pivot } from './pivot';
import { Splat } from './splat';
import { Transform } from './transform';
import { TransformHandler } from './transform-handler';

type Target = Splat | Model;

type TargetEntry = {
    target: Target;
    bindMat: Mat4;
    op: EntityTransformOp;
};

const mat = new Mat4();
const mat2 = new Mat4();
const quat = new Quat();
const vec = new Vec3();
const unitScale = new Vec3(1, 1, 1);
const bound = new BoundingBox();
const transform = new Transform();

const isTarget = (element: Element | null): element is Target => {
    return element instanceof Splat || element instanceof Model;
};

const averagePosition = (targets: Target[], out: Vec3) => {
    out.set(0, 0, 0);
    if (targets.length === 0) {
        return out;
    }
    targets.forEach((target) => {
        out.add(target.entity.getPosition());
    });
    out.mulScalar(1 / targets.length);
    return out;
};

class MultiEntityTransformHandler implements TransformHandler {
    events: Events;
    targets: Target[] = [];
    entries: TargetEntry[] = [];
    pop: PlacePivotOp = null;
    previewActive = false;

    constructor(events: Events) {
        this.events = events;

        events.on('pivot.started', (pivot: Pivot) => {
            if (this.targets.length > 0) {
                this.start();
            }
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (this.targets.length > 0) {
                this.update(pivot.transform);
            }
        });

        events.on('pivot.ended', (pivot: Pivot) => {
            if (this.targets.length > 0) {
                this.end();
            }
        });

        events.on('pivot.origin', (mode: 'center' | 'boundCenter') => {
            if (this.targets.length > 0) {
                this.placePivot();
            }
        });

        events.on('tool.coordSpace', () => {
            if (this.targets.length > 0 && !this.pop) {
                this.placePivot();
            }
        });

        events.on('camera.focalPointPicked', (details: { position: Vec3 }) => {
            if (this.targets.length > 0 && ['move', 'rotate', 'scale'].includes(this.events.invoke('tool.active'))) {
                const pivot = events.invoke('pivot') as Pivot;
                const oldt = pivot.transform.clone();
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                const op = new PlacePivotOp({ pivot, oldt, newt });
                events.fire('edit.add', op);
            }
        });
    }

    private collectTargets() {
        const list = this.events.invoke('selection.list') as Element[];
        return list.filter(isTarget);
    }

    private pickActiveTarget() {
        const active = this.events.invoke('selection') as Element;
        if (isTarget(active)) {
            return active;
        }
        return this.targets[0] ?? null;
    }

    placePivot() {
        if (this.targets.length === 0) {
            return;
        }

        const origin = this.events.invoke('pivot.origin');
        const active = this.pickActiveTarget();
        const coordSpace = this.events.functions.has('tool.coordSpace')
            ? (this.events.invoke('tool.coordSpace') as 'local' | 'world')
            : 'world';
        const rotation = quat.copy(coordSpace === 'local' && active ? active.entity.getRotation() : Quat.IDENTITY);

        if (origin === 'boundCenter') {
            let hasBound = false;
            this.targets.forEach((target) => {
                const targetBound = target.worldBound;
                if (!targetBound) {
                    return;
                }
                if (!hasBound) {
                    bound.copy(targetBound);
                    hasBound = true;
                } else {
                    bound.add(targetBound);
                }
            });
            if (hasBound) {
                vec.copy(bound.center);
            } else {
                averagePosition(this.targets, vec);
            }
        } else {
            averagePosition(this.targets, vec);
        }

        transform.set(vec, rotation, unitScale);
        this.events.invoke('pivot').place(transform);
    }

    activate() {
        this.targets = this.collectTargets();
        if (this.targets.length > 0) {
            this.placePivot();
        }
    }

    deactivate() {
        this.targets = [];
        this.entries = [];
        this.pop = null;
        this.previewActive = false;
    }

    start() {
        const pivot = this.events.invoke('pivot') as Pivot;
        const { transform } = pivot;

        mat.setTRS(transform.position, transform.rotation, transform.scale);
        mat2.copy(mat).invert();

        this.entries = this.targets.map((target) => {
            const bindMat = new Mat4();
            bindMat.mul2(mat2, target.entity.getLocalTransform());

            const p = target.entity.getLocalPosition();
            const r = target.entity.getLocalRotation();
            const s = target.entity.getLocalScale();
            const op = new EntityTransformOp({
                splat: target,
                oldt: new Transform(p, r, s),
                newt: new Transform(p, r, s)
            });

            return { target, bindMat, op };
        });

        this.pop = new PlacePivotOp({
            pivot,
            oldt: transform.clone(),
            newt: transform.clone()
        });

        const scene = this.targets[0]?.scene;
        this.previewActive = !!scene?.beginBoundPreviewMulti?.(this.targets);
        if (!this.previewActive && scene) {
            scene.boundDirty = true;
        }
    }

    update(transform: Transform) {
        mat.setTRS(transform.position, transform.rotation, transform.scale);

        this.entries.forEach((entry) => {
            mat2.mul2(mat, entry.bindMat);
            quat.setFromMat4(mat2);

            const t = mat2.getTranslation();
            const r = quat;
            const s = mat2.getScale();

            if (entry.target instanceof Splat) {
                entry.target.move(t, r, s, true);
            } else {
                entry.target.move(t, r, s);
            }

            entry.op.newt.set(t, r, s);
        });

        this.pop?.newt.copy(transform);

        if (this.previewActive) {
            const scene = this.targets[0]?.scene;
            scene?.updateBoundPreviewMulti?.();
        } else if (this.targets[0]?.scene) {
            this.targets[0].scene.boundDirty = true;
        }
    }

    end() {
        if (!this.pop) {
            return;
        }

        const ops = this.entries.map(entry => entry.op);
        const changed = ops.some(op => !op.oldt.equals(op.newt));

        const scene = this.targets[0]?.scene;
        if (changed) {
            this.events.fire('edit.add', new MultiOp([...ops, this.pop]));
            this.entries.forEach((entry) => {
                if (entry.target instanceof Splat && !entry.op.oldt.equals(entry.op.newt)) {
                    entry.target.updatePositions();
                }
            });
        }

        if (this.previewActive && scene) {
            scene.endBoundPreviewMulti?.();
        } else if (scene) {
            scene.boundDirty = true;
        }

        this.entries = [];
        this.pop = null;
        this.previewActive = false;
    }
}

export { MultiEntityTransformHandler };
