import {
    ShaderChunks,
    SHADERLANGUAGE_GLSL,
    SHADERLANGUAGE_WGSL,
    type BoundingBox,
    type Entity,
    type Texture
} from 'playcanvas';

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

type UnifiedDisplaySceneGsplatPolicy = {
    culling: boolean;
    radialSorting: boolean;
    colorUpdateAngle: number;
    colorUpdateDistance: number;
};

type UnifiedDisplayProjectionSnapshotEntry = {
    key: string;
    value: string;
};

type UnifiedDisplayProjectionSnapshot = {
    entries: UnifiedDisplayProjectionSnapshotEntry[];
    signature: string;
};

type UnifiedDisplayRefreshController = {
    syncSceneGsplatPolicy: () => void;
    resetProjectionBaseline: () => void;
    captureProjectionBaseline: () => void;
    refreshForProjectionChange: () => void;
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

const unifiedDisplayGsplatCenterGLSL = /* glsl */`
uniform mat4 matrix_model;
uniform mat4 matrix_view;
#ifndef GSPLAT_CENTER_NOPROJ
    uniform vec4 camera_params;
    uniform mat4 matrix_projection;
#endif
bool initCenter(vec3 modelCenter, inout SplatCenter center) {
    mat4 modelView = matrix_view * matrix_model;
    vec4 centerView = modelView * vec4(modelCenter, 1.0);
    #ifndef GSPLAT_CENTER_NOPROJ
        if (camera_params.w != 1.0 && centerView.z > 0.0) {
            return false;
        }

        float dist = -centerView.z;
        if (dist < camera_params.z) {
            return false;
        }

        vec4 centerProj = matrix_projection * centerView;
        #if WEBGPU
            centerProj.z = clamp(centerProj.z, 0, abs(centerProj.w));
        #else
            centerProj.z = clamp(centerProj.z, -abs(centerProj.w), abs(centerProj.w));
        #endif
        center.proj = centerProj;
        center.projMat00 = matrix_projection[0][0];
    #endif
    center.view = centerView.xyz / centerView.w;
    center.modelView = modelView;
    return true;
}
`;

const unifiedDisplayGsplatCenterWGSL = /* wgsl */`
uniform matrix_model: mat4x4f;
uniform matrix_view: mat4x4f;
#ifndef GSPLAT_CENTER_NOPROJ
    uniform camera_params: vec4f;
    uniform matrix_projection: mat4x4f;
#endif
fn initCenter(modelCenter: vec3f, center: ptr<function, SplatCenter>) -> bool {
    let modelView: mat4x4f = uniform.matrix_view * uniform.matrix_model;
    let centerView: vec4f = modelView * vec4f(modelCenter, 1.0);
    #ifndef GSPLAT_CENTER_NOPROJ
        if (uniform.camera_params.w != 1.0 && centerView.z > 0.0) {
            return false;
        }

        let dist = -centerView.z;
        if (dist < uniform.camera_params.z) {
            return false;
        }

        var centerProj: vec4f = uniform.matrix_projection * centerView;
        centerProj.z = clamp(centerProj.z, 0.0, abs(centerProj.w));
        center.proj = centerProj;
        center.projMat00 = uniform.matrix_projection[0][0];
    #endif
    center.view = centerView.xyz / centerView.w;
    center.modelView = modelView;
    return true;
}
`;

const unifiedDisplayGsplatCenterOverrideInstalled = new WeakSet<object>();

const resolveUnifiedDisplayRadialSorting = (scene: Scene) => {
    // Perspective keeps radial sorting. Orthographic prefers linear sorting
    // for stable compositing with grids / GLB, while the unified shader chunk
    // override enforces near clipping so front/back slicing still works.
    return !scene.camera?.ortho;
};

const resolveUnifiedDisplaySceneGsplatPolicy = (scene: Scene): UnifiedDisplaySceneGsplatPolicy => {
    return {
        culling: scene.config.renderBackend?.unifiedCulling === true,
        radialSorting: resolveUnifiedDisplayRadialSorting(scene),
        colorUpdateAngle: 0,
        colorUpdateDistance: 0
    };
};

const readUnifiedDisplaySceneGsplatPolicy = (scene: Scene): UnifiedDisplaySceneGsplatPolicy => {
    const gsplat = scene.app.scene.gsplat;
    return {
        culling: gsplat.culling,
        radialSorting: gsplat.radialSorting,
        colorUpdateAngle: gsplat.colorUpdateAngle,
        colorUpdateDistance: gsplat.colorUpdateDistance
    };
};

const formatUnifiedDisplaySceneGsplatPolicy = (policy: UnifiedDisplaySceneGsplatPolicy) => {
    return `culling=${policy.culling}, radialSorting=${policy.radialSorting}, colorUpdateAngle=${policy.colorUpdateAngle}, colorUpdateDistance=${policy.colorUpdateDistance}`;
};

const installUnifiedDisplayGsplatCenterOverride = (scene: Scene) => {
    const device = scene.graphicsDevice;
    if (unifiedDisplayGsplatCenterOverrideInstalled.has(device)) {
        return;
    }

    ShaderChunks.get(device, SHADERLANGUAGE_GLSL).set('gsplatCenterVS', unifiedDisplayGsplatCenterGLSL);
    ShaderChunks.get(device, SHADERLANGUAGE_WGSL).set('gsplatCenterVS', unifiedDisplayGsplatCenterWGSL);
    unifiedDisplayGsplatCenterOverrideInstalled.add(device);
};

const applyUnifiedDisplaySceneGsplatPolicy = (scene: Scene) => {
    installUnifiedDisplayGsplatCenterOverride(scene);

    const gsplat = scene.app.scene.gsplat;
    const currentPolicy = readUnifiedDisplaySceneGsplatPolicy(scene);
    const nextPolicy = resolveUnifiedDisplaySceneGsplatPolicy(scene);
    const needsUpdate =
        currentPolicy.culling !== nextPolicy.culling ||
        currentPolicy.radialSorting !== nextPolicy.radialSorting ||
        currentPolicy.colorUpdateAngle !== nextPolicy.colorUpdateAngle ||
        currentPolicy.colorUpdateDistance !== nextPolicy.colorUpdateDistance;

    gsplat.culling = nextPolicy.culling;
    gsplat.radialSorting = nextPolicy.radialSorting;
    gsplat.colorUpdateAngle = nextPolicy.colorUpdateAngle;
    gsplat.colorUpdateDistance = nextPolicy.colorUpdateDistance;

    if (needsUpdate) {
        gsplat.dirty = true;
        console.info(`[SplatRender] unified-display scene.gsplat configured: ${formatUnifiedDisplaySceneGsplatPolicy(nextPolicy)}`);
    }
};

const roundProjectionSignatureValue = (value: number | null | undefined) => {
    if (!(typeof value === 'number' && isFinite(value))) {
        return 'null';
    }
    return `${Math.round(value * 1e6) / 1e6}`;
};

const createUnifiedDisplayProjectionSnapshot = (
    entries: UnifiedDisplayProjectionSnapshotEntry[]
): UnifiedDisplayProjectionSnapshot => {
    return {
        entries,
        signature: entries.map(({ key, value }) => `${key}=${value}`).join('|')
    };
};

const getUnifiedDisplayProjectionSnapshot = (scene: Scene): UnifiedDisplayProjectionSnapshot => {
    const cameraElement = scene.camera;
    if (!cameraElement?.camera) {
        return createUnifiedDisplayProjectionSnapshot([
            { key: 'status', value: 'camera-unavailable' }
        ]);
    }

    const camera = cameraElement.camera;
    const targetSize = cameraElement.targetSize;
    const customFrustum = cameraElement.getCustomFrustum();
    const useUnifiedCulling = scene.config.renderBackend?.unifiedCulling === true;
    const cameraPosition = cameraElement.entity?.getPosition();

    return createUnifiedDisplayProjectionSnapshot([
        { key: 'proj', value: `${camera.projection}` },
        { key: 'fov', value: roundProjectionSignatureValue(camera.fov) },
        { key: 'orthoHeight', value: roundProjectionSignatureValue(camera.orthoHeight) },
        { key: 'hFov', value: `${camera.horizontalFov ? 1 : 0}` },
        { key: 'aspect', value: roundProjectionSignatureValue(camera.aspectRatio) },
        { key: 'near', value: roundProjectionSignatureValue(camera.nearClip) },
        { key: 'far', value: roundProjectionSignatureValue(camera.farClip) },
        { key: 'ortho', value: `${cameraElement.ortho ? 1 : 0}` },
        { key: 'nearOverride', value: roundProjectionSignatureValue(cameraElement.getNearOverride()) },
        { key: 'target', value: targetSize ? `${roundProjectionSignatureValue(targetSize.width)}x${roundProjectionSignatureValue(targetSize.height)}` : 'null' },
        {
            key: 'frustum',
            value: customFrustum ? [
                roundProjectionSignatureValue(customFrustum.left),
                roundProjectionSignatureValue(customFrustum.right),
                roundProjectionSignatureValue(customFrustum.bottom),
                roundProjectionSignatureValue(customFrustum.top),
                roundProjectionSignatureValue(customFrustum.near),
                roundProjectionSignatureValue(customFrustum.far)
            ].join(',') : 'null'
        },
        { key: 'culling', value: `${useUnifiedCulling ? 1 : 0}` },
        {
            key: 'cameraPos',
            value: useUnifiedCulling && cameraPosition ? [
                roundProjectionSignatureValue(cameraPosition.x),
                roundProjectionSignatureValue(cameraPosition.y),
                roundProjectionSignatureValue(cameraPosition.z)
            ].join(',') : 'null'
        }
    ]);
};

const describeUnifiedDisplayProjectionSnapshotDiff = (
    previousSnapshot: UnifiedDisplayProjectionSnapshot,
    nextSnapshot: UnifiedDisplayProjectionSnapshot
) => {
    const previousValues = new Map(previousSnapshot.entries.map(({ key, value }) => [key, value]));
    const nextValues = new Map(nextSnapshot.entries.map(({ key, value }) => [key, value]));
    const diffs: string[] = [];

    nextSnapshot.entries.forEach(({ key, value }) => {
        const previousValue = previousValues.get(key);
        if (previousValue !== value) {
            diffs.push(`${key}:${previousValue ?? 'null'}->${value}`);
        }
    });

    previousSnapshot.entries.forEach(({ key, value }) => {
        if (!nextValues.has(key)) {
            diffs.push(`${key}:${value}->null`);
        }
    });

    return diffs.join(', ');
};

const createUnifiedDisplayRefreshController = (
    scene: Scene,
    options: {
        debugState: boolean;
        scheduleDirectRefresh: (frames?: number) => void;
    }
): UnifiedDisplayRefreshController => {
    let lastProjectionSnapshot: UnifiedDisplayProjectionSnapshot | null = null;

    return {
        syncSceneGsplatPolicy: () => {
            applyUnifiedDisplaySceneGsplatPolicy(scene);
        },
        resetProjectionBaseline: () => {
            lastProjectionSnapshot = null;
        },
        captureProjectionBaseline: () => {
            lastProjectionSnapshot = getUnifiedDisplayProjectionSnapshot(scene);
        },
        refreshForProjectionChange: () => {
            const projectionSnapshot = getUnifiedDisplayProjectionSnapshot(scene);
            if (projectionSnapshot.signature === lastProjectionSnapshot?.signature) {
                return;
            }

            const previousProjectionSnapshot = lastProjectionSnapshot;
            lastProjectionSnapshot = projectionSnapshot;

            if (!previousProjectionSnapshot) {
                return;
            }

            if (options.debugState) {
                const reason = describeUnifiedDisplayProjectionSnapshotDiff(previousProjectionSnapshot, projectionSnapshot);
                console.info(`[SplatRender] unified-display projection changed ${reason || projectionSnapshot.signature}`);
            }

            options.scheduleDirectRefresh(36);
        }
    };
};

const createUnifiedDisplayBackends = (scene: Scene): SplatRenderRoleBackends => {
    applyUnifiedDisplaySceneGsplatPolicy(scene);

    const mergedRenderer = createSupersplatSplatRenderSystemBackends(scene);
    const sources: Splat[] = [];
    const debugUnifiedState = scene.config.renderBackend?.debugState === true;
    let engineDirectActive = false;
    let lastFallbackReason: string | null = null;
    let pendingDirectForceRenderFrames = 0;
    let lastUnifiedStateLog = '';
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

    const unifiedDisplayRefreshController = createUnifiedDisplayRefreshController(scene, {
        debugState: debugUnifiedState,
        scheduleDirectRefresh
    });

    const findFallbackReason = () => {
        for (const splat of sources) {
            const issue = splat.getDirectEngineCompatibilityIssue();
            if (issue) {
                return `${splat.name || splat.filename}: ${issue}`;
            }
        }
        return null;
    };

    const prefersMergedDisplayForSelection = () => {
        // Rings mode visuals still come from the legacy merged renderer. Keep
        // unified-display direct mode for normal editing, but temporarily fall
        // back to merged while rings mode is active so the existing behavior
        // continues to work.
        return scene.events.invoke('camera.mode') === 'rings' || scene.renderFlags.forceMergedSplatDisplay;
    };

    const syncEngineComponents = (options?: { refreshDirect?: boolean }) => {
        const fallbackReason = findFallbackReason();
        const shouldUseEngineDirect = !prefersMergedDisplayForSelection() && fallbackReason === null;
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
            unifiedDisplayRefreshController.resetProjectionBaseline();
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
            if (directModeChanged || options?.refreshDirect) {
                unifiedDisplayRefreshController.captureProjectionBaseline();
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
                    unifiedDisplayRefreshController.syncSceneGsplatPolicy();
                    unifiedDisplayRefreshController.refreshForProjectionChange();
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
