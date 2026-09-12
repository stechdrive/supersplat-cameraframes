import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const pin = JSON.parse(readFileSync(join(here, 'upstream.json'), 'utf8'));
for (const [variant, commit, dependencyRoot] of [['legacy', pin.base, root], ['baseline', pin.commit, join(root, '.v3-proof/upstream')]]) {
    const target = join(root, '.v3-proof', variant);
    mkdirSync(target, { recursive: true });
    const archive = join(root, '.v3-proof', `${variant}.tar`);
    for (const [cmd, args] of [['git', ['archive', '--format=tar', `--output=${archive}`, commit]], ['tar', ['-xf', archive, '-C', target]]]) {
        const result = spawnSync(cmd, args, { cwd: root, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status) process.exit(result.status);
    }
    mkdirSync(join(target, 'src/proof'), { recursive: true });
    for (const name of ['baseline.ts', 'fixtures.ts', 'render-view.ts']) cpSync(join(here, 'src', name), join(target, 'src/proof', name));
    if (existsSync(join(root, 'AGENTS.md'))) cpSync(join(root, 'AGENTS.md'), join(target, 'AGENTS.md'));
    if (!existsSync(join(target, 'node_modules'))) symlinkSync(join(dependencyRoot, 'node_modules'), join(target, 'node_modules'), 'junction');
    const mainPath = join(target, 'src/main.ts');
    let source = readFileSync(mainPath, 'utf8');
    source = source.replace('import { registerPublishEvents }', 'import { installBaseline } from \'./proof/baseline\';\nimport { registerPublishEvents }');
    source = source.replace('    scene.start();', '    scene.start();\n    if (url.searchParams.has(\'baseline\')) installBaseline(scene, events);');
    writeFileSync(mainPath, source);
    console.log(`${variant}: ${commit} の描画コードを変更せず計測入口を追加しました。`);
}
