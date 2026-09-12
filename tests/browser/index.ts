import '../../src/ui/scss/style.scss';
import { MemoryFileSystem, createChunkDataPool, type ChunkLayer } from '@playcanvas/splat-transform';
import { readPsd } from 'ag-psd';
import { Quat, Vec3, version as engineVersion } from 'playcanvas';

import { makeGlb, makePly } from '../../experiments/v3/src/fixtures';
import type { Camera } from '../../src/camera';
import type { CameraViews } from '../../src/cameras/camera-views';
import { main } from '../../src/main';
import type { Model } from '../../src/model';
import type { Scene } from '../../src/scene';
import type { Splat } from '../../src/splat';

const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error(message);
};
const nextFrame = (scene: Scene) => new Promise<void>((resolve, reject) => {
    const pending: { timer?: ReturnType<typeof setTimeout> } = {};
    const handle = scene.events.on('postrender', () => {
        clearTimeout(pending.timer); handle.off(); resolve();
    });
    pending.timer = setTimeout(() => { handle.off(); reject(new Error('描画が完了しませんでした')); }, 15000);
    scene.forceRender = true;
});
const difference = (a: Uint8Array, b: Uint8Array) => {
    assert(a.length === b.length, '画像サイズが不一致');
    let max = 0;
    let total = 0;
    for (let i = 0; i < a.length; i++) {
        const delta = Math.abs(a[i] - b[i]);
        max = Math.max(max, delta);
        total += delta;
    }
    return { max, mean: total / a.length };
};
const readView = async (scene: Scene, camera: Camera) => {
    const { width, height } = camera.targetSize;
    const data = new Uint8Array(width * height * 4);
    scene.dataProcessor.copyRt(camera.mainTarget, camera.workTarget);
    await camera.workTarget.colorBuffer.read(0, 0, width, height, { renderTarget: camera.workTarget, data, immediate: true });
    return data;
};
const savePng = async (name: string, pixels: Uint8Array, width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const image = new ImageData(width, height);
    image.data.set(pixels);
    canvas.getContext('2d').putImageData(image, 0, 0);
    const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob(resolve);
    });
    await fetch(`/__result/${name}.png`, { method: 'POST', body: blob });
};

const sourceDigest = async (splat: Splat) => {
    const source = splat.resource.source;
    const pool = createChunkDataPool({ chunkSize: 65536 });
    const hashes: string[] = [];
    try {
        for (let at = 0; at < source.meta.numGaussians; at += 65536) {
            const count = Math.min(65536, source.meta.numGaussians - at);
            const indices = Uint32Array.from({ length: count }, (_, i) => at + i);
            const buffers = Object.fromEntries((['position', 'geometric', 'color'] as ChunkLayer[])
            .map(layer => [layer, pool.acquire(layer, source.meta.layouts[layer], count)]));
            await source.read({ indices, indexOffset: 0, count, ...buffers });
            for (const [layer, buffer] of Object.entries(buffers)) {
                const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(buffer.data, 0, count * source.meta.layouts[layer as ChunkLayer].stride));
                hashes.push([...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join(''));
                buffer.release();
            }
        }
        return hashes.join('');
    } finally { pool.destroy(); }
};

