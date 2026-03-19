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

const resolveUnifiedDisplayRadialSorting = (scene: Scene) => {
    return scene.camera?.ortho !== true;
};

const isUnifiedDisplayWindowActive = () => {
    if (typeof document === 'undefined') {
        return true;
    }

    if (document.visibilityState && document.visibilityState !== 'visible') {
        return false;
    }

    if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
        return false;
    }

    return true;
};

const configureUnifiedDisplaySceneGsplat = (scene: Scene) => {
    const gsplat = scene.app.scene.gsplat;
    const useUnifiedCulling = scene.config.renderBackend?.unifiedCulling === true;
    const useRadialSorting = resolveUnifiedDisplayRadialSorting(scene);
    const needsUpdate =
        gsplat.culling !== useUnifiedCulling ||
        gsplat.radialSorting !== useRadialSorting ||
        gsplat.colorUpdateAngle !== 0 ||
        gsplat.colorUpdateDistance !== 0;

    gsplat.culling = useUnifiedCulling;
    gsplat.radialSorting = useRadialSorting;
    gsplat.colorUpdateAngle = 0;
    gsplat.colorUpdateDistance = 0;

    if (needsUpdate) {
        gsplat.dirty = true;
        console.info(`[SplatRender] unified-display scene.gsplat configured: culling=${useUnifiedCulling}, radialSorting=${useRadialSorting}, colorUpdateAngle=0, colorUpdateDistance=0`);
    }
};

const roundProjectionSignatureValue = (value: number | null | undefined) => {
    if (!(typeof value === 'number' && isFinite(value))) {
        return 'null';
    }
    return `${Math.round(value * 1e6) / 1e6}`;
};

const getUnifiedDisplayProjectionSignature = (scene: Scene) => {
    const cameraElement = scene.camera;
    if (!cameraElement?.camera) {
        return 'camera-unavailable';
    }
    const camera = cameraElement.camera;
    const targetSize = cameraElement.targetSize;
    const customFrustum = cameraElement.getCustomFrustum();

    return [
        `proj=${camera.projection}`,
        `fov=${roundProjectionSignatureValue(camera.fov)}`,
        `hFov=${camera.horizontalFov ? 1 : 0}`,
        `aspect=${roundProjectionSignatureValue(camera.aspectRatio)}`,
        `near=${roundProjectionSignatureValue(camera.nearClip)}`,
        `far=${roundProjectionSignatureValue(camera.farClip)}`,
        `ortho=${cameraElement.ortho ? 1 : 0}`,
        `nearOverride=${roundProjectionSignatureValue(cameraElement.getNearOverride())}`,
        `target=${targetSize ? `${roundProjectionSignatureValue(targetSize.width)}x${roundProjectionSignatureValue(targetSize.height)}` : 'null'}`,
        `frustum=${customFrustum ? [
            roundProjectionSignatureValue(customFrustum.left),
            roundProjectionSignatureValue(customFrustum.right),
            roundProjectionSignatureValue(customFrustum.bottom),
            roundProjectionSignatureValue(customFrustum.top),
            roundProjectionSignatureValue(customFrustum.near),
            roundProjectionSignatureValue(customFrustum.far)
        ].join(',') : 'null'}`
    ].join('|');
};

