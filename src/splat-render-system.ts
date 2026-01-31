import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_R16U,
    PIXELFORMAT_RGBA32F,
    PIXELFORMAT_R8,
    Asset,
    BoundingBox,
    Entity,
    GSplatData,
    GSplatResource,
    Mat4,
    Texture
} from 'playcanvas';

import type { Scene } from './scene';
import { vertexShader, fragmentShader, gsplatCenter } from './shaders/splat-shader';
import { Splat } from './splat';
import { State } from './splat-state';
import { TransformPalette } from './transform-palette';

type TransformBlock = { base: number; size: number };

type BoundCacheEntry = {
    selection: BoundingBox;
    visible: BoundingBox;
    selectionDirty: boolean;
    visibleDirty: boolean;
};

type ParamsTextures = {
    tex0: Texture;
    tex1: Texture;
    tex2: Texture;
};

type ParamsStorage = {
    arr0: Float32Array;
    arr1: Float32Array;
    arr2: Float32Array;
};

class SplatRenderSystem {
    scene: Scene;
    sources: Splat[] = [];
    offsets = new Map<Splat, number>();
    counts = new Map<Splat, number>();
    transformBases = new Map<Splat, TransformBlock>();
    mergedData: GSplatData | null = null;
    mergedResource: GSplatResource | null = null;
    mergedAsset: Asset | null = null;
    mergedEntity: Entity;
    materialDirty = false;
    stateTexture: Texture | null = null;
    transformTexture: Texture | null = null;
    paramsTextures: ParamsTextures | null = null;
    paramsStorage: ParamsStorage | null = null;
    transformPalette: TransformPalette;
    globalIdToSplat: Array<{ splat: Splat; local: number }> = [];
    globalState: Uint8Array | null = null;
    globalTransformIndices: Uint16Array | null = null;
    boundCache = new Map<Splat, BoundCacheEntry>();
    shBands = 0;
    sorterPromiseHandle: Promise<void> | null = null;
    private visibilityRebuildTimer: number | null = null;
    private visibilityRebuildPending = false;
    private visibilityRebuildImmediate = false;
    private pivotActive = false;
    private visibilityRebuildDebounceMs = 400;
    private sorterCentersDirty = false;
    private centersUpdateToken = 0;
    private sorterMapping: Uint32Array | null = null;
    private sorterUpdatedHandle: { off: () => void } | null = null;
    private sorterUpdatedSorter: unknown | null = null;

    constructor(scene: Scene) {
        this.scene = scene;
        this.transformPalette = new TransformPalette(scene.graphicsDevice);

        this.mergedEntity = new Entity('mergedSplat');
        this.scene.contentRoot.addChild(this.mergedEntity);

        // SH バンド変更に追従
        this.scene.events.on('view.bands', (bands: number) => {
            if (this.mergedEntity.gsplat?.instance?.material) {
                this.applyMaterialBands(bands);
            } else {
                this.materialDirty = true;
            }
        });

        this.scene.events.on('pivot.started', () => {
            this.pivotActive = true;
            this.clearVisibilityRebuildTimer();
        });
        this.scene.events.on('pivot.ended', () => {
            this.pivotActive = false;
            if (this.visibilityRebuildPending) {
                if (this.visibilityRebuildImmediate) {
                    this.runVisibilityRebuild();
                } else {
                    this.startVisibilityRebuildTimer();
                }
            }
        });

        this.scene.events.on('splat.positionsChanged', (splat: Splat) => {
            if (!this.isSplatActive(splat)) {
                return;
            }
            this.markSorterCentersDirty();
        });
    }

    add(splat: Splat) {
        if (this.sources.includes(splat)) {
            return;
        }

        this.sources.push(splat);
        this.boundCache.set(splat, {
            selection: new BoundingBox(),
            visible: new BoundingBox(),
            selectionDirty: true,
            visibleDirty: true
        });
        if (this._frozen) {
            this._dirty = true;
        } else {
            this.rebuild();
        }
    }

    remove(splat: Splat) {
        const idx = this.sources.indexOf(splat);
        if (idx !== -1) {
            this.sources.splice(idx, 1);
            this.offsets.delete(splat);
            this.counts.delete(splat);
            this.transformBases.delete(splat);
            this.boundCache.delete(splat);
            if (this._frozen) {
                this._dirty = true;
            } else {
                this.rebuild();
            }
        }
    }

    private _frozen = false;
    private _dirty = false;

