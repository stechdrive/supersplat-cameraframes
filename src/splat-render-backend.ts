import type { BoundingBox, Entity, Texture } from 'playcanvas';

import type { IntersectOptions } from './data-processor';
import type { Scene } from './scene';
import type { SplatRenderBackendMode } from './scene-config';
import type { Splat } from './splat';
import { createSupersplatSplatRenderSystemBackends } from './splat-render-system';

type SplatRenderPickMapping = { splat: Splat; local: number };

type SplatRenderStateSummary = {
    numSelected: number;
    numLocked: number;
    numDeleted: number;
    numHidden: number;
    numVisible: number;
    numSplats: number;
};

type SplatRenderOverlayBinding = {
    node: Entity;
    positionTexture: Texture;
    stateTexture: Texture | null;
    transformTexture: Texture | null;
    transformPaletteTexture: Texture | null;
    offset: number;
    count: number;
    globalParams: [number, number];
};

type SplatRenderLifecycleBackend = {
    freeze: () => void;
    unfreeze: () => void;
    waitForSorter: () => Promise<void>;
    onPreRender: () => void;
    rebuild: () => void;
};

type SplatRenderDisplayBackend = {
    add: (splat: Splat) => void;
    remove: (splat: Splat) => void;
    isSplatActive: (splat: Splat) => boolean;
    scheduleRebuildForVisibility: (immediate?: boolean) => void;
    hasRenderableData: (splat: Splat) => boolean;
    updateState: (splat: Splat) => SplatRenderStateSummary | undefined;
    updateSplatParams: (splat: Splat) => void;
    updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => void;
    updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => void;
};

type SplatRenderDataBackend = {
    readWorldCenter: (splat: Splat, localIndex: number, out: { set: (x: number, y: number, z: number) => void }) => boolean;
    writeWorldCenter: (splat: Splat, localIndex: number, x: number, y: number, z: number) => boolean;
    calcBound: (splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox) => Promise<void>;
    getBound: (splat: Splat, mode: 'selected' | 'visible') => BoundingBox | null;
    calcPositions: (splat: Splat) => Promise<Float32Array>;
    intersect: (splat: Splat, options: IntersectOptions) => Promise<Uint8Array>;
};

type SplatRenderPickingBackend = {
    mapPickId: (id: number) => SplatRenderPickMapping | null;
    withPickingBlendDisabled: (fn: () => void) => void;
};

type SplatRenderOverlayBackend = {
    getOverlayBinding: (splat: Splat) => SplatRenderOverlayBinding | null;
};

type SplatRenderBackend =
    SplatRenderLifecycleBackend &
    SplatRenderDisplayBackend &
    SplatRenderDataBackend &
    SplatRenderPickingBackend &
    SplatRenderOverlayBackend;

type SplatRenderBackendResolvedMode = Exclude<SplatRenderBackendMode, 'auto'>;

type SplatRenderBackendCapabilities = {
    mode: SplatRenderBackendMode;
    resolvedMode: SplatRenderBackendResolvedMode;
    supportsUnifiedDisplay: boolean;
    supportsEditorData: boolean;
    supportsPicking: boolean;
    supportsOverlay: boolean;
    supportsStreamLod: boolean;
    supportsPerSplatVisualState: boolean;
};

type SplatRenderRoleBackends = {
    lifecycle: SplatRenderLifecycleBackend;
    display: SplatRenderDisplayBackend;
    data: SplatRenderDataBackend;
    picking: SplatRenderPickingBackend;
    overlay: SplatRenderOverlayBackend;
};

type SplatRenderBackends = SplatRenderRoleBackends & {
    combined: SplatRenderBackend;
    capabilities: SplatRenderBackendCapabilities;
};

const wrapSplatRenderLifecycleBackend = (backend: SplatRenderLifecycleBackend): SplatRenderLifecycleBackend => {
    return {
        freeze: () => backend.freeze(),
        unfreeze: () => backend.unfreeze(),
        waitForSorter: () => backend.waitForSorter(),
        onPreRender: () => backend.onPreRender(),
        rebuild: () => backend.rebuild()
    };
};

const wrapSplatRenderDisplayBackend = (backend: SplatRenderDisplayBackend): SplatRenderDisplayBackend => {
    return {
        add: (splat: Splat) => backend.add(splat),
        remove: (splat: Splat) => backend.remove(splat),
        isSplatActive: (splat: Splat) => backend.isSplatActive(splat),
        scheduleRebuildForVisibility: (immediate?: boolean) => backend.scheduleRebuildForVisibility(immediate),
        hasRenderableData: (splat: Splat) => backend.hasRenderableData(splat),
        updateState: (splat: Splat) => backend.updateState(splat),
        updateSplatParams: (splat: Splat) => backend.updateSplatParams(splat),
        updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => backend.updateTransform(splat, skipCenterUpdate),
        updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => backend.updateTransformIndices(splat, updatedIndices)
    };
};

