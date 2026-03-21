import type { ReferenceExportLayer } from './camera-frames-types';
import type { Events } from './events';
import type { Model } from './model';
import { renderModelLayersWithOcclusion as renderModelLayersWithOcclusionExport } from './model-occlusion-export';
import type { PsdOverlayLayer } from './psd-export';
import type { Scene } from './scene';
import type { Splat } from './splat';
import { renderSplatLayersWithOcclusion as renderSplatLayersWithOcclusionExport } from './splat-occlusion-export';
import { localize } from './ui/localization';

type OffscreenOptions = {
    includeGrid?: boolean;
    includeEyeLevel?: boolean;
    overlaysOnly?: boolean;
    unpremultiplyAlpha?: boolean;
    includeReferenceImage?: boolean;
    stabilizeSplat?: boolean;
};

type ObjectLayerProgress = {
    completed: number;
    total: number;
    name?: string;
};

type CameraFramesRenderBackend = {
    syncExportFrustum: (width: number, height: number) => void;
    waitForSplatSorter: () => Promise<void>;
    showExportError: (error: unknown) => Promise<void>;
    restorePreviewAfterExport: (enabled: boolean) => void;
    renderBase: (width: number, height: number) => Promise<Uint8Array>;
    renderBaseWithoutLayers: (width: number, height: number, options: { excludeModels?: boolean; excludeSplats?: boolean; }) => Promise<Uint8Array>;
    renderReferenceLayers: (width: number, height: number, options?: { applyOpacity?: boolean; }) => Promise<ReferenceExportLayer[]>;
    renderOverlayLayers: (
        width: number,
        height: number,
        exportGridOverlay: boolean
    ) => Promise<{ grid: HTMLCanvasElement | null; eyeLevel: HTMLCanvasElement | null; } | null>;
    renderModelLayers: (
        width: number,
        height: number,
        exportModelLayers: boolean,
        onProgress?: (progress: ObjectLayerProgress) => void
    ) => Promise<PsdOverlayLayer[]>;
    renderModelLayersWithOcclusion: (
        width: number,
        height: number,
        exportModelLayers: boolean,
        onProgress?: (progress: ObjectLayerProgress) => void
    ) => Promise<PsdOverlayLayer[]>;
    renderSplatLayersWithOcclusion: (
        width: number,
        height: number,
        exportSplatLayers: boolean,
        onProgress?: (progress: ObjectLayerProgress) => void
    ) => Promise<PsdOverlayLayer[]>;
};

type CreateRenderBackendParams = {
    events: Events;
    scene: Scene;
    clearViewportNearOverride: () => void;
    syncCameraFrustum: () => void;
    requestRender: () => void;
};

const canvasFromPixels = (pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for overlay render');
    }
    const view = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
    const imgData = new ImageData(width, height);
    imgData.data.set(view);
    ctx.putImageData(imgData, 0, 0);
    return canvas;
};

