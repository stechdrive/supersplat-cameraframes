import { Color, RenderPass } from 'playcanvas';

import type { RenderView } from './render-view';
import type { Scene } from '../scene';

export const nextFrame = (scene: Scene) => new Promise<void>((resolve, reject) => {
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const handle = scene.events.on('postrender', () => {
        handle.off();
        clearTimeout(pending.timer);
        resolve();
    });
    pending.timer = setTimeout(() => {
        handle.off();
        reject(new Error('指定 view の描画が完了しませんでした'));
    }, 15000);
    scene.forceRender = true;
    if (scene.lockedRenderMode) scene.lockedRender = true;
});

// 操作履歴と同じ queue で view 変更から GPU readback まで直列に実行する。
export const capture = (scene: Scene, view: RenderView, mode: 'color' | 'front-alpha' = 'color') => scene.commandQueue.enqueue(async () => {
    const camera = scene.camera;
    const saved = {
        view: camera.shotView,
        target: camera.targetSizeOverride,
        passes: camera.camera.framePasses,
        overlays: camera.renderOverlays,
        locked: scene.lockedRenderMode,
        final: camera.finalPass.enabled
    };
    let alphaClear: RenderPass | undefined;
    try {
        scene.lockedRenderMode = true;
        camera.renderOverlays = false;
        camera.setShotView(view);
        camera.startOffscreenMode(view.size.width, view.size.height);
        const passes = [camera.clearPass, camera.mainPass];
        if (mode === 'front-alpha') {
            alphaClear = new RenderPass(scene.graphicsDevice);
            alphaClear.name = 'GLB深度を保持してカラーのみクリア';
            alphaClear.init(camera.splatTarget);
            alphaClear.setClearColor(new Color(0, 0, 0, 0));
            // depth/stencil の clear は行わない。GLB と Splat は同じ depth texture を使う。
            passes.push(alphaClear);
        }
        camera.camera.framePasses = [...passes, camera.splatPass];
        await nextFrame(scene);
        const { width, height } = view.size;
        const data = new Uint8Array(width * height * 4);
        scene.dataProcessor.copyRt(camera.mainTarget, camera.workTarget);
        await camera.workTarget.colorBuffer.read(0, 0, width, height, {
            renderTarget: camera.workTarget, data, immediate: true
        });
        return data;
    } finally {
        alphaClear?.destroy();
        camera.setShotView(saved.view);
        if (saved.target) camera.startOffscreenMode(saved.target.width, saved.target.height);
        else camera.endOffscreenMode();
        camera.camera.framePasses = saved.passes;
        camera.finalPass.enabled = saved.final;
        camera.renderOverlays = saved.overlays;
        scene.lockedRenderMode = saved.locked;
        scene.forceRender = true;
    }
});

export const straightPixels = (pixels: Uint8Array) => {
    const result = new Uint8ClampedArray(pixels);
    for (let i = 0; i < result.length; i += 4) {
        const a = result[i + 3];
        if (a > 0 && a < 255) {
            for (let c = 0; c < 3; c++) result[i + c] = Math.round(result[i + c] * 255 / a);
        }
    }
    return result;
};

export const imageData = (data: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
    const result = new ImageData(width, height);
    result.data.set(data);
    return result;
};

export const png = (data: Uint8Array | Uint8ClampedArray, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.putImageData(imageData(data, width, height), 0, 0);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG変換に失敗しました'))));
    });
};