const createUnifiedDisplayBackends = (scene: Scene): SplatRenderRoleBackends => {
    configureUnifiedDisplaySceneGsplat(scene);

    const mergedRenderer = createSupersplatSplatRenderSystemBackends(scene);
    const sources: Splat[] = [];
    const debugUnifiedState = scene.config.renderBackend?.debugState === true;
    let engineDirectActive = false;
    let lastFallbackReason: string | null = null;
    let pendingDirectForceRenderFrames = 0;
    let lastUnifiedStateLog = '';
    let lastProjectionRefreshSignature = '';
    let pendingDirectRestoreFrames = 0;

    const markUnifiedDisplayDirty = () => {
        scene.app.scene.gsplat.dirty = true;
        scene.forceRender = true;
    };

    const kickEngineDirectPlacements = () => {
        if (!engineDirectActive) {
            return;
        }

        sources.forEach((splat) => {
            const component = splat.entity.gsplat;
            if (component?.enabled) {
                component.workBufferUpdate = 1;
            }
        });

        markUnifiedDisplayDirty();
    };

    const getUnifiedDisplayManagers = () => {
        const director = (scene.app.renderer as any).gsplatDirector;
        if (!director?.camerasMap) {
            return [] as any[];
        }

        const managers: any[] = [];
        director.camerasMap.forEach((cameraData: any) => {
            cameraData.layersMap?.forEach((layerData: any) => {
                if (layerData.gsplatManager) {
                    managers.push(layerData.gsplatManager);
                }
            });
        });
        return managers;
    };

    const isUnifiedDisplaySettled = () => {
        const managers = getUnifiedDisplayManagers();
        if (managers.length === 0) {
            return false;
        }

        return managers.every((manager) => {
            const jobsInFlight = manager.cpuSorter?.jobsInFlight ?? 0;
            const latestState = manager.worldStates?.get?.(manager.lastWorldStateVersion);
            const sortedBefore = latestState ? latestState.sortedBefore !== false : false;

            return manager.sortedVersion === manager.lastWorldStateVersion &&
                jobsInFlight === 0 &&
                !manager.sortNeeded &&
                !manager.layerPlacementsDirty &&
                !manager._workBufferRebuildRequired &&
                !manager.scene.gsplat.dirty &&
                sortedBefore;
        });
    };

    const logUnifiedDisplayState = () => {
        if (!debugUnifiedState) {
            return;
        }

        const managers = getUnifiedDisplayManagers();
        const summary = managers.map((manager, index) => {
            const jobsInFlight = manager.cpuSorter?.jobsInFlight ?? 0;
            const latestState = manager.worldStates?.get?.(manager.lastWorldStateVersion);
            const sortedBefore = latestState ? latestState.sortedBefore !== false : false;
            const activeSplats = latestState?.totalActiveSplats ?? -1;
            const uploadCount = latestState?.needsUpload?.length ?? 0;
            const fullRebuild = latestState?.fullRebuild ? 1 : 0;
            const placements = manager.layerPlacements?.length ?? 0;
            const copyUploaded = manager.bufferCopyUploaded ?? 0;
            const copyTotal = manager.bufferCopyTotal ?? 0;
            return `m${index}:sv=${manager.sortedVersion} lv=${manager.lastWorldStateVersion} jobs=${jobsInFlight} sort=${manager.sortNeeded ? 1 : 0} layer=${manager.layerPlacementsDirty ? 1 : 0} wb=${manager._workBufferRebuildRequired ? 1 : 0} dirty=${manager.scene.gsplat.dirty ? 1 : 0} sorted=${sortedBefore ? 1 : 0} placements=${placements} active=${activeSplats} upload=${uploadCount} full=${fullRebuild} copy=${copyUploaded}/${copyTotal}`;
        }).join(' | ');

        if (summary !== lastUnifiedStateLog) {
            lastUnifiedStateLog = summary;
            console.info(`[SplatRender] unified-display state ${summary || 'no-managers'}`);
        }
    };

    const scheduleDirectRefresh = (frames = 24) => {
        if (!engineDirectActive) {
            return;
        }

        pendingDirectForceRenderFrames = Math.max(pendingDirectForceRenderFrames, frames);
        kickEngineDirectPlacements();
    };

    const refreshForProjectionChange = () => {
        const projectionSignature = getUnifiedDisplayProjectionSignature(scene);
        if (projectionSignature === lastProjectionRefreshSignature) {
            return;
        }

        const hadPreviousSignature = lastProjectionRefreshSignature.length > 0;
        lastProjectionRefreshSignature = projectionSignature;

        if (hadPreviousSignature) {
            if (debugUnifiedState) {
                console.info(`[SplatRender] unified-display projection changed ${projectionSignature}`);
            }
            scheduleDirectRefresh(36);
        }
    };

    const findFallbackReason = () => {
        if (!isUnifiedDisplayWindowActive()) {
            return 'window unfocused';
        }

        if (scene.camera?.ortho === true) {
            return 'orthographic camera';
        }

        for (const splat of sources) {
            const issue = splat.getDirectEngineCompatibilityIssue();
            if (issue) {
                return `${splat.name || splat.filename}: ${issue}`;
            }
        }
        return null;
    };

    const syncEngineComponents = (options?: { refreshDirect?: boolean }) => {
        const fallbackReason = findFallbackReason();
        const shouldUseEngineDirect = fallbackReason === null;
        const directModeChanged = engineDirectActive !== shouldUseEngineDirect;
        if (fallbackReason !== lastFallbackReason) {
            if (fallbackReason) {
                console.warn(`[SplatRender] unified-display fallback to merged: ${fallbackReason}`);
                pendingDirectRestoreFrames = 6;
            } else if (lastFallbackReason) {
                if (debugUnifiedState) {
                    console.info(`[SplatRender] unified-display restore armed in ${pendingDirectRestoreFrames} frames.`);
                }
            }
            lastFallbackReason = fallbackReason;
        }

        if (shouldUseEngineDirect && !engineDirectActive && pendingDirectRestoreFrames > 0) {
            pendingDirectRestoreFrames--;
            scene.forceRender = true;
            return;
        }

        engineDirectActive = shouldUseEngineDirect;
        mergedRenderer.setMergedDisplayVisible(!shouldUseEngineDirect);
        if (!shouldUseEngineDirect) {
            pendingDirectForceRenderFrames = 0;
            lastProjectionRefreshSignature = '';
        }

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

        if (shouldUseEngineDirect) {
            pendingDirectRestoreFrames = 0;
            if (directModeChanged) {
                console.info('[SplatRender] unified-display direct mode restored.');
            }
            lastProjectionRefreshSignature = getUnifiedDisplayProjectionSignature(scene);
            if (directModeChanged || options?.refreshDirect) {
                scheduleDirectRefresh(directModeChanged ? 36 : 24);
            }
        }
    };

    const display: SplatRenderDisplayBackend = {
        add: (splat: Splat) => {
            if (!sources.includes(splat)) {
                sources.push(splat);
            }
            mergedRenderer.display.add(splat);
            splat.ensureEngineGsplatComponent({ unified: true, enabled: false });
            syncEngineComponents({ refreshDirect: true });
        },
        remove: (splat: Splat) => {
            const idx = sources.indexOf(splat);
            if (idx !== -1) {
                sources.splice(idx, 1);
            }
            mergedRenderer.display.remove(splat);
            splat.disableEngineGsplatComponent();
            syncEngineComponents({ refreshDirect: true });
        },
        isSplatActive: (splat: Splat) => mergedRenderer.display.isSplatActive(splat),
        scheduleRebuildForVisibility: (immediate?: boolean) => {
            mergedRenderer.display.scheduleRebuildForVisibility(immediate);
            syncEngineComponents({ refreshDirect: true });
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
            syncEngineComponents({ refreshDirect: true });
            return result;
        },
        updateSplatParams: (splat: Splat) => {
            mergedRenderer.display.updateSplatParams(splat);
            syncEngineComponents({ refreshDirect: true });
        },
        updateTransform: (splat: Splat, skipCenterUpdate?: boolean) => {
            mergedRenderer.display.updateTransform(splat, skipCenterUpdate);
            splat.syncEngineGsplatComponent({
                unified: true,
                enabled: engineDirectActive && splat.visible
            });
            syncEngineComponents({ refreshDirect: true });
        },
        updateTransformIndices: (splat: Splat, updatedIndices?: Uint16Array) => {
            mergedRenderer.display.updateTransformIndices(splat, updatedIndices);
            syncEngineComponents({ refreshDirect: true });
        }
    };

    syncEngineComponents();

    return {
        lifecycle: {
            freeze: () => mergedRenderer.lifecycle.freeze(),
            unfreeze: () => mergedRenderer.lifecycle.unfreeze(),
            waitForSorter: () => mergedRenderer.lifecycle.waitForSorter(),
            onPreRender: () => {
                syncEngineComponents();
                if (engineDirectActive) {
                    configureUnifiedDisplaySceneGsplat(scene);
                    refreshForProjectionChange();
                    logUnifiedDisplayState();
                    if (pendingDirectForceRenderFrames > 0) {
                        pendingDirectForceRenderFrames--;
                        scene.forceRender = true;
                    } else if (!isUnifiedDisplaySettled()) {
                        scene.forceRender = true;
                    }
                }
                mergedRenderer.lifecycle.onPreRender();
            },
            rebuild: () => mergedRenderer.lifecycle.rebuild()
        },
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
