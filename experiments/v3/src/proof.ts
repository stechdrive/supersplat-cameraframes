import { ZipReadFileSystem, type ZipFileSystem } from '@playcanvas/splat-transform';
import { Asset, Entity, Mat4, Quat, Vec3, version as engineVersion } from 'playcanvas';

import { capture, nextFrame, png, straightPixels } from './capture';
import { makeGlb, makePly } from './fixtures';
import { exportMaskPsd } from './mask-psd';
import { resolveView, type FrameComposition, type RenderView, type ShotCamera } from './render-view';
import type { EditHistory } from '../edit-history';
import { AddSplatOp, RemoveInstancesOp, SelectOp, SplatsTransformOp } from '../edit-ops';
import type { Events } from '../events';
import { IndexRanges } from '../index-ranges';
import { BlobReadSource } from '../io';
import type { Scene } from '../scene';
import type { Splat } from '../splat';

const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
};
const difference = (a: ArrayLike<number>, b: ArrayLike<number>) => {
    assert(a.length === b.length, `配列長が不一致: ${a.length}/${b.length}`);
    let max = 0;
    let total = 0;
    for (let i = 0; i < a.length; i++) {
        const error = Math.abs(a[i] - b[i]);
        max = Math.max(max, error);
        total += error;
    }
    return { max, mean: total / a.length };
};
const crop = (pixels: Uint8Array, width: number, x: number, y: number, w: number, h: number) => {
    const result = new Uint8Array(w * h * 4);
    for (let row = 0; row < h; row++) result.set(pixels.subarray(((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4), row * w * 4);
    return result;
};
const sample = (pixels: Uint8Array, width: number, x: number, y: number) => Array.from(pixels.subarray((Math.floor(y) * width + Math.floor(x)) * 4, (Math.floor(y) * width + Math.floor(x)) * 4 + 4));
const over = (front: number[], back: number[]) => front.map((v, c) => v + back[c] * (1 - front[3] / 255));
const artifact = async (name: string, data: Blob | Uint8Array | string) => {
    const body = data instanceof Uint8Array ? new Blob([new Uint8Array(data)]) : data;
    const response = await fetch(`/__proof/artifact/${encodeURIComponent(name)}`, { method: 'POST', body });
    if (!response.ok) throw new Error(`検証結果の保存に失敗: ${name}`);
};

export const installProof = (scene: Scene, events: Events, history: EditHistory) => {
    let shot: ShotCamera = { id: 'shot-a', position: [0, 0, 5], rotation: [0, 0, 0, 1], projection: 'perspective', fovY: 50, orthoHalfHeight: 2, near: 0.1, far: 100 };
    let frame: FrameComposition = { width: 320, height: 240, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0 };
    let model: Entity | undefined;
    let modelAsset: Asset | undefined;
    let glbFile: File | undefined;
    const gpuErrors: string[] = [];
    const device = scene.graphicsDevice as any;
    device.wgpu?.addEventListener('uncapturederror', (event: any) => gpuErrors.push(event.error.message));
    const splats = () => events.invoke('scene.allSplats') as Splat[];

    const loadGlb = async (file: File) => {
        model?.destroy();
        if (modelAsset) {
            modelAsset.unload();
            scene.app.assets.remove(modelAsset);
        }
        const url = URL.createObjectURL(file);
        try {
            const asset = new Asset(file.name, 'container', { url, filename: file.name });
            scene.app.assets.add(asset);
            await new Promise<void>((resolve, reject) => {
                asset.ready(() => resolve());
                asset.once('error', reject);
                scene.app.assets.load(asset);
            });
            model = (asset.resource as any).instantiateRenderEntity();
            for (const component of model!.findComponents('render') as any[]) component.layers = [scene.worldLayer.id];
            scene.contentRoot.addChild(model!);
            modelAsset = asset;
            glbFile = file;
            scene.forceRender = true;
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    events.function('proof.doc.serialize', () => ({ cameraFramesProof: { version: 1, shot, frame, glb: glbFile ? 'proof/plane.glb' : null } }));
    events.function('proof.doc.writeAssets', async (zip: ZipFileSystem) => {
        if (glbFile) {
            const writer = await zip.createWriter('proof/plane.glb');
            await writer.write(new Uint8Array(await glbFile.arrayBuffer()));
            await writer.close();
        }
    });
    events.function('proof.doc.deserialize', async (extensions: any, zip: ZipReadFileSystem) => {
        const extension = extensions?.cameraFramesProof;
        if (!extension || extension.version !== 1) throw new Error('この実証には cameraFramesProof v1 が必要です');
        const view = resolveView(extension.shot, extension.frame);
        shot = structuredClone(view.shot);
        frame = structuredClone(view.composition);
        model?.destroy();
        model = undefined;
        if (extension.glb) {
            const source = await zip.createSource(extension.glb);
            const bytes = await source.read().readAll();
            source.close();
            await loadGlb(new File([new Uint8Array(bytes)], 'plane.glb'));
        }
        scene.camera.setShotView(view);
    });

    const panel = document.createElement('section');
    panel.id = 'v3-proof';
    panel.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:10000;padding:16px;background:#18212ef5;color:#e8f0ff;border:1px solid #617089;border-radius:8px;max-width:620px;max-height:45vh;overflow:auto;font:13px/1.6 sans-serif;';
    const button = document.createElement('button');
    button.textContent = 'v3 実証を実行';
    const log = document.createElement('pre');
    log.style.cssText = 'white-space:pre-wrap;margin:8px 0 0';
    log.textContent = '固定基盤: SuperSplat 3.0.0 / 撮影カメラ・GLBマスク';
    panel.append(button, log);
    document.body.append(panel);

    const show = (view = resolveView(shot, frame)) => {
        const width = scene.targetSize.width;
        const height = scene.targetSize.height;
        const scale = Math.min(width * 0.65 / view.outputSize.width, height * 0.65 / view.outputSize.height);
        const displayed = resolveView(shot, frame, {
            width,
            height,
            gate: { x: (width - view.outputSize.width * scale) / 2, y: (height - view.outputSize.height * scale) / 2, width: view.outputSize.width * scale, height: view.outputSize.height * scale }
        });
        scene.camera.setShotView(displayed);
        return displayed;
    };

    button.onclick = async () => {
        button.disabled = true;
        log.textContent = '';
        const results: { name: string; detail: unknown }[] = [];
        const passed = (name: string, detail: unknown = true) => {
            results.push({ name, detail });
            log.textContent += `PASS ${name}\n`;
        };
        const saveImage = async (name: string, pixels: Uint8Array, view: RenderView) => artifact(name, await png(straightPixels(pixels), view.size.width, view.size.height));
        try {
            frame = { ...frame, scaleX: 1, scaleY: 1 };
            events.fire('view.setStochastic', 'disabled');
            events.fire('view.setBands', 0);
            scene.camera.tonemapping = 'linear';
            model?.destroy();
            model = undefined;
            glbFile = undefined;
            events.fire('scene.clear');
            await history.clear();
            const started = performance.now();
            for (const side of ['red', 'blue'] as const) {
                const file = makePly(side);
                await artifact(file.name, file);
                await events.invoke('import', [{ filename: file.name, contents: file }]);
            }
            await scene.commandQueue.enqueue(() => {});
            const [red, blue] = splats();
            assert(splats().length === 2, '2つのSplatを読み込めませんでした');
            red.move(new Vec3(), new Quat());
            blue.move(new Vec3(), new Quat());
            const loadMs = performance.now() - started;
            const base = resolveView(shot, frame);
            const initial = await capture(scene, base);
            await saveImage('01-two-splats.png', initial, base);
            blue.visible = false;
            const onlyRed = await capture(scene, base);
            blue.visible = true;
            red.visible = false;
            const onlyBlue = await capture(scene, base);
            red.visible = true;
            const focal = 120 / Math.tan(25 * Math.PI / 180);
            const points = [-1, 1].map(sign => ({ x: 160 + sign * 0.13 * focal, y: 120 - 0.055 * focal }));
            const orderErrors = points.map((point, index) => {
                const a = sample(onlyRed, 320, point.x, point.y);
                const b = sample(onlyBlue, 320, point.x, point.y);
                return difference(sample(initial, 320, point.x, point.y), index === 0 ? over(a, b) : over(b, a));
            });
            assert(orderErrors.every(error => error.max <= 2), `複数Splatの前後関係が不一致: ${JSON.stringify(orderErrors)}`);
            assert(points.every(point => sample(initial, 320, point.x, point.y)[3] > 150), 'Splat画像が空です');
            assert(sample(initial, 320, points[0].x, points[0].y)[0] > sample(initial, 320, points[0].x, points[0].y)[2], '左の赤いSplatが前面ではありません');
            assert(sample(initial, 320, points[1].x, points[1].y)[2] > sample(initial, 320, points[1].x, points[1].y)[0], '右の青いSplatが前面ではありません');
            passed('複数Splatの左右で逆転する深度順', { orderErrors, loadMs });

            frame = { ...frame, scaleX: 1.5 };
            const expanded = resolveView(shot, frame);
            const wider = await capture(scene, expanded);
            const expansionError = difference(initial, crop(wider, 480, 0, 0, 320, 240));
            assert(expansionError.max <= 2, `右拡張で基準画像が変化: ${JSON.stringify(expansionError)}`);
            const preview = resolveView(shot, frame, { width: 640, height: 480, gate: { x: 51, y: 37, width: 480, height: 240 } });
            const previewImage = await capture(scene, preview);
            const previewError = difference(wider, crop(previewImage, 640, 51, 37, 480, 240));
            assert(previewError.max <= 2, `preview/output が不一致: ${JSON.stringify(previewError)}`);
            await saveImage('02-right-expanded.png', wider, expanded);
            await saveImage('03-preview.png', previewImage, preview);
            passed('右側フレーム拡張とpreview/output', { expansionError, previewError });

            const oldRadius = scene.camera.sceneRadius;
            for (const angles of [[90, 0, 0], [-90, 0, 0], [0, 0, 37], [0, 180, 0]]) {
                const q = new Quat().setFromEulerAngles(angles[0], angles[1], angles[2]);
                const changed = resolveView({ ...shot, position: [0, 0, 0], rotation: [q.x, q.y, q.z, q.w], fovY: 70 }, frame);
                scene.camera.setShotView(changed);
                scene.camera.sceneRadius = 10000;
                scene.camera.onUpdate(0);
                assert(scene.camera.mainCamera.getPosition().equals(Vec3.ZERO), 'sceneRadius/FOVで撮影位置が変化');
                assert(scene.camera.mainCamera.getRotation().equalsApprox(q, 1e-6), '撮影Quaternionが変化');
                assert(difference(scene.camera.displayTransform.data, scene.camera.mainCamera.getWorldTransform().data).max < 1e-6, '表示姿勢が撮影姿勢と不一致');
            }
            scene.camera.sceneRadius = oldRadius;
            scene.camera.setShotView(expanded);
            const restoredPose = await capture(scene, expanded);
            assert(difference(restoredPose, wider).max === 0, 'カメラ切替復帰で画像が変化');
            passed('値0・真上/真下・roll・FOV/sceneRadius・カメラ切替');

            // frame 完了前に別 view へ変更しても picker 自身が最新 view を再投影する。
            scene.camera.startOffscreenMode(640, 480);
            scene.camera.setShotView(preview);
            scene.camera.renderOverlays = false;
            scene.camera.picker.prepareId(red, 'set');
            const pickId = await scene.camera.picker.readId((51 + points[0].x) / 640, (37 + points[0].y) / 480);
            assert(pickId < red.instances.count, `レンズシフト下のpick失敗: ${pickId}`);
            await history.add(new SelectOp(red, 'set', new Uint32Array([pickId])));
            assert(red.numSelected === 1, '選択結果が反映されませんでした');
            await history.undo();
            assert(red.numSelected === 0, '選択Undo失敗');
            await history.redo();
            const clone = red.createLayer(IndexRanges.fromPredicate(red.instances.count, () => true), 'red-copy');
            await history.add(new AddSplatOp(scene, clone));
            assert(clone.resource === red.resource, '複製でresourceが共有されていません');
            await history.add(new RemoveInstancesOp(clone));
            assert(red.instances.count === 2 && clone.instances.count === 1, '複製側の削除が元を破壊しました');
            await history.undo();
            assert(clone.instances.count === 2, '削除Undo失敗');
            await history.redo();
            await history.add(new SplatsTransformOp({
                splat: red,
                transform: new Mat4().setTranslate(0.1, 0, 0),
                paletteMap: new Map([[red.instances.transformIndex(pickId), red.transformPalette.size]])
            }));
            clone.visible = false;
            scene.camera.endOffscreenMode();
            scene.camera.setShotView(expanded);
            passed('最新viewのGPU pick・選択Undo/Redo・共有resourceの片側編集', { pickId });

            await loadGlb(makeGlb());
            const composite = await capture(scene, expanded);
            red.visible = false;
            blue.visible = false;
            const source = await capture(scene, expanded);
            await saveImage('05-glb-original.png', source, expanded);
            assert(source.some((value, index) => index % 4 === 3 && value === 255), 'GLB元画像が空です');
            red.visible = true;
            blue.visible = true;
            const front = await capture(scene, expanded, 'front-alpha');
            const recomposed = new Uint8Array(front.length);
            for (let i = 0; i < front.length; i += 4) {
                for (let c = 0; c < 4; c++) recomposed[i + c] = Math.min(255, Math.round(front[i + c] + source[i + c] * (1 - front[i + 3] / 255)));
            }
            const compositeError = difference(composite, recomposed);
            assert(compositeError.max <= 2, `GLB深度alphaの合成が不一致: ${JSON.stringify(compositeError)}`);
            red.visible = false;
            const blueDepth = await capture(scene, expanded, 'front-alpha');
            red.visible = true;
            const backAlpha = sample(blueDepth, 480, points[0].x, points[0].y)[3];
            const frontAlpha = sample(blueDepth, 480, points[1].x, points[1].y)[3];
            assert(backAlpha === 0 && frontAlpha > 100, `GLB前後を分離できていません: ${backAlpha}/${frontAlpha}`);
            const psd = exportMaskPsd(source, front, composite, 480, 240);
            assert(psd.maxSourceError === 0 && psd.maxMaskError === 0, 'PSD再読込で元画像またはマスクが変化');
            await artifact('04-composite.png', await png(straightPixels(composite), 480, 240));
            await artifact('05-glb-original.png', await png(psd.raw, 480, 240));
            await artifact('06-glb-mask.png', await png(psd.mask, 480, 240));
            await artifact('07-front-splats.png', await png(straightPixels(front), 480, 240));
            await artifact('glb-mask.psd', psd.bytes);
            passed('GLB深度を保持したalpha・元画像とPSDマスクの分離', { compositeError, backAlpha, frontAlpha, psdSourceError: psd.maxSourceError, psdMaskError: psd.maxMaskError });

            const before = splats().map(splat => ({ doc: splat.docSerialize(), count: splat.instances.count, flags: Array.from(splat.instances.flags.slice(0, splat.instances.count)), palette: Array.from(splat.instances.palette.slice(0, splat.instances.count)) }));
            const chunks: Uint8Array<ArrayBuffer>[] = [];
            const stream = {
                seek: (offset: number) => Promise.resolve(assert(offset === 0, '想定外のseek')),
                write: (bytes: Uint8Array) => {
                    chunks.push(new Uint8Array(bytes));
                    return Promise.resolve();
                },
                truncate: (length: number) => Promise.resolve(assert(length === chunks.reduce((sum, chunk) => sum + chunk.length, 0), '保存サイズ不一致')),
                close: async () => {},
                abort: () => Promise.reject(new Error('保存中断'))
            };
            await events.invoke('proof.doc.save', { stream });
            const file = new File(chunks, 'v3-proof.ssproj');
            await artifact(file.name, file);
            const zip = new ZipReadFileSystem(new BlobReadSource(file));
            const jsonSource = await zip.createSource('document.json');
            const doc = JSON.parse(new TextDecoder().decode(await jsonSource.read().readAll()));
            jsonSource.close();
            await zip.close();
            assert(doc.version === 1 && doc.resources.length === 2 && doc.splats.length === 3, 'resource/instance保存構造が不一致');
            assert(doc.extensions.cameraFramesProof.shot.position.join() === '0,0,5', '撮影姿勢が保存されませんでした');
            await events.invoke('proof.doc.load', file);
            const after = splats().map(splat => ({ doc: splat.docSerialize(), count: splat.instances.count, flags: Array.from(splat.instances.flags.slice(0, splat.instances.count)), palette: Array.from(splat.instances.palette.slice(0, splat.instances.count)) }));
            assert(JSON.stringify(before) === JSON.stringify(after), '保存前後のinstance/選択/transform状態が不一致');
            assert(splats()[0].resource === splats()[2].resource, '再読込で共有resourceを失いました');
            const reloaded = await capture(scene, resolveView(shot, frame));
            const reloadError = difference(composite, reloaded);
            assert(reloadError.max <= 1, `保存再読込で描画が不一致: ${JSON.stringify(reloadError)}`);
            await saveImage('08-reloaded.png', reloaded, expanded);
            passed('本家v1保存・共有resourceとinstance・撮影構図/GLB/編集状態の再読込', { bytes: file.size, resources: doc.resources.length, reloadError });

            const displayed = show();
            const savedGizmo = scene.gizmoLayer.enabled;
            const savedCenters = scene.centersLayer.enabled;
            scene.gizmoLayer.enabled = false;
            scene.centersLayer.enabled = false;
            scene.camera.renderOverlays = false;
            await nextFrame(scene);
            const screenPixels = new Uint8Array(displayed.size.width * displayed.size.height * 4);
            scene.dataProcessor.copyRt(scene.camera.mainTarget, scene.camera.workTarget);
            await scene.camera.workTarget.colorBuffer.read(0, 0, displayed.size.width, displayed.size.height, {
                renderTarget: scene.camera.workTarget, data: screenPixels, immediate: true
            });
            const screenError = difference(screenPixels, await capture(scene, displayed));
            scene.gizmoLayer.enabled = savedGizmo;
            scene.centersLayer.enabled = savedCenters;
            assert(screenError.max <= 2, `画面描画と同じviewのoffscreen描画が不一致: ${JSON.stringify(screenError)}`);
            passed('画面描画と同じviewのoffscreen出力', { size: displayed.size, screenError });
            events.fire('view.setPerfOverlay', true);
            for (let i = 0; i < 45; i++) await nextFrame(scene);
            events.fire('view.setPerfOverlay', false);
            const timings = scene.frameTimings;
            const values = (numbers: number[]) => {
                const sorted = numbers.slice(-30).sort((a, b) => a - b);
                return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)] };
            };
            assert(gpuErrors.length === 0, `WebGPU検証エラー: ${gpuErrors.join('\n')}`);
            const info = device.gpuAdapter?.info;
            passed('WebGPUエラーなし', { adapter: info ? { vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description } : null, engineVersion });
            const report = {
                status: 'passed',
                date: new Date().toISOString(),
                userAgent: navigator.userAgent,
                engineVersion,
                results,
                gpuErrors,
                smallFixtureTimings: { cpu: values(timings.cpu), gpu: values(timings.gpu), gpuSupported: timings.gpuSupported, width: timings.width, height: timings.height, stats: events.invoke('splat.projectedRendererStats') },
                limitations: ['単純な不透明GLB 1個・MSAA 1・sorted描画', 'PSDはGLBマスク素材。全シーンの汎用レイヤー再合成は未実証', '旧ssproj/sscam/timeline互換・断面・大容量・実素材性能・PWA更新は未実証']
            };
            await artifact('report.json', JSON.stringify(report, null, 2));
            panel.dataset.status = 'passed';
            log.textContent += '結果: .v3-proof/results/report.json\n';
        } catch (error) {
            const message = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
            panel.dataset.status = 'failed';
            log.textContent += `FAIL ${message}`;
            await artifact('report.json', JSON.stringify({ status: 'failed', results, error: message, gpuErrors }, null, 2));
            console.error(error);
        } finally {
            button.disabled = false;
        }
    };
    if (new URLSearchParams(window.location.search).has('run')) button.click();
};
