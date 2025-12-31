import {
    Asset,
    BoundingBox,
    Color,
    Entity,
    GSplatData,
    Mat4,
    Quat,
    Texture,
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
    numLocked = 0;
    numSelected = 0;
    entity: Entity;
    changedCounter = 0;
    stateTexture: Texture | null = null;
    transformTexture: Texture | null = null;
    selectionBoundStorage: BoundingBox;
    localBoundStorage: BoundingBox;
    worldBoundStorage: BoundingBox;
    selectionBoundDirty = true;
    localBoundDirty = true;
    worldBoundDirty = true;
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
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    updateState(changedState = State.selected) {
        const state = this.splatData.getProp('state') as Uint8Array;

        const result = this.scene.renderSystem.updateState(this);
        if (result) {
            this.numSplats = result.numSplats;
            this.numLocked = result.numLocked;
            this.numSelected = result.numSelected;
            this.numDeleted = result.numDeleted;
        }

        this.makeSelectionBoundDirty();

        // handle splats being added or removed
        this.scene.forceRender = true;
        this.scene.events.fire('splat.stateChanged', this);
    }

    updatePositions() {
        const data = this.scene.renderSystem.calcPositions(this);

        // update the splat centers which are used for render-time sorting
        const state = this.splatData.getProp('state') as Uint8Array;
        const centersInfo = this.scene.renderSystem.getCenters(this);
        if (centersInfo) {
            const { centers, offset } = centersInfo;
            for (let i = 0; i < this.splatData.numSplats; ++i) {
                const base = (offset / 3 + i) * 3;
                if ((state[i] & State.deleted) === 0) {
                    centers[base + 0] = data[i * 4];
                    centers[base + 1] = data[i * 4 + 1];
                    centers[base + 2] = data[i * 4 + 2];
                }
            }
        }

        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
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

        const centersInfo = this.scene.renderSystem.getCenters(this);
        if (!centersInfo) {
            return false;
        }

        const { centers, offset } = centersInfo;
        const base = offset + splatId * 3;
        // console.log(`calcSplatWorldPosition: SplatId=${splatId} Offset=${offset} Base=${base} Center=[${centers[base]}, ${centers[base+1]}, ${centers[base+2]}]`);
        result.set(
            centers[base + 0],
            centers[base + 1],
            centers[base + 2]
        );

        return true;
    }

    add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        this.scene.renderSystem.add(this);
        this.stateTexture = this.scene.renderSystem.stateTexture;
        this.transformTexture = this.scene.renderSystem.transformTexture;
        this.scene.renderSystem.updateSplatParams(this);
        this.updateState();

        // 標準GSplatコンポーネントは統合レンダラーが吸収するため常時無効化。
        // ここを再有効化すると標準レンダー経路が復活してゴーストが再発する。
        const gsplatComp = this.entity.gsplat;
        if (gsplatComp) {
            gsplatComp.enabled = false;
        }
    }

    remove() {
        this.scene.renderSystem.remove(this);
        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
        this.stateTexture = null;
        this.transformTexture = null;
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

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
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

        this.makeSelectionBoundDirty();
        this.scene.renderSystem.updateTransform(this);
        this.scene.events.fire('splat.moved', this);
    }

    makeSelectionBoundDirty() {
        this.selectionBoundDirty = true;
        this.makeLocalBoundDirty();
    }

    makeLocalBoundDirty() {
        this.localBoundDirty = true;
        this.makeWorldBoundDirty();
    }

    makeWorldBoundDirty() {
        this.worldBoundDirty = true;
        this.scene.boundDirty = true;
    }

    // get the selection bound
    get selectionBound() {
        const selectionBound = this.selectionBoundStorage;
        if (this.selectionBoundDirty) {
            const bound = this.scene.renderSystem.getBound(this, 'selected');
            if (bound) {
                selectionBound.copy(bound);
            } else {
                selectionBound.center.set(0, 0, 0);
                selectionBound.halfExtents.set(0, 0, 0);
            }
            this.selectionBoundDirty = false;
        }
        return selectionBound;
    }

    // get local space bound
    get localBound() {
        const localBound = this.localBoundStorage;
        if (this.localBoundDirty) {
            const bound = this.scene.renderSystem.getBound(this, 'visible');
            if (bound) {
                localBound.copy(bound);
            } else {
                localBound.center.set(0, 0, 0);
                localBound.halfExtents.set(0, 0, 0);
            }
            this.localBoundDirty = false;
        }
        return localBound;
    }

    // get world space bound
    get worldBound() {
        if (!this.scene.renderSystem.counts.has(this) || !this.visible) {
            return null;
        }
        const worldBound = this.worldBoundStorage;
        if (this.worldBoundDirty) {
            worldBound.copy(this.localBound);

            // flag scene bound as dirty
            this.worldBoundDirty = false;
        }
        return worldBound;
    }

    set visible(value: boolean) {
        if (value !== this.visible) {
            this._visible = value;
            if (this.scene?.renderSystem) {
                if (value) {
                    this.scene.renderSystem.add(this);
                } else {
                    this.scene.renderSystem.remove(this);
                }
                this.stateTexture = this.scene.renderSystem.stateTexture;
                this.transformTexture = this.scene.renderSystem.transformTexture;
            }
            this.scene.events.fire('splat.visibility', this);
            this.scene.forceRender = true;
        }
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

    getPivot(mode: 'center' | 'boundCenter', selection: boolean, result: Transform) {
        const { entity } = this;
        switch (mode) {
            case 'center':
                result.set(entity.getLocalPosition(), entity.getLocalRotation(), entity.getLocalScale());
                break;
            case 'boundCenter':
                result.set((selection ? this.selectionBound : this.localBound).center, entity.getLocalRotation(), entity.getLocalScale());
                break;
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