    freeze() {
        this._frozen = true;
    }

    unfreeze() {
        this._frozen = false;
        if (this._dirty) {
            this.rebuild();
            this._dirty = false;
        }
    }

    isSplatActive(splat: Splat) {
        return this.offsets.has(splat);
    }

    scheduleRebuildForVisibility(immediate = false) {
        const allVisible = this.sources.every(splat => splat.visible);
        const allActive = this.sources.every(splat => this.isSplatActive(splat));
        if (allVisible && allActive && !immediate) {
            this.visibilityRebuildPending = false;
            this.visibilityRebuildImmediate = false;
            this.clearVisibilityRebuildTimer();
            return;
        }

        this.visibilityRebuildPending = true;
        if (immediate) {
            this.visibilityRebuildImmediate = true;
        }
        if (this._frozen) {
            this._dirty = true;
            this.visibilityRebuildPending = false;
            this.visibilityRebuildImmediate = false;
            return;
        }
        if (this.pivotActive) {
            return;
        }
        if (this.visibilityRebuildImmediate) {
            this.runVisibilityRebuild();
            return;
        }
        this.startVisibilityRebuildTimer();
    }

    private startVisibilityRebuildTimer() {
        this.clearVisibilityRebuildTimer();
        this.visibilityRebuildTimer = window.setTimeout(() => {
            this.visibilityRebuildTimer = null;
            if (!this.visibilityRebuildPending || this.pivotActive) {
                return;
            }
            this.runVisibilityRebuild();
        }, this.visibilityRebuildDebounceMs);
    }

    private runVisibilityRebuild() {
        this.clearVisibilityRebuildTimer();
        if (!this.visibilityRebuildPending || this.pivotActive) {
            return;
        }
        this.visibilityRebuildPending = false;
        this.visibilityRebuildImmediate = false;
        if (this._frozen) {
            this._dirty = true;
            return;
        }
        this.rebuild();
    }

    private clearVisibilityRebuildTimer() {
        if (this.visibilityRebuildTimer !== null) {
            window.clearTimeout(this.visibilityRebuildTimer);
            this.visibilityRebuildTimer = null;
        }
    }

    private markSorterCentersDirty() {
        this.sorterCentersDirty = true;
    }

    private clearSorterUpdatedHandler() {
        if (this.sorterUpdatedHandle) {
            this.sorterUpdatedHandle.off();
        }
        this.sorterUpdatedHandle = null;
        this.sorterUpdatedSorter = null;
    }

    private ensureSorterUpdatedHandler() {
        const sorter = this.mergedEntity.gsplat?.instance?.sorter;
        if (!sorter) {
            this.clearSorterUpdatedHandler();
            return;
        }
        if (this.sorterUpdatedHandle && this.sorterUpdatedSorter === sorter) {
            return;
        }
        this.clearSorterUpdatedHandler();
        this.sorterUpdatedSorter = sorter;
        this.sorterUpdatedHandle = sorter.on('updated', () => {
            this.scene.forceRender = true;
            this.sources.forEach((s) => {
                s.changedCounter++;
            });
        });
    }

    private flushSorterCenters() {
        if (!this.sorterCentersDirty) {
            return;
        }
        const instance = this.mergedEntity.gsplat?.instance;
        if (!instance?.sorter) {
            return;
        }

        this.sorterCentersDirty = false;
        instance.sorter.setMapping(this.sorterMapping);
    }

    mapPickId(id: number) {
        const entry = this.globalIdToSplat[id];
        return entry || null;
    }

    get centers() {
        return this.mergedEntity.gsplat?.instance?.sorter?.centers || null;
    }

    getProcessorContext(splat: Splat) {
        return {
            splat,
            offset: this.offsets.get(splat) ?? 0,
            count: this.counts.get(splat) ?? 0,
            transformTexture: this.transformTexture,
            transformPalette: this.transformPalette.texture,
            stateTexture: this.stateTexture
        };
    }

    getCenters(splat: Splat) {
        const centers = this.centers;
        if (!centers) return null;
        const offset = (this.offsets.get(splat) ?? 0) * 3;
        return { centers, offset };
    }

