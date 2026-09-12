import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const runtime = join(root, '.v3-proof/upstream');
const pin = JSON.parse(readFileSync(join(here, 'upstream.json'), 'utf8'));

const run = (command, args, cwd = root) => {
    const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${command} failed (${result.status})`);
};

mkdirSync(runtime, { recursive: true });
const archive = join(root, '.v3-proof/upstream.tar');
run('git', ['archive', '--format=tar', `--output=${archive}`, pin.commit]);
run('tar', ['-xf', archive, '-C', runtime]);
cpSync(join(here, 'src'), join(runtime, 'src/proof'), { recursive: true });
if (existsSync(join(root, 'AGENTS.md'))) cpSync(join(root, 'AGENTS.md'), join(runtime, 'AGENTS.md'));

// 固定タグの継ぎ目だけを変更する。タグの再展開後に適用するため再実行も同じ結果になる。
const replace = (path, before, after) => {
    const file = join(runtime, path);
    const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
    if (source.split(before).length !== 2) throw new Error(`${path}: 接続箇所が一意ではありません`);
    writeFileSync(file, source.replace(before, after));
};
replace('src/camera.ts', 'import { Serializer }', 'import { applyView } from \'./proof/apply-view\';\nimport type { RenderView } from \'./proof/render-view\';\nimport { Serializer }');
replace('src/camera.ts', '    renderOverlays = true;', `    shotView: RenderView | null = null;

    setShotView(view: RenderView | null) {
        this.shotView = view;
        if (view) {
            applyView(this.mainCamera, view);
            this.displayTransform.copy(this.mainCamera.getWorldTransform());
        } else {
            this.camera.projectionOffset = this.camera.projectionOffset.clone().set(0, 0);
            this.camera.horizontalFov = this.targetSize.width > this.targetSize.height;
            this.camera.aspectRatio = this.targetSize.width / this.targetSize.height;
        }
        this.scene.forceRender = true;
    }

    renderOverlays = true;`);
replace('src/camera.ts', '    onUpdate(deltaTime: number) {', `    onUpdate(deltaTime: number) {
        if (this.shotView) {
            applyView(this.mainCamera, this.shotView);
            this.displayTransform.copy(this.mainCamera.getWorldTransform());
            return;
        }`);
replace('src/camera.ts', '        this.rebuildRenderTargets();\n        this.updateCameraUniforms();', `        this.rebuildRenderTargets();
        if (this.shotView) applyView(this.mainCamera, this.shotView);
        this.updateCameraUniforms();`);
replace('src/projected-splat-renderer.ts', 'const { camera, targetSize, events } = this.scene;', 'const { camera, events } = this.scene;\n        const targetSize = camera.targetSize;');
replace('src/main.ts', 'import { registerPublishEvents }', 'import { installBaseline } from \'./proof/baseline\';\nimport { installProof } from \'./proof/proof\';\nimport { registerPublishEvents }');
replace('src/main.ts', '    scene.start();', '    scene.start();\n    if (url.searchParams.has(\'proof\')) installProof(scene, events, editHistory);\n    else if (url.searchParams.has(\'baseline\')) installBaseline(scene, events);');
replace('src/doc.ts', '                version: 1,', '                version: 1,\n                extensions: events.functions.get(\'proof.doc.serialize\')?.(),');
replace('src/doc.ts', '            scene.camera.docDeserialize(document.camera);', '            scene.camera.docDeserialize(document.camera);\n            await events.functions.get(\'proof.doc.deserialize\')?.(document.extensions, zipFs);');
replace('src/doc.ts', '            // Close zip (also closes underlying browser writer)', '            await events.functions.get(\'proof.doc.writeAssets\')?.(zipFs);\n\n            // Close zip (also closes underlying browser writer)');
replace('src/doc.ts', '    // handle user requesting a new document', `    if (new URLSearchParams(window.location.search).has('proof')) {
        events.function('proof.doc.save', saveDocument);
        events.function('proof.doc.load', loadDocument);
    }

    // handle user requesting a new document`);
replace('rollup.config.mjs', 'import alias from \'@rollup/plugin-alias\';', 'import alias from \'@rollup/plugin-alias\';\nimport commonjs from \'@rollup/plugin-commonjs\';');
replace('rollup.config.mjs', '        resolve(),', '        resolve(),\n        commonjs(),');
// upstream の ESLint 10 と eslint-plugin-import 2.32 は非互換。
// 実装・依存の基準は固定したまま、検査コマンドには親のlockfileのESLint 9を使う。
const pkgPath = join(runtime, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.scripts.lint = 'node ../../node_modules/eslint/bin/eslint.js --config ../../eslint.config.mjs src';
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
console.log(`固定した ${pin.tag} (${pin.commit}) を ${runtime} に展開しました。`);
