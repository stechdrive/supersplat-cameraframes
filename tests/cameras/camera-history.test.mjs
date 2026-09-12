import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadTypeScript } from '../load-typescript.mjs';

const { CameraStore, createCamera } = loadTypeScript('src/cameras/camera-store.ts');
const { CameraHistory } = loadTypeScript('src/cameras/camera-history.ts');
const { EditHistory } = loadTypeScript('src/edit-history.ts');
const { CommandQueue } = loadTypeScript('src/command-queue.ts');
const { Events } = loadTypeScript('src/events.ts');
const setup = () => {
    const events = new Events();
    const queue = new CommandQueue();
    const history = new EditHistory(events, queue);
    const store = new CameraStore({ version: 1, cameras: [createCamera('a')], outputCameraId: 'a' });
    return { events, queue, history, store, camera: new CameraHistory(store, history, { commandQueue: queue }, events) };
};

test('camera field gesture is one queued undo step and preserves redo identity', async () => {
    const { camera, store, history } = setup();
    camera.begin();
    const a = camera.change((document) => {
        document.cameras[0].camera.position[0] = 1;
    });
    const b = camera.change((document) => {
        document.cameras[0].camera.position[0] = 2;
    });
    camera.end();
    await Promise.all([a, b]);
    assert.equal(history.cursor, 1);
    assert.equal(store.get('a').camera.position[0], 2);
    await history.undo();
    assert.equal(store.get('a').camera.position[0], 0);
    await history.redo();
    assert.equal(store.get('a').camera.position[0], 2);
});

test('an interleaved tool command splits camera gestures instead of absorbing unrelated history', async () => {
    const { camera, store, history, queue } = setup();
    let selected = 0;
    camera.begin();
    const first = camera.change((document) => {
        document.cameras[0].camera.position[1] = 1;
    });
    const gpu = queue.enqueue(async () => {
        await Promise.resolve();
        await history.addInQueue({ name: 'select',
            do: () => {
                selected = 1;
            },
            undo: () => {
                selected = 0;
            } });
    });
    const last = camera.change((document) => {
        document.cameras[0].camera.position[1] = 3;
    });
    camera.end();
    await Promise.all([first, gpu, last]);
    assert.equal(history.cursor, 3);
    await history.undo();
    assert.equal(store.get('a').camera.position[1], 1);
    assert.equal(selected, 1);
    await history.undo();
    assert.equal(selected, 0);
    await history.undo();
    assert.equal(store.get('a').camera.position[1], 0);
});

test('failed edits leave live data and redo entries intact and do not poison the command queue', async () => {
    const { store, history } = setup();
    await history.add(store.edit((document) => {
        document.cameras[0].camera.near = 0.1;
    }));
    await history.undo();
    const before = JSON.stringify(store.state);
    const failed = history.add(store.edit((document) => {
        document.cameras[0].camera.near = -1;
    }));
    await assert.rejects(failed);
    assert.equal(JSON.stringify(store.state), before);
    assert.equal(history.history.length, 1);
    assert.equal(history.canRedo(), true);
    await history.redo();
    assert.equal(store.get('a').camera.near, 0.1);
});
