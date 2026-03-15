import type { ReferenceExportLayer } from './camera-frames-types';
import type { Events } from './events';
import type { Model } from './model';
import { renderModelLayersWithOcclusion as renderModelLayersWithOcclusionExport } from './model-occlusion-export';
import type { PsdOverlayLayer } from './psd-export';
import type { Scene } from './scene';
import { localize } from './ui/localization';

type OffscreenOptions = {
    includeGrid?: boolean;
    includeEyeLevel?: boolean;
    overlaysOnly?: boolean;
    unpremultiplyAlpha?: boolean;
    includeReferenceImage?: boolean;
};

type CameraFramesRenderBackend = {
    syncExportFrustum: (width: number, height: number) => void;
    waitForSplatSorter: () => Promise<void>;
    renderBase: (width: number, height: number) => Promise<Uint8Array>;
    renderBaseWithoutModels: (width: number, height: number) => Promise<Uint8Array>;
    renderReferenceLayers: (width: number, height: number, options?: { applyOpacity?: boolean; }) => Promise<ReferenceExportLayer[]>;
    renderOverlayLayers: (
        width: number,
        height: number,
        exportGridOverlay: boolean
    ) => Promise<{ grid: HTMLCanvasElement | null; eyeLevel: HTMLCanvasElement | null; } | null>;
    renderModelLayers: (width: number, height: number, exportModelLayers: boolean) => Promise<PsdOverlayLayer[]>;
    renderModelLayersWithOcclusion: (width: number, height: number, exportModelLayers: boolean) => Promise<PsdOverlayLayer[]>;
};

type CreateRenderBackendParams = {
    events: Events;
    scene: Scene;
    clearViewportNearOverride: () => void;
    syncCameraFrustum: () => void;
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
    syncCameraFrustum
}: CreateRenderBackendParams): CameraFramesRenderBackend => {
    const renderOffscreen = async (width: number, height: number, options: OffscreenOptions) => {
        const pixels = await events.invoke('render.offscreen', width, height, options) as Uint8Array;
        if (!pixels) {
            throw new Error('render.offscreen returned empty buffer');
        }
        return pixels;
    };

    const renderBase = async (width: number, height: number) => {
        return await renderOffscreen(width, height, { includeReferenceImage: false });
    };

    const renderBaseWithoutModels = async (width: number, height: number) => {
        const modelLayer = scene.modelLightingLayer;
        const prevEnabled = modelLayer?.enabled ?? false;
        try {
            if (modelLayer) {
                modelLayer.enabled = false;
            }
            return await renderBase(width, height);
        } finally {
            if (modelLayer) {
                modelLayer.enabled = prevEnabled;
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
        exportModelLayers: boolean
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

            for (const { model } of modelStates) {
                model.entity.enabled = true;
                const pixels = await renderOffscreen(width, height, { unpremultiplyAlpha: true });
                if (pixels.length > 0) {
                    overlays.push({
                        name: localize('panel.camera-frames.export.model-layer', { name: model.name ?? 'Model' }),
                        canvas: canvasFromPixels(pixels, width, height)
                    });
                }
                model.entity.enabled = false;
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
        exportModelLayers: boolean
    ) => {
        return await renderModelLayersWithOcclusionExport(events, scene, width, height, exportModelLayers);
    };

    const syncExportFrustum = (width: number, height: number) => {
        clearViewportNearOverride();
        const prevTarget = scene.camera.targetSize ? { ...scene.camera.targetSize } : null;
        scene.camera.targetSize = { width, height };
        syncCameraFrustum();
        scene.camera.targetSize = prevTarget;
    };

    return {
        syncExportFrustum,
        waitForSplatSorter: () => scene.renderSystem.waitForSorter(),
        renderBase,
        renderBaseWithoutModels,
        renderReferenceLayers,
        renderOverlayLayers,
        renderModelLayers,
        renderModelLayersWithOcclusion
    };
};

export { createSupersplatCameraFramesRenderBackend };
export type { CameraFramesRenderBackend };
