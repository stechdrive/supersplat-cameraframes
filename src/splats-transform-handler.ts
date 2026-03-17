import { Mat4, Vec3 } from 'playcanvas';

import { PlacePivotOp, SplatsTransformOp, MultiOp } from './edit-ops';
import { Events } from './events';
import { Pivot } from './pivot';
import { Splat } from './splat';
import { State } from './splat-state';
import { Transform } from './transform';
import { TransformHandler } from './transform-handler';

const mat = new Mat4();
const mat2 = new Mat4();
const mat3 = new Mat4();
const transform = new Transform();
const blockedMask = State.locked | State.deleted | State.hidden;
const selectedActive = (state: number) => (state & State.selected) !== 0 && (state & blockedMask) === 0;
const centerUpdateIntervalMs = 100;
const translationUpdateRatio = 0.01;
const rotationUpdateThresholdDeg = 2;
const scaleUpdateThreshold = 0.01;

class SplatsTransformHandler implements TransformHandler {
    events: Events;
    splat: Splat;
    pivotStart = new Transform();
    localToPivot = new Mat4();
    worldToLocal = new Mat4();

    transform = new Mat4();
    paletteMap = new Map<number, number>();
    selectedCount = 0;
    selectionRadius = 0;
    lastCenterUpdateTime = 0;
    lastCenterUpdateTransform = new Transform();
    selectedIndices = new Uint32Array(0);

    constructor(events: Events) {
        this.events = events;

        events.on('pivot.started', (pivot: Pivot) => {
            if (this.splat) {
                this.start();
            }
        });

        events.on('pivot.moved', (pivot: Pivot) => {
            if (this.splat) {
                this.update(pivot.transform);
            }
        });

        events.on('pivot.ended', (pivot: Pivot) => {
            if (this.splat) {
                this.end();
            }
        });

        events.on('selection.changed', (selection) => {
            if (this.splat && selection === this.splat) {
                this.placePivot();
            }
        });

        events.on('pivot.origin', (mode: 'center' | 'boundCenter') => {
            if (this.splat) {
                this.placePivot();
            }
        });

        events.on('camera.focalPointPicked', (details: { splat?: Splat, position: Vec3 }) => {
            if (this.splat && ['move', 'rotate', 'scale'].includes(this.events.invoke('tool.active'))) {
                const pivot = events.invoke('pivot') as Pivot;
                const oldt = pivot.transform.clone();
                const newt = new Transform(details.position, pivot.transform.rotation, pivot.transform.scale);
                const op = new PlacePivotOp({ pivot, oldt, newt });
                events.fire('edit.add', op);
            }
        });
    }

    placePivot() {
        const origin = this.events.invoke('pivot.origin');
        this.splat.getPivot(origin === 'center' ? 'center' : 'boundCenter', true, transform);
        this.events.invoke('pivot').place(transform);
    }

    activate() {
        const selection = this.events.invoke('selection');
        this.splat = selection instanceof Splat ? selection : null;
        if (this.splat) {
            this.placePivot();
        }
    }

    deactivate() {
        this.splat = null;
    }

    start() {
        const pivot = this.events.invoke('pivot') as Pivot;
        const { transform } = pivot;
        const { splat } = this;
        const { transformPalette } = splat;

        mat.setTRS(transform.position, transform.rotation, transform.scale);

        // calculate local -> pivot transform
        this.localToPivot.invert(mat);
        this.localToPivot.mul2(this.localToPivot, splat.entity.getLocalTransform());

        // calculate the world -> local transform
        this.worldToLocal.invert(splat.entity.getLocalTransform());

        this.pivotStart.copy(transform);

        // allocate a new transform for the current selection
        const state = splat.splatData.getProp('state') as Uint8Array;
        const indices = splat.splatData.getProp('transform') as Uint16Array;

        const { paletteMap } = this;
        paletteMap.clear();

        let selectedCount = 0;
        const selectedIndices: number[] = [];
        for (let i = 0; i < state.length; ++i) {
            if (selectedActive(state[i])) {
                selectedCount++;
                selectedIndices.push(i);
                const oldIdx = indices[i];
                let newIdx;
                if (!paletteMap.has(oldIdx)) {
                    newIdx = transformPalette.alloc();
                    paletteMap.set(oldIdx, newIdx);
                } else {
                    newIdx = paletteMap.get(oldIdx);
                }

                indices[i] = newIdx;
            }
        }

        // initialize transforms
        transformPalette.beginUpdate();
        this.paletteMap.forEach((newIdx, oldIdx) => {
            transformPalette.getTransform(oldIdx, mat);
            transformPalette.setTransform(newIdx, mat);
        });
        transformPalette.endUpdate();

        splat.scene.splatRenderDisplay.updateTransformIndices(splat, indices);
        splat.scene.splatRenderDisplay.updateTransform(splat, true);

        this.selectedCount = selectedCount;
        this.selectedIndices = new Uint32Array(selectedIndices);
        this.selectionRadius = selectedCount > 0 ? splat.selectionBound.halfExtents.length() : 0;
        this.lastCenterUpdateTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        this.lastCenterUpdateTransform.copy(transform);

        splat.selectionAlpha = 0;
        splat.scene.outline.enabled = false;
        splat.scene.underlay.enabled = false;

        splat.scene.beginBoundPreview(splat);
    }

