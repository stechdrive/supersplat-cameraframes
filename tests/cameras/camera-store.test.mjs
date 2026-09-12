import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScript } from '../load-typescript.mjs';

const { CameraStore, createCamera, createWorkspace, cloneCamera, removeCamera, captureViewLease } = loadTypeScript('src/cameras/camera-store.ts');
const { resolveView } = loadTypeScript('src/cameras/render-view.ts');
const makeStore = () => new CameraStore({ version: 1, cameras: [createCamera('a')], outputCameraId: 'a' });

test('copy, edit, delete and undo preserve camera identity and independent data', () => {
    const store = makeStore();
    const original = JSON.stringify(store.state);
    const copy = store.edit(document => cloneCamera(document, 'a', 'b'));
    copy.do();
    const edit = store.edit(document => {
        document.cameras[1].camera.position = [0, -7, 0];
        document.cameras[1].frames[0].pos.x = 0.1;
    });
    edit.do();
    assert.deepEqual(store.get('a').camera.position, [0, 0, 5]);
    assert.equal(store.get('a').frames[0].pos.x, 0.5);
    const views = createWorkspace('b');
    views.split = true;
    store.setWorkspace(views);
    const remove = store.edit(document => removeCamera(document, 'b'));
    remove.do();
    assert.equal(store.state.outputCameraId, 'a');
    assert.equal(store.views.panes[1].camera.cameraId, 'a');
    remove.undo();
    assert.deepEqual(store.get('b').camera.position, [0, -7, 0]);
    assert.equal(store.state.outputCameraId, 'b');
    edit.undo();
    copy.undo();
    assert.equal(JSON.stringify(store.state), original);
    copy.do();
    edit.do();
    assert.deepEqual(store.get('b').camera.position, [0, -7, 0]);
});

test('rapid queued commands compose against execution state', () => {
    const store = makeStore();
    const first = store.edit(document => cloneCamera(document, 'a', 'b'));
    const second = store.edit(document => cloneCamera(document, 'a', 'c'));
    first.do();
    second.do();
    assert.deepEqual(store.state.cameras.map(camera => camera.id), ['a', 'b', 'c']);
    second.undo();
    assert.deepEqual(store.state.cameras.map(camera => camera.id), ['a', 'b']);
});

test('zero position, pole orientations and roll survive JSON and view changes', () => {
    for (const rotation of [[0, 0, 0, 2], [Math.SQRT1_2, 0, 0, Math.SQRT1_2], [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], [0, 0, 1, 0]]) {
        const store = makeStore();
        store.edit(document => {
            document.cameras[0].camera.position = [0, 0, 0];
            document.cameras[0].camera.rotation = rotation;
        }).do();
        const before = JSON.stringify(store.state);
        const output = resolveView(store.get('a').camera, store.get('a').composition);
        for (const width of [480, 1080, 1920]) {
            const workspace = structuredClone(store.views);
            workspace.split = true;
            workspace.panes[1].zoom = width / 480;
            workspace.panes[1].pan = { x: -200, y: 120 };
            store.setWorkspace(workspace);
            const preview = resolveView(store.get('a').camera, store.get('a').composition, { width, height: 800, gate: { x: -100, y: 40, width: 400, height: 225 } });
            assert.deepEqual(preview.shot, output.shot);
            assert.deepEqual(preview.outputFrustum, output.outputFrustum);
        }
        assert.equal(JSON.stringify(store.state), before);
        const loaded = new CameraStore(JSON.parse(before));
        assert.deepEqual(loaded.state, store.state);
    }
});

test('invalid import and edit fail atomically without notifying or changing revisions', () => {
    const store = makeStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const before = store.state;
    const invalid = [
        document => document.cameras.push(structuredClone(document.cameras[0])),
        document => { document.cameras[0].camera.rotation = [0, 0, 0, 0]; },
        document => { document.cameras[0].camera.position[0] = NaN; },
        document => { document.cameras[0].camera.far = 0; },
        document => { document.outputCameraId = 'missing'; },
        document => { document.cameras[0].composition.scaleX = Infinity; },
        document => { document.cameras[0].frames[0].baseSize.w = 0; }
    ];
    for (const change of invalid) {
        const command = store.edit(change);
        assert.throws(() => command.do());
        assert.equal(store.state, before);
        assert.equal(store.revision, 0);
        assert.equal(calls, 0);
    }
    assert.throws(() => { store.get('a').camera.position[0] = 10; });
});

test('deleting the last camera leaves no dangling output or pane references', () => {
    const store = makeStore();
    store.edit(document => removeCamera(document, 'a')).do();
    assert.equal(store.state.outputCameraId, null);
    assert.equal(store.state.cameras.length, 0);
    assert.ok(store.views.panes.every(pane => pane.camera.kind === 'viewport'));
});

test('async picks are invalidated by pane changes, camera edits and scene replacement', () => {
    const store = makeStore();
    const first = captureViewLease(store, 'shot', 1);
    assert.ok(first.isCurrent(1));
    assert.equal(first.isCurrent(2), false);
    store.setWorkspace({ ...structuredClone(store.views), split: true });
    assert.equal(first.isCurrent(1), false);
    const second = captureViewLease(store, 'shot', 1);
    store.edit(document => { document.cameras[0].camera.fovY = 60; }).do();
    assert.equal(second.isCurrent(1), false);
});