const createSupersplatCameraFramesRenderBackend = ({
    events,
    scene,
    clearViewportNearOverride,
    syncCameraFrustum,
    requestRender
}: CreateRenderBackendParams): CameraFramesRenderBackend => {
    const postRender = () => {
        return new Promise<void>((resolve) => {
            const handle = scene.events.on('postrender', () => {
                handle.off();
                resolve();
            });
        });
    };

    const stabilizeAfterSplatVisibilityChange = async () => {
        const isUnifiedDisplay =
            scene.splatRenderCapabilities.resolvedMode === 'unified-display' &&
            !scene.renderFlags.forceMergedSplatDisplay;
        const minFrames = isUnifiedDisplay ? 3 : 1;
        const maxFrames = isUnifiedDisplay ? 6 : 2;

        scene.splatRenderDisplay.scheduleRebuildForVisibility(true);
        await scene.splatRenderLifecycle.waitForSorter();

        for (let frame = 0; frame < maxFrames; frame++) {
            scene.forceRender = true;
            await postRender();
            await scene.splatRenderLifecycle.waitForSorter();

            if (frame + 1 >= minFrames && !scene.forceRender) {
                break;
            }
        }
    };

    const renderOffscreen = async (width: number, height: number, options: OffscreenOptions) => {
        const pixels = await events.invoke('render.offscreen', width, height, options) as Uint8Array;
        if (!pixels) {
            throw new Error('render.offscreen returned empty buffer');
        }
        return pixels;
    };

    const renderBase = async (width: number, height: number) => {
        return await renderOffscreen(width, height, {
            includeReferenceImage: false,
            stabilizeSplat: true
        });
    };

    const renderBaseWithoutLayers = async (
        width: number,
        height: number,
        options: { excludeModels?: boolean; excludeSplats?: boolean; }
    ) => {
        const modelStates = options.excludeModels ?
            (((events.invoke('mesh.list') as Model[] | null) ?? []).filter((model) => {
                return !!model && !!model.entity && model.visible && model.entity.enabled !== false;
            }).map(model => ({
                model,
                enabled: model.entity.enabled
            }))) :
            [];
        const restoreLayers: Array<{ layer: any; enabled: boolean; }> = [];
        const rememberLayer = (layer?: any) => {
            if (!layer) return;
            restoreLayers.push({ layer, enabled: layer.enabled });
        };
        const prevForceMergedSplatDisplay = scene.renderFlags.forceMergedSplatDisplay;
        try {
            modelStates.forEach(({ model }) => {
                model.entity.enabled = false;
            });
            if (options.excludeSplats) {
                rememberLayer(scene.splatLayer);
                scene.renderFlags.forceMergedSplatDisplay = true;
                if (scene.splatLayer) {
                    scene.splatLayer.enabled = false;
                }
                await stabilizeAfterSplatVisibilityChange();
            }
            return await renderBase(width, height);
        } finally {
            modelStates.forEach(({ model, enabled }) => {
                model.entity.enabled = enabled;
            });
            restoreLayers.forEach(({ layer, enabled }) => {
                layer.enabled = enabled;
            });
            scene.renderFlags.forceMergedSplatDisplay = prevForceMergedSplatDisplay;
            if (options.excludeSplats) {
                await stabilizeAfterSplatVisibilityChange();
            }
        }
    };

    const renderReferenceLayers = async (width: number, height: number, options?: { applyOpacity?: boolean; }) => {
        const layers = await events.invoke('referenceImages.renderExportLayers', width, height, options) as ReferenceExportLayer[] | null;
        return Array.isArray(layers) ? layers : [];
    };

    const renderOverlayLayer = async (
        width: number,
        height: number,
        options: { includeGrid?: boolean; includeEyeLevel?: boolean; }
    ): Promise<HTMLCanvasElement | null> => {
        const includeGrid = !!options.includeGrid;
        const includeEyeLevel = !!options.includeEyeLevel;
        if (!includeGrid && !includeEyeLevel) {
            return null;
        }
        const pixels = await renderOffscreen(width, height, {
            includeGrid,
            includeEyeLevel,
            overlaysOnly: true,
            unpremultiplyAlpha: true
        });
        return canvasFromPixels(pixels, width, height);
    };

    const renderOverlayLayers = async (
        width: number,
        height: number,
        exportGridOverlay: boolean
    ): Promise<{ grid: HTMLCanvasElement | null; eyeLevel: HTMLCanvasElement | null; } | null> => {
        if (!exportGridOverlay) {
            return null;
        }
        const grid = await renderOverlayLayer(width, height, { includeGrid: true });
        const eyeLevel = await renderOverlayLayer(width, height, { includeEyeLevel: true });
        return { grid, eyeLevel };
    };

    const renderModelLayers = async (
        width: number,
        height: number,
        exportModelLayers: boolean,
        onProgress?: (progress: ObjectLayerProgress) => void
    ): Promise<PsdOverlayLayer[]> => {
        if (!exportModelLayers) {
            return [];
        }

        const models = ((events.invoke('mesh.list') as Model[] | null) ?? []).filter((model) => {
            return !!model && !!model.entity && model.visible && model.entity.enabled !== false;
        });

        if (models.length === 0) {
            return [];
        }

        const overlays: PsdOverlayLayer[] = [];
        const modelStates = models.map(model => ({
            model,
            enabled: model.entity.enabled
        }));
        onProgress?.({ completed: 0, total: modelStates.length });

        const layers = scene.app.scene.layers;
        const worldLayer = layers.getLayerByName('World');
        const restoreLayers: Array<{ layer: any; enabled: boolean; }> = [];
        const rememberLayer = (layer?: any) => {
            if (!layer) return;
            restoreLayers.push({ layer, enabled: layer.enabled });
        };

        const layersToDisable = [
            worldLayer,
            scene.splatLayer,
            scene.selectionVolumeLayer,
            scene.overlayLayer,
            scene.debugLayer,
            scene.gizmoLayer,
            scene.backgroundLayer,
            scene.shadowLayer,
            scene.exportOverlayLayer,
            scene.referenceBackLayer,
            scene.referenceFrontLayer
        ];
        layersToDisable.forEach(rememberLayer);

        const prevRenderFlags = { ...scene.renderFlags };
        const prevGridVisible = scene.grid.visible;
        const prevEyeVisible = scene.eyeLevel.visible;
        const prevRenderOverlays = scene.camera.renderOverlays;

        try {
            layersToDisable.forEach((layer) => {
                if (layer) {
                    layer.enabled = false;
                }
            });

            scene.renderFlags.forceGridOverlay = false;
            scene.renderFlags.forceEyeLevelOverlay = false;
            scene.renderFlags.eyeLevelLayerOverride = null;
            scene.renderFlags.gridLayerOverride = null;
            scene.renderFlags.hideBounds = true;
            scene.grid.visible = false;
            scene.eyeLevel.visible = false;
            scene.camera.renderOverlays = false;

            modelStates.forEach(({ model }) => {
                model.entity.enabled = false;
            });

            for (let index = 0; index < modelStates.length; index++) {
                const { model } = modelStates[index];
                model.entity.enabled = true;
                const pixels = await renderOffscreen(width, height, { unpremultiplyAlpha: true });
                if (pixels.length > 0) {
                    overlays.push({
                        name: localize('panel.camera-frames.export.model-layer', { name: model.name ?? 'Model' }),
                        canvas: canvasFromPixels(pixels, width, height)
                    });
                }
                model.entity.enabled = false;
                onProgress?.({
                    completed: index + 1,
                    total: modelStates.length,
                    name: model.name ?? 'Model'
                });
            }
        } finally {
            modelStates.forEach(({ model, enabled }) => {
                model.entity.enabled = enabled;
            });
            restoreLayers.forEach(({ layer, enabled }) => {
                layer.enabled = enabled;
            });
            scene.renderFlags.forceGridOverlay = prevRenderFlags.forceGridOverlay;
            scene.renderFlags.forceEyeLevelOverlay = prevRenderFlags.forceEyeLevelOverlay;
            scene.renderFlags.eyeLevelLayerOverride = prevRenderFlags.eyeLevelLayerOverride;
            scene.renderFlags.gridLayerOverride = prevRenderFlags.gridLayerOverride;
            scene.renderFlags.hideBounds = prevRenderFlags.hideBounds;
            scene.grid.visible = prevGridVisible;
            scene.eyeLevel.visible = prevEyeVisible;
            scene.camera.renderOverlays = prevRenderOverlays;
        }

        return overlays;
    };

    const renderModelLayersWithOcclusion = async (
        width: number,
        height: number,
        exportModelLayers: boolean,
        onProgress?: (progress: ObjectLayerProgress) => void
    ) => {
        return await renderModelLayersWithOcclusionExport(events, scene, width, height, exportModelLayers, onProgress);
    };

    const renderSplatLayersWithOcclusion = async (
        width: number,
        height: number,
        exportSplatLayers: boolean,
        onProgress?: (progress: ObjectLayerProgress) => void
    ) => {
        return await renderSplatLayersWithOcclusionExport(events, scene, width, height, exportSplatLayers, onProgress);
    };

    const syncExportFrustum = (width: number, height: number) => {
        clearViewportNearOverride();
        const prevTarget = scene.camera.targetSize ? { ...scene.camera.targetSize } : null;
        scene.camera.targetSize = { width, height };
        syncCameraFrustum();
        scene.camera.targetSize = prevTarget;
    };

    const showExportError = async (error: unknown) => {
        await events.invoke('showPopup', {
            type: 'error',
            header: 'Camera Frames',
            message: `'${(error as Error)?.message ?? error}'`
        });
    };

    const restorePreviewAfterExport = (enabled: boolean) => {
        if (!enabled) {
            return;
        }
        syncCameraFrustum();
        requestRender();
    };

    return {
        syncExportFrustum,
        waitForSplatSorter: () => scene.splatRenderLifecycle.waitForSorter(),
        showExportError,
        restorePreviewAfterExport,
        renderBase,
        renderBaseWithoutLayers,
        renderReferenceLayers,
        renderOverlayLayers,
        renderModelLayers,
        renderModelLayersWithOcclusion,
        renderSplatLayersWithOcclusion
    };
};

export { createSupersplatCameraFramesRenderBackend };
export type { CameraFramesRenderBackend, ObjectLayerProgress };
