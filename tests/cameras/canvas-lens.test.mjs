import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Mat4 } from 'playcanvas';

import { loadTypeScript } from '../load-typescript.mjs';

const { canvasLens } = loadTypeScript('src/cameras/canvas-lens.ts');
const matrix = (lens, ortho) => {
    const result = new Mat4();
    if (ortho) {
        const half = lens.orthoHalfHeight;
        result.setOrtho(-half * lens.aspect, half * lens.aspect, -half, half, 0.1, 1000);
        result.data[12] = -lens.offsetX;
        result.data[13] = -lens.offsetY;
    } else {
        result.setPerspective(lens.fovY, lens.aspect, 0.1, 1000, false);
        result.data[8] = lens.offsetX;
        result.data[9] = lens.offsetY;
    }
    return result.data;
};

test('standard full-canvas lens projects to the same pixels as the pane rectangle', () => {
    for (const ortho of [false, true]) {
        for (const rect of [{ x: 0, y: 0, z: 0.5, w: 1 }, { x: 0.5, y: 0, z: 0.5, w: 1 }, { x: 0.25, y: 0.2, z: 0.4, w: 0.3 }]) {
            for (const offsetX of [-0.75, 0, 1.3]) {
                const lens = { fovY: 50, aspect: 1.6, orthoHalfHeight: 3, offsetX, offsetY: -0.2 };
                const pane = matrix(lens, ortho);
                const full = matrix(canvasLens(lens, rect), ortho);
                for (const point of [[0, 0, -1], [1, 2, -10], [-7, 5, -30]]) {
                    const project = (mat) => {
                        const w = ortho ? 1 : -point[2];
                        return [(mat[0] * point[0] + mat[8] * point[2] + mat[12]) / w, (mat[5] * point[1] + mat[9] * point[2] + mat[13]) / w];
                    };
                    const before = project(pane);
                    const after = project(full);
                    assert.ok(Math.abs(after[0] - (before[0] * rect.z + 2 * rect.x + rect.z - 1)) < 1e-6);
                    assert.ok(Math.abs(after[1] - (before[1] * rect.w + 2 * rect.y + rect.w - 1)) < 1e-6);
                }
            }
        }
    }
});
