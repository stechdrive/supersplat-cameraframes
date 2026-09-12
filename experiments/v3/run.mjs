import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runtime = join(root, '.v3-proof/upstream');
const run = (script, args, cwd = root) => {
    const result = spawnSync(process.execPath, [script, ...args], { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status) process.exit(result.status);
};
const command = process.argv[2];
if (command === 'build') {
    run(join(runtime, 'node_modules/typescript/bin/tsc'), ['--noEmit'], runtime);
    run(join(runtime, 'node_modules/rollup/dist/bin/rollup'), ['-c'], runtime);
} else if (command === 'lint') {
    run(join(root, 'node_modules/eslint/bin/eslint.js'), ['experiments/v3/*.mjs']);
    run(join(root, 'node_modules/eslint/bin/eslint.js'), ['--config', join(root, 'eslint.config.mjs'), 'src'], runtime);
} else {
    throw new Error('build または lint を指定してください');
}
