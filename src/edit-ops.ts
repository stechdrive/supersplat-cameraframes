import { Color, Mat4 } from 'playcanvas';

import { AnimTrack } from './anim-track';
import { IndexRanges, sortedPredicate } from './index-ranges';
import { LightRig } from './light-rig';
import { Model } from './model';
import { Pivot } from './pivot';
import { Scene } from './scene';
import { Splat } from './splat';
import { State } from './splat-state';
import { Transform } from './transform';

interface EditOp {
    name: string;
    do(): void | Promise<void>;
    undo(): void | Promise<void>;
    destroy?(): void;
}

const hiddenMask = (State as { hidden?: number }).hidden ?? 0;
const blockedMask = State.locked | State.deleted | hiddenMask;
const selectable = (state: number) => (state & blockedMask) === 0;
const selectedActive = (state: number) => (state & State.selected) !== 0 && (state & blockedMask) === 0;
const enum BitOp {
    SET,
    CLEAR,
    TOGGLE
}

class StateOp {
    splat: Splat;
    ranges: IndexRanges;
    mask: number;
    op: BitOp;
    updateFlags: number;

    constructor(splat: Splat, ranges: IndexRanges, mask: number, op: BitOp, updateFlags = State.selected) {
        this.splat = splat;
        this.ranges = ranges;
        this.mask = mask;
        this.op = op;
        this.updateFlags = updateFlags;
    }

    private apply(op: BitOp) {
        const state = this.splat.splatData.getProp('state') as Uint8Array;
        const { mask } = this;

        switch (op) {
            case BitOp.SET:
                this.ranges.forEach((i) => {
                    state[i] |= mask;
                });
                break;
            case BitOp.CLEAR:
                this.ranges.forEach((i) => {
                    state[i] &= ~mask;
                });
                break;
            case BitOp.TOGGLE:
                this.ranges.forEach((i) => {
                    state[i] ^= mask;
                });
                break;
        }
    }

    async do() {
        this.apply(this.op);
        await this.splat.updateState(this.updateFlags);
    }

    async undo() {
        const undoOp = this.op === BitOp.TOGGLE ? BitOp.TOGGLE :
            this.op === BitOp.SET ? BitOp.CLEAR : BitOp.SET;
        this.apply(undoOp);
        await this.splat.updateState(this.updateFlags);
    }

    destroy() {
        this.splat = null;
        this.ranges = null;
    }
}

class SelectAllOp extends StateOp {
    name = 'selectAll';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => selectable(state[i]) && (state[i] & State.selected) === 0), State.selected, BitOp.SET);
    }
}

class SelectNoneOp extends StateOp {
    name = 'selectNone';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => selectedActive(state[i])), State.selected, BitOp.CLEAR);
    }
}

class SelectInvertOp extends StateOp {
    name = 'selectInvert';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => selectable(state[i])), State.selected, BitOp.TOGGLE);
    }
}

class SelectOp extends StateOp {
    name = 'selectOp';

    constructor(splat: Splat, op: 'add' | 'remove' | 'set', filter: ((i: number) => boolean) | Uint32Array) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const bitOp = op === 'add' ? BitOp.SET : op === 'remove' ? BitOp.CLEAR : BitOp.TOGGLE;

        const pred = filter instanceof Uint32Array ? sortedPredicate(filter) : filter;

        const preds = {
            add: (i: number) => pred(i) && selectable(state[i]) && (state[i] & State.selected) === 0,
            remove: (i: number) => pred(i) && selectedActive(state[i]),
            set: (i: number) => selectable(state[i]) && (selectedActive(state[i]) !== pred(i))
        };

        super(splat, IndexRanges.fromPredicate(splatData.numSplats, preds[op]), State.selected, bitOp);
    }
}

class HideSelectionOp extends StateOp {
    name = 'hideSelection';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => selectedActive(state[i])), State.locked, BitOp.SET, State.locked);
    }
}

class UnhideAllOp extends StateOp {
    name = 'unhideAll';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => (state[i] & State.locked) !== 0 && (state[i] & State.deleted) === 0), State.locked, BitOp.CLEAR, State.locked);
    }
}

class DeleteSelectionOp extends StateOp {
    name = 'deleteSelection';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => selectedActive(state[i])), State.deleted, BitOp.SET, State.deleted);
    }
}

class ResetOp extends StateOp {
    name = 'reset';

    constructor(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        super(splat, IndexRanges.fromPredicate(splat.splatData.numSplats, i => (state[i] & State.deleted) !== 0), State.deleted, BitOp.CLEAR, State.deleted);
    }
}

class EntityTransformOp {
    name = 'entityTransform';
    splat: Splat | Model | LightRig;
    oldt: Transform;
    newt: Transform;

    constructor(options: { splat: Splat | Model | LightRig, oldt: Transform, newt: Transform }) {
        this.splat = options.splat;
        this.oldt = options.oldt;
        this.newt = options.newt;
    }

    do() {
        this.splat.move(this.newt.position, this.newt.rotation, this.newt.scale);
    }

