import {
    Asset,
    BoundingBox,
    Color,
    Entity,
    GSplatData,
    Mat4,
    Quat,
    Vec3,
    GSplatResource
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { State } from './splat-state';
import { Transform } from './transform';
import { TransformPalette } from './transform-palette';

const vec = new Vec3();
const veca = new Vec3();
const vecb = new Vec3();

const boundingPoints =
    [-1, 1].map((x) => {
        return [-1, 1].map((y) => {
            return [-1, 1].map((z) => {
                return [
                    new Vec3(x, y, z), new Vec3(x * 0.75, y, z),
                    new Vec3(x, y, z), new Vec3(x, y * 0.75, z),
                    new Vec3(x, y, z), new Vec3(x, y, z * 0.75)
                ];
            });
        });
    }).flat(3);

class Splat extends Element {
    asset: Asset;
    splatData: GSplatData;
    numSplats = 0;
    numDeleted = 0;
    numHidden = 0;
    numVisible = 0;
    numLocked = 0;
    numSelected = 0;
    entity: Entity;
    changedCounter = 0;
    selectionBoundStorage: BoundingBox;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;

    _visible = true;
    transformPalette: TransformPalette;

    _selectionAlpha = 1;

    _name = '';
    _tintClr = new Color(1, 1, 1);
    _temperature = 0;
    _saturation = 1;
    _brightness = 0;
    _blackPoint = 0;
    _whitePoint = 1;
    _transparency = 1;

    _localCenters: Float32Array | null = null;

    get localCenters() {
        if (!this._localCenters) {
            const x = this.splatData.getProp('x') as Float32Array;
            const y = this.splatData.getProp('y') as Float32Array;
            const z = this.splatData.getProp('z') as Float32Array;
            const num = this.splatData.numSplats;
            this._localCenters = new Float32Array(num * 3);
            for (let i = 0; i < num; ++i) {
                this._localCenters[i * 3 + 0] = x[i];
                this._localCenters[i * 3 + 1] = y[i];
                this._localCenters[i * 3 + 2] = z[i];
            }
        }
        return this._localCenters;
    }

    measurePoints: Vec3[] = [];
    measureSelection = -1;

    constructor(asset: Asset, orientation: Vec3) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatData | GSplatResource;
        const splatData = (splatResource as any).gsplatData ? (splatResource as any).gsplatData as GSplatData : splatResource as GSplatData;
        const device = (asset.resource as any).device;

        this._name = (asset.file as any).filename;
        this.asset = asset;
        this.splatData = splatData as GSplatData;
        this.numSplats = splatData.numSplats;

        this.entity = new Entity('splatEntitiy');
        this.entity.setEulerAngles(orientation);

        // added per-splat state channel
        // bit 1: selected
        // bit 2: locked
        // bit 3: deleted
        // bit 4: hidden
        if (!this.splatData.getProp('state')) {
            this.splatData.getElement('vertex').properties.push({
                type: 'uchar',
                name: 'state',
                storage: new Uint8Array(this.splatData.numSplats),
                byteSize: 1
            });
        }

        // per-splat transform matrix
        this.splatData.getElement('vertex').properties.push({
            type: 'ushort',
            name: 'transform',
            storage: new Uint16Array(this.splatData.numSplats),
            byteSize: 2
        });

        // create the transform palette
        this.transformPalette = new TransformPalette(device);

        this.selectionBoundStorage = new BoundingBox();
        this.localBoundStorage = new BoundingBox();
        this.worldBoundStorage = new BoundingBox();
    }

    destroy() {
        super.destroy();
        this.transformPalette?.destroy();
        this.transformPalette = null as any;
        this.entity?.destroy();
        this.entity = null as any;
        if (this.asset) {
            this.asset.registry?.remove(this.asset);
            this.asset.unload();
            this.asset = null as any;
        }
        this.splatData = null as any;
        this._localCenters = null;
    }

    async updateState(changedState = State.selected) {
        const state = this.splatData.getProp('state') as Uint8Array;

        const result = this.scene.renderSystem.updateState(this);
        if (result) {
            this.numSplats = result.numSplats;
            this.numLocked = result.numLocked;
            this.numSelected = result.numSelected;
            this.numDeleted = result.numDeleted;
            this.numHidden = result.numHidden;
            this.numVisible = result.numVisible;
        }

        // handle splats being added or removed
        if (changedState & State.deleted) {
            await this.updateSorting();
        } else {
            await this.updateLocalBounds();
        }
        this.scene.forceRender = true;
        this.scene.events.fire('splat.stateChanged', this);
    }

    async updatePositions() {
        const data = await this.scene.dataProcessor.calcPositions(this);
        if (data.length === 0) {
            return;
        }

        // update the splat centers which are used for render-time sorting
        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < this.splatData.numSplats; ++i) {
            if ((state[i] & (State.deleted | State.hidden)) === 0) {
                this.scene.renderSystem.writeWorldCenter(
                    this,
                    i,
                    data[i * 4 + 0],
                    data[i * 4 + 1],
                    data[i * 4 + 2]
                );
            }
        }

        await this.updateSorting();
        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    updatePositionsPartial(selectedCount: number) {
        const data = this.splatData;
        if (selectedCount > Math.min(20000, data.numSplats * 0.05)) {
            this.updatePositions().catch(() => {});
            return;
        }

        const state = data.getProp('state') as Uint8Array;
        const indices = data.getProp('transform') as Uint16Array;
        const localCenters = this.localCenters;
        const localPalette = this.transformPalette;
        const world = this.entity.getWorldTransform();
        const localMat = new Mat4();
        const worldMat = new Mat4();
        const transforms = new Map<number, Float32Array>();
        const skipMask = State.locked | State.deleted | State.hidden;

        for (let i = 0; i < data.numSplats; ++i) {
            const s = state[i];
            if ((s & State.selected) === 0 || (s & skipMask) !== 0) {
                continue;
            }
            const index = indices[i];
            let transform = transforms.get(index);
            if (!transform) {
                localPalette.getTransform(index, localMat);
                worldMat.mul2(world, localMat);
                const m = worldMat.data;
                transform = new Float32Array([
                    m[0], m[1], m[2],
                    m[4], m[5], m[6],
                    m[8], m[9], m[10],
                    m[12], m[13], m[14]
                ]);
                transforms.set(index, transform);
            }

            const x = localCenters[i * 3 + 0];
            const y = localCenters[i * 3 + 1];
            const z = localCenters[i * 3 + 2];
            this.scene.renderSystem.writeWorldCenter(
                this,
                i,
                x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
                x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
                x * transform[2] + y * transform[5] + z * transform[8] + transform[11]
            );
        }

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    updatePositionsForIndices(indices: Uint32Array) {
        if (indices.length === 0) {
            return;
        }

        const data = this.splatData;
        if (indices.length > Math.min(20000, data.numSplats * 0.05)) {
            this.updatePositions().catch(() => {});
            return;
        }

        const state = data.getProp('state') as Uint8Array;
        const transformIndices = data.getProp('transform') as Uint16Array;
        const localCenters = this.localCenters;
        const localPalette = this.transformPalette;
        const world = this.entity.getWorldTransform();
        const localMat = new Mat4();
        const worldMat = new Mat4();
        const transforms = new Map<number, Float32Array>();
        const skipMask = State.deleted | State.hidden;

        for (let i = 0; i < indices.length; ++i) {
            const idx = indices[i];
            const s = state[idx];
            if ((s & skipMask) !== 0) {
                continue;
            }
            const transformIndex = transformIndices[idx];
            let transform = transforms.get(transformIndex);
            if (!transform) {
                localPalette.getTransform(transformIndex, localMat);
                worldMat.mul2(world, localMat);
                const m = worldMat.data;
                transform = new Float32Array([
                    m[0], m[1], m[2],
                    m[4], m[5], m[6],
                    m[8], m[9], m[10],
                    m[12], m[13], m[14]
                ]);
                transforms.set(transformIndex, transform);
            }

            const x = localCenters[idx * 3 + 0];
            const y = localCenters[idx * 3 + 1];
            const z = localCenters[idx * 3 + 2];
            this.scene.renderSystem.writeWorldCenter(
                this,
                idx,
                x * transform[0] + y * transform[3] + z * transform[6] + transform[9],
                x * transform[1] + y * transform[4] + z * transform[7] + transform[10],
                x * transform[2] + y * transform[5] + z * transform[8] + transform[11]
            );
        }

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    async updateSorting() {
        await this.scene.renderSystem.waitForSorter();
        await this.updateLocalBounds();
    }

    get worldTransform() {
        return this.entity.getWorldTransform();
    }

    set name(newName: string) {
        if (newName !== this.name) {
            this._name = newName;
            this.scene.events.fire('splat.name', this);
        }
    }

    get name() {
        return this._name;
    }

    get filename() {
        return (this.asset.file as any).filename;
    }

    calcSplatWorldPosition(splatId: number, result: Vec3) {
        if (splatId >= this.splatData.numSplats) {
            return false;
        }

        return this.scene.renderSystem.readWorldCenter(this, splatId, result);
    }

    async add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        this.scene.renderSystem.add(this);
        this.scene.renderSystem.updateSplatParams(this);
        await this.updateState();

        // 標準GSplatコンポーネントは統合レンダラーが吸収するため常時無効化。
        // ここを再有効化すると標準レンダー経路が復活してゴーストが再発する。
        const gsplatComp = this.entity.gsplat;
        if (gsplatComp) {
            gsplatComp.enabled = false;
        }
    }

    swapRuntimeDataWith(other: Splat) {
        [
            this.asset, other.asset,
            this.splatData, other.splatData,
            this.numSplats, other.numSplats,
            this.numDeleted, other.numDeleted,
            this.numHidden, other.numHidden,
            this.numVisible, other.numVisible,
            this.numLocked, other.numLocked,
            this.numSelected, other.numSelected,
            this.transformPalette, other.transformPalette,
            this._localCenters, other._localCenters
        ] = [
            other.asset, this.asset,
            other.splatData, this.splatData,
            other.numSplats, this.numSplats,
            other.numDeleted, this.numDeleted,
            other.numHidden, this.numHidden,
            other.numVisible, this.numVisible,
            other.numLocked, this.numLocked,
            other.numSelected, this.numSelected,
            other.transformPalette, this.transformPalette,
            other._localCenters, this._localCenters
        ];
    }

    remove() {
        this.scene.renderSystem.remove(this);
        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
        serializer.pack(this.visible);
        serializer.pack(this.tintClr.r, this.tintClr.g, this.tintClr.b);
        serializer.pack(this.temperature, this.saturation, this.brightness, this.blackPoint, this.whitePoint, this.transparency);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = this.scene.camera.renderOverlays && events.invoke('selection') === this;

        if (this.visible && selected && events.invoke('camera.bound') && !this.scene.renderFlags.hideBounds) {
            const bound = this.localBound;
            const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);

            for (let i = 0; i < boundingPoints.length / 2; i++) {
                const a = boundingPoints[i * 2];
                const b = boundingPoints[i * 2 + 1];
                scale.transformPoint(a, veca);
                scale.transformPoint(b, vecb);

                this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.debugLayer);
            }
        }

        this.entity.enabled = this.visible;
    }

    focalPoint() {
        // GSplatData has a function for calculating an weighted average of the splat positions
        // to get a focal point for the camera, but we use bound center instead
        return this.worldBound.center;
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3, skipCenterUpdate = false) {
        const entity = this.entity;
        if (position) {
            entity.setLocalPosition(position);
        }
        if (rotation) {
            entity.setLocalRotation(rotation);
        }
        if (scale) {
            entity.setLocalScale(scale);
        }

        this.scene.renderSystem.updateTransform(this, skipCenterUpdate);
        this.updateWorldBound();
        this.scene.events.fire('splat.moved', this);
    }

    // calculate both selection and local bounds (async, callers must await)
    async updateLocalBounds(): Promise<void> {
        await this.scene.dataProcessor.calcBound(this, this.selectionBoundStorage, this.localBoundStorage);
        this.updateWorldBound();
    }

    // update world bound from local bound (synchronous)
    private updateWorldBound() {
        this.worldBoundStorage.setFromTransformedAabb(this.localBoundStorage, this.entity.getWorldTransform());
        this.scene.boundDirty = true;
    }

    // get the selection bound
    get selectionBound() {
        return this.selectionBoundStorage;
    }

    // get local space bound
    get localBound() {
        return this.localBoundStorage;
    }

    // get world space bound
    get worldBound() {
        if (!this.scene.renderSystem.hasRenderableData(this) || !this.visible) {
            return null;
        }
        return this.worldBoundStorage;
    }

    set visible(value: boolean) {
        const next = !!value;
        if (next === this._visible) {
            return;
        }

        this._visible = next;

        const state = this.splatData.getProp('state') as Uint8Array;
        for (let i = 0; i < state.length; ++i) {
            if (next) {
                state[i] &= ~State.hidden;
            } else {
                state[i] |= State.hidden;
            }
        }

        this.updateState(State.hidden).catch(() => {});
        const renderSystem = this.scene.renderSystem;
        const needsImmediateRebuild = next && !renderSystem.isSplatActive(this);
        if (!next || needsImmediateRebuild) {
            renderSystem.scheduleRebuildForVisibility(needsImmediateRebuild);
        }
        this.scene.scheduleBoundRecalc();
        this.scene.events.fire('splat.visibility', this);
        this.scene.forceRender = true;
    }

    get visible() {
        return this._visible;
    }

    set tintClr(value: Color) {
        if (!this._tintClr.equals(value)) {
            this._tintClr.set(value.r, value.g, value.b);
            this.scene.events.fire('splat.tintClr', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get tintClr() {
        return this._tintClr;
    }

    set temperature(value: number) {
        if (value !== this._temperature) {
            this._temperature = value;
            this.scene.events.fire('splat.temperature', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get temperature() {
        return this._temperature;
    }

    set saturation(value: number) {
        if (value !== this._saturation) {
            this._saturation = value;
            this.scene.events.fire('splat.saturation', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get saturation() {
        return this._saturation;
    }

    set brightness(value: number) {
        if (value !== this._brightness) {
            this._brightness = value;
            this.scene.events.fire('splat.brightness', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get brightness() {
        return this._brightness;
    }

    set blackPoint(value: number) {
        if (value !== this._blackPoint) {
            this._blackPoint = value;
            this.scene.events.fire('splat.blackPoint', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get blackPoint() {
        return this._blackPoint;
    }

    set whitePoint(value: number) {
        if (value !== this._whitePoint) {
            this._whitePoint = value;
            this.scene.events.fire('splat.whitePoint', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get whitePoint() {
        return this._whitePoint;
    }

    set transparency(value: number) {
        if (value !== this._transparency) {
            this._transparency = value;
            this.scene.events.fire('splat.transparency', this);
            this.scene.renderSystem.updateSplatParams(this);
        }
    }

    get transparency() {
        return this._transparency;
    }

    set selectionAlpha(value: number) {
        if (value !== this._selectionAlpha) {
            this._selectionAlpha = value;
            if (this.scene?.renderSystem) {
                this.scene.renderSystem.updateSplatParams(this);
            }
            if (this.scene) {
                this.scene.forceRender = true;
            }
        }
    }

    get selectionAlpha() {
        return this._selectionAlpha;
    }

    // get pivot position/rotation/scale (caller should have awaited operation that changed data)
    getPivot(mode: 'center' | 'boundCenter', selection: boolean, result: Transform) {
        const { entity } = this;
        switch (mode) {
            case 'center':
                result.set(entity.getLocalPosition(), entity.getLocalRotation(), entity.getLocalScale());
                break;
            case 'boundCenter': {
                const bound = selection ? this.selectionBound : this.localBound;
                entity.getLocalTransform().transformPoint(bound.center, vec);
                result.set(vec, entity.getLocalRotation(), entity.getLocalScale());
                break;
            }
        }
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            name: this.name,
            position: pack3(this.entity.getLocalPosition()),
            rotation: pack4(this.entity.getLocalRotation()),
            scale: pack3(this.entity.getLocalScale()),
            visible: this.visible,
            tintClr: packC(this.tintClr),
            temperature: this.temperature,
            saturation: this.saturation,
            brightness: this.brightness,
            blackPoint: this.blackPoint,
            whitePoint: this.whitePoint,
            transparency: this.transparency
        };
    }

    docDeserialize(doc: any) {
        const { name, position, rotation, scale, visible, tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = doc;

        this.name = name;
        this.move(new Vec3(position), new Quat(rotation), new Vec3(scale));
        this.visible = visible;
        this.tintClr = new Color(tintClr[0], tintClr[1], tintClr[2], tintClr[3]);
        this.temperature = temperature ?? 0;
        this.saturation = saturation ?? 1;
        this.brightness = brightness;
        this.blackPoint = blackPoint;
        this.whitePoint = whitePoint;
        this.transparency = transparency;
    }
}

export { Splat };
