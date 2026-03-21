import type { ObjectLayerProgress } from './camera-frames-render-backend';
import type { Events } from './events';
import type { Model } from './model';
import type { PsdOverlayLayer } from './psd-export';
import type { Scene } from './scene';
import type { Splat } from './splat';
import { localize } from './ui/localization';

const flipRows = (data: Uint8Array, width: number, height: number) => {
    const rowSize = width * 4;
    const result = new Uint8Array(data.length);
    for (let y = 0; y < height; y++) {
        const src = (height - 1 - y) * rowSize;
        result.set(data.subarray(src, src + rowSize), y * rowSize);
    }
    return result;
};

const unpremultiplyAlpha = (data: Uint8Array) => {
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

const canvasFromPixels = (pixels: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Failed to acquire 2D context for splat export');
    }
    const data = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
    const imageData = new ImageData(width, height);
    imageData.data.set(data);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
};

const extractAlphaChannel = (pixels: Uint8Array) => {
    const alpha = new Uint8ClampedArray(pixels.length / 4);
    for (let i = 0; i < alpha.length; i++) {
        alpha[i] = pixels[i * 4 + 3];
    }
    return alpha;
};

const postRender = (scene: Scene) => {
    return new Promise<void>((resolve) => {
        const handle = scene.events.on('postrender', () => {
            handle.off();
            resolve();
        });
    });
};

const stabilizeSplatCapture = async (scene: Scene) => {
    const isUnifiedDisplay =
        scene.splatRenderCapabilities.resolvedMode === 'unified-display' &&
        !scene.renderFlags.forceMergedSplatDisplay;
    const minFrames = isUnifiedDisplay ? 3 : 1;
    const maxFrames = isUnifiedDisplay ? 6 : 2;

    await scene.splatRenderLifecycle.waitForSorter();

    for (let frame = 0; frame < maxFrames; frame++) {
        scene.forceRender = true;
        await postRender(scene);
        await scene.splatRenderLifecycle.waitForSorter();

        if (frame + 1 >= minFrames && !scene.forceRender) {
            break;
        }
    }
};

const captureScenePixels = async (scene: Scene, width: number, height: number, settled = false) => {
    if (!settled) {
        await stabilizeSplatCapture(scene);
    }

    const data = new Uint8Array(width * height * 4);
    const { mainTarget, workTarget } = scene.camera;
    scene.dataProcessor.copyRt(mainTarget, workTarget);
    await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

    const flipped = flipRows(data, width, height);
    unpremultiplyAlpha(flipped);
    return flipped;
};

const composeOpaqueMaskPixels = (colorPixels: Uint8Array) => {
    const result = new Uint8ClampedArray(colorPixels.length);

    for (let i = 0; i < result.length; i += 4) {
        if (colorPixels[i + 3] === 0) {
            continue;
        }
        result[i + 0] = 255;
        result[i + 1] = 255;
        result[i + 2] = 255;
        result[i + 3] = 255;
    }

    return result;
};

const splatMaskHoleFillCurrentThreshold = 24;
const splatMaskHoleFillNeighborThreshold = 6;
const splatMaskHoleFillNeighborMaskThreshold = 224;
const splatMaskContributionEpsilon = 1 / 255;
const splatMaskSolveDenominatorEpsilon = 1e-3;

const fillSplatMaskDarkSpeckles = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sourceAlpha: Uint8ClampedArray
) => {
    const result = new Uint8ClampedArray(pixels);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const index = y * width + x;
            const pixelOffset = index * 4;
            const currentAlpha = pixels[pixelOffset + 3];
            if (currentAlpha > splatMaskHoleFillCurrentThreshold) {
                continue;
            }

            const sourceVisibleAlpha = sourceAlpha[index];
            if (sourceVisibleAlpha <= 0) {
                continue;
            }

            let visibleNeighbors = 0;
            for (let oy = -1; oy <= 1; oy++) {
                for (let ox = -1; ox <= 1; ox++) {
                    if (ox === 0 && oy === 0) {
                        continue;
                    }
                    const neighborOffset = (((y + oy) * width + (x + ox)) * 4) + 3;
                    if (pixels[neighborOffset] >= splatMaskHoleFillNeighborMaskThreshold) {
                        visibleNeighbors++;
                    }
                }
            }

            if (visibleNeighbors >= splatMaskHoleFillNeighborThreshold) {
                result[pixelOffset + 0] = 255;
                result[pixelOffset + 1] = 255;
                result[pixelOffset + 2] = 255;
                result[pixelOffset + 3] = 255;
            }
        }
    }

    return result;
};