    undo() {
        this.splat.move(this.oldt.position, this.oldt.rotation, this.oldt.scale);
    }

    destroy() {
        this.splat = null;
        this.oldt = null;
        this.newt = null;
    }
}

const mat = new Mat4();

class SplatsTransformOp {
    name = 'splatsTransform';

    splat: Splat;
    transform: Mat4;
    paletteMap: Map<number, number>;
    indices: Uint32Array;

    constructor(options: { splat: Splat, transform: Mat4, paletteMap: Map<number, number>, indices: Uint32Array }) {
        this.splat = options.splat;
        this.transform = options.transform;
        this.paletteMap = options.paletteMap;
        this.indices = options.indices;
    }

    async do() {
        const { splat, transform, paletteMap } = this;
        const indices = splat.splatData.getProp('transform') as Uint16Array;
        const selectedIndices = this.indices;

        for (let i = 0; i < selectedIndices.length; ++i) {
            const idx = selectedIndices[i];
            indices[idx] = paletteMap.get(indices[idx]);
        }

        splat.transformPalette.alloc(paletteMap.size);

        const { transformPalette } = splat;
        transformPalette.beginUpdate();
        this.paletteMap.forEach((newIdx, oldIdx) => {
            transformPalette.getTransform(oldIdx, mat);
            mat.mul2(transform, mat);
            transformPalette.setTransform(newIdx, mat);
        });
        transformPalette.endUpdate();

        await splat.updatePositions();
    }

    async undo() {
        const { splat, paletteMap } = this;
        const indices = splat.splatData.getProp('transform') as Uint16Array;
        const selectedIndices = this.indices;

        const inverseMap = new Map<number, number>();
        paletteMap.forEach((newIdx, oldIdx) => {
            inverseMap.set(newIdx, oldIdx);
        });

        for (let i = 0; i < selectedIndices.length; ++i) {
            const idx = selectedIndices[i];
            indices[idx] = inverseMap.get(indices[idx]);
        }

        splat.transformPalette.free(paletteMap.size);

        await splat.updatePositions();
    }

    destroy() {
        this.splat = null;
        this.transform = null;
        this.paletteMap = null;
        this.indices = null;
    }
}

class PlacePivotOp {
    name = 'setPivot';
    pivot: Pivot;
    oldt: Transform;
    newt: Transform;

    constructor(options: { pivot: Pivot, oldt: Transform, newt: Transform }) {
        this.pivot = options.pivot;
        this.oldt = options.oldt;
        this.newt = options.newt;
    }

    do() {
        this.pivot.place(this.newt);
    }

    undo() {
        this.pivot.place(this.oldt);
    }
}

type ColorAdjustment = {
    tintClr?: Color
    temperature?: number,
    saturation?: number,
    brightness?: number,
    blackPoint?: number,
    whitePoint?: number,
    transparency?: number
};

class SetSplatColorAdjustmentOp {
    name: 'setSplatColor';
    splat: Splat;

    newState: ColorAdjustment;
    oldState: ColorAdjustment;

    constructor(options: { splat: Splat, oldState: ColorAdjustment, newState: ColorAdjustment }) {
        const { splat, oldState, newState } = options;
        this.splat = splat;
        this.oldState = oldState;
        this.newState = newState;
    }

