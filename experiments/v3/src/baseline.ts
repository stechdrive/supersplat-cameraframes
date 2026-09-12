import { Quat, Vec3, version } from 'playcanvas';

import { makePly } from './fixtures';
import { resolveView } from './render-view';

// 同じ合成素材を、変更していない描画基盤と実証基盤で測る共通の計測コード。
// 旧版とv3でSceneの型が異なるため、この比較専用入口だけ構造的に扱う。
export const installBaseline = (scene: any, events: any) => {
    const label = new URLSearchParams(location.search).get('baseline') ?? 'proof';
    const status = document.createElement('pre');
    status.id = 'baseline-status';
    status.style.cssText = 'position:fixed;bottom:20px;left:20px;z-index:10000;background:#162130;color:white;padding:14px';
    status.textContent = `${label}: 計測中`;
    document.body.append(status);
    const next = () => new Promise<void>((resolve, reject) => {
        const pending: { timer?: ReturnType<typeof setTimeout> } = {};
        const handle = events.on('postrender', () => {
            clearTimeout(pending.timer);
            handle.off();
            resolve();
        });
        pending.timer = setTimeout(() => {
            handle.off();
            reject(new Error('比較用フレームが描画されませんでした'));
        }, 15000);
        scene.forceRender = true;
    });
    const save = async (name: string, body: Blob | string) => {
        const response = await fetch(`/__proof/artifact/${name}`, { method: 'POST', body });
        if (!response.ok) throw new Error('比較結果の保存に失敗しました');
    };
    const run = async () => {
        try {
            events.fire('scene.clear');
            events.fire('view.setStochastic', 'disabled');
            events.fire('view.setBands', 0);
            const start = performance.now();
            for (const side of ['red', 'blue'] as const) {
                const file = makePly(side);
                await events.invoke('import', [{ filename: file.name, contents: file }]);
            }
            if (scene.commandQueue) await scene.commandQueue.enqueue(() => {});
            const splats = events.invoke('scene.allSplats');
            splats.forEach((splat: any) => splat.move(new Vec3(), new Quat()));
            const radius = scene.bound.halfExtents.length();
            if (!(radius > 0)) throw new Error('比較用素材のboundが空です');
            // 同一320x240の実描画面を使う。CSSでの表示寸法は計測しない。
            const container = document.getElementById('canvas-container')!;
            const cssWidth = 320 / window.devicePixelRatio;
            const cssHeight = 240 / window.devicePixelRatio;
            container.style.cssText += `;position:absolute!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;flex:none!important;min-width:0!important;min-height:0!important;width:${cssWidth}px!important;height:${cssHeight}px!important;`;
            scene.canvasResize = { width: 320, height: 240 };
            scene.camera.renderOverlays = false;
            scene.camera.tonemapping = 'linear';
            scene.gizmoLayer.enabled = false;
            if (scene.centersLayer) scene.centersLayer.enabled = false;
            await next();
            events.fire('cameraFrames.setMainEditMode', false);
            events.fire('cameraFrames.setEnabled', false);
            // 旧版はnav切替時に姿勢/注視点を復元するため、比較姿勢を設定する前に切り替える。
            scene.camera.setNavMode?.('orbit', { preservePose: true });
            scene.camera.renderOverlays = false;
            if (scene.debugLayer) scene.debugLayer.enabled = false;
            await next();
            if (scene.camera.setShotView) {
                scene.camera.setShotView(resolveView({ id: 'baseline', position: [0, 0, 5], rotation: [0, 0, 0, 1], projection: 'perspective', fovY: 50, orthoHalfHeight: 2, near: 0.1, far: 100 },
                    { width: 320, height: 240, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 }));
            } else {
                const fov = 2 * Math.atan(Math.tan(25 * Math.PI / 180) * 4 / 3) * 180 / Math.PI;
                scene.camera.fov = fov;
                scene.camera.docDeserialize({ focalPoint: [0, 0, 0],
                    azim: 0,
                    elev: 0,
                    distance: 5 * scene.camera.fovFactor / scene.camera.sceneRadius,
                    fov,
                    tonemapping: 'linear',
                    ortho: false,
                    roll: 0,
                    navMode: 'orbit',
                    renderOverlays: false,
                    nearOverride: null,
                    customFrustum: null }, { preserveNavMode: false });
            }
            await next();
            if (scene.splatRenderLifecycle) await scene.splatRenderLifecycle.waitForSorter();
            for (let i = 0; i < 5; i++) await next();
            const readyForCaptureMs = performance.now() - start;
            const position = scene.camera.mainCamera.getPosition();
            if (Math.abs(position.x) > 1e-5 || Math.abs(position.y) > 1e-5 || Math.abs(position.z - 5) > 1e-5) {
                throw new Error(`比較カメラの位置が不一致: ${position.toString()}`);
            }
            const { mainTarget, workTarget } = scene.camera;
            if (mainTarget.width !== 320 || mainTarget.height !== 240) throw new Error(`描画面が不一致: ${mainTarget.width}x${mainTarget.height}`);
            const data = new Uint8Array(320 * 240 * 4);
            scene.dataProcessor.copyRt(mainTarget, workTarget);
            await workTarget.colorBuffer.read(0, 0, 320, 240, { renderTarget: workTarget, data, immediate: true });
            const topDown = new Uint8ClampedArray(data.length);
            for (let y = 0; y < 240; y++) {
                const from = scene.graphicsDevice.isWebGPU ? y : 239 - y;
                topDown.set(data.subarray(from * 1280, (from + 1) * 1280), y * 1280);
            }
            await save(`baseline-${label}.rgba`, new Blob([topDown]));
            for (let i = 0; i < topDown.length; i += 4) {
                if (topDown[i + 3] > 0) for (let c = 0; c < 3; c++) topDown[i + c] = Math.round(topDown[i + c] * 255 / topDown[i + 3]);
            }
            const canvas = document.createElement('canvas');
            canvas.width = 320;
            canvas.height = 240;
            canvas.getContext('2d')!.putImageData(new ImageData(topDown, 320, 240), 0, 0);
            const png = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG変換に失敗しました'))));
            });
            await save(`baseline-${label}.png`, png);
            events.fire('view.setPerfOverlay', true);
            scene.graphicsDevice.gpuProfiler.enabled = true;
            const cpu: number[] = [];
            const gpu: number[] = [];
            let frameStart = 0;
            const updateHandle = scene.app.on('update', () => {
                frameStart = performance.now();
            });
            const postHandle = events.on('postrender', () => {
                cpu.push(performance.now() - frameStart);
                gpu.push(scene.graphicsDevice.gpuProfiler._frameTime);
            });
            for (let i = 0; i < 60; i++) {
                status.textContent = `${label}: 計測中 ${i + 1}/60`;
                await next();
            }
            updateHandle.off();
            postHandle.off();
            events.fire('view.setPerfOverlay', false);
            const summarize = (values: number[]) => {
                const sorted = values.slice(15).sort((a, b) => a - b);
                return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)] };
            };
            const info = scene.graphicsDevice.gpuAdapter?.info;
            const report = {
                status: 'passed',
                label,
                version,
                date: new Date().toISOString(),
                userAgent: navigator.userAgent,
                deviceType: scene.graphicsDevice.deviceType,
                width: mainTarget.width,
                height: mainTarget.height,
                splats: splats.length,
                cameraPosition: [position.x, position.y, position.z],
                projection: Array.from(scene.camera.camera.projectionMatrix.data),
                readyForCaptureMs,
                cpu: summarize(cpu),
                gpu: summarize(gpu),
                adapter: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : scene.graphicsDevice.unmaskedRenderer,
                backend: scene.splatRenderCapabilities?.resolvedMode ?? 'ProjectedSplatRenderer',
                note: '4 Gaussianの小素材。CPUはupdate完了後からpostrenderまで。性能優劣の判定には使わない。'
            };
            await save(`baseline-${label}.json`, JSON.stringify(report, null, 2));
            status.textContent = `${label}: 完了\nCPU ${report.cpu.median.toFixed(3)} ms / GPU ${report.gpu.median.toFixed(3)} ms`;
        } catch (error) {
            status.textContent = `${label}: 失敗 ${error}`;
            await save(`baseline-${label}.json`, JSON.stringify({ status: 'failed', error: String(error) }));
        }
    };
    run().catch((error) => {
        status.textContent = `${label}: 結果の記録に失敗 ${error}`;
    });
};