const composeSplatMaskPixels = (
    colorPixels: Uint8Array,
    compositePixels: Uint8Array,
    lowerPixels: Uint8Array,
    width: number,
    height: number
) => {
    const result = new Uint8ClampedArray(colorPixels.length);
    const sourceAlpha = extractAlphaChannel(colorPixels);

    for (let i = 0; i < result.length; i += 4) {
        const sourceAlphaValue = colorPixels[i + 3];
        const index = i / 4;
        if (sourceAlphaValue === 0) {
            continue;
        }

        const sourceAlphaNormalized = sourceAlphaValue / 255;
        const compositeAlphaNormalized = compositePixels[i + 3] / 255;
        const lowerAlphaNormalized = lowerPixels[i + 3] / 255;

        const estimates: Array<{ value: number; weight: number; }> = [];

        const alphaDenominator = sourceAlphaNormalized * (1 - lowerAlphaNormalized);
        if (alphaDenominator > splatMaskContributionEpsilon) {
            estimates.push({
                value: (compositeAlphaNormalized - lowerAlphaNormalized) / alphaDenominator,
                weight: alphaDenominator * 2
            });
        }

        for (let channel = 0; channel < 3; channel++) {
            const sourcePremultiplied = (colorPixels[i + channel] / 255) * sourceAlphaNormalized;
            const compositePremultiplied = (compositePixels[i + channel] / 255) * compositeAlphaNormalized;
            const lowerPremultiplied = (lowerPixels[i + channel] / 255) * lowerAlphaNormalized;
            const denominator = sourcePremultiplied - (sourceAlphaNormalized * lowerPremultiplied);
            if (Math.abs(denominator) <= splatMaskSolveDenominatorEpsilon) {
                continue;
            }

            estimates.push({
                value: (compositePremultiplied - lowerPremultiplied) / denominator,
                weight: Math.abs(denominator)
            });
        }

        let maskNormalized = 1;
        if (estimates.length > 0) {
            const weighted = estimates.reduce((sum, { value, weight }) => {
                return sum + (Math.max(0, Math.min(1, value)) * weight);
            }, 0);
            const totalWeight = estimates.reduce((sum, { weight }) => sum + weight, 0);
            maskNormalized = totalWeight > 0 ? (weighted / totalWeight) : 1;
        } else {
            const contribution =
                Math.abs(compositeAlphaNormalized - lowerAlphaNormalized) +
                Math.abs((compositePixels[i + 0] * compositeAlphaNormalized) - (lowerPixels[i + 0] * lowerAlphaNormalized)) / (255 * 255) +
                Math.abs((compositePixels[i + 1] * compositeAlphaNormalized) - (lowerPixels[i + 1] * lowerAlphaNormalized)) / (255 * 255) +
                Math.abs((compositePixels[i + 2] * compositeAlphaNormalized) - (lowerPixels[i + 2] * lowerAlphaNormalized)) / (255 * 255);
            maskNormalized = contribution > splatMaskContributionEpsilon ? 1 : 0;
        }

        const maskValue = Math.round(maskNormalized * 255);
        result[i + 0] = maskValue;
        result[i + 1] = maskValue;
        result[i + 2] = maskValue;
        result[i + 3] = maskValue;
    }

    return fillSplatMaskDarkSpeckles(
        result,
        width,
        height,
        sourceAlpha
    );
};

