import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTypeScript } from '../load-typescript.mjs';

const { createCamera } = loadTypeScript('src/cameras/camera-store.ts');
const { cameraAngles, quaternionFromAngles, legacyPreset, migrateLegacyCameras, expandFrame } = loadTypeScript('src/cameras/camera-legacy.ts');
const { resolveView } = loadTypeScript('src/cameras/render-view.ts');
const close = (a, b, tolerance = 1e-9) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const sameRotation = (a, b) => close(Math.abs(a.reduce((value, component, index) => value + component * b[index], 0)), 1);

test('legacy world transforms preserve zero position, poles and roll through quaternion conversion', () => {
    for (const pitch of [-90, -89.999, 0, 89.999, 90]) {
        for (const yaw of [-180, 0, 82]) {
            for (const roll of [-160, 0, 46]) {
                const q = quaternionFromAngles({ yaw, pitch, roll });
                const record = createCamera('a');
                record.camera.rotation = q.toArray();
                record.camera.position = [0, 0, 0];
                sameRotation(record.camera.rotation, quaternionFromAngles(cameraAngles(q.toArray())).toArray());
                const preset = legacyPreset(record, true);
                preset.cameraFramesState.mainCameraPose.fpvPosition = { x: 90, y: 80, z: 70 };
                const loaded = migrateLegacyCameras({ version: 3, cameraPresets: [preset] }).cameras[0];
                assert.deepEqual(loaded.camera.position, [0, 0, 0]);
                sameRotation(record.camera.rotation, loaded.camera.rotation);
            }
        }
    }
});

test('legacy camera files retain lens, frame expansion, references and independent cameras', () => {
    const a = createCamera('a');
    a.composition.scaleY = 1.4;
    a.composition.anchorX = 1;
    a.camera.fovY = 28;
    a.referenceImageOverrides = { reference: { items: { image: { opacity: 0.3 } } } };
    const b = createCamera('b');
    b.camera.position = [0, 2, 0];
    b.camera.projection = 'ortho';
    b.camera.orthoHalfHeight = 7;
    const loaded = migrateLegacyCameras({ cameraPresets: [legacyPreset(a, false), legacyPreset(b, true)] });
    assert.equal(loaded.outputCameraId, 'b');
    for (const [i, record] of [a, b].entries()) {
        const before = resolveView(record.camera, record.composition);
        const after = resolveView(loaded.cameras[i].camera, loaded.cameras[i].composition);
        for (const key of ['left', 'right', 'top', 'bottom']) close(before.outputFrustum[key], after.outputFrustum[key]);
        assert.deepEqual(record.frames, loaded.cameras[i].frames);
        assert.deepEqual(record.referenceImageOverrides, loaded.cameras[i].referenceImageOverrides);
    }
    const one = legacyPreset(a, true);
    assert.deepEqual(migrateLegacyCameras({ version: 1, mainCamera: one.mainCamera, cameraFramesState: one.cameraFramesState }).cameras[0].camera.position, a.camera.position);
});

test('legacy fpv fallback retains real coordinates without orbit radius or truthy defaults', () => {
    const old = legacyPreset(createCamera('a'), true).cameraFramesState;
    old.mainCameraPose.fpvPosition = { x: 0, y: -4, z: 0 };
    assert.deepEqual(migrateLegacyCameras(old, 999).cameras[0].camera.position, [0, -4, 0]);
    assert.throws(() => migrateLegacyCameras({ cameraPresets: [{ id: 'a', mainCamera: { transform: { position: { x: NaN, y: 0, z: 0 } } } }] }));
});

test('expanding any of nine anchors leaves each frame at the same original image position', () => {
    for (const anchorX of [0, 0.5, 1]) {
        for (const anchorY of [0, 0.5, 1]) {
            const record = createCamera('a');
            record.composition.anchorX = anchorX;
            record.composition.anchorY = anchorY;
            record.frames[0].pos = { x: 0.2, y: 0.7 };
            const original = structuredClone(record.frames[0]);
            expandFrame(record, 2, 1.6);
            close(record.frames[0].pos.x * 2 - anchorX, original.pos.x);
            close(record.frames[0].pos.y * 1.6 - anchorY * 0.6, original.pos.y);
            assert.deepEqual(record.frames[0].baseSize, original.baseSize);
            expandFrame(record, 1, 1);
            close(record.frames[0].pos.x, original.pos.x);
            close(record.frames[0].pos.y, original.pos.y);
        }
    }
});