const wrapSplatRenderDataBackend = (backend: SplatRenderDataBackend): SplatRenderDataBackend => {
    return {
        readWorldCenter: (splat: Splat, localIndex: number, out: { set: (x: number, y: number, z: number) => void }) => backend.readWorldCenter(splat, localIndex, out),
        writeWorldCenter: (splat: Splat, localIndex: number, x: number, y: number, z: number) => backend.writeWorldCenter(splat, localIndex, x, y, z),
        calcBound: (splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox) => backend.calcBound(splat, selectionBound, localBound),
        getBound: (splat: Splat, mode: 'selected' | 'visible') => backend.getBound(splat, mode),
        calcPositions: (splat: Splat) => backend.calcPositions(splat),
        intersect: (splat: Splat, options: IntersectOptions) => backend.intersect(splat, options)
    };
};

const wrapSplatRenderPickingBackend = (backend: SplatRenderPickingBackend): SplatRenderPickingBackend => {
    return {
        mapPickId: (id: number) => backend.mapPickId(id),
        withPickingBlendDisabled: (fn: () => void) => backend.withPickingBlendDisabled(fn)
    };
};

const wrapSplatRenderOverlayBackend = (backend: SplatRenderOverlayBackend): SplatRenderOverlayBackend => {
    return {
        getOverlayBinding: (splat: Splat) => backend.getOverlayBinding(splat)
    };
};

const combineSplatRenderBackends = (
    lifecycle: SplatRenderLifecycleBackend,
    display: SplatRenderDisplayBackend,
    data: SplatRenderDataBackend,
    picking: SplatRenderPickingBackend,
    overlay: SplatRenderOverlayBackend
): SplatRenderBackend => {
    return {
        freeze: () => lifecycle.freeze(),
        unfreeze: () => lifecycle.unfreeze(),
        waitForSorter: () => lifecycle.waitForSorter(),
        onPreRender: () => lifecycle.onPreRender(),
        rebuild: () => lifecycle.rebuild(),
        add: (splat: Splat) => display.add(splat),
        remove: (splat: Splat) => display.remove(splat),
        isSplatActive: (splat: Splat) => display.isSplatActive(splat),
        scheduleRebuildForVisibility: (immediate?: boolean) => display.scheduleRebuildForVisibility(immediate),
        hasRenderableData: (splat: Splat) => display.hasRenderableData(splat),
        updateState: (splat: Splat) => display.updateState(splat),
        updateSplatParams: (splat: Splat) => display.updateSplatParams(splat),
        updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => display.updateTransform(splat, skipCenterUpdate),
        updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => display.updateTransformIndices(splat, updatedIndices),
        readWorldCenter: (splat: Splat, localIndex: number, out: { set: (x: number, y: number, z: number) => void }) => data.readWorldCenter(splat, localIndex, out),
        writeWorldCenter: (splat: Splat, localIndex: number, x: number, y: number, z: number) => data.writeWorldCenter(splat, localIndex, x, y, z),
        calcBound: (splat: Splat, selectionBound: BoundingBox, localBound: BoundingBox) => data.calcBound(splat, selectionBound, localBound),
        getBound: (splat: Splat, mode: 'selected' | 'visible') => data.getBound(splat, mode),
        calcPositions: (splat: Splat) => data.calcPositions(splat),
        intersect: (splat: Splat, options: IntersectOptions) => data.intersect(splat, options),
        mapPickId: (id: number) => picking.mapPickId(id),
        withPickingBlendDisabled: (fn: () => void) => picking.withPickingBlendDisabled(fn),
        getOverlayBinding: (splat: Splat) => overlay.getOverlayBinding(splat)
    };
};

const createSplatRenderBackends = (
    roleBackends: SplatRenderRoleBackends,
    capabilities: SplatRenderBackendCapabilities
): SplatRenderBackends => {
    const lifecycle = wrapSplatRenderLifecycleBackend(roleBackends.lifecycle);
    const display = wrapSplatRenderDisplayBackend(roleBackends.display);
    const data = wrapSplatRenderDataBackend(roleBackends.data);
    const picking = wrapSplatRenderPickingBackend(roleBackends.picking);
    const overlay = wrapSplatRenderOverlayBackend(roleBackends.overlay);

    return {
        combined: combineSplatRenderBackends(lifecycle, display, data, picking, overlay),
        capabilities,
        lifecycle,
        display,
        data,
        picking,
        overlay
    };
};

const createMergedRenderBackendCapabilities = (mode: SplatRenderBackendMode): SplatRenderBackendCapabilities => {
    return {
        mode,
        resolvedMode: 'merged',
        supportsUnifiedDisplay: false,
        supportsEditorData: true,
        supportsPicking: true,
        supportsOverlay: true,
        supportsStreamLod: false,
        supportsPerSplatVisualState: true
    };
};

const createUnifiedDisplayRenderBackendCapabilities = (): SplatRenderBackendCapabilities => {
    return {
        mode: 'unified-display',
        resolvedMode: 'unified-display',
        supportsUnifiedDisplay: true,
        supportsEditorData: true,
        supportsPicking: true,
        supportsOverlay: true,
        supportsStreamLod: false,
        supportsPerSplatVisualState: false
    };
};