    do() {
        const { splat } = this;
        const { tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = this.newState;
        if (tintClr) splat.tintClr = tintClr;
        if (temperature !== null) splat.temperature = temperature;
        if (saturation !== null) splat.saturation = saturation;
        if (brightness !== null) splat.brightness = brightness;
        if (blackPoint !== null) splat.blackPoint = blackPoint;
        if (whitePoint !== null) splat.whitePoint = whitePoint;
        if (transparency !== null) splat.transparency = transparency;
    }

    undo() {
        const { splat } = this;
        const { tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = this.oldState;
        if (tintClr) splat.tintClr = tintClr;
        if (temperature !== null) splat.temperature = temperature;
        if (saturation !== null) splat.saturation = saturation;
        if (brightness !== null) splat.brightness = brightness;
        if (blackPoint !== null) splat.blackPoint = blackPoint;
        if (whitePoint !== null) splat.whitePoint = whitePoint;
        if (transparency !== null) splat.transparency = transparency;
    }
}

class AnimTrackEditOp {
    name: string;
    track: AnimTrack;
    before: unknown;
    after: unknown;

    constructor(name: string, track: AnimTrack, before: unknown, after: unknown) {
        this.name = name;
        this.track = track;
        this.before = before;
        this.after = after;
    }

    do() {
        this.track.restore(this.after);
    }

    undo() {
        this.track.restore(this.before);
    }
}

class LightStateOp implements EditOp {
    name = 'lightState';
    light: LightRig;
    prevEnabled: boolean;
    prevIntensity: number;
    nextEnabled: boolean;
    nextIntensity: number;

    constructor(options: { light: LightRig; prevEnabled: boolean; prevIntensity: number; nextEnabled: boolean; nextIntensity: number; }) {
        const { light, prevEnabled, prevIntensity, nextEnabled, nextIntensity } = options;
        this.light = light;
        this.prevEnabled = !!prevEnabled;
        this.prevIntensity = prevIntensity;
        this.nextEnabled = !!nextEnabled;
        this.nextIntensity = nextIntensity;
    }

    do() {
        this.light.applyStateDirect(this.nextEnabled, this.nextIntensity);
    }

    undo() {
        this.light.applyStateDirect(this.prevEnabled, this.prevIntensity);
    }
}

class AmbientLightOp implements EditOp {
    name = 'ambientLight';
    scene: Scene;
    prev: number;
    next: number;

    constructor(options: { scene: Scene; prev: number; next: number; }) {
        this.scene = options.scene;
        this.prev = options.prev;
        this.next = options.next;
    }

    do() {
        this.scene.applyAmbient(this.next);
    }

    undo() {
        this.scene.applyAmbient(this.prev);
    }
}

class CameraPresetReferenceImageOp implements EditOp {
    name = 'cameraFrames.setPresetReferenceImage';
    presetId: string;
    prevReferenceImagePresetId: string;
    nextReferenceImagePresetId: string;
    applyLink: (presetId: string, referenceImagePresetId: string) => void;

    constructor(options: {
        presetId: string;
        prevReferenceImagePresetId: string;
        nextReferenceImagePresetId: string;
        apply: (presetId: string, referenceImagePresetId: string) => void;
    }) {
        this.presetId = options.presetId;
        this.prevReferenceImagePresetId = options.prevReferenceImagePresetId;
        this.nextReferenceImagePresetId = options.nextReferenceImagePresetId;
        this.applyLink = options.apply;
    }

    do() {
        this.applyLink(this.presetId, this.nextReferenceImagePresetId);
    }

    undo() {
        this.applyLink(this.presetId, this.prevReferenceImagePresetId);
    }
}

class MultiOp {
    name = 'multiOp';
    ops: EditOp[];

    constructor(ops: EditOp[]) {
        this.ops = ops;
    }

    async do() {
        for (const op of this.ops) {
            await op.do();
        }
    }

    async undo() {
        for (const op of this.ops) {
            await op.undo();
        }
    }
}

class AddSplatOp {
    name = 'addSplat';
    scene: Scene;
    splat: Splat;

    constructor(scene: Scene, splat: Splat) {
        this.scene = scene;
        this.splat = splat;
    }

    async do() {
        await this.scene.add(this.splat);
        await this.scene.renderSystem.waitForSorter();
        this.scene.forceRender = true;
    }

    async undo() {
        this.scene.remove(this.splat);
        await this.scene.renderSystem.waitForSorter();
        this.scene.forceRender = true;
    }

    destroy() {
        this.splat.destroy();
    }
}

class SeparateSplatOp {
    name = 'separateSplat';
    scene: Scene;
    splat: Splat;
    remainder: Splat;
    copy: Splat;

    constructor(scene: Scene, splat: Splat, remainder: Splat, copy: Splat) {
        this.scene = scene;
        this.splat = splat;
        this.remainder = remainder;
        this.copy = copy;
    }

    private async swapOriginalRuntime() {
        this.splat.remove();
        this.splat.swapRuntimeDataWith(this.remainder);
        await this.splat.add();
        await this.scene.renderSystem.waitForSorter();
        this.scene.boundDirty = true;
        this.scene.forceRender = true;
    }

    async do() {
        await this.swapOriginalRuntime();
        await this.scene.add(this.copy);
        await this.scene.renderSystem.waitForSorter();
        this.scene.forceRender = true;
    }

    async undo() {
        if (this.copy.scene === this.scene) {
            this.scene.remove(this.copy);
            await this.scene.renderSystem.waitForSorter();
        }
        await this.swapOriginalRuntime();
    }

    destroy() {
        if (!this.copy.scene) {
            this.copy.destroy();
        }
        this.remainder.destroy();
        this.splat = null;
        this.remainder = null;
        this.copy = null;
    }
}

class SplatRenameOp {
    name = 'splatRename';
    splat: Splat;
    oldName: string;
    newName: string;

    constructor(splat: Splat, newName: string) {
        this.splat = splat;
        this.oldName = splat.name;
        this.newName = newName;
    }

    do() {
        this.splat.name = this.newName;
    }

    undo() {
        this.splat.name = this.oldName;
    }
}

export {
    EditOp,
    SelectAllOp,
    SelectNoneOp,
    SelectInvertOp,
    SelectOp,
    HideSelectionOp,
    UnhideAllOp,
    DeleteSelectionOp,
    ResetOp,
    EntityTransformOp,
    SplatsTransformOp,
    PlacePivotOp,
    ColorAdjustment,
    SetSplatColorAdjustmentOp,
    AnimTrackEditOp,
    LightStateOp,
    AmbientLightOp,
    CameraPresetReferenceImageOp,
    MultiOp,
    AddSplatOp,
    SeparateSplatOp,
    SplatRenameOp
};