    getBound(splat: Splat, mode: 'selected' | 'visible') {
        const count = this.counts.get(splat);
        if (!this.mergedResource || count === undefined || count === 0) {
            return null;
        }
        const cache = this.boundCache.get(splat);
        if (!cache) {
            return null;
        }

        const entry = mode === 'selected' ? cache.selection : cache.visible;
        const dirty = mode === 'selected' ? cache.selectionDirty : cache.visibleDirty;

        if (dirty) {
            const boundingBox = entry;
            const onlySelected = mode === 'selected';
            this.scene.dataProcessor.calcBound(this.getProcessorContext(splat), boundingBox, onlySelected).catch(() => {});
            if (mode === 'selected') {
                cache.selectionDirty = false;
            } else {
                cache.visibleDirty = false;
            }
        }

        return entry;
    }

    calcPositions(splat: Splat) {
        const count = this.counts.get(splat) ?? 0;
        if (count === 0) {
            return Promise.resolve(new Float32Array(0));
        }
        return this.scene.dataProcessor.calcPositions(this.getProcessorContext(splat));
    }

    private async updateSorterCenters(activeSources: Splat[], totalSplats: number, instance: any, token: number) {
        const centers = new Float32Array(totalSplats * 3);
        for (const splat of activeSources) {
            const offset = this.offsets.get(splat) ?? 0;
            const count = this.counts.get(splat) ?? 0;
            const positions = await this.calcPositions(splat);
            for (let i = 0; i < count; i++) {
                centers[(offset + i) * 3 + 0] = positions[i * 4 + 0];
                centers[(offset + i) * 3 + 1] = positions[i * 4 + 1];
                centers[(offset + i) * 3 + 2] = positions[i * 4 + 2];
            }
        }

        if (token !== this.centersUpdateToken) {
            return;
        }
        if (this.mergedEntity.gsplat?.instance !== instance) {
            return;
        }

        (instance as any).centers = centers;
        if (instance.sorter) {
            (instance.sorter as any).centers = centers;
        }
        this.markSorterCentersDirty();
    }

    private seedInstance(instance: any, totalSplats: number) {
        const instanceSize = (GSplatResource as any).instanceSize ?? 128;
        const count = Math.max(0, totalSplats);

        // Ensure the mesh renders even before the sorter posts its first update.
        instance.meshInstance.instancingCount = Math.ceil(count / instanceSize);
        instance.material?.setParameter('numSplats', count);

        const orderTexture = (instance as any).orderTexture;
        if (orderTexture) {
            const orderData = orderTexture.lock() as Uint32Array;
            for (let i = 0; i < orderData.length; i++) {
                orderData[i] = i;
            }
            orderTexture.unlock();
        }

        if (instance.sorter) {
            instance.sort(this.scene.camera.entity);
        }
    }

    waitForSorter() {
        const instance = this.mergedEntity.gsplat?.instance;
        if (!instance?.sorter) {
            return Promise.resolve();
        }

        let resolver: (() => void) | null = null;
        this.sorterPromiseHandle = new Promise<void>((resolve) => {
            const handle = instance.sorter.on('updated', () => {
                handle.off();
                resolver = null;
                resolve();
            });
            resolver = () => {
                handle.off();
                resolve();
            };
        });

        instance.sort(this.scene.camera.entity);
        setTimeout(() => {
            // フォールバック: ソートされなかった場合でも resolve する
            if (resolver) {
                resolver();
            }
        }, 1000);

        return this.sorterPromiseHandle;
    }

    updateState(splat: Splat) {
        const state = splat.splatData.getProp('state') as Uint8Array;
        const offset = this.offsets.get(splat);
        if (this.stateTexture && this.globalState && offset !== undefined) {
            this.globalState.set(state, offset);

            const data = this.stateTexture.lock() as Uint8Array;
            data.set(state, offset);
            this.stateTexture.unlock();
        }

        let numSelected = 0;
        let numLocked = 0;
        let numDeleted = 0;
        let numHidden = 0;
        for (let i = 0; i < state.length; ++i) {
            const s = state[i];
            const isDeleted = (s & State.deleted) !== 0;
            if (isDeleted) {
                numDeleted++;
                continue;
            }
            if (s & State.hidden) {
                numHidden++;
            }
            if (s & State.locked) {
                numLocked++;
            }
            if ((s & State.selected) !== 0 && (s & (State.locked | State.hidden)) === 0) {
                numSelected++;
            }
        }
        const numSplats = state.length - numDeleted;
        const numVisible = numSplats - numHidden;

        this.rebuildSorterMapping();

        this.boundCache.forEach((entry) => {
            entry.selectionDirty = true;
            entry.visibleDirty = true;
        });

        this.scene.forceRender = true;

        return {
            numSelected,
            numLocked,
            numDeleted,
            numHidden,
            numVisible,
            numSplats
        };
    }

