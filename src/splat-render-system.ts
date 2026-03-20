import {
    BLEND_NONE,
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

import type { ProcessorContext, ProcessorInputLayout } from './data-processor/types';
import type { Scene } from './scene';
import { vertexShader, fragmentShader, gsplatCenter } from './shaders/splat-shader';
import { Splat } from './splat';
import type {
    SplatRenderDataBackend,
    SplatRenderDisplayBackend,
    SplatRenderLifecycleBackend,
    SplatRenderOverlayBinding,
    SplatRenderOverlayBackend,
    SplatRenderPickMapping,
    SplatRenderPickingBackend,
    SplatRenderRoleBackends
} from './splat-render-backend';
import { State } from './splat-state';
import { TransformPalette } from './transform-palette';

type TransformBlock = { base: number; size: number };

type SplatRenderEntry = {
    offset: number;
    count: number;
    transformBlock?: TransformBlock;
};

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

type MergedResourceInfo = {
    positionTexture: Texture | null;
    globalParams: [number, number];
    width: number;
    height: number;
    colorTextureWidth: number;
};

type SplatRenderSystemDataContext = {
    scene: Scene;
    getEntry: (splat: Splat) => SplatRenderEntry | null;
    getCenters: () => Float32Array | null;
    hasMergedResource: () => boolean;
    getMergedResourceInfo: () => MergedResourceInfo | null;
    getTransformTexture: () => Texture | null;
    getTransformPaletteTexture: () => Texture | null;
    getStateTexture: () => Texture | null;
    getBoundCache: (splat: Splat) => BoundCacheEntry | null;
};

type SplatRenderSystemDisplayContext = {
    scene: Scene;
    getEntry: (splat: Splat) => SplatRenderEntry | null;
    getBoundCache: (splat: Splat) => BoundCacheEntry | null;
    setBoundCache: (splat: Splat, entry: BoundCacheEntry) => void;
    deleteBoundCache: (splat: Splat) => void;
    deleteEntry: (splat: Splat) => void;
    getMergedInstance: () => any;
    getStateTexture: () => Texture | null;
    getGlobalState: () => Uint8Array | null;
    getParamsTextures: () => ParamsTextures | null;
    getParamsStorage: () => ParamsStorage | null;
    getTransformTexture: () => Texture | null;
    getGlobalTransformIndices: () => Uint16Array | null;
    getTransformPalette: () => TransformPalette;
    markSorterCentersDirty: () => void;
    rebuildSorterMapping: () => void;
    isFrozen: () => boolean;
    markDirty: () => void;
    rebuild: () => void;
};

type SplatRenderSystemPickingContext = {
    getPickMapping: (id: number) => SplatRenderPickMapping | null;
    getMaterial: () => any;
};

type SplatRenderSystemOverlayContext = {
    getEntry: (splat: Splat) => SplatRenderEntry | null;
    getNode: () => Entity;
    getMergedResourceInfo: () => MergedResourceInfo | null;
    getStateTexture: () => Texture | null;
    getTransformTexture: () => Texture | null;
    getTransformPaletteTexture: () => Texture | null;
};

type SplatRenderSystemLifecycleContext = {
    scene: Scene;
    getSources: () => Splat[];
    getMergedInstance: () => any;
    ensureSorterUpdatedHandler: () => void;
    flushSorterCenters: () => void;
    isMaterialDirty: () => boolean;
    setMaterialDirty: (value: boolean) => void;
    applyMaterialBands: (bands: number) => void;
    updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => void;
    rebuild: () => void;
};

type SplatRenderSystemLifecycleController = SplatRenderLifecycleBackend & {
    isFrozen: () => boolean;
    markDirty: () => void;
    setNeedsTransformUpdate: (value: boolean) => void;
};

type SplatRenderSystemDisplayController = SplatRenderDisplayBackend & {
    getSources: () => Splat[];
    onPivotStarted: () => void;
    onPivotEnded: () => void;
};

type SplatRenderBuildArtifacts = {
    entries: Map<Splat, SplatRenderEntry>;
    globalIdToSplat: SplatRenderPickMapping[];
    transformPalette: TransformPalette;
    mergedData: GSplatData;
    mergedResource: GSplatResource;
    mergedResourceInfo: MergedResourceInfo;
    mergedAsset: Asset;
    shBands: number;
    totalSplats: number;
};

type SplatRenderRuntimeState = {
    stateTexture: Texture;
    transformTexture: Texture;
    paramsTextures: ParamsTextures;
    paramsStorage: ParamsStorage;
    globalState: Uint8Array;
    globalTransformIndices: Uint16Array;
};

type SplatRenderRuntimeDimensions = {
    width: number;
    height: number;
};

const createSplatRenderProcessorContext = (context: SplatRenderSystemDataContext, splat: Splat): ProcessorContext => {
    const entry = context.getEntry(splat);
    const resourceInfo = context.getMergedResourceInfo();
    const inputLayout: ProcessorInputLayout = {
        centerSource: resourceInfo?.positionTexture ?? null,
        transformIndexSource: context.getTransformTexture(),
        transformPaletteSource: context.getTransformPaletteTexture(),
        stateSource: context.getStateTexture(),
        globalUv: {
            textureWidth: resourceInfo?.globalParams[0] ?? 0,
            textureCapacity: resourceInfo?.globalParams[1] ?? 0
        }
    };

    return {
        splat,
        offset: entry?.offset ?? 0,
        count: entry?.count ?? 0,
        inputLayout
    };
};

const createMergedResourceInfo = (resource: GSplatResource | null) => {
    const positionTexture = resource?.getTexture('transformA') ?? null;
    const width = positionTexture?.width ?? resource?.textureDimensions.x ?? 2048;
    const height = positionTexture?.height ?? resource?.textureDimensions.y ?? 2048;
    const colorTextureWidth = resource?.getTexture('splatColor')?.width ?? 0;
    const globalParams: [number, number] = [width, width * height];

    return {
        positionTexture,
        globalParams,
        width,
        height,
        colorTextureWidth
    };
};

const createSplatRenderBuildArtifacts = (
    scene: Scene,
    activeSources: Splat[]
): SplatRenderBuildArtifacts => {
    let maxProps = 0;
    let baseSplat = activeSources[0];

    activeSources.forEach((splat) => {
        const props = splat.splatData.getElement('vertex').properties;
        if (props.length > maxProps) {
            maxProps = props.length;
            baseSplat = splat;
        }
    });

    const baseProperties = baseSplat.splatData.getElement('vertex').properties;
    const totalSplats = activeSources.reduce((sum, splat) => sum + splat.splatData.numSplats, 0);
    let shBands = 0;

    const entries = new Map<Splat, SplatRenderEntry>();
    const globalIdToSplat: SplatRenderPickMapping[] = new Array(totalSplats);
    let runningOffset = 0;

    activeSources.forEach((splat) => {
        const count = splat.splatData.numSplats;
        entries.set(splat, {
            offset: runningOffset,
            count
        });

        for (let i = 0; i < count; i++) {
            globalIdToSplat[runningOffset + i] = { splat, local: i };
        }

        runningOffset += count;
        const resource = splat.asset.resource as GSplatResource;
        shBands = Math.max(shBands, resource.shBands ?? 0);
    });

    const transformPalette = new TransformPalette(scene.graphicsDevice);
    const mat = new Mat4();
    transformPalette.beginUpdate();
    activeSources.forEach((splat) => {
        const indices = splat.splatData.getProp('transform') as Uint16Array;
        let maxLocal = 0;
        for (let i = 0; i < indices.length; i++) {
            maxLocal = Math.max(maxLocal, indices[i]);
        }
        const size = maxLocal + 1;
        const base = transformPalette.alloc(size);
        const entry = entries.get(splat);
        if (entry) {
            entry.transformBlock = { base, size };
        }

        const world = splat.entity.getWorldTransform();
        for (let i = 0; i < size; i++) {
            splat.transformPalette.getTransform(i, mat);
            mat.mul2(world, mat);
            transformPalette.setTransform(base + i, mat);
        }
    });
    transformPalette.endUpdate();

    const mergedProperties = baseProperties.map((prop) => {
        const stride = prop.storage.length / baseSplat.splatData.numSplats;
        const storage = new (prop.storage.constructor as any)(stride * totalSplats);
        return {
            type: prop.type,
            name: prop.name,
            storage,
            byteSize: prop.byteSize,
            stride
        };
    });

    activeSources.forEach((splat) => {
        const entry = entries.get(splat);
        const offset = entry?.offset ?? 0;
        const count = entry?.count ?? 0;
        const propSrc = splat.splatData.getElement('vertex').properties;

        mergedProperties.forEach((mergedProp) => {
            const srcProp = propSrc.find(p => p.name === mergedProp.name);
            if (!srcProp) {
                return;
            }

            const stride = mergedProp.stride;
            const srcStride = srcProp.storage.length / splat.splatData.numSplats;

            if (stride !== srcStride) {
                console.warn(`SplatRenderSystem: Stride mismatch for ${mergedProp.name}. Expected ${stride}, got ${srcStride}`);
                return;
            }

            const dst = mergedProp.storage;
            const dstOffset = offset * stride;

            if (srcProp.name === 'transform') {
                const block = entry?.transformBlock;
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

    const mergedData = new GSplatData([{
        name: 'vertex',
        count: totalSplats,
        properties: mergedProperties
    } as any]);
    (mergedData as any)._shBands = shBands;

    const mergedResource = new GSplatResource(scene.graphicsDevice, mergedData);
    const mergedResourceInfo = createMergedResourceInfo(mergedResource);
    const mergedAsset = new Asset('mergedSplat', 'gsplat', {
        filename: 'mergedSplat'
    });
    mergedAsset.resource = mergedResource;
    scene.app.assets.add(mergedAsset);

    return {
        entries,
        globalIdToSplat,
        transformPalette,
        mergedData,
        mergedResource,
        mergedResourceInfo,
        mergedAsset,
        shBands,
        totalSplats
    };
};

const createSplatRenderRuntimeState = (
    createTexture: (name: string, width: number, height: number, format: number) => Texture,
    width: number,
    height: number
): SplatRenderRuntimeState => {
    const globalStateSize = width * height;
    const paramsStorage: ParamsStorage = {
        arr0: new Float32Array(globalStateSize * 4),
        arr1: new Float32Array(globalStateSize * 4),
        arr2: new Float32Array(globalStateSize * 4)
    };

    const { arr0, arr1, arr2 } = paramsStorage;
    for (let i = 0; i < globalStateSize; i++) {
        const idx = i * 4;
        arr0[idx + 0] = 1; arr0[idx + 1] = 1; arr0[idx + 2] = 1; arr0[idx + 3] = 0;
        arr1[idx + 0] = 1; arr1[idx + 1] = 0; arr1[idx + 2] = 0; arr1[idx + 3] = 1;
        arr2[idx + 0] = 1; arr2[idx + 1] = 1; arr2[idx + 2] = 0; arr2[idx + 3] = 0;
    }

    return {
        stateTexture: createTexture('mergedState', width, height, PIXELFORMAT_R8),
        transformTexture: createTexture('mergedTransform', width, height, PIXELFORMAT_R16U),
        paramsTextures: {
            tex0: createTexture('splatParams0', width, height, PIXELFORMAT_RGBA32F),
            tex1: createTexture('splatParams1', width, height, PIXELFORMAT_RGBA32F),
            tex2: createTexture('splatParams2', width, height, PIXELFORMAT_RGBA32F)
        },
        paramsStorage,
        globalState: new Uint8Array(globalStateSize),
        globalTransformIndices: new Uint16Array(globalStateSize)
    };
};

const destroySplatRenderRuntimeState = (
    stateTexture: Texture | null,
    transformTexture: Texture | null,
    paramsTextures: ParamsTextures | null
) => {
    stateTexture?.destroy();
    transformTexture?.destroy();
    paramsTextures?.tex0.destroy();
    paramsTextures?.tex1.destroy();
    paramsTextures?.tex2.destroy();
};

class SplatRenderSystem {
    scene: Scene;
    entries = new Map<Splat, SplatRenderEntry>();
    mergedData: GSplatData | null = null;
    mergedResource: GSplatResource | null = null;
    mergedResourceInfo: MergedResourceInfo | null = null;
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
    private sorterCentersDirty = false;
    private centersUpdateToken = 0;
    private sorterMapping: Uint32Array | null = null;
    private sorterUpdatedHandle: { off: () => void } | null = null;
    private sorterUpdatedSorter: unknown | null = null;
    private mergedDisplayVisible = true;
    private lifecycleController!: SplatRenderSystemLifecycleController;
    private displayOps!: SplatRenderDisplayBackend;
    private displayController!: SplatRenderSystemDisplayController;

    constructor(scene: Scene) {
        this.scene = scene;
        this.transformPalette = new TransformPalette(scene.graphicsDevice);

        this.mergedEntity = new Entity('mergedSplat');
        this.scene.contentRoot.addChild(this.mergedEntity);
        this.lifecycleController = createSplatRenderSystemLifecycleBackend(this.createLifecycleContext());
        this.displayController = createSplatRenderSystemDisplayBackend(this.createDisplayContext());
        this.displayOps = this.displayController;

        // SH バンド変更に追従
        this.scene.events.on('view.bands', (bands: number) => {
            if (this.mergedEntity.gsplat?.instance?.material) {
                this.applyMaterialBands(bands);
            } else {
                this.materialDirty = true;
            }
        });

        this.scene.events.on('pivot.started', () => {
            this.displayController.onPivotStarted();
        });
        this.scene.events.on('pivot.ended', () => {
            this.displayController.onPivotEnded();
        });

        this.scene.events.on('splat.positionsChanged', (splat: Splat) => {
            if (!this.isSplatActive(splat)) {
                return;
            }
            this.markSorterCentersDirty();
        });
    }

    isSplatActive(splat: Splat) {
        return this.displayOps.isSplatActive(splat);
    }

    getLifecycleBackend() {
        return this.lifecycleController;
    }

    getDisplayBackend() {
        return this.displayController;
    }

    setMergedDisplayVisible(visible: boolean) {
        this.mergedDisplayVisible = visible;
        this.applyMergedDisplayVisibility();
    }

    private getEntry(splat: Splat) {
        return this.entries.get(splat) ?? null;
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
            this.displayController.getSources().forEach((s) => {
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

    hasRenderableData(splat: Splat) {
        return this.displayOps.hasRenderableData(splat);
    }

    get centers() {
        return this.mergedEntity.gsplat?.instance?.sorter?.centers || null;
    }

    createDataContext(): SplatRenderSystemDataContext {
        return {
            scene: this.scene,
            getEntry: (splat: Splat) => this.getEntry(splat),
            getCenters: () => this.centers,
            hasMergedResource: () => !!this.mergedResource,
            getMergedResourceInfo: () => this.mergedResourceInfo,
            getTransformTexture: () => this.transformTexture,
            getTransformPaletteTexture: () => this.transformPalette.texture,
            getStateTexture: () => this.stateTexture,
            getBoundCache: (splat: Splat) => this.boundCache.get(splat) ?? null
        };
    }

    createDisplayContext(): SplatRenderSystemDisplayContext {
        return {
            scene: this.scene,
            getEntry: (splat: Splat) => this.getEntry(splat),
            getBoundCache: (splat: Splat) => this.boundCache.get(splat) ?? null,
            setBoundCache: (splat: Splat, entry: BoundCacheEntry) => this.boundCache.set(splat, entry),
            deleteBoundCache: (splat: Splat) => this.boundCache.delete(splat),
            deleteEntry: (splat: Splat) => this.entries.delete(splat),
            getMergedInstance: () => this.mergedEntity.gsplat?.instance,
            getStateTexture: () => this.stateTexture,
            getGlobalState: () => this.globalState,
            getParamsTextures: () => this.paramsTextures,
            getParamsStorage: () => this.paramsStorage,
            getTransformTexture: () => this.transformTexture,
            getGlobalTransformIndices: () => this.globalTransformIndices,
            getTransformPalette: () => this.transformPalette,
            markSorterCentersDirty: () => this.markSorterCentersDirty(),
            rebuildSorterMapping: () => this.rebuildSorterMapping(),
            isFrozen: () => this.lifecycleController.isFrozen(),
            markDirty: () => this.lifecycleController.markDirty(),
            rebuild: () => this.rebuild()
        };
    }

    createLifecycleContext(): SplatRenderSystemLifecycleContext {
        return {
            scene: this.scene,
            getSources: () => this.displayController?.getSources?.() ?? [],
            getMergedInstance: () => this.mergedEntity.gsplat?.instance,
            ensureSorterUpdatedHandler: () => this.ensureSorterUpdatedHandler(),
            flushSorterCenters: () => this.flushSorterCenters(),
            isMaterialDirty: () => this.materialDirty,
            setMaterialDirty: (value: boolean) => {
                this.materialDirty = value;
            },
            applyMaterialBands: (bands: number) => this.applyMaterialBands(bands),
            updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => this.updateTransform(splat, skipCenterUpdate),
            rebuild: () => this.rebuild()
        };
    }

    createPickingContext(): SplatRenderSystemPickingContext {
        return {
            getPickMapping: (id: number) => this.globalIdToSplat[id] || null,
            getMaterial: () => this.mergedEntity.gsplat?.instance?.material
        };
    }

    createOverlayContext(): SplatRenderSystemOverlayContext {
        return {
            getEntry: (splat: Splat) => this.getEntry(splat),
            getNode: () => this.mergedEntity,
            getMergedResourceInfo: () => this.mergedResourceInfo,
            getStateTexture: () => this.stateTexture,
            getTransformTexture: () => this.transformTexture,
            getTransformPaletteTexture: () => this.transformPalette.texture
        };
    }

    private createProcessorContext(splat: Splat) {
        return createSplatRenderProcessorContext(this.createDataContext(), splat);
    }

    readWorldCenter(splat: Splat, localIndex: number, out: { set: (x: number, y: number, z: number) => void }) {
        const centers = this.centers;
        const entry = this.getEntry(splat);
        if (!centers || !entry || localIndex < 0 || localIndex >= entry.count) {
            return false;
        }
        const base = (entry.offset + localIndex) * 3;
        out.set(
            centers[base + 0],
            centers[base + 1],
            centers[base + 2]
        );
        return true;
    }

    writeWorldCenter(splat: Splat, localIndex: number, x: number, y: number, z: number) {
        const centers = this.centers;
        const entry = this.getEntry(splat);
        if (!centers || !entry || localIndex < 0 || localIndex >= entry.count) {
            return false;
        }
        const base = (entry.offset + localIndex) * 3;
        centers[base + 0] = x;
        centers[base + 1] = y;
        centers[base + 2] = z;
        return true;
    }

    getBound(splat: Splat, mode: 'selected' | 'visible') {
        const entry = this.getEntry(splat);
        if (!this.mergedResource || !entry || entry.count === 0) {
            return null;
        }
        const cache = this.boundCache.get(splat);
        if (!cache) {
            return null;
        }

        const boundingBox = mode === 'selected' ? cache.selection : cache.visible;
        const dirty = mode === 'selected' ? cache.selectionDirty : cache.visibleDirty;

        if (dirty) {
            const onlySelected = mode === 'selected';
            this.scene.dataProcessor.calcBound(this.createProcessorContext(splat), boundingBox, onlySelected).catch(() => {});
            if (mode === 'selected') {
                cache.selectionDirty = false;
            } else {
                cache.visibleDirty = false;
            }
        }

        return boundingBox;
    }

    async calcBound(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox) {
        await this.scene.dataProcessor.calcBound(this.createProcessorContext(splat), selectionBound, localBound);
    }

    calcPositions(splat: Splat) {
        const count = this.getEntry(splat)?.count ?? 0;
        if (count === 0) {
            return Promise.resolve(new Float32Array(0));
        }
        return this.scene.dataProcessor.calcPositions(this.createProcessorContext(splat));
    }

    intersect(splat: Splat, options: import('./data-processor').IntersectOptions) {
        return this.scene.dataProcessor.intersect(options, this.createProcessorContext(splat));
    }

    private async updateSorterCenters(activeSources: Splat[], totalSplats: number, instance: any, token: number) {
        const centers = new Float32Array(totalSplats * 3);
        for (const splat of activeSources) {
            const entry = this.getEntry(splat);
            const offset = entry?.offset ?? 0;
            const count = entry?.count ?? 0;
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

    updateState(splat: Splat) {
        return this.displayOps.updateState(splat);
    }

    updateSplatParams(splat: Splat) {
        this.displayOps.updateSplatParams(splat);
    }

    updateTransform(splat: Splat, skipCenterUpdate = false) {
        this.displayOps.updateTransform(splat, skipCenterUpdate);
    }

    updateTransformIndices(splat: Splat, updatedIndices?: Uint16Array) {
        this.displayOps.updateTransformIndices(splat, updatedIndices);
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
                const globalParams = this.mergedResourceInfo?.globalParams ?? [tex.width, tex.width * tex.height];
                material.setParameter('globalParams', globalParams);

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

    private applyMergedDisplayVisibility() {
        const gsplat = this.mergedEntity.gsplat;
        if (!gsplat) {
            return;
        }

        if (this.mergedDisplayVisible) {
            gsplat.show();
        } else {
            gsplat.hide();
        }
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
        this.mergedResourceInfo = null;
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

    private resetEmptyRebuildState() {
        destroySplatRenderRuntimeState(this.stateTexture, this.transformTexture, this.paramsTextures);
        this.stateTexture = null;
        this.transformTexture = null;
        this.paramsTextures = null;
        this.paramsStorage = null;
        this.entries.clear();
        this.globalState = null;
        this.globalTransformIndices = null;
        this.globalIdToSplat = [];
        this.sorterMapping = null;
        this.sorterCentersDirty = false;
    }

    private applyBuildArtifacts(buildArtifacts: SplatRenderBuildArtifacts) {
        this.transformPalette.destroy();
        this.transformPalette = buildArtifacts.transformPalette;
        this.entries = buildArtifacts.entries;
        this.globalIdToSplat = buildArtifacts.globalIdToSplat;
        this.mergedData = buildArtifacts.mergedData;
        this.mergedResource = buildArtifacts.mergedResource;
        this.mergedResourceInfo = buildArtifacts.mergedResourceInfo;
        this.mergedAsset = buildArtifacts.mergedAsset;
        this.shBands = buildArtifacts.shBands;
    }

    private attachMergedAsset() {
        this.mergedEntity.addComponent('gsplat', { asset: this.mergedAsset });
        const splatLayer = this.scene.splatLayer ?? this.scene.app.scene.layers.getLayerByName('Splat');
        if (splatLayer) {
            this.mergedEntity.gsplat.layers = [splatLayer.id];
            this.applyMergedDisplayVisibility();
            return;
        }

        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');
        if (worldLayer) {
            this.mergedEntity.gsplat.layers = [worldLayer.id];
        }
        this.applyMergedDisplayVisibility();
    }

    private getRuntimeDimensions(): SplatRenderRuntimeDimensions {
        const resourceInfo = this.mergedResourceInfo ?? createMergedResourceInfo(this.mergedResource);
        return {
            width: resourceInfo.width,
            height: resourceInfo.height
        };
    }

    private applyRuntimeState(runtimeState: SplatRenderRuntimeState) {
        destroySplatRenderRuntimeState(this.stateTexture, this.transformTexture, this.paramsTextures);
        this.stateTexture = runtimeState.stateTexture;
        this.transformTexture = runtimeState.transformTexture;
        this.paramsTextures = runtimeState.paramsTextures;
        this.paramsStorage = runtimeState.paramsStorage;
        this.globalState = runtimeState.globalState;
        this.globalTransformIndices = runtimeState.globalTransformIndices;
    }

    private populateRuntimeState(activeSources: Splat[]) {
        activeSources.forEach((splat) => {
            const entry = this.getEntry(splat);
            const block = entry?.transformBlock;
            if (!entry || !block) {
                return;
            }

            const indices = splat.splatData.getProp('transform') as Uint16Array;
            for (let i = 0; i < entry.count; i++) {
                this.globalTransformIndices[entry.offset + i] = block.base + indices[i];
            }
        });

        const transformData = this.transformTexture.lock() as Uint16Array;
        transformData.set(this.globalTransformIndices);
        this.transformTexture.unlock();
    }

    private syncRuntimeTextures() {
        if (!this.paramsTextures || !this.paramsStorage) {
            return;
        }

        this.displayController.getSources().forEach((splat) => {
            this.updateSplatParams(splat);
            this.updateState(splat);
        });
    }

    private finalizeRebuild(activeSources: Splat[], totalSplats: number) {
        this.applyMaterialBands(this.scene.events.invoke('view.bands'));

        const instance = this.mergedEntity.gsplat.instance;
        if (instance) {
            instance.meshInstance.cull = false;
            this.seedInstance(instance, totalSplats);

            const centersToken = this.centersUpdateToken;
            this.updateSorterCenters([...activeSources], totalSplats, instance, centersToken).catch(() => {});
        }

        this.ensureSorterUpdatedHandler();
        this.rebuildSorterMapping();
        this.applyMergedDisplayVisibility();
        this.scene.forceRender = true;
        this.materialDirty = false;
        this.scene.boundDirty = true;

        activeSources.forEach((splat) => {
            this.updateTransform(splat);
        });
        this.lifecycleController.setNeedsTransformUpdate(true);
    }

    rebuild() {
        this.destroyMerged();
        this.centersUpdateToken++;

        const activeSources = this.displayController.getSources().filter(splat => splat.visible);
        if (activeSources.length === 0) {
            console.log('SplatRenderSystem: No sources to rebuild');
            this.destroyMerged();
            this.resetEmptyRebuildState();
            return;
        }

        const buildArtifacts = createSplatRenderBuildArtifacts(this.scene, activeSources);
        this.applyBuildArtifacts(buildArtifacts);
        this.attachMergedAsset();

        const resourceInfo = this.mergedResourceInfo ?? createMergedResourceInfo(this.mergedResource);
        const runtimeDimensions = this.getRuntimeDimensions();

        console.log(
            this.scene.splatRenderCapabilities.resolvedMode === 'unified-display' ?
                'SplatRenderSystem: Merged backing data created for unified-display.' :
                'SplatRenderSystem: Merged data created.',
            'Total splats:', buildArtifacts.totalSplats,
            'Resource Width:', runtimeDimensions.width,
            'Resource Height:', runtimeDimensions.height,
            'Color Tex Width:', resourceInfo.colorTextureWidth,
            'SH Bands:', buildArtifacts.shBands
        );

        const runtimeState = createSplatRenderRuntimeState(
            (name: string, texWidth: number, texHeight: number, format: number) => this.createTexture(name, texWidth, texHeight, format),
            runtimeDimensions.width,
            runtimeDimensions.height
        );
        this.applyRuntimeState(runtimeState);
        this.populateRuntimeState(activeSources);
        this.syncRuntimeTextures();
        this.finalizeRebuild(activeSources, buildArtifacts.totalSplats);
    }
}

function createSplatRenderSystemLifecycleBackend(
    context: SplatRenderSystemLifecycleContext
): SplatRenderSystemLifecycleController {
    let frozen = false;
    let dirty = false;
    let needsTransformUpdate = false;
    let sorterPromiseHandle: Promise<void> | null = null;

    return {
        isFrozen: () => frozen,
        markDirty: () => {
            dirty = true;
        },
        setNeedsTransformUpdate: (value: boolean) => {
            needsTransformUpdate = value;
        },
        freeze: () => {
            frozen = true;
        },
        unfreeze: () => {
            frozen = false;
            if (dirty) {
                context.rebuild();
                dirty = false;
            }
        },
        waitForSorter: () => {
            const instance = context.getMergedInstance();
            if (!instance?.sorter) {
                return Promise.resolve();
            }

            let resolver: (() => void) | null = null;
            sorterPromiseHandle = new Promise<void>((resolve) => {
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

            instance.sort(context.scene.camera.entity);
            setTimeout(() => {
                if (resolver) {
                    resolver();
                }
            }, 1000);

            return sorterPromiseHandle;
        },
        onPreRender: () => {
            const instance = context.getMergedInstance();
            if (!instance) {
                return;
            }

            context.ensureSorterUpdatedHandler();

            if (needsTransformUpdate && instance.sorter) {
                context.getSources().forEach(splat => context.updateTransform(splat));
                needsTransformUpdate = false;
            }

            context.flushSorterCenters();

            if (context.isMaterialDirty()) {
                context.applyMaterialBands(context.scene.events.invoke('view.bands'));
                context.setMaterialDirty(false);
            }

            const material = instance.material;
            const events = context.scene.events;
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
        },
        rebuild: () => {
            context.rebuild();
        }
    };
}

function createSplatRenderSystemDisplayBackend(
    context: SplatRenderSystemDisplayContext
): SplatRenderSystemDisplayController {
    const sources: Splat[] = [];
    let visibilityRebuildTimer: number | null = null;
    let visibilityRebuildPending = false;
    let visibilityRebuildImmediate = false;
    let pivotActive = false;
    const visibilityRebuildDebounceMs = 400;

    const clearVisibilityRebuildTimer = () => {
        if (visibilityRebuildTimer !== null) {
            window.clearTimeout(visibilityRebuildTimer);
            visibilityRebuildTimer = null;
        }
    };

    const runVisibilityRebuild = () => {
        clearVisibilityRebuildTimer();
        if (!visibilityRebuildPending || pivotActive) {
            return;
        }
        visibilityRebuildPending = false;
        visibilityRebuildImmediate = false;
        if (context.isFrozen()) {
            context.markDirty();
            return;
        }
        context.rebuild();
    };

    const startVisibilityRebuildTimer = () => {
        clearVisibilityRebuildTimer();
        visibilityRebuildTimer = window.setTimeout(() => {
            visibilityRebuildTimer = null;
            if (!visibilityRebuildPending || pivotActive) {
                return;
            }
            runVisibilityRebuild();
        }, visibilityRebuildDebounceMs);
    };

    return {
        getSources: () => sources,
        onPivotStarted: () => {
            pivotActive = true;
            clearVisibilityRebuildTimer();
        },
        onPivotEnded: () => {
            pivotActive = false;
            if (visibilityRebuildPending) {
                if (visibilityRebuildImmediate) {
                    runVisibilityRebuild();
                } else {
                    startVisibilityRebuildTimer();
                }
            }
        },
        add: (splat: Splat) => {
            if (sources.includes(splat)) {
                return;
            }

            sources.push(splat);
            context.setBoundCache(splat, {
                selection: new BoundingBox(),
                visible: new BoundingBox(),
                selectionDirty: true,
                visibleDirty: true
            });

            if (context.isFrozen()) {
                context.markDirty();
                return;
            }

            context.rebuild();
        },
        remove: (splat: Splat) => {
            const idx = sources.indexOf(splat);
            if (idx === -1) {
                return;
            }

            sources.splice(idx, 1);
            context.deleteEntry(splat);
            context.deleteBoundCache(splat);

            if (context.isFrozen()) {
                context.markDirty();
                return;
            }

            context.rebuild();
        },
        isSplatActive: (splat: Splat) => !!context.getEntry(splat),
        scheduleRebuildForVisibility: (immediate = false) => {
            const allVisible = sources.every(splat => splat.visible);
            const allActive = sources.every(splat => !!context.getEntry(splat));
            if (allVisible && allActive && !immediate) {
                visibilityRebuildPending = false;
                visibilityRebuildImmediate = false;
                clearVisibilityRebuildTimer();
                return;
            }

            visibilityRebuildPending = true;
            if (immediate) {
                visibilityRebuildImmediate = true;
            }
            if (context.isFrozen()) {
                context.markDirty();
                visibilityRebuildPending = false;
                visibilityRebuildImmediate = false;
                return;
            }
            if (pivotActive) {
                return;
            }
            if (visibilityRebuildImmediate) {
                runVisibilityRebuild();
                return;
            }
            startVisibilityRebuildTimer();
        },
        hasRenderableData: (splat: Splat) => !!context.getEntry(splat),
        updateState: (splat: Splat) => {
            const state = splat.splatData.getProp('state') as Uint8Array;
            const entry = context.getEntry(splat);
            const stateTexture = context.getStateTexture();
            const globalState = context.getGlobalState();
            if (stateTexture && globalState && entry) {
                globalState.set(state, entry.offset);

                const data = stateTexture.lock() as Uint8Array;
                data.set(state, entry.offset);
                stateTexture.unlock();
            }

            let numSelected = 0;
            let numLocked = 0;
            let numDeleted = 0;
            let numHidden = 0;
            for (let i = 0; i < state.length; ++i) {
                const splatState = state[i];
                const isDeleted = (splatState & State.deleted) !== 0;
                if (isDeleted) {
                    numDeleted++;
                    continue;
                }
                if (splatState & State.hidden) {
                    numHidden++;
                }
                if (splatState & State.locked) {
                    numLocked++;
                }
                if ((splatState & State.selected) !== 0 && (splatState & (State.locked | State.hidden)) === 0) {
                    numSelected++;
                }
            }

            const numSplats = state.length - numDeleted;
            const numVisible = numSplats - numHidden;

            context.rebuildSorterMapping();
            context.scene.boundDirty = true;
            context.scene.forceRender = true;

            return {
                numSelected,
                numLocked,
                numDeleted,
                numHidden,
                numVisible,
                numSplats
            };
        },
        updateSplatParams: (splat: Splat) => {
            const paramsTextures = context.getParamsTextures();
            const paramsStorage = context.getParamsStorage();
            if (!paramsTextures || !paramsStorage) {
                return;
            }

            const entry = context.getEntry(splat);
            if (!entry?.count) {
                return;
            }

            const { offset, count } = entry;
            const { arr0, arr1, arr2 } = paramsStorage;
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

            const upload = (texture: Texture, data: Float32Array) => {
                const buffer = texture.lock() as Float32Array;
                buffer.set(data);
                texture.unlock();
            };

            upload(paramsTextures.tex0, arr0);
            upload(paramsTextures.tex1, arr1);
            upload(paramsTextures.tex2, arr2);
        },
        updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => {
            const entry = context.getEntry(splat);
            const block = entry?.transformBlock;
            if (!entry || !block) {
                return;
            }

            const worldTransform = splat.entity.getWorldTransform();
            const localPalette = splat.transformPalette;
            const transformPalette = context.getTransformPalette();
            const mat = new Mat4();
            transformPalette.beginUpdate();
            for (let i = 0; i < block.size; i++) {
                localPalette.getTransform(i, mat);
                mat.mul2(worldTransform, mat);
                transformPalette.setTransform(block.base + i, mat);
            }
            transformPalette.endUpdate();

            context.scene.boundDirty = true;
            const cache = context.getBoundCache(splat);
            if (cache) {
                cache.selectionDirty = true;
                cache.visibleDirty = true;
            }

            const instance = context.getMergedInstance();
            if (instance && !skipCenterUpdate) {
                const { offset, count } = entry;
                const localCenters = splat.localCenters;
                const world = worldTransform.data;
                const m0 = world[0], m1 = world[1], m2 = world[2];
                const m4 = world[4], m5 = world[5], m6 = world[6];
                const m8 = world[8], m9 = world[9], m10 = world[10];
                const m12 = world[12], m13 = world[13], m14 = world[14];

                const centers = instance.centers as Float32Array;
                if (centers && localCenters) {
                    for (let i = 0; i < count; i++) {
                        const x = localCenters[i * 3 + 0];
                        const y = localCenters[i * 3 + 1];
                        const z = localCenters[i * 3 + 2];

                        centers[(offset + i) * 3 + 0] = x * m0 + y * m4 + z * m8 + m12;
                        centers[(offset + i) * 3 + 1] = x * m1 + y * m5 + z * m9 + m13;
                        centers[(offset + i) * 3 + 2] = x * m2 + y * m6 + z * m10 + m14;
                    }
                    if (instance.sorter) {
                        instance.sorter.centers = centers;
                    }
                    context.markSorterCentersDirty();
                }
            }
        },
        updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => {
            const transformTexture = context.getTransformTexture();
            const globalTransformIndices = context.getGlobalTransformIndices();
            if (!transformTexture || !globalTransformIndices) {
                return;
            }

            const indices = updatedIndices ?? (splat.splatData.getProp('transform') as Uint16Array);
            const entry = context.getEntry(splat);
            const block = entry?.transformBlock;
            if (!entry || !block) {
                return;
            }

            let maxLocal = 0;
            for (let i = 0; i < indices.length; i++) {
                maxLocal = Math.max(maxLocal, indices[i]);
            }
            if (maxLocal >= block.size) {
                context.rebuild();
                return;
            }

            for (let i = 0; i < indices.length; i++) {
                globalTransformIndices[entry.offset + i] = block.base + indices[i];
            }

            const data = transformTexture.lock() as Uint16Array;
            data.set(globalTransformIndices);
            transformTexture.unlock();

            context.scene.boundDirty = true;
            const cache = context.getBoundCache(splat);
            if (cache) {
                cache.selectionDirty = true;
                cache.visibleDirty = true;
            }
        }
    };
}

class SplatRenderSystemDataBackend implements SplatRenderDataBackend {
    constructor(private readonly context: SplatRenderSystemDataContext) {}

    private createProcessorContext(splat: Splat) {
        return createSplatRenderProcessorContext(this.context, splat);
    }

    readWorldCenter(splat: Splat, localIndex: number, out: { set: (x: number, y: number, z: number) => void }) {
        const centers = this.context.getCenters();
        const entry = this.context.getEntry(splat);
        if (!centers || !entry || localIndex < 0 || localIndex >= entry.count) {
            return false;
        }
        const base = (entry.offset + localIndex) * 3;
        out.set(
            centers[base + 0],
            centers[base + 1],
            centers[base + 2]
        );
        return true;
    }

    writeWorldCenter(splat: Splat, localIndex: number, x: number, y: number, z: number) {
        const centers = this.context.getCenters();
        const entry = this.context.getEntry(splat);
        if (!centers || !entry || localIndex < 0 || localIndex >= entry.count) {
            return false;
        }
        const base = (entry.offset + localIndex) * 3;
        centers[base + 0] = x;
        centers[base + 1] = y;
        centers[base + 2] = z;
        return true;
    }

    calcBound(splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox) {
        return this.context.scene.dataProcessor.calcBound(this.createProcessorContext(splat), selectionBound, localBound);
    }

    getBound(splat: Splat, mode: 'selected' | 'visible') {
        const entry = this.context.getEntry(splat);
        if (!this.context.hasMergedResource() || !entry || entry.count === 0) {
            return null;
        }

        const cache = this.context.getBoundCache(splat);
        if (!cache) {
            return null;
        }

        const boundingBox = mode === 'selected' ? cache.selection : cache.visible;
        const dirty = mode === 'selected' ? cache.selectionDirty : cache.visibleDirty;

        if (dirty) {
            const onlySelected = mode === 'selected';
            this.context.scene.dataProcessor.calcBound(this.createProcessorContext(splat), boundingBox, onlySelected).catch(() => {});
            if (mode === 'selected') {
                cache.selectionDirty = false;
            } else {
                cache.visibleDirty = false;
            }
        }

        return boundingBox;
    }

    calcPositions(splat: Splat) {
        const count = this.context.getEntry(splat)?.count ?? 0;
        if (count === 0) {
            return Promise.resolve(new Float32Array(0));
        }
        return this.context.scene.dataProcessor.calcPositions(this.createProcessorContext(splat));
    }

    intersect(splat: Splat, options: import('./data-processor').IntersectOptions) {
        return this.context.scene.dataProcessor.intersect(options, this.createProcessorContext(splat));
    }
}

class SplatRenderSystemPickingBackend implements SplatRenderPickingBackend {
    constructor(private readonly context: SplatRenderSystemPickingContext) {}

    mapPickId(id: number) {
        return this.context.getPickMapping(id);
    }

    withPickingBlendDisabled(fn: () => void) {
        const material = this.context.getMaterial();
        if (material) {
            const oldBlend = material.blendType;
            material.blendType = BLEND_NONE;
            material.update();
            try {
                fn();
            } finally {
                material.blendType = oldBlend;
                material.update();
            }
            return;
        }

        fn();
    }
}

class SplatRenderSystemOverlayBackend implements SplatRenderOverlayBackend {
    constructor(private readonly context: SplatRenderSystemOverlayContext) {}

    getOverlayBinding(splat: Splat) {
        const resourceInfo = this.context.getMergedResourceInfo();
        const positionTexture = resourceInfo?.positionTexture ?? null;
        const entry = this.context.getEntry(splat);
        const offset = entry?.offset ?? 0;
        const count = entry?.count ?? splat.splatData.numSplats;

        if (!positionTexture || count === 0) {
            return null;
        }

        return {
            node: this.context.getNode(),
            positionTexture,
            stateTexture: this.context.getStateTexture(),
            transformTexture: this.context.getTransformTexture(),
            transformPaletteTexture: this.context.getTransformPaletteTexture(),
            offset,
            count,
            globalParams: resourceInfo?.globalParams ?? [0, 0]
        } satisfies SplatRenderOverlayBinding;
    }
}

const createSupersplatSplatRenderSystemBackends = (scene: Scene): SplatRenderRoleBackends & {
    setMergedDisplayVisible: (visible: boolean) => void;
} => {
    const core = new SplatRenderSystem(scene);

    return {
        lifecycle: core.getLifecycleBackend(),
        display: core.getDisplayBackend(),
        data: new SplatRenderSystemDataBackend(core.createDataContext()),
        picking: new SplatRenderSystemPickingBackend(core.createPickingContext()),
        overlay: new SplatRenderSystemOverlayBackend(core.createOverlayContext()),
        setMergedDisplayVisible: (visible: boolean) => core.setMergedDisplayVisible(visible)
    };
};

export { createSupersplatSplatRenderSystemBackends };