main().then(() => {
    const scene = window.scene;
    const events = scene.events;
    const views = events.invoke('cameraViews') as CameraViews;
    const errors: string[] = [];
    (scene.graphicsDevice as any).wgpu.addEventListener('uncapturederror', (event: any) => {
        if (errors.length < 10) errors.push(event.error.message);
    });
    const button = document.createElement('button');
    button.textContent = '移行検証を実行';
    button.id = 'run-migration-tests';
    const log = document.createElement('pre');
    log.id = 'migration-test-status';
    log.style.cssText = 'margin:4px 0;max-height:240px;overflow:auto';
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:90px;left:25px;z-index:1000;background:#20252a;color:white;padding:10px;font:12px monospace;max-width:70vw';
    panel.append(button, log);
    document.body.appendChild(panel);
    const legacyButton = document.createElement('button');
    legacyButton.textContent = 'ローカル旧プロジェクトを検証';
    legacyButton.id = 'run-legacy-tests';
    panel.prepend(legacyButton);
    legacyButton.onclick = async () => {
        legacyButton.disabled = true;
        log.textContent = '旧プロジェクト読込中\n';
        try {
            const response = await fetch('/__legacy/project.ssproj');
            assert(response.ok, 'ローカル旧素材がありません');
            const file = new File([await response.blob()], 'test_ape100.ssproj');
            const started = performance.now();
            const loaded = await events.invoke('doc.loadFile', file);
            assert(loaded, '旧プロジェクトの読込失敗');
            views.store.setWorkspace({ ...structuredClone(views.store.views), activePaneId: 'shot', split: true });
            await nextFrame(scene);
            const record = views.store.state.cameras[0];
            const source = loaded.cameraFrames.mainCameraPose.fpvPosition;
            assert(record.camera.position.every((value, i) => Math.abs(value - [source.x, source.y, source.z][i]) < 1e-8), '旧FPV姿勢が変化');
            const splats = events.invoke('scene.allSplats') as Splat[];
            log.textContent += `PASS 旧撮影位置・${splats.reduce((sum, splat) => sum + splat.instances.count, 0)} Gaussian 読込 (${Math.round(performance.now() - started)}ms)\n`;
            const output = await events.invoke('shotCameras.capture', record.id, 'png');
            assert(output.blob.size > 10000, '旧プロジェクトのPNG出力が空');
            await fetch('/__result/legacy-output.png', { method: 'POST', body: output.blob });
            const repeated = await events.invoke('shotCameras.capture', record.id, 'png');
            const repeatDelta = difference(output.composite, repeated.composite);
            log.textContent += `同じデータの連続描画差 ${JSON.stringify(repeatDelta)}\n`;
            log.textContent += '全Gaussianの位置・形状・色を照合用に記録中\n';
            const rawBefore = await sourceDigest(splats[0]);
            log.textContent += '旧素材を新形式パッケージへ保存中\n';
            assert((await fetch('/__large/project.ssproj', { method: 'PUT' })).ok, '大容量検証ファイルを作れません');
            let packageBytes = 0;
            const writer = {
                get bytesWritten() { return packageBytes; },
                async write(bytes: Uint8Array) {
                    for (let at = 0; at < bytes.length; at += 4 * 1024 * 1024) {
                        const chunk = bytes.subarray(at, at + 4 * 1024 * 1024);
                        assert((await fetch('/__large/project.ssproj', { method: 'PATCH', body: new Uint8Array(chunk) })).ok, '大容量検証ファイルの書込失敗');
                        packageBytes += chunk.length;
                    }
                },
                close() {}
            };
            const state = JSON.stringify(views.store.state);
            assert(await events.invoke('doc.writeTo', writer), '旧素材の新パッケージ保存失敗');
            log.textContent += `新形式再読込中 (${Math.round(packageBytes / 1024 / 1024)} MiB)\n`;
            const savedFile = new File([await (await fetch('/__large/project.ssproj')).blob()], 'legacy-roundtrip.ssproj');
            assert(await events.invoke('doc.loadFile', savedFile), '旧素材の新パッケージ再読込失敗');
            assert(JSON.stringify(views.store.state) === state, '旧素材の撮影状態が保存再読込で変化');
            const reloaded = await events.invoke('shotCameras.capture', record.id, 'png');
            await fetch('/__result/legacy-reloaded.png', { method: 'POST', body: reloaded.blob });
            const delta = difference(output.composite, reloaded.composite);
            const rawAfter = await sourceDigest((events.invoke('scene.allSplats') as Splat[])[0]);
            const sourceExact = rawBefore === rawAfter;
            log.textContent += `位置・形状・色の全Float32ビット一致: ${sourceExact}; 再読込描画差 ${JSON.stringify(delta)}\n`;
            await fetch('/__result/legacy-report.json', { method: 'POST', body: JSON.stringify({ repeatDelta, delta, sourceExact, packageBytes }, null, 2) });
            assert(sourceExact, '旧素材の保存再読込でGaussianの値が変化');
            // Dense scenes also vary on consecutive captures of unchanged data.
            // Require bit-exact source values and no material increase over that
            // measured rendering variation; keep the small fixture's <=1 check.
            assert(delta.mean <= repeatDelta.mean * 1.5 + 1 / 255, `保存再読込の差が連続描画の揺らぎを超過: ${JSON.stringify(delta)}`);
            log.textContent += `PASS 旧素材の新形式保存・再読込 全Gaussianビット一致・描画差は連続描画と同程度\n`;
            assert(errors.length === 0, `WebGPUエラー: ${errors.join('\n')}`);
            log.textContent += `PASS 旧プロジェクトのPNG ${output.width}×${output.height}・WebGPU error 0\n完了`;
        } catch (error) {
            log.textContent += `FAIL ${error.stack ?? error}`;
        } finally { legacyButton.disabled = false; }
    };
    button.onclick = async () => {
        button.disabled = true;
        log.textContent = '検証中\n';
        const results: unknown[] = [];
        const pass = (name: string, detail?: unknown) => {
            results.push({ name, detail });
            log.textContent += `PASS ${name}\n`;
        };
        try {
            events.fire('scene.clear');
            await scene.commandQueue.enqueue(() => {});
            events.fire('view.setStochastic', 'disabled');
            events.fire('view.setBands', 0);
            scene.grid.visible = false;
            scene.camera.renderOverlays = views.shot.renderOverlays = false;
            scene.camera.tonemapping = views.shot.tonemapping = 'linear';
            for (const side of ['red', 'blue'] as const) {
                const file = makePly(side);
                await events.invoke('import', [{ filename: file.name, contents: file }]);
            }
            const splats = events.invoke('scene.allSplats') as Splat[];
            assert(splats.length === 2, '複数Splatの読込失敗');
            for (const splat of splats) splat.move(new Vec3(), new Quat());
            const [red] = splats;
            await events.invoke('shotCameras.edit', (document: any) => {
                const record = document.cameras[0];
                record.camera.position = [0, 0, 5];
                record.camera.rotation = [0, 0, 0, 1];
                record.camera.near = 0.1;
                record.camera.far = 100;
                record.composition = { width: 320, height: 240, scaleX: 1, scaleY: 1, anchorX: 0, anchorY: 0 };
                record.frames.forEach((frame: any) => {
                    frame.baseSize = { w: 160, h: 90 };
                });
            });
            views.store.setWorkspace({ ...structuredClone(views.store.views), split: true, activePaneId: 'editor' });
            scene.camera.setPose(new Vec3(0, 0, 5), new Vec3(), 0);
            scene.camera.fov = 50;
            await nextFrame(scene);
            const editorBefore = await readView(scene, scene.camera);
            const shotBefore = await readView(scene, views.shot);
            assert(shotBefore.some((value, i) => i % 4 === 3 && value > 150), '撮影カメラ画像が空です');
            const sourceBytes = scene.projectedSplatRenderer.stats.sourceBytes;
            assert(sourceBytes === views.shot.projector.stats.sourceBytes, '参照しているsourceサイズが不一致');
            pass('2ビューと共有Splat', { sourceBytes, editor: scene.camera.targetSize, shot: views.shot.targetSize });

            const cameraId = views.store.state.outputCameraId;
            await events.invoke('shotCameras.edit', (document: any) => {
                document.cameras[0].camera.position[0] = 0.6;
            });
            await nextFrame(scene);
            const editorAfter = await readView(scene, scene.camera);
            const shotAfter = await readView(scene, views.shot);
            const editorDelta = difference(editorBefore, editorAfter);
            const shotDelta = difference(shotBefore, shotAfter);
            assert(editorDelta.max === 0, `撮影カメラ移動がviewport画像へ混入: ${JSON.stringify(editorDelta)}`);
            assert(shotDelta.max > 20, '撮影カメラ移動が画像に反映されません');
            pass('view間の投影・sort資源の独立', { editorDelta, shotDelta });
            await events.invoke('shotCameras.edit', (document: any) => {
                document.cameras[0].camera.position[0] = 0;
            });
            await nextFrame(scene);
            const restored = await readView(scene, views.shot);
            assert(difference(shotBefore, restored).max === 0, '撮影カメラ復帰で画像が変化');

            events.fire('selection', red);
            for (const paneId of ['editor', 'shot']) {
                views.store.setWorkspace({ ...structuredClone(views.store.views), activePaneId: paneId });
                await nextFrame(scene);
                const camera = views.activeCamera;
                const point = new Vec3();
                camera.worldToScreen(new Vec3(-0.52, 0.22, 1), point);
                camera.pickPrep(red, 'set');
                const id = await camera.pick(point.x, point.y);
                assert(id < red.instances.count, `${paneId}のpick位置が不一致: ${id}`);
                for (const [depth, footprint] of [[false, 0], [false, 1], [true, 1]] as const) {
                    events.fire('selection.setUseDepth', depth);
                    events.fire('selection.setFootprint', footprint);
                    await events.invoke('select.rect', 'set', { start: { x: point.x - 0.01, y: point.y - 0.01 }, end: { x: point.x + 0.01, y: point.y + 0.01 } });
                    await scene.commandQueue.enqueue(() => {});
                    assert(red.numSelected === 1, `${paneId}の選択が不一致: depth=${depth}, footprint=${footprint}, count=${red.numSelected}`);
                }
                pass(`${paneId}のpick・centers・footprint・depth選択`);
            }
            const outputBefore = JSON.stringify(events.invoke('shotCameras.outputView', cameraId));
            const documentBefore = JSON.stringify(views.store.state);
            const workspace = structuredClone(views.store.views);
            workspace.panes[1].zoom = 1.4;
            workspace.panes[1].pan = { x: 27, y: -19 };
            views.store.setWorkspace(workspace);
            scene.camera.setAzimElev(45, -30, 0);
            await nextFrame(scene);
            assert(JSON.stringify(views.store.state) === documentBefore, '観察操作で撮影データが変化');
            assert(JSON.stringify(events.invoke('shotCameras.outputView', cameraId)) === outputBefore, 'preview操作で出力が変化');
            pass('viewport操作とpreview倍率・panから撮影出力を分離');

            // Exercise the same import / picker paths used by the editor UI.
            const glb = makeGlb();
            await events.invoke('import', [{ filename: glb.name, contents: glb }]);
            assert(events.invoke('mesh.list').length === 1, 'GLB読込失敗');
            scene.camera.setPose(new Vec3(0, 0, 5), new Vec3(), 0);
            workspace.panes[1].zoom = 1;
            workspace.panes[1].pan = { x: 0, y: 0 };
            views.store.setWorkspace(workspace);
            await nextFrame(scene);
            for (const camera of [scene.camera, views.shot]) {
                const front = new Vec3(); const back = new Vec3();
                camera.worldToScreen(new Vec3(-0.52, 0.22, 1), front);
                camera.worldToScreen(new Vec3(0.78, 0.33, -1), back);
                const local = camera.localPoint(back.x, back.y);
                const mesh = await camera.picker.readMesh(local.x, local.y);
                log.textContent += `MESH ${JSON.stringify({ found: !!mesh.mesh, id: mesh.id, count: mesh.count })}\n`;
                await savePng(camera === scene.camera ? 'glb-editor' : 'glb-shot', await readView(scene, camera), camera.targetSize.width, camera.targetSize.height);
                camera.pickPrep(red, 'set');
                const ids = [await camera.pick(front.x, front.y), await camera.pick(back.x, back.y)];
                assert(ids[0] < red.instances.count && ids[1] === 0xffffffff, `GLB遮蔽pick: ${ids}`);
            }
            pass('GLBの標準深度で両ペインの前後Splatを選択');

            const pattern = document.createElement('canvas');
            pattern.width = 320; pattern.height = 240;
            const ctx = pattern.getContext('2d');
            const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
            colors.forEach((color, i) => {
                ctx.fillStyle = color; ctx.fillRect(i % 2 * 160, Math.floor(i / 2) * 120, 160, 120);
            });
            const patternBlob = await new Promise<Blob>((resolve) => {
                pattern.toBlob(resolve);
            });
            const editorReferenceBefore = await readView(scene, scene.camera);
            await events.invoke('referenceImages.addBlob', patternBlob, 'quadrants.png', { group: 'front' });
            await scene.commandQueue.enqueue(() => {});
            const referenceId = events.invoke('referenceImages.state').items[0].id;
            events.fire('referenceImages.update', referenceId, { opacity: 1 });
            await scene.commandQueue.enqueue(() => {});
            await nextFrame(scene);
            await nextFrame(scene);
            const referencePixels = await readView(scene, views.shot);
            const mapping = events.invoke('cameraFrames.viewportMapping');
            const { width: rw, height: rh } = views.shot.targetSize;
            await savePng('reference-shot', referencePixels, rw, rh);
            assert(difference(editorReferenceBefore, await readView(scene, scene.camera)).max === 0, '下絵がviewportへ混入');
            const exportedReferences = await events.invoke('referenceImages.renderExportLayers', 320, 240);
            assert(exportedReferences.length === 1, '下絵の出力レイヤーが欠落');
            assert(events.invoke('referenceImages.state').items[0].opacity === 1, '下絵の不透明度変更が未反映');
            const expectedColors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]];
            expectedColors.forEach((expected, i) => {
                const rect = mapping.rectPxRaw;
                const x = Math.floor(rect.x + rect.w * (i % 2 ? 0.75 : 0.25));
                const y = Math.floor(rect.y + rect.h * (i < 2 ? 0.25 : 0.75));
                const sample = referencePixels.slice((y * rw + x) * 4, (y * rw + x) * 4 + 4);
                assert(expected.every((value, c) => Math.abs(sample[c] - value) <= 1) && sample[3] === 255, `下絵の向き/色/alphaが不一致: ${sample}`);
            });
            pass('下絵を撮影ビューと出力レイヤーに接続', { mapping, bounds: exportedReferences[0].bounds });

            await events.invoke('shotCameras.edit', (document: any) => {
                const record = document.cameras[0];
                record.settings.exportReferenceImages = false;
                record.settings.exportModelLayers = true;
                record.frames = [];
            });
            const poseBeforeExport = JSON.stringify(scene.camera.docSerialize());
            const stateBeforeExport = JSON.stringify(views.store.state);
            const png = await events.invoke('shotCameras.capture', cameraId, 'png');
            assert(png.blob.size > 300 && png.width === 320 && png.height === 240, 'PNG出力が不正');
            const psd = await events.invoke('shotCameras.capture', cameraId, 'psd');
            const decodedPsd = readPsd(await psd.blob.arrayBuffer(), { useImageData: true });
            const modelLayer = decodedPsd.children.find(layer => layer.name === 'plane.glb');
            assert(modelLayer?.imageData && modelLayer.mask?.imageData, 'PSDのGLB元画像/マスクが欠落');
            assert(modelLayer.mask.imageData.data.some((value, i) => i % 4 === 0 && value > 0 && value < 220), 'PSDのGaussian遮蔽マスクが空');
            assert(modelLayer.imageData.data.some((value, i) => i % 4 === 3 && value === 255), 'GLB元画像のalphaが遮蔽で変化');
            assert(JSON.stringify(views.store.state) === stateBeforeExport, '出力が撮影データを変更');
            assert(JSON.stringify(scene.camera.docSerialize()) === poseBeforeExport, '出力がviewport姿勢を変更');
            assert(scene.splatRenderers.size === 2, '出力projectorが解放されていません');
            await fetch('/__result/output.png', { method: 'POST', body: png.blob });
            await fetch('/__result/output.psd', { method: 'POST', body: psd.blob });
            pass('専用出力カメラのPNG/PSD・元GLBと独立マスク・資源解放', { pngBytes: png.blob.size, psdBytes: psd.blob.size });

            await events.invoke('shotCameras.edit', (document: any) => {
                document.cameras[0].settings.exportSplatLayers = true;
                document.cameras[0].settings.exportGridOverlay = true;
            });
            events.fire('eyeLevel.setVisible', true);
            const layered = await events.invoke('shotCameras.capture', cameraId, 'psd');
            const layers = readPsd(await layered.blob.arrayBuffer(), { useImageData: true }).children;
            const splatLayers = layers.filter(layer => splats.some(splat => splat.name === layer.name));
            assert(splatLayers.length === 2 && splatLayers.some(layer => layer.mask?.imageData), 'Splat別元画像/マスクが欠落');
            const gridLayer = layers.find(layer => layer.name === 'グリッド・アイレベル');
            assert(gridLayer?.imageData?.data.some((value, i) => i % 4 === 3 && value > 0), 'PSDガイドレイヤーが空');
            await events.invoke('shotCameras.edit', (document: any) => {
                document.cameras[0].settings.exportSplatLayers = false;
                document.cameras[0].settings.exportGridOverlay = false;
            });
            events.fire('eyeLevel.setVisible', false);
            pass('PSDのSplat別元画像・遮蔽マスク・グリッドとアイレベル');

            const foregroundFile = new File([makeGlb()], 'foreground.glb');
            await events.invoke('import', [{ filename: foregroundFile.name, contents: foregroundFile }]);
            const foreground = (events.invoke('mesh.list') as Model[]).find(model => model.name === foregroundFile.name);
            foreground.entity.setLocalPosition(0, 0, 0.8);
            foreground.entity.setLocalScale(0.4, 0.4, 0.4);
            const overlapping = await events.invoke('shotCameras.capture', cameraId, 'psd');
            const backgroundLayer = readPsd(await overlapping.blob.arrayBuffer(), { useImageData: true }).children.find(layer => layer.name === glb.name);
            assert(backgroundLayer.mask.imageData.data.some((value, i) => i % 4 === 0 && value === 0), '手前のGLBが背後GLBのマスクに含まれません');
            events.fire('mesh.remove', foreground);
            await scene.commandQueue.enqueue(() => {});
            pass('複数の不透明GLBの前後関係を独立PSDマスクへ反映');

            const originalComposition = structuredClone(views.store.get(cameraId).composition);
            for (const [anchorX, anchorY] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
                await events.invoke('shotCameras.edit', (document: any) => {
                    Object.assign(document.cameras[0].composition, { scaleX: 1.5, scaleY: 1.5, anchorX, anchorY });
                });
                const expanded = await events.invoke('shotCameras.capture', cameraId, 'png');
                const crop = new Uint8Array(png.composite.length);
                for (let y = 0; y < png.height; ++y) {
                    const offset = ((y + anchorY * (expanded.height - png.height)) * expanded.width + anchorX * (expanded.width - png.width)) * 4;
                    crop.set(expanded.composite.subarray(offset, offset + png.width * 4), y * png.width * 4);
                }
                assert(difference(crop, png.composite).max <= 1, `標準レンズシフトの構図が変化 ${anchorX},${anchorY}`);
            }
            await events.invoke('shotCameras.edit', (document: any) => { document.cameras[0].composition = originalComposition; });
            pass('標準レンズシフトによる四隅の拡張後も元領域のRGBAを維持');

            const mem = new MemoryFileSystem();
            const snapshotBefore = JSON.stringify({ camera: views.store.state,
                workspace: views.store.views,
                splats: splats.map(splat => ({ ...splat.docSerialize(), flags: [...splat.instances.flags.slice(0, splat.instances.count)] })),
                references: events.invoke('docSerialize.referenceImages') });
            assert(await events.invoke('doc.writeTo', mem.createWriter('scene.ssproj')), 'プロジェクト保存失敗');
            const projectFile = new File([mem.results.get('scene.ssproj') as BlobPart], 'synthetic-v3.ssproj');
            const loaded = await events.invoke('doc.loadFile', projectFile);
            assert(loaded, '保存プロジェクトの再読込失敗');
            const reloadedSplats = events.invoke('scene.allSplats') as Splat[];
            const snapshotAfter = JSON.stringify({ camera: views.store.state,
                workspace: views.store.views,
                splats: reloadedSplats.map(splat => ({ ...splat.docSerialize(), flags: [...splat.instances.flags.slice(0, splat.instances.count)] })),
                references: events.invoke('docSerialize.referenceImages') });
            assert(snapshotBefore === snapshotAfter, '保存再読込で撮影/選択/下絵状態が変化');
            assert(events.invoke('mesh.list').length === 1, 'GLBの再読込が欠落');
            const reloadedImage = await events.invoke('shotCameras.capture', cameraId, 'png');
            const reloadDelta = difference(png.composite, reloadedImage.composite);
            assert(reloadDelta.max <= 1, `保存再読込で出力が変化: ${JSON.stringify(reloadDelta)}`);
            await fetch('/__result/synthetic-v3.ssproj', { method: 'POST', body: projectFile });
            pass('本家v1資源と撮影カメラ・GLB・下絵・選択の保存再読込', { bytes: projectFile.size, reloadDelta });

            await events.invoke('shotCameras.edit', (document: any) => {
                document.cameras[0].camera.position[0] += 0.5;
                document.cameras[0].name = 'Working camera';
            });
            const workingCameras = JSON.stringify(views.store.state);
            assert(events.invoke('doc.status').dirty, '撮影変更が未保存状態にならない');
            assert(await events.invoke('doc.save'), 'ローカル作業保存失敗');
            assert(!events.invoke('doc.status').dirty && events.invoke('doc.status').packageDirty, '作業保存とパッケージ保存の状態が未分離');
            assert(await events.invoke('doc.loadFile', projectFile), '作業状態を伴う再読込失敗');
            assert(JSON.stringify(views.store.state) === workingCameras, 'ローカル作業状態の撮影変更が復元されない');
            assert(!events.invoke('doc.status').dirty && events.invoke('doc.status').packageDirty, '作業状態復元後の保存状態が不正');
            pass('軽量作業保存と同じパッケージからの作業状態復元');

            await events.invoke('shotCameras.edit', (document: any) => {
                const second = structuredClone(document.cameras[0]);
                second.id = second.camera.id = 'second'; second.name = 'Second camera';
                second.camera.position[1] += 2;
                document.cameras.push(second);
            });
            const firstBeforeGizmo = JSON.stringify(views.store.state.cameras[0]);
            const secondBeforeGizmo = JSON.stringify(views.store.get('second'));
            const viewportBeforeGizmo = JSON.stringify(scene.camera.docSerialize());
            events.fire('shotCameras.select', 'second');
            const pivot = events.invoke('pivot');
            const nextPosition = pivot.transform.position.clone().add(new Vec3(1, 0, 0));
            pivot.start();
            pivot.moveTRS(nextPosition, pivot.transform.rotation.clone(), Vec3.ONE);
            pivot.end();
            await scene.commandQueue.enqueue(() => {});
            assert(views.store.get('second').camera.position[0] === nextPosition.x, '撮影カメラgizmoの姿勢が未反映');
            assert(JSON.stringify(views.store.state.cameras[0]) === firstBeforeGizmo, '別の撮影カメラまで変化');
            assert(JSON.stringify(scene.camera.docSerialize()) === viewportBeforeGizmo, '撮影カメラgizmoがviewport姿勢を変更');
            events.fire('edit.undo');
            await scene.commandQueue.enqueue(() => {});
            assert(JSON.stringify(views.store.get('second')) === secondBeforeGizmo, '撮影カメラgizmoをUndoできない');
            const cameraFile = JSON.stringify(events.invoke('cameraSave.serialize'));
            const cameraState = JSON.stringify(views.store.state);
            await events.invoke('shotCameras.edit', (document: any) => { document.cameras.pop(); });
            await events.invoke('cameraSave.importBlob', new Blob([cameraFile]));
            assert(JSON.stringify(views.store.state) === cameraState, '.sscamで複数撮影カメラが復元されない');
            pass('撮影カメラgizmoの所有ID・Undo・複数カメラのsscam再読込');

            const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('camera-frames-v3-validation', { create: true });
            const handle = await directory.getFileHandle('overwrite.ssproj', { create: true });
            const stream = await handle.createWritable();
            await stream.write(projectFile); await stream.close();
            assert(await events.invoke('doc.loadFile', await handle.getFile(), handle), '上書き検証素材を開けない');
            const removed = (events.invoke('scene.allSplats') as Splat[])[1];
            events.fire('edit.add', { name: 'testRemoveLayer', splat: removed,
                do: () => scene.remove(removed), undo: () => scene.add(removed),
                destroy: () => { if (!removed.scene) removed.destroy(); } });
            await scene.commandQueue.enqueue(() => {});
            assert(await events.invoke('doc.writeHandle', handle), '同一ファイルへの保存失敗');
            events.fire('edit.undo');
            await scene.commandQueue.enqueue(() => {});
            const afterUndo = await events.invoke('shotCameras.capture', cameraId, 'png');
            assert(difference(afterUndo.composite, png.composite).max <= 1, '上書き後のUndoで削除したSplatの資源/描画が破損');
            assert(await events.invoke('doc.writeHandle', handle), 'Undo後の再保存失敗');
            const savedCameras = JSON.stringify(views.store.state);
            assert(await events.invoke('doc.loadFile', await handle.getFile(), handle), '上書きパッケージの再読込失敗');
            assert(JSON.stringify(views.store.state) === savedCameras, 'パッケージ保存後のカメラが変化');
            const afterOverwrite = await events.invoke('shotCameras.capture', cameraId, 'png');
            assert(difference(afterOverwrite.composite, png.composite).max <= 1, '上書き後の再読込で出力が変化');
            assert(!events.invoke('doc.status').dirty && !events.invoke('doc.status').packageDirty, '完全保存の後に未保存状態が残る');
            pass('実FileSystemFileHandleへの上書き・削除Undo・再保存・再読込');
            await savePng('split-editor', editorBefore, scene.camera.targetSize.width, scene.camera.targetSize.height);
            await savePng('split-shot', shotBefore, views.shot.targetSize.width, views.shot.targetSize.height);
            assert(errors.length === 0, `WebGPUエラー: ${errors.join('\n')}`);
            pass('WebGPU validation errorなし');
            const report = { date: new Date().toISOString(), engineVersion, results, errors };
            await fetch('/__result/report.json', { method: 'POST', body: JSON.stringify(report, null, 2) });
            log.textContent += '完了';
        } catch (error) {
            log.textContent += `FAIL ${error.stack ?? error}\n${errors.join('\n')}`;
            console.error(error);
        } finally {
            scene.camera.renderOverlays = views.shot.renderOverlays = true;
            scene.forceRender = true;
            button.disabled = false;
        }
    };
}).catch(console.error);