    updateSplatParams(splat: Splat) {
        if (!this.paramsTextures || !this.paramsStorage) {
            return;
        }

        const offset = this.offsets.get(splat) ?? 0;
        const count = this.counts.get(splat);
        if (!count) {
            return;
        }
        const { arr0, arr1, arr2 } = this.paramsStorage;

        const tint = splat.tintClr;
        const temperature = splat.temperature;
        const saturation = splat.saturation;
        const brightness = splat.brightness;
        const blackPoint = splat.blackPoint;
        const whitePoint = splat.whitePoint;
        const transparency = splat.transparency;
        const selectionAlpha = splat.selectionAlpha;

        for (let i = 0; i < count; i++) {
            const idx = (offset + i) * 4;

            arr0[idx + 0] = tint.r;
            arr0[idx + 1] = tint.g;
            arr0[idx + 2] = tint.b;
            arr0[idx + 3] = temperature;

            arr1[idx + 0] = saturation;
            arr1[idx + 1] = brightness;
            arr1[idx + 2] = blackPoint;
            arr1[idx + 3] = whitePoint;

            arr2[idx + 0] = transparency;
            arr2[idx + 1] = selectionAlpha;
            arr2[idx + 2] = 0;
            arr2[idx + 3] = 0;
        }

        const upload = (tex: Texture, data: Float32Array) => {
            const buf = tex.lock() as Float32Array;
            buf.set(data);
            tex.unlock();
        };

        upload(this.paramsTextures.tex0, arr0);
        upload(this.paramsTextures.tex1, arr1);
        upload(this.paramsTextures.tex2, arr2);
    }

    updateTransform(splat: Splat, skipCenterUpdate = false) {
        const block = this.transformBases.get(splat);
        if (!block) {
            return;
        }

        const world = splat.entity.getWorldTransform();
        const localPalette = splat.transformPalette;
        const mat = new Mat4();
        this.transformPalette.beginUpdate();
        for (let i = 0; i < block.size; i++) {
            localPalette.getTransform(i, mat);
            mat.mul2(world, mat);
            this.transformPalette.setTransform(block.base + i, mat);
        }
        this.transformPalette.endUpdate();

        this.scene.boundDirty = true;
        const cache = this.boundCache.get(splat);
        if (cache) {
            cache.selectionDirty = true;
            cache.visibleDirty = true;
        }

        // ソーターの位置情報も更新
        const instance = this.mergedEntity.gsplat?.instance;
        if (instance && !skipCenterUpdate) {
            const offset = this.offsets.get(splat) ?? 0;
            const count = this.counts.get(splat) ?? 0;

            // OPTIMIZATION: Use CPU for center updates during interaction to avoid slow readPixels
            const localCenters = splat.localCenters;
            const world = splat.entity.getWorldTransform().data;
            const m0 = world[0], m1 = world[1], m2 = world[2];
            const m4 = world[4], m5 = world[5], m6 = world[6];
            const m8 = world[8], m9 = world[9], m10 = world[10];
            const m12 = world[12], m13 = world[13], m14 = world[14];

            const centers = (instance as any).centers as Float32Array;
            if (centers && localCenters) {
                for (let i = 0; i < count; i++) {
                    const x = localCenters[i * 3 + 0];
                    const y = localCenters[i * 3 + 1];
                    const z = localCenters[i * 3 + 2];

                    // Apply World Matrix
                    centers[(offset + i) * 3 + 0] = x * m0 + y * m4 + z * m8 + m12;
                    centers[(offset + i) * 3 + 1] = x * m1 + y * m5 + z * m9 + m13;
                    centers[(offset + i) * 3 + 2] = x * m2 + y * m6 + z * m10 + m14;
                }
                if (instance.sorter) {
                    (instance.sorter as any).centers = centers;
                }
                this.markSorterCentersDirty();
            }
        }
    }

