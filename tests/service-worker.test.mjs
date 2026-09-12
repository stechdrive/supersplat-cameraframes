import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import ts from 'typescript';

const origin = 'https://example.test/supersplat-cameraframes/';
const version = 'v3.0.0-test';
const { outputText: workerSource } = ts.transpileModule(readFileSync('src/sw.ts', 'utf8')
    .replace("import { buildInfo } from './build-info';", `const buildInfo = { version: '${version}' };`), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
});

const createWorker = () => {
    const listeners = {};
    const deleted = [];
    const installed = [];
    const names = ['superSplat-cFrames-v2.21.14-old', `superSplat-cFrames-${version}`, 'camera-frames-spark-cache'];
    const self = {
        location: { href: `${origin}sw.js?v=${version}` },
        addEventListener: (name, handler) => { listeners[name] = handler; },
        skipWaiting: () => {},
        clients: { claim: async () => {} }
    };
    const caches = {
        keys: async () => names,
        delete: async name => { deleted.push(name); },
        open: async () => ({ addAll: async urls => { installed.push(...urls); } })
    };
    runInNewContext(workerSource, { self, caches, URL, console });
    const dispatch = async (name) => {
        let pending;
        listeners[name]({ waitUntil: value => { pending = value; } });
        await pending;
    };
    return { dispatch, installed, deleted };
};

test('worker update removes only obsolete Camera Frames caches', async () => {
    const worker = createWorker();
    await worker.dispatch('activate');
    assert.deepEqual(worker.deleted, ['superSplat-cFrames-v2.21.14-old']);
});

test('new worker precaches every locale with the application build version', async () => {
    const worker = createWorker();
    await worker.dispatch('install');
    const locales = worker.installed.filter(url => url.includes('/static/locales/'));
    assert.equal(locales.length, 9);
    assert(locales.every(url => new URL(url).searchParams.get('v') === version));
    assert(worker.installed.includes(`${origin}index.html?v=${version}`));
});
