import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_ZERO,
    BlendState,
    Picker as EnginePicker
} from 'playcanvas';

import type { Events } from './events';
import type { Model } from './model';
import type { PsdOverlayLayer } from './psd-export';
import type { Scene } from './scene';
import { localize } from './ui/localization';

const float32 = new Float32Array(1);
const int32 = new Int32Array(float32.buffer);

const decodeDepthAt = (data: Uint8Array | null | undefined, offset: number) => {
    if (!data || offset + 3 >= data.length) {
        return null;
    }
    const intBits = (
        (data[offset + 0] << 24) |
        (data[offset + 1] << 16) |
        (data[offset + 2] << 8) |
        data[offset + 3]
    ) >>> 0;
    if (intBits === 0xFFFFFFFF) {
        return null;
    }
    int32[0] = intBits | 0;
    return float32[0];
};

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
        throw new Error('Failed to acquire 2D context for model export');
    }
    const data = pixels instanceof Uint8ClampedArray ? pixels : new Uint8ClampedArray(pixels);
    const imageData = new ImageData(width, height);
    imageData.data.set(data);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
};

const postRender = (scene: Scene) => {
    return new Promise<void>((resolve) => {
        const handle = scene.events.on('postrender', () => {
            handle.off();
            resolve();
        });
    });
};

const captureScenePixels = async (scene: Scene, width: number, height: number) => {
    scene.forceRender = true;
    await postRender(scene);

    const data = new Uint8Array(width * height * 4);
    const { mainTarget, workTarget } = scene.camera;
    scene.dataProcessor.copyRt(mainTarget, workTarget);
    await workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workTarget, data });

    const flipped = flipRows(data, width, height);
    unpremultiplyAlpha(flipped);
    return flipped;
};

const readPickerDepth = async (picker: any, width: number, height: number) => {
    const texture = picker?.depthBuffer;
    const renderTarget = picker?.renderTargetDepth;
    if (!texture || !renderTarget) {
        return null;
    }
    const data = await texture.read(0, 0, width, height, { renderTarget });
    return flipRows(data, width, height);
};

const composeOcclusionMaskPixels = (
    colorPixels: Uint8Array,
    targetDepth: Uint8Array | null,
    otherDepth: Uint8Array | null,
    splatOcclusion: Uint8Array | null
) => {
    const result = new Uint8ClampedArray(colorPixels.length);
    const depthBias = 1e-6;

    for (let i = 0; i < result.length; i += 4) {
        const sourceAlpha = colorPixels[i + 3];
        if (sourceAlpha === 0) {
            continue;
        }

        const selfDepth = decodeDepthAt(targetDepth, i);
        if (selfDepth === null) {
            continue;
        }

        const occluderDepth = decodeDepthAt(otherDepth, i);
        if (occluderDepth !== null && occluderDepth < selfDepth - depthBias) {
            continue;
        }

        const transmittance = splatOcclusion ? (splatOcclusion[i + 3] / 255) : 1;
        const maskValue = Math.max(0, Math.min(255, Math.round(transmittance * 255)));
        result[i + 0] = maskValue;
        result[i + 1] = maskValue;
        result[i + 2] = maskValue;
        result[i + 3] = maskValue;
    }

    return result;
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

const setModelEnabledStates = (models: Array<{ model: Model; enabled: boolean; }>, predicate: (model: Model) => boolean) => {
    models.forEach(({ model }) => {
        model.entity.enabled = predicate(model);
    });
};

const captureSplatOcclusion = async (
    scene: Scene,
    width: number,
    height: number,
    modelDepthTexture: any
) => {
    const splatPicker = new EnginePicker(scene.app, width, height, true) as any;
    try {
        const device = scene.app.graphicsDevice;
        device.scope.resolve('pickOp').setValue(2);
        device.scope.resolve('pickMode').setValue(2);
        device.scope.resolve('occlusionModelDepthTex').setValue(modelDepthTexture);
        device.scope.resolve('occlusionModelDepthTexSize').setValue([width, height]);
        splatPicker.renderPass.blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ZERO, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );
        splatPicker.prepare(scene.camera.entity.camera, scene.app.scene, [scene.splatLayer]);
        return await readPickerDepth(splatPicker, width, height);
    } finally {
        splatPicker.destroy();
    }
};

export const renderModelLayersWithOcclusion = async (
    events: Events,
    scene: Scene,
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
    const modelStates = models.map(model => ({ model, enabled: model.entity.enabled }));
    const layers = scene.app.scene.layers;
    const worldLayer = layers.getLayerByName('World');
    const restoreLayers: Array<{ layer: any; enabled: boolean; }> = [];
    const rememberLayer = (layer?: any) => {
        if (!layer) return;
        restoreLayers.push({ layer, enabled: layer.enabled });
    };

    [
        worldLayer,
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
    const depthPicker = new EnginePicker(scene.app, width, height, true) as any;

    try {
        scene.camera.startOffscreenMode(width, height);

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

        setModelEnabledStates(modelStates, () => false);

        for (const { model } of modelStates) {
            setModelEnabledStates(modelStates, candidate => candidate === model);
            if (scene.modelLightingLayer) {
                scene.modelLightingLayer.enabled = true;
            }
            scene.splatLayer.enabled = false;
            const colorPixels = await captureScenePixels(scene, width, height);

            depthPicker.prepare(scene.camera.entity.camera, scene.app.scene, [scene.modelLightingLayer]);
            const targetDepth = await readPickerDepth(depthPicker, width, height);
            const targetDepthTexture = depthPicker.depthBuffer;

            scene.splatLayer.enabled = true;
            const splatOcclusion = targetDepthTexture ?
                await captureSplatOcclusion(scene, width, height, targetDepthTexture) :
                null;
            scene.splatLayer.enabled = false;

            setModelEnabledStates(modelStates, candidate => candidate !== model);
            let otherDepth: Uint8Array | null = null;
            if (modelStates.some(({ model: candidate, enabled }) => enabled && candidate !== model)) {
                depthPicker.prepare(scene.camera.entity.camera, scene.app.scene, [scene.modelLightingLayer]);
                otherDepth = await readPickerDepth(depthPicker, width, height);
            }

            const sourceCanvas = canvasFromPixels(colorPixels, width, height);
            const maskPixels = targetDepth ?
                composeOcclusionMaskPixels(colorPixels, targetDepth, otherDepth, splatOcclusion) :
                composeOpaqueMaskPixels(colorPixels);
            const maskCanvas = canvasFromPixels(maskPixels, width, height);
            overlays.push({
                name: localize('panel.camera-frames.export.model-layer', { name: model.name ?? 'Model' }),
                // レイヤー本体は未遮蔽のまま保持し、遮蔽結果だけを PSD mask として載せる。
                canvas: sourceCanvas,
                mask: {
                    canvas: maskCanvas,
                    bounds: { left: 0, top: 0, right: width, bottom: height },
                    defaultColor: 0
                }
            });

            setModelEnabledStates(modelStates, () => false);
        }
    } finally {
        depthPicker.destroy();
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
        scene.camera.endOffscreenMode();
    }

    return overlays;
};
