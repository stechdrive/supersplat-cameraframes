import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inflateSync } from 'node:zlib';

import { loadTypeScript } from '../load-typescript.mjs';

const { readCameraFile } = loadTypeScript('src/camera-save.ts');
const { createCamera } = loadTypeScript('src/cameras/camera-store.ts');
const { legacyPreset, migrateLegacyCameras } = loadTypeScript('src/cameras/camera-legacy.ts');
const { decodeInstances } = loadTypeScript('src/doc-instances.ts');
const { encodePng } = loadTypeScript('src/png-writer.ts');
const { reconstructLayerMask } = loadTypeScript('src/cameras/layer-mask.ts');

test('PSD masks preserve source alpha and recover partial occlusion over lower layers', () => {
    const source = new Uint8Array([128, 0, 0, 128]);
    const lower = new Uint8Array([0, 0, 255, 255]);
    for (const fraction of [0, 0.25, 0.5, 1]) {
        const composite = new Uint8Array([Math.round(128 * fraction), 0, Math.round(255 - 128 * fraction), 255]);
        const mask = reconstructLayerMask(source, composite, lower);
        assert.ok(Math.abs(mask[0] - Math.round(255 * fraction)) <= 1);
        assert.equal(mask[3], 255);
        assert.equal(source[3], 128);
    }
    assert.deepEqual([...reconstructLayerMask(new Uint8Array(4), lower, lower)], [0, 0, 0, 255]);
    assert.throws(() => reconstructLayerMask(source, lower, new Uint8Array(3)));
});

test('sscam v4 round trip preserves multiple independent world cameras and rejects invalid data', () => {
    const a = createCamera('a');
    const b = createCamera('b');
    b.camera.position = [0, 4, -1];
    const payload = { type: 'supersplat.camera-frames.main-camera', version: 4,
        shotCameras: { version: 1, cameras: [a, b], outputCameraId: 'b' } };
    const loaded = readCameraFile(JSON.parse(JSON.stringify(payload)));
    assert.equal(loaded.outputCameraId, 'b');
    assert.deepEqual(loaded.cameras.map(camera => camera.camera.position), [a.camera.position, b.camera.position]);
    payload.shotCameras.cameras[1].camera.position[0] = Infinity;
    assert.throws(() => readCameraFile(payload));
    assert.throws(() => readCameraFile({ ...payload, version: 5 }));
});

test('legacy orbit positions respect framing lock and the original world scene radius', () => {
    const state = legacyPreset(createCamera('a'), true).cameraFramesState;
    state.mainCameraPose = { focalPoint: { x: 1, y: 2, z: 3 }, azim: 0, elev: 0,
        distance: 2, navMode: 'orbit', lockFraming: true };
    const context = { radius: 5, fovFactor: 0.5 };
    assert.deepEqual(migrateLegacyCameras(state, context).cameras[0].camera.position, [1, 2, 13]);
    state.mainCameraPose.lockFraming = false;
    assert.deepEqual(migrateLegacyCameras(state, context).cameras[0].camera.position, [1, 2, 23]);
});

test('instance reader rejects truncated buffers, forged counts, palette references and nonfinite transforms', () => {
    const valid = new Uint32Array(5 + 2 + 1 + 16 + 13);
    valid.set([0x4c495353, 1, 1, 1, 1, 0, 0, 1]);
    assert.equal(decodeInstances(new Uint8Array(valid.buffer)).count, 1);
    for (const byteLength of [0, 4, 19, valid.byteLength - 4]) {
        assert.throws(() => decodeInstances(new Uint8Array(valid.buffer.slice(0, byteLength))));
    }
    for (const [offset, value] of [[2, 0xffffffff], [3, 0], [6, 2], [8, 0x7fc00000]]) {
        const broken = valid.slice();
        broken[offset] = value;
        assert.throws(() => decodeInstances(new Uint8Array(broken.buffer)));
    }
});

test('PNG keeps exact straight RGBA bytes and 150 dpi including transparent RGB', async () => {
    const pixels = new Uint8Array([255, 50, 20, 0, 40, 80, 120, 128]);
    const png = await encodePng(pixels, 2, 1, 150);
    const chunks = new Map();
    for (let at = 8; at < png.length;) {
        const view = new DataView(png.buffer, png.byteOffset + at);
        const length = view.getUint32(0);
        const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
        chunks.set(type, png.slice(at + 8, at + 8 + length));
        at += length + 12;
    }
    assert.deepEqual([...inflateSync(chunks.get('IDAT'))], [0, ...pixels]);
    const density = new DataView(chunks.get('pHYs').buffer);
    assert.equal(density.getUint32(0), 5906);
    assert.equal(density.getUint32(4), 5906);
    assert.equal(density.getUint8(8), 1);
    await assert.rejects(() => encodePng(pixels, 3, 1));
});