const setModelEnabledStates = (models: Array<{ model: Model; enabled: boolean; }>, predicate: (model: Model) => boolean) => {
    models.forEach(({ model }) => {
        model.entity.enabled = predicate(model);
    });
};

const setSplatVisibleStates = (splats: Array<{ splat: Splat; visible: boolean; }>, predicate: (splat: Splat) => boolean) => {
    splats.forEach(({ splat }) => {
        splat.visible = predicate(splat);
    });
};

const captureEngineGsplatStates = (splats: Array<{ splat: Splat; visible: boolean; }>) => {
    return splats
    .map(({ splat }) => {
        const component = splat.entity.gsplat;
        if (!component) {
            return null;
        }
        return {
            splat,
            component,
            enabled: component.enabled
        };
    })
    .filter((entry): entry is { splat: Splat; component: any; enabled: boolean; } => !!entry);
};

const setEngineGsplatComponentsEnabled = (
    states: Array<{ splat: Splat; component: any; enabled: boolean; }>,
    enabled: boolean
) => {
    states.forEach(({ splat }) => {
        splat.syncEngineGsplatComponent({ enabled });
    });
};

const restoreEngineGsplatComponents = (
    states: Array<{ splat: Splat; component: any; enabled: boolean; }>
) => {
    states.forEach(({ splat, enabled }) => {
        splat.syncEngineGsplatComponent({ enabled });
    });
};

const settleSplatVisibility = async (scene: Scene) => {
    scene.splatRenderDisplay.scheduleRebuildForVisibility(true);
    await stabilizeSplatCapture(scene);
};

const settleDirectSplatDisplayMode = async (scene: Scene) => {
    scene.splatRenderDisplay.scheduleRebuildForVisibility(true);
    await stabilizeSplatCapture(scene);
};