    updateTransformIndices(splat: Splat, updatedIndices?: Uint16Array) {
        if (!this.transformTexture || !this.globalTransformIndices) {
            return;
        }

        const indices = updatedIndices ?? (splat.splatData.getProp('transform') as Uint16Array);
        const block = this.transformBases.get(splat);
        const offset = this.offsets.get(splat) ?? 0;
        if (!block) {
            return;
        }

        let maxLocal = 0;
        for (let i = 0; i < indices.length; i++) {
            maxLocal = Math.max(maxLocal, indices[i]);
        }
        if (maxLocal >= block.size) {
            this.rebuild();
            return;
        }

        const target = this.globalTransformIndices;
        for (let i = 0; i < indices.length; i++) {
            target[offset + i] = block.base + indices[i];
        }

        const data = this.transformTexture.lock() as Uint16Array;
        data.set(target);
        this.transformTexture.unlock();

        this.scene.boundDirty = true;
        const cache = this.boundCache.get(splat);
        if (cache) {
            cache.selectionDirty = true;
            cache.visibleDirty = true;
        }
    }

    private rebuildSorterMapping() {
        const instance = this.mergedEntity.gsplat?.instance;
        if (!instance || !this.globalState) {
            this.sorterMapping = null;
            return;
        }

        const state = this.globalState;
        const total = this.globalIdToSplat.length;
        let active = 0;
        const skipMask = State.deleted | State.hidden;
        for (let i = 0; i < total; i++) {
            if ((state[i] & skipMask) === 0) {
                active++;
            }
        }
        let mapping: Uint32Array | undefined;
        if (active !== total) {
            mapping = new Uint32Array(active);
            let idx = 0;
            for (let i = 0; i < total; i++) {
                if ((state[i] & skipMask) === 0) {
                    mapping[idx++] = i;
                }
            }
        }

        this.sorterMapping = mapping ?? null;
        if (!instance.sorter) {
            return;
        }
        instance.sorter.setMapping(this.sorterMapping);
        this.sorterCentersDirty = false;
    }

    private applyMaterialBands(bands: number) {
        const instance = this.mergedEntity.gsplat?.instance;
        if (!instance) {
            return;
        }

        const material = instance.material;
        console.log('SplatRenderSystem: Applying material bands. SH_BANDS:', bands);
        // PlayCanvas 標準の gsplat シェーダへ戻さず、常に統合レンダラー専用のシェーダで上書きする。
        // ここがデフォルトへ戻ると二重描画や matrix_model 二重適用でゴーストが再発するため、削除・変更禁止。
        const { glsl } = material.shaderChunks;
        glsl.set('gsplatVS', vertexShader);
        glsl.set('gsplatPS', fragmentShader);
        glsl.set('gsplatCenterVS', gsplatCenter);

        const resource = instance.resource as GSplatResource;
        const resourceBands = resource.shBands ?? 0;
        const safeBands = Math.min(Math.min(bands, resourceBands), 3);
        material.setDefine('SH_BANDS', `${safeBands}`);
        material.setParameter('splatState', this.stateTexture);
        material.setParameter('splatTransform', this.transformTexture);
        material.setParameter('transformPalette', this.transformPalette.texture);
        if (this.paramsTextures) {
            material.setParameter('splatParams0', this.paramsTextures.tex0);
            material.setParameter('splatParams1', this.paramsTextures.tex1);
            material.setParameter('splatParams2', this.paramsTextures.tex2);
            // Use stateTexture width/height which covers all splats (mergedResource might be smaller)
            const tex = this.stateTexture;
            if (tex) {
                // globalParams must match GSplatResource's texture for correct initSource() behavior
                const resourceWidth = (this.mergedResource as any).transformATexture?.width ?? tex.width;
                const resourceHeight = (this.mergedResource as any).transformATexture?.height ?? tex.height;
                material.setParameter('globalParams', [resourceWidth, resourceWidth * resourceHeight]);

                // splatParamsDim for our custom textures
                material.setParameter('splatParamsDim', [tex.width, tex.width * tex.height]);
            }
        }

        // GSplat は他の描画（GLB等）と深度統合するため、深度テストは常に有効化し、
        // 深度書き込みは無効のまま維持する。
        material.depthTest = true;
        material.depthWrite = false;
        material.update();
    }

    private destroyMerged() {
        this.clearSorterUpdatedHandler();
        if (this.mergedEntity.gsplat) {
            this.mergedEntity.removeComponent('gsplat');
        }

        if (this.mergedAsset) {
            this.mergedAsset.unload();
            this.scene.app.assets.remove(this.mergedAsset);
        }

        this.mergedAsset = null;
        this.mergedResource = null;
    }

