import { Layer } from 'playcanvas';

import type { Events } from './events';
import type { Scene } from './scene';

type OffscreenRenderOptions = {
    includeGrid?: boolean;
    includeEyeLevel?: boolean;
    overlaysOnly?: boolean;
    unpremultiplyAlpha?: boolean;
    includeReferenceImage?: boolean;
    stabilizeSplat?: boolean;
};

const unpremultiplyAlpha = (pixels: Uint8Array) => {
    const data = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels.buffer);
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0 || a === 255) {
            continue;
        }
        const alpha = a / 255;
        data[i + 0] = Math.min(255, Math.round(data[i + 0] / alpha));
        data[i + 1] = Math.min(255, Math.round(data[i + 1] / alpha));
        data[i + 2] = Math.min(255, Math.round(data[i + 2] / alpha));
    }
};

const registerCameraFramesRenderBridge = (
    scene: Scene,
    events: Events,
    postRender: () => Promise<boolean>
) => {
    const stabilizeSplatCapture = async () => {
        const isUnifiedDisplay = scene.splatRenderCapabilities.resolvedMode === 'unified-display';
        const minFrames = isUnifiedDisplay ? 3 : 1;
        const maxFrames = isUnifiedDisplay ? 6 : 2;

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

    events.function('render.offscreen', async (width: number, height: number, options?: OffscreenRenderOptions): Promise<Uint8Array> => {
        const includeGrid = !!options?.includeGrid;
        const includeEyeLevel = !!options?.includeEyeLevel;
        const overlaysOnly = !!options?.overlaysOnly;
        const applyUnpremultiply = !!options?.unpremultiplyAlpha;
        const includeReferenceImage = !!options?.includeReferenceImage && !overlaysOnly;
        const stabilizeSplat = !!options?.stabilizeSplat && !overlaysOnly;

        const restoreLayers: Array<{ layer: Layer; enabled: boolean; }> = [];
        const rememberLayer = (layer?: Layer) => {
            if (!layer) return;
            restoreLayers.push({ layer, enabled: layer.enabled });
        };
        const referenceLayers = [scene.referenceBackLayer, scene.referenceFrontLayer];
        const disableReferenceLayers = () => {
            referenceLayers.forEach((layer) => {
                if (!layer) return;
                rememberLayer(layer);
                layer.enabled = false;
            });
        };

        const prevRenderOverlays = scene.camera.renderOverlays;
        const prevRenderFlags = { ...scene.renderFlags };
        const prevGridVisible = scene.grid.visible;
        const prevEyeVisible = scene.eyeLevel.visible;
        const prevHideBounds = scene.renderFlags.hideBounds;
        const prevOffscreenIncludeReferenceImage = scene.renderFlags.offscreenIncludeReferenceImage;

        try {
            scene.camera.startOffscreenMode(width, height);
            scene.renderFlags.offscreenIncludeReferenceImage = includeReferenceImage;

            const worldLayer = scene.app.scene.layers.getLayerByName('World');

            if (overlaysOnly) {
                [scene.backgroundLayer, scene.shadowLayer, scene.selectionVolumeLayer, scene.overlayLayer, scene.gizmoLayer, scene.modelLightingLayer, worldLayer, scene.splatLayer, ...referenceLayers].forEach((layer) => {
                    if (!layer) return;
                    rememberLayer(layer);
                    layer.enabled = false;
                });
            } else {
                rememberLayer(scene.gizmoLayer);
                scene.gizmoLayer.enabled = false;
                if (!includeReferenceImage) {
                    disableReferenceLayers();
                }
            }

            scene.camera.renderOverlays = includeGrid || includeEyeLevel;
            scene.renderFlags.forceGridOverlay = includeGrid;
            scene.renderFlags.forceEyeLevelOverlay = includeEyeLevel;
            scene.renderFlags.eyeLevelLayerOverride = includeEyeLevel ? scene.debugLayer : null;
            scene.renderFlags.gridLayerOverride = includeGrid ? scene.debugLayer : null;
            scene.renderFlags.hideBounds = overlaysOnly;
            scene.grid.visible = includeGrid;
            scene.eyeLevel.visible = includeEyeLevel;

            scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
            if (stabilizeSplat) {
                await stabilizeSplatCapture();
            } else {
                scene.forceRender = true;
                await postRender();
            }

            const data = new Uint8Array(width * height * 4);
            const { mainTarget, workTarget } = scene.camera;

            scene.dataProcessor.copyRt(mainTarget, workTarget);
            await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

            if (applyUnpremultiply) {
                unpremultiplyAlpha(data);
            }

            let line = new Uint8Array(width * 4);
            for (let y = 0; y < height / 2; y++) {
                line = data.slice(y * width * 4, (y + 1) * width * 4);
                data.copyWithin(y * width * 4, (height - y - 1) * width * 4, (height - y) * width * 4);
                data.set(line, (height - y - 1) * width * 4);
            }

            return data;
        } finally {
            restoreLayers.forEach(({ layer, enabled }) => {
                if (layer) {
                    layer.enabled = enabled;
                }
            });
            scene.renderFlags.forceGridOverlay = prevRenderFlags.forceGridOverlay;
            scene.renderFlags.forceEyeLevelOverlay = prevRenderFlags.forceEyeLevelOverlay;
            scene.renderFlags.eyeLevelLayerOverride = prevRenderFlags.eyeLevelLayerOverride;
            scene.renderFlags.gridLayerOverride = prevRenderFlags.gridLayerOverride;
            scene.renderFlags.hideBounds = prevHideBounds;
            scene.renderFlags.offscreenIncludeReferenceImage = prevOffscreenIncludeReferenceImage;
            scene.grid.visible = prevGridVisible;
            scene.eyeLevel.visible = prevEyeVisible;
            scene.camera.endOffscreenMode();
            scene.camera.renderOverlays = prevRenderOverlays;
            scene.camera.camera.clearColor.set(0, 0, 0, 0);
        }
    });
};

export { registerCameraFramesRenderBridge };
export type { OffscreenRenderOptions };
