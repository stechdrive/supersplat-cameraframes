import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MemoryReadFileSystem, readPly, createChunkDataPool, materializeToDataTable } from '../../.v3-proof/upstream/node_modules/@playcanvas/splat-transform/dist/index.mjs';
import { ASPECT_MANUAL, Camera, Mat4, PROJECTION_ORTHOGRAPHIC, Vec2 } from '../../.v3-proof/upstream/node_modules/playcanvas/build/playcanvas/src/index.js';
import ts from '../../node_modules/typescript/lib/typescript.js';

const loadFunctions = (path, names) => {
    const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const statements = names ? source.statements.filter(statement => ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(source)))) : source.statements;
    assert.ok(!names || statements.length === names.length, '基準となる現行関数が見つかりません');
    const code = statements.map(statement => statement.getText(source)).join('\n');
    const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    // 比較対象はリポ内の現行関数のみ。コピーした数式ではなく実装を実行する。
    // eslint-disable-next-line no-new-func
    Function('exports', js)(exports);
    return exports;
};
const { resolveView } = loadFunctions('./src/render-view.ts');
const { makePly } = loadFunctions('./src/fixtures.ts');
const { computeEffectiveFrustum, syncCameraFrustum } = loadFunctions('../../src/camera-frames-camera.ts', ['computeEffectiveFrustum', 'syncCameraFrustum']);
const { computeViewportMapping } = loadFunctions('../../src/camera-frames-viewport.ts', ['computeViewportMapping']);
const close = (a, b, epsilon = 2e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const shot = { id: 'test', position: [0, 0, 5], rotation: [0, 0, 0, 1], projection: 'perspective', fovY: 50, orthoHalfHeight: 2, near: 0.1, far: 100 };
const frame = { width: 960, height: 640, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 };
const project = (m, p, size) => {
    const d = m.data;
    const w = d[3] * p[0] + d[7] * p[1] + d[11] * p[2] + d[15];
    return [
        (1 + (d[0] * p[0] + d[4] * p[1] + d[8] * p[2] + d[12]) / w) * size.width / 2,
        (1 - (d[1] * p[0] + d[5] * p[1] + d[9] * p[2] + d[13]) / w) * size.height / 2
    ];
};
const engineProjection = (view) => {
    const camera = new Camera();
    camera.aspectRatioMode = ASPECT_MANUAL;
    camera.projection = view.shot.projection === 'ortho' ? PROJECTION_ORTHOGRAPHIC : 0;
    camera.horizontalFov = false;
    camera.aspectRatio = view.lens.aspect;
    camera.fov = view.lens.fovY;
    camera.orthoHeight = view.lens.orthoHalfHeight;
    camera.nearClip = view.shot.near;
    camera.farClip = view.shot.far;
    camera.projectionOffset = new Vec2(view.lens.offsetX, view.lens.offsetY);
    return camera.projectionMatrix.clone();
};

test('現行の9アンカー・拡縮・透視/正射影とEngine 2.22の標準shiftを照合', () => {
    let cases = 0;
    for (const projection of ['perspective', 'ortho']) {
        for (const anchorX of [0, 0.5, 1]) {
            for (const anchorY of [0, 0.5, 1]) {
                for (const scaleX of [0.3, 1, 1.5]) {
                    for (const scaleY of [0.5, 1, 2]) {
                        const current = { ...frame, anchorX, anchorY, scaleX, scaleY };
                        const view = resolveView({ ...shot, projection }, current);
                        const base = resolveView({ ...shot, projection }, frame).frustum;
                        const rb = { scale: { kx: scaleX, ky: scaleY }, anchor: { ax: anchorX, ay: anchorY } };
                        const legacy = computeEffectiveFrustum({
                            getRuntimeFrustum: () => ({ l0: base.left, r0: base.right, b0: base.bottom, t0: base.top, near: base.near, far: base.far }),
                            renderBox: rb,
                            scene: { camera: { far: shot.far } }
                        });
                        for (const key of Object.keys(legacy)) close(view.frustum[key], legacy[key], 1e-12);
                        const f = view.frustum;
                        const expected = projection === 'ortho' ? new Mat4().setOrtho(f.left, f.right, f.bottom, f.top, f.near, f.far) : new Mat4().setFrustum(f.left, f.right, f.bottom, f.top, f.near, f.far);
                        const actual = engineProjection(view);
                        for (let i = 0; i < 16; i++) close(actual.data[i], expected.data[i]);
                        const baseMatrix = engineProjection(resolveView({ ...shot, projection }, frame));
                        for (const depth of [1, 4, 17]) {
                            const point = [0.1, -0.2, -depth];
                            const before = project(baseMatrix, point, { width: 960, height: 640 });
                            const after = project(actual, point, view.outputSize);
                            close(after[0] - before[0], anchorX * (view.outputSize.width - 960), 1e-3);
                            close(after[1] - before[1], anchorY * (view.outputSize.height - 640), 1e-3);
                        }
                        cases++;
                    }
                }
            }
        }
    }
    assert.equal(cases, 162);
});

test('現行viewportのfit/zoom/pan/raw gateとpreviewの投影が一致する', () => {
    for (const zoom of [50, 100, 175]) {
        for (const dpr of [1, 1.25, 2]) {
            for (const projection of ['perspective', 'ortho']) {
                const rb = {
                    baseSize: { w: 960, h: 640 },
                    scale: { kx: 1.5, ky: 1 },
                    anchor: { ax: 0, ay: 0 },
                    center: { cx: 613, cy: 343 },
                    fitScale: 0.65,
                    viewZoomPct: zoom,
                    lastViewport: { vw: 1200, vh: 800 }
                };
                const mapping = computeViewportMapping(rb, { vw: 1200, vh: 800 }, null, false, x => x);
                const f = { ...frame, scaleX: 1.5, anchorX: 0, anchorY: 0 };
                const output = resolveView({ ...shot, projection }, f);
                const legacy = syncCameraFrustum({ stateEnabled: true,
                    computeEffectiveFrustum: () => output.frustum,
                    scene: { camera: {} },
                    events: { fire: () => {} },
                    viewport: { vw: 1200, vh: 800 },
                    computeViewportMapping: () => mapping });
                const gate = mapping.rectPxRaw;
                const view = resolveView({ ...shot, projection }, f, { width: 1200 * dpr,
                    height: 800 * dpr,
                    gate: { x: gate.x * dpr, y: gate.y * dpr, width: gate.w * dpr, height: gate.h * dpr } });
                for (const key of Object.keys(legacy)) close(view.frustum[key], legacy[key], 1e-12);
                const original = project(engineProjection(output), [0.1, -0.2, -4], output.size);
                const preview = project(engineProjection(view), [0.1, -0.2, -4], view.size);
                close(preview[0], (gate.x + original[0] * mapping.viewScale) * dpr, 1e-3);
                close(preview[1], (gate.y + original[1] * mapping.viewScale) * dpr, 1e-3);
            }
        }
    }
});

test('previewは保存構図を変更せず、主点は出力枠外でもclampされない', () => {
    const input = structuredClone(shot);
    const view = resolveView(input, { ...frame, scaleX: 0.3, anchorX: 0 });
    assert.ok(view.opticalAxis.x > view.size.width);
    input.position[0] = 100;
    assert.equal(view.shot.position[0], 0);
    assert.throws(() => {
        view.shot.rotation[0] = 1;
    });
    assert.deepEqual(view.shot.position, [0, 0, 5]);
    assert.throws(() => resolveView({ ...shot, rotation: [0, 0, 0, 0] }, frame));
    assert.throws(() => resolveView({ ...shot, near: 0 }, frame));
    assert.throws(() => resolveView(shot, { ...frame, width: NaN }));
});

// 同じpoolへの返却と再利用を含めて検証するため直列に読み込む。
/* eslint-disable no-await-in-loop */
test('合成PLYを本家の実loaderで読み、座標・SH色・opacityのFloat32値を照合する', async () => {
    const fs = new MemoryReadFileSystem();
    const pool = createChunkDataPool();
    try {
        for (const side of ['red', 'blue']) {
            const file = makePly(side);
            fs.set(file.name, new Uint8Array(await file.arrayBuffer()));
            const source = await readPly(await fs.createSource(file.name), pool);
            try {
                const table = await materializeToDataTable(source, pool);
                const columns = Object.fromEntries(table.columns.map(column => [column.name, Array.from(column.data)]));
                const sign = side === 'red' ? 1 : -1;
                assert.deepEqual(columns.z, [sign, -sign]);
                close(columns.x[0], -0.13 * (5 - sign));
                close(columns.opacity[0], Math.log(0.65 / 0.35));
                close(columns.f_dc_0[0] * 0.28209479177387814 + 0.5, side === 'red' ? 0.9 : 0.02);
            } finally {
                await source.close();
            }
        }
    } finally {
        pool.destroy();
    }
});