    private createTexture(name: string, width: number, height: number, format: number) {
        return new Texture(this.scene.graphicsDevice, {
            name,
            width,
            height,
            format,
            mipmaps: false,
            minFilter: FILTER_NEAREST,
            magFilter: FILTER_NEAREST,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
    }

    private _needsTransformUpdate = false;

    onPreRender() {
        const instance = this.mergedEntity.gsplat?.instance;
        if (!instance) return;

        this.ensureSorterUpdatedHandler();

        // check if we need to run delayed transform updates
        // this is necessary because the sorter (worker) and GPU resources might not be ready
        // immediately after rebuild/add, leading to valid centers being overwritten with 0s
        if (this._needsTransformUpdate && instance.sorter) {
            this.sources.forEach(splat => this.updateTransform(splat));
            this._needsTransformUpdate = false;
        }

        this.flushSorterCenters();

        if (this.materialDirty) {
            this.applyMaterialBands(this.scene.events.invoke('view.bands'));
            this.materialDirty = false;
        }

        const material = instance.material;
        const events = this.scene.events;
        const selection = events.invoke('selection');
        const selected = selection instanceof Splat ? selection : null;
        const selectedClr = events.invoke('selectedClr');
        const unselectedClr = events.invoke('unselectedClr');
        const lockedClr = events.invoke('lockedClr');
        const cameraMode = events.invoke('camera.mode');
        const cameraOverlay = events.invoke('camera.overlay');
        const outlineMode = !!events.invoke('view.outlineSelection');

        material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a]);
        material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
        material.setParameter('lockedClr', [lockedClr.r, lockedClr.g, lockedClr.b, lockedClr.a]);

        material.setParameter('mode', cameraMode === 'rings' ? 1 : 0);
        material.setParameter('ringSize', (selected && cameraOverlay && cameraMode === 'rings') ? 0.04 : 0);
        material.setParameter('outlineMode', outlineMode ? 1 : 0);
        material.setParameter('clrOffset', [0, 0, 0]);
        material.setParameter('clrScale', [1, 1, 1, 1]);
    }