const createUnifiedDisplayBackends = (scene: Scene): SplatRenderRoleBackends => {
    const mergedRenderer = createSupersplatSplatRenderSystemBackends(scene);
    const sources: Splat[] = [];
    let engineDirectActive = false;
    let lastFallbackReason: string | null = null;

    const findFallbackReason = () => {
        for (const splat of sources) {
            const issue = splat.getDirectEngineCompatibilityIssue();
            if (issue) {
                return `${splat.name || splat.filename}: ${issue}`;
            }
        }
        return null;
    };

    const syncEngineComponents = () => {
        const fallbackReason = findFallbackReason();
        const shouldUseEngineDirect = fallbackReason === null;
        if (fallbackReason !== lastFallbackReason) {
            if (fallbackReason) {
                console.warn(`[SplatRender] unified-display fallback to merged: ${fallbackReason}`);
            } else if (lastFallbackReason) {
                console.info('[SplatRender] unified-display direct mode restored.');
            }
            lastFallbackReason = fallbackReason;
        }

        engineDirectActive = shouldUseEngineDirect;
        mergedRenderer.setMergedDisplayVisible(!shouldUseEngineDirect);

        sources.forEach((splat) => {
            if (shouldUseEngineDirect) {
                splat.ensureEngineGsplatComponent({
                    unified: true,
                    enabled: splat.visible
                });
            } else {
                splat.disableEngineGsplatComponent();
            }
        });
    };

    const display: SplatRenderDisplayBackend = {
        add: (splat: Splat) => {
            if (!sources.includes(splat)) {
                sources.push(splat);
            }
            mergedRenderer.display.add(splat);
            splat.ensureEngineGsplatComponent({ unified: true, enabled: false });
            syncEngineComponents();
        },
        remove: (splat: Splat) => {
            const idx = sources.indexOf(splat);
            if (idx !== -1) {
                sources.splice(idx, 1);
            }
            mergedRenderer.display.remove(splat);
            splat.disableEngineGsplatComponent();
            syncEngineComponents();
        },
        isSplatActive: (splat: Splat) => mergedRenderer.display.isSplatActive(splat),
        scheduleRebuildForVisibility: (immediate?: boolean) => {
            mergedRenderer.display.scheduleRebuildForVisibility(immediate);
            syncEngineComponents();
        },
        hasRenderableData: (splat: Splat) => mergedRenderer.display.hasRenderableData(splat),
        updateState: (splat: Splat) => {
            const result = mergedRenderer.display.updateState(splat);
            if (result) {
                splat.numSplats = result.numSplats;
                splat.numLocked = result.numLocked;
                splat.numSelected = result.numSelected;
                splat.numDeleted = result.numDeleted;
                splat.numHidden = result.numHidden;
                splat.numVisible = result.numVisible;
            }
            syncEngineComponents();
            return result;
        },
        updateSplatParams: (splat: Splat) => {
            mergedRenderer.display.updateSplatParams(splat);
            syncEngineComponents();
        },
        updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => {
            mergedRenderer.display.updateTransform(splat, skipCenterUpdate);
            splat.syncEngineGsplatComponent({
                unified: true,
                enabled: engineDirectActive && splat.visible
            });
            syncEngineComponents();
        },
        updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => {
            mergedRenderer.display.updateTransformIndices(splat, updatedIndices);
            syncEngineComponents();
        }
    };

    syncEngineComponents();

    return {
        lifecycle: mergedRenderer.lifecycle,
        display,
        data: mergedRenderer.data,
        picking: mergedRenderer.picking,
        overlay: mergedRenderer.overlay
    };
};

const createSupersplatSplatRenderBackends = (scene: Scene): SplatRenderBackends => {
    const requestedMode = scene.config.renderBackend?.mode ?? 'merged';
    let roleBackends: SplatRenderRoleBackends;
    let capabilities: SplatRenderBackendCapabilities;

    switch (requestedMode) {
        case 'auto':
            roleBackends = createSupersplatSplatRenderSystemBackends(scene);
            capabilities = createMergedRenderBackendCapabilities(requestedMode);
            break;
        case 'unified-display':
            roleBackends = createUnifiedDisplayBackends(scene);
            capabilities = createUnifiedDisplayRenderBackendCapabilities();
            break;
        case 'merged':
        default:
            roleBackends = createSupersplatSplatRenderSystemBackends(scene);
            capabilities = createMergedRenderBackendCapabilities('merged');
            break;
    }

    return createSplatRenderBackends(roleBackends, capabilities);
};

export { createSupersplatSplatRenderBackends };
export type {
    SplatRenderBackendCapabilities,
    SplatRenderBackendResolvedMode,
    SplatRenderBackends,
    SplatRenderDataBackend,
    SplatRenderDisplayBackend,
    SplatRenderBackend,
    SplatRenderLifecycleBackend,
    SplatRenderOverlayBinding,
    SplatRenderOverlayBackend,
    SplatRenderPickMapping,
    SplatRenderPickingBackend,
    SplatRenderRoleBackends,
    SplatRenderStateSummary
};
