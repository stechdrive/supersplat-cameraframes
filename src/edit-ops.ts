import { Color, Mat4 } from 'playcanvas';

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

// build an index array based on a boolean predicate over indices
const buildIndex = (total: number, pred: (i: number) => boolean) => {
    let num = 0;
    for (let i = 0; i < total; ++i) {
        if (pred(i)) num++;
    }

    const result = new Uint32Array(num);
    let idx = 0;
    for (let i = 0; i < total; ++i) {
        if (pred(i)) {
            result[idx++] = i;
        }
    }

    return result;
};

const hiddenMask = (State as { hidden?: number }).hidden ?? 0;
const blockedMask = State.locked | State.deleted | hiddenMask;
const selectable = (state: number) => (state & blockedMask) === 0;
const selectedActive = (state: number) => (state & State.selected) !== 0 && (state & blockedMask) === 0;

type filterFunc = (state: number, index: number) => boolean;
type doFunc = (state: number) => number;
type undoFunc = (state: number) => number;

class StateOp {
    splat: Splat;
    indices: Uint32Array;
    doIt: doFunc;
    undoIt: undoFunc;
    updateFlags: number;

    constructor(splat: Splat, filter: filterFunc, doIt: doFunc, undoIt: undoFunc, updateFlags = State.selected) {
        const splatData = splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        const indices = buildIndex(splatData.numSplats, i => filter(state[i], i));

        this.splat = splat;
        this.indices = indices;
        this.doIt = doIt;
        this.undoIt = undoIt;
        this.updateFlags = updateFlags;
    }

    async do() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            const idx = this.indices[i];
            state[idx] = this.doIt(state[idx]);
        }
        await this.splat.updateState(this.updateFlags);
    }

    async undo() {
        const splatData = this.splat.splatData;
        const state = splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.indices.length; ++i) {
            const idx = this.indices[i];
            state[idx] = this.undoIt(state[idx]);
        }
        await this.splat.updateState(this.updateFlags);
    }

    destroy() {
        this.splat = null;
        this.indices = null;
    }
}

class SelectAllOp extends StateOp {
    name = 'selectAll';

    constructor(splat: Splat) {
        super(splat,
            state => selectable(state) && (state & State.selected) === 0,
            state => state | State.selected,
            state => state & (~State.selected)
        );
    }
}

class SelectNoneOp extends StateOp {
    name = 'selectNone';

    constructor(splat: Splat) {
        super(splat,
            state => selectedActive(state),
            state => state & (~State.selected),
            state => state | State.selected
        );
    }
}

class SelectInvertOp extends StateOp {
    name = 'selectInvert';

    constructor(splat: Splat) {
        super(splat,
            state => selectable(state),
            state => state ^ State.selected,
            state => state ^ State.selected
        );
    }
}

class SelectOp extends StateOp {
    name = 'selectOp';

    constructor(splat: Splat, op: 'add'|'remove'|'set', filter: (i: number) => boolean) {
        const filterFunc = {
            add: (state: number, index: number) => selectable(state) && (state & State.selected) === 0 && filter(index),
            remove: (state: number, index: number) => selectedActive(state) && filter(index),
            set: (state: number, index: number) => selectable(state) && (selectedActive(state) !== filter(index))
        };

        const doIt = {
            add: (state: number) => state | State.selected,
            remove: (state: number) => state & (~State.selected),
            set: (state: number) => state ^ State.selected
        };

        const undoIt = {
            add: (state: number) => state & (~State.selected),
            remove: (state: number) => state | State.selected,
            set: (state: number) => state ^ State.selected
        };

        super(splat, filterFunc[op], doIt[op], undoIt[op]);
    }
}

class HideSelectionOp extends StateOp {
    name = 'hideSelection';

    constructor(splat: Splat) {
        super(splat,
            state => selectedActive(state),
            state => state | State.locked,
            state => state & (~State.locked),
            State.locked
        );
    }
}

class UnhideAllOp extends StateOp {
    name = 'unhideAll';

    constructor(splat: Splat) {
        super(splat,
            state => (state & State.locked) !== 0 && (state & State.deleted) === 0,
            state => state & (~State.locked),
            state => state | State.locked,
            State.locked
        );
    }
}

class DeleteSelectionOp extends StateOp {
    name = 'deleteSelection';

    constructor(splat: Splat) {
        super(splat,
            state => selectedActive(state),
            state => state | State.deleted,
            state => state & (~State.deleted),
            State.deleted
        );
    }
}

class ResetOp extends StateOp {
    name = 'reset';

    constructor(splat: Splat) {
        super(splat,
            state => (state & State.deleted) !== 0,
            state => state & (~State.deleted),
            state => state | State.deleted,
            State.deleted
        );
    }
}

// op for modifying a splat transform
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

// op for modifying a subset of individual splats
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

        // update splat transform palette indices
        for (let i = 0; i < selectedIndices.length; ++i) {
            const idx = selectedIndices[i];
            indices[idx] = paletteMap.get(indices[idx]);
        }

        splat.transformPalette.alloc(paletteMap.size);

        // update transform palette
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

        // invert the palette map
        const inverseMap = new Map<number, number>();
        paletteMap.forEach((newIdx, oldIdx) => {
            inverseMap.set(newIdx, oldIdx);
        });

        // restore the original transform indices
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
    name: 'addSplat';
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
    LightStateOp,
    AmbientLightOp,
    CameraPresetReferenceImageOp,
    MultiOp,
    AddSplatOp,
    SplatRenameOp
};