export const renderSplatLayersWithOcclusion = async (
    events: Events,
    scene: Scene,
    width: number,
    height: number,
    exportSplatLayers: boolean,
    onProgress?: (progress: ObjectLayerProgress) => void
): Promise<PsdOverlayLayer[]> => {
    if (!exportSplatLayers) {
        return [];
    }

    const splats = ((events.invoke('scene.allSplats') as Splat[] | null) ?? []).filter((splat) => {
        return !!splat && !!splat.entity && splat.visible && splat.numSplats > 0;
    });

    if (splats.length === 0) {
        return [];
    }

    const models = ((events.invoke('mesh.list') as Model[] | null) ?? []).filter((model) => {
        return !!model && !!model.entity && model.visible && model.entity.enabled !== false;
    });

    const overlays: PsdOverlayLayer[] = [];
    const splatStates = splats.map(splat => ({ splat, visible: splat.visible }));
    onProgress?.({ completed: 0, total: splatStates.length });
    const modelStates = models.map(model => ({ model, enabled: model.entity.enabled }));
    const restoreLayers: Array<{ layer: any; enabled: boolean; }> = [];
    const rememberLayer = (layer?: any) => {
        if (!layer) return;
        restoreLayers.push({ layer, enabled: layer.enabled });
    };

    [
        scene.splatLayer,
        scene.selectionVolumeLayer,
        scene.overlayLayer,
        scene.debugLayer,
        scene.gizmoLayer,
        scene.backgroundLayer,
        scene.shadowLayer,
        scene.exportOverlayLayer,
        scene.modelLightingLayer,
        scene.referenceBackLayer,
        scene.referenceFrontLayer
    ].forEach(rememberLayer);

    const prevRenderFlags = { ...scene.renderFlags };
    const prevGridVisible = scene.grid.visible;
    const prevEyeVisible = scene.eyeLevel.visible;
    const prevRenderOverlays = scene.camera.renderOverlays;
    let cachedCompositePixelsForNextLayer: Uint8Array | null = null;
    try {
        scene.camera.startOffscreenMode(width, height);
        scene.forceRender = true;
        await postRender(scene);

        restoreLayers.forEach(({ layer }) => {
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
        await settleDirectSplatDisplayMode(scene);

        for (let index = 0; index < splatStates.length; index++) {
            const { splat } = splatStates[index];
            const isBottomSplatLayer = index === splatStates.length - 1;
            // splatOverlays は Scene Manager の並び順で積み、PSD へ渡す時に reverse して
            // bottom-to-top へ並べ替えている。よって最後の 3DGS は PSD 最下段の背景レイヤー。
            // 背景 3DGS は上位レイヤー側の mask で見え方を作るため、自身の mask は不要。
            // また、現在レイヤーの mask が考慮すべき相手は「自分より下の PSD レイヤー」だけ。
            // 上に積まれるレイヤーは PSD の重ね順で自然に被さるので、mask に入れると二重減衰になる。
            const occluderSplats = new Set(
                splatStates
                .slice(index + 1)
                .map(({ splat: candidate }) => candidate)
            );

            setModelEnabledStates(modelStates, () => false);
            setSplatVisibleStates(splatStates, candidate => candidate === splat);
            if (scene.modelLightingLayer) {
                scene.modelLightingLayer.enabled = false;
            }
            await settleDirectSplatDisplayMode(scene);
            const colorPixels = await captureScenePixels(scene, width, height, true);

            const sourceCanvas = canvasFromPixels(colorPixels, width, height);

            const overlay: PsdOverlayLayer = {
                name: localize('panel.camera-frames.export.splat-layer', { name: splat.name ?? 'Splat' }),
                canvas: sourceCanvas
            };

            if (!isBottomSplatLayer) {
                setSplatVisibleStates(splatStates, candidate => occluderSplats.has(candidate));
                await settleDirectSplatDisplayMode(scene);
                const lowerPixels = await captureScenePixels(scene, width, height, true);

                const compositePixels = cachedCompositePixelsForNextLayer ?? await (async () => {
                    setSplatVisibleStates(splatStates, candidate => candidate === splat || occluderSplats.has(candidate));
                    await settleSplatVisibility(scene);
                    return await captureScenePixels(scene, width, height, true);
                })();

                const maskPixels = composeSplatMaskPixels(colorPixels, compositePixels, lowerPixels, width, height);
                const maskCanvas = canvasFromPixels(maskPixels, width, height);
                overlay.mask = {
                    canvas: maskCanvas,
                    bounds: { left: 0, top: 0, right: width, bottom: height },
                    defaultColor: 0
                };

                cachedCompositePixelsForNextLayer = lowerPixels;
            } else {
                cachedCompositePixelsForNextLayer = null;
            }

            overlays.push(overlay);

            setSplatVisibleStates(splatStates, () => false);
            onProgress?.({
                completed: index + 1,
                total: splatStates.length,
                name: splat.name ?? 'Splat'
            });
        }
    } finally {
        modelStates.forEach(({ model, enabled }) => {
            model.entity.enabled = enabled;
        });
        splatStates.forEach(({ splat, visible }) => {
            splat.visible = visible;
        });
        restoreLayers.forEach(({ layer, enabled }) => {
            layer.enabled = enabled;
        });
        scene.renderFlags.forceGridOverlay = prevRenderFlags.forceGridOverlay;
        scene.renderFlags.forceEyeLevelOverlay = prevRenderFlags.forceEyeLevelOverlay;
        scene.renderFlags.eyeLevelLayerOverride = prevRenderFlags.eyeLevelLayerOverride;
        scene.renderFlags.gridLayerOverride = prevRenderFlags.gridLayerOverride;
        scene.renderFlags.hideBounds = prevRenderFlags.hideBounds;
        scene.renderFlags.forceMergedSplatDisplay = prevRenderFlags.forceMergedSplatDisplay;
        scene.grid.visible = prevGridVisible;
        scene.eyeLevel.visible = prevEyeVisible;
        scene.camera.renderOverlays = prevRenderOverlays;
        await settleDirectSplatDisplayMode(scene);
        scene.camera.endOffscreenMode();
    }

    return overlays;
};