    update(transform: Transform) {
        // calculate updated new pivot -> world transform
        mat.setTRS(transform.position, transform.rotation, transform.scale);
        mat.mul2(mat, this.localToPivot);       // local -> world
        mat.mul2(this.worldToLocal, mat);       // world -> local

        this.transform.copy(mat);

        // update the transform palette
        const { transformPalette } = this.splat;
        transformPalette.beginUpdate();
        this.paletteMap.forEach((newIdx, oldIdx) => {
            transformPalette.getTransform(oldIdx, mat2);
            mat2.mul2(mat, mat2);
            transformPalette.setTransform(newIdx, mat2);
        });
        transformPalette.endUpdate();

        this.splat.scene.splatRenderDisplay.updateTransform(this.splat, true);

        const world = this.splat.entity.getWorldTransform();
        mat2.copy(world).invert();
        mat3.mul2(world, this.transform);
        mat3.mul2(mat3, mat2);
        this.splat.scene.updateBoundPreviewWithDelta(this.splat, mat3);

        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const lastTransform = this.lastCenterUpdateTransform;
        const dx = transform.position.x - lastTransform.position.x;
        const dy = transform.position.y - lastTransform.position.y;
        const dz = transform.position.z - lastTransform.position.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const translationThreshold = this.selectionRadius * translationUpdateRatio;
        const movedEnough = translationThreshold > 0 ? distance >= translationThreshold : distance > 0;

        let dot = Math.abs(transform.rotation.dot(lastTransform.rotation));
        dot = Math.min(1, dot);
        const rotationDelta = (2 * Math.acos(dot)) * (180 / Math.PI);
        const rotatedEnough = rotationDelta >= rotationUpdateThresholdDeg;

        const scale = transform.scale;
        const lastScale = lastTransform.scale;
        const scaleChanged =
            Math.abs(scale.x - lastScale.x) / Math.max(Math.abs(lastScale.x), 1e-6) >= scaleUpdateThreshold ||
            Math.abs(scale.y - lastScale.y) / Math.max(Math.abs(lastScale.y), 1e-6) >= scaleUpdateThreshold ||
            Math.abs(scale.z - lastScale.z) / Math.max(Math.abs(lastScale.z), 1e-6) >= scaleUpdateThreshold;

        if (now - this.lastCenterUpdateTime >= centerUpdateIntervalMs || movedEnough || rotatedEnough || scaleChanged) {
            this.splat.updatePositionsForIndices(this.selectedIndices);
            this.lastCenterUpdateTime = now;
            this.lastCenterUpdateTransform.copy(transform);
        }
    }

    async end() {
        const { splat, transform, paletteMap } = this;

        splat.scene.endBoundPreview(splat);

        // TODO: consider moving this to update() function above so splats are sorted correctly
        // for render during drag (which is slower).
        await splat.updatePositions();
        splat.selectionAlpha = 1;
        splat.scene.outline.enabled = true;
        splat.scene.underlay.enabled = true;

        // create op for splat transform
        const top = new SplatsTransformOp({
            splat,
            transform: transform.clone(),
            paletteMap: new Map(paletteMap),
            indices: new Uint32Array(this.selectedIndices)
        });

        // create op for pivot placement
        const pivot = this.events.invoke('pivot') as Pivot;
        const oldt = this.pivotStart.clone();
        const newt = pivot.transform.clone();
        const pop = new PlacePivotOp({ pivot, newt, oldt });

        // add the editop without applying it
        this.events.fire('edit.add', new MultiOp([top, pop]), true);
    }
}

export { SplatsTransformHandler };