    rebuild() {
        this.destroyMerged();
        this.centersUpdateToken++;

        const activeSources = this.sources.filter(splat => splat.visible);
        if (activeSources.length === 0) {
            console.log('SplatRenderSystem: No sources to rebuild');
            this.destroyMerged();
            this.stateTexture?.destroy();
            this.stateTexture = null;
            this.transformTexture?.destroy();
            this.transformTexture = null;
            this.sources.forEach((splat) => {
                splat.stateTexture = null;
                splat.transformTexture = null;
            });
            this.paramsTextures?.tex0.destroy();
            this.paramsTextures?.tex1.destroy();
            this.paramsTextures?.tex2.destroy();
            this.paramsTextures = null;
            this.paramsStorage = null;
            this.transformBases.clear();
            this.offsets.clear();
            this.counts.clear();
            this.globalState = null;
            this.globalTransformIndices = null;
            this.globalIdToSplat = [];
            this.sorterMapping = null;
            this.sorterCentersDirty = false;
            return;
        }

        // 前掃除
        this.transformPalette.destroy();
        this.transformPalette = new TransformPalette(this.scene.graphicsDevice);

        // プロパティ検証
        // プロパティ検証: 最も多くのプロパティを持つSplatを基準にする (SH Bandsが多いものをベースにするため)
        let maxProps = 0;
        let baseSplat = activeSources[0];

        activeSources.forEach((s) => {
            const props = s.splatData.getElement('vertex').properties;
            if (props.length > maxProps) {
                maxProps = props.length;
                baseSplat = s;
            }
        });

        const baseProperties = baseSplat.splatData.getElement('vertex').properties;
        const totalSplats = activeSources.reduce((sum, s) => sum + s.splatData.numSplats, 0);
        let shBands = 0;

        this.offsets.clear();
        this.counts.clear();
        this.transformBases.clear();
        this.globalIdToSplat = new Array(totalSplats);

        // オフセット計算
        let runningOffset = 0;
        activeSources.forEach((splat) => {
            this.offsets.set(splat, runningOffset);
            this.counts.set(splat, splat.splatData.numSplats);

            // Map global IDs to this splat for picking
            for (let i = 0; i < splat.splatData.numSplats; i++) {
                this.globalIdToSplat[runningOffset + i] = { splat, local: i };
            }

            runningOffset += splat.splatData.numSplats;
            const resource = splat.asset.resource as GSplatResource;
            shBands = Math.max(shBands, resource.shBands ?? 0);
        });

        // 変換ブロック割当
        const mat = new Mat4();
        this.transformPalette.beginUpdate();
        activeSources.forEach((splat) => {
            const indices = splat.splatData.getProp('transform') as Uint16Array;
            let maxLocal = 0;
            for (let i = 0; i < indices.length; i++) {
                maxLocal = Math.max(maxLocal, indices[i]);
            }
            const size = maxLocal + 1;
            const base = this.transformPalette.alloc(size);
            this.transformBases.set(splat, { base, size });

            const world = splat.entity.getWorldTransform();
            for (let i = 0; i < size; i++) {
                splat.transformPalette.getTransform(i, mat);
                mat.mul2(world, mat);
                this.transformPalette.setTransform(base + i, mat);
            }
        });
        this.transformPalette.endUpdate();

        // 頂点属性統合
        const mergedProperties = baseProperties.map((prop) => {
            const stride = prop.storage.length / baseSplat.splatData.numSplats;
            const storage = new (prop.storage.constructor as any)(stride * totalSplats);
            return {
                type: prop.type,
                name: prop.name,
                storage,
                byteSize: prop.byteSize,
                stride // Helper for later
            };
        });

        activeSources.forEach((splat) => {
            const offset = this.offsets.get(splat) ?? 0;
            const count = this.counts.get(splat) ?? 0;
            const propSrc = splat.splatData.getElement('vertex').properties;

            mergedProperties.forEach((mergedProp, index) => {
                const srcProp = propSrc.find(p => p.name === mergedProp.name);
                if (!srcProp) {
                    // This splat does not have this property (e.g. missing SH band).
                    // Leave initialized zeros in merged storage.
                    return;
                }

                const stride = mergedProp.stride; // Use merged stride expectation
                const srcStride = srcProp.storage.length / splat.splatData.numSplats;

                if (stride !== srcStride) {
                    // Stride mismatch (unlikely for matched name, but possible). Skip to avoid corruption.
                    console.warn(`SplatRenderSystem: Stride mismatch for ${mergedProp.name}. Expected ${stride}, got ${srcStride}`);
                    return;
                }

                const dst = mergedProp.storage;
                const dstOffset = offset * stride;

                if (srcProp.name === 'transform') {
                    const block = this.transformBases.get(splat);
                    const src = srcProp.storage as Uint16Array;
                    const dstTyped = dst as Uint16Array;
                    for (let i = 0; i < count; i++) {
                        dstTyped[dstOffset + i] = (block?.base ?? 0) + src[i];
                    }
                } else {
                    dst.set(srcProp.storage.slice(0, count * stride), dstOffset);
                }
            });
        });

        this.mergedData = new GSplatData([{
            name: 'vertex',
            count: totalSplats,
            properties: mergedProperties
        } as any]);
        // shBands は readonly ゲッターのみなので内部フィールドに直接設定
        (this.mergedData as any)._shBands = shBands;
        this.shBands = shBands;


        this.mergedResource = new GSplatResource(this.scene.graphicsDevice, this.mergedData);
        this.mergedAsset = new Asset('mergedSplat', 'gsplat', {
            filename: 'mergedSplat'
        });
        this.mergedAsset.resource = this.mergedResource;
        this.scene.app.assets.add(this.mergedAsset);

        this.mergedEntity.addComponent('gsplat', { asset: this.mergedAsset });
        const splatLayer = this.scene.splatLayer ?? this.scene.app.scene.layers.getLayerByName('Splat');
        if (splatLayer) {
            this.mergedEntity.gsplat.layers = [splatLayer.id];
        } else {
            const worldLayer = this.scene.app.scene.layers.getLayerByName('World');
            if (worldLayer) {
                this.mergedEntity.gsplat.layers = [worldLayer.id];
            }
        }

        // テクスチャ再構築
        // GSplatResourceと同じテクスチャサイズを使用する必要がある (UV計算の一貫性のため)
        const frameWidth = this.mergedResource.transformATexture?.width ?? 2048;
        const frameHeight = this.mergedResource.transformATexture?.height ?? 2048;

        const width = frameWidth;
        const height = frameHeight;

        console.log('SplatRenderSystem: Merged data created.',
            'Total splats:', totalSplats,
            'Resource Width:', width,
            'Resource Height:', height,
            'Color Tex Width:', (this.mergedResource as any).colorTexture?.width,
            'SH Bands:', shBands
        );
        const globalStateSize = width * height;

        this.stateTexture?.destroy();
        this.transformTexture?.destroy();
        this.paramsTextures?.tex0.destroy();
        this.paramsTextures?.tex1.destroy();
        this.paramsTextures?.tex2.destroy();
        this.paramsTextures = null;
        this.paramsStorage = null;

        this.stateTexture = this.createTexture('mergedState', width, height, PIXELFORMAT_R8);
        this.transformTexture = this.createTexture('mergedTransform', width, height, PIXELFORMAT_R16U);
        this.globalState = new Uint8Array(globalStateSize);
        this.globalTransformIndices = new Uint16Array(globalStateSize);
        this.paramsTextures = {
            tex0: this.createTexture('splatParams0', width, height, PIXELFORMAT_RGBA32F),
            tex1: this.createTexture('splatParams1', width, height, PIXELFORMAT_RGBA32F),
            tex2: this.createTexture('splatParams2', width, height, PIXELFORMAT_RGBA32F)
        };
        this.paramsStorage = {
            arr0: new Float32Array(globalStateSize * 4),
            arr1: new Float32Array(globalStateSize * 4),
            arr2: new Float32Array(globalStateSize * 4)
        };

        // Initialize with safe defaults (White, Opacity 1.0, etc.)
        // This prevents invisible splats if updateParams loop has issues
        const { arr0, arr1, arr2 } = this.paramsStorage;
        for (let i = 0; i < globalStateSize; i++) {
            const idx = i * 4;
            // Params0: Tint(1,1,1), Temp(0)
            arr0[idx + 0] = 1; arr0[idx + 1] = 1; arr0[idx + 2] = 1; arr0[idx + 3] = 0;
            // Params1: Sat(1), Bright(0), Black(0), White(1)
            arr1[idx + 0] = 1; arr1[idx + 1] = 0; arr1[idx + 2] = 0; arr1[idx + 3] = 1;
            // Params2: Trans(1), Sel(1)
            arr2[idx + 0] = 1; arr2[idx + 1] = 1; arr2[idx + 2] = 0; arr2[idx + 3] = 0;
        }

        this.sources.forEach((splat) => {
            if (splat.visible) {
                splat.stateTexture = this.stateTexture;
                splat.transformTexture = this.transformTexture;
            } else {
                splat.stateTexture = null;
                splat.transformTexture = null;
            }
        });

        activeSources.forEach((splat) => {
            const offset = this.offsets.get(splat);
            const count = this.counts.get(splat);
            const block = this.transformBases.get(splat);
            if (offset === undefined || count === undefined || !block) {
                return;
            }
            const state = splat.splatData.getProp('state') as Uint8Array;
            const indices = splat.splatData.getProp('transform') as Uint16Array;

            // globalState updating is handled in updateState call below
            // but we need globalTransformIndices setup here or in updateTransform
            for (let i = 0; i < count; i++) {
                this.globalTransformIndices[offset + i] = block.base + indices[i];
            }

            for (let i = 0; i < count; i++) {
                this.globalIdToSplat[offset + i] = { splat, local: i };
            }
        });

        // データ設定 (updateState/updateSplatParams でテクスチャ転送を行うため、ここでは初期化のみ)
        // transformTexture はここで一度転送する
        const transformData = this.transformTexture.lock() as Uint16Array;
        transformData.set(this.globalTransformIndices);
        this.transformTexture.unlock();

        // 各Splatのパラメータと状態を更新・転送
        if (this.paramsTextures && this.paramsStorage) {
            this.sources.forEach((splat) => {
                this.updateSplatParams(splat);
                this.updateState(splat);
            });
        }

        this.applyMaterialBands(this.scene.events.invoke('view.bands'));

        const instance = this.mergedEntity.gsplat.instance;
        if (instance) {
            instance.meshInstance.cull = false;
            this.seedInstance(instance, totalSplats);

            // Update sorter centers asynchronously (GPU readback).
            const centersToken = this.centersUpdateToken;
            this.updateSorterCenters([...activeSources], totalSplats, instance, centersToken).catch(() => {});
        }

        this.ensureSorterUpdatedHandler();

        this.rebuildSorterMapping();
        this.scene.forceRender = true;
        this.materialDirty = false;

        this.scene.boundDirty = true;

        // Ensure transforms (and thus world centers) are up to date
        // This prevents pivot picking issues where centers are initially 0 or unscaled
        activeSources.forEach((splat) => {
            this.updateTransform(splat);
        });

        // Trigger delayed transform update to ensure centers are valid
        // regardless of async sorter initialization timing
        this._needsTransformUpdate = true;
    }
}

export { SplatRenderSystem };
