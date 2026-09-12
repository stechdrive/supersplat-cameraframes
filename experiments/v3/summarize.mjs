import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directory = join(root, '.v3-proof/results');
const readJson = name => JSON.parse(readFileSync(join(directory, name), 'utf8'));
const proof = readJson('report.json');
assert.equal(proof.status, 'passed', '実GPU検証が合格していません');
const labels = ['legacy-merged', 'legacy-unified', 'upstream', 'proof'];
const reports = labels.map(label => readJson(`baseline-${label}.json`));
const buffers = labels.map(label => readFileSync(join(directory, `baseline-${label}.rgba`)));
for (let index = 0; index < labels.length; index++) {
    const report = reports[index];
    assert.equal(report.status, 'passed', `${labels[index]}の計測が未完了です`);
    assert.equal(report.width, 320);
    assert.equal(report.height, 240);
    assert.equal(report.splats, 2);
    assert.ok(report.cameraPosition.every((value, axis) => Math.abs(value - [0, 0, 5][axis]) < 1e-5), '比較カメラの位置が不一致');
    assert.ok([0, 5, 8, 9].every(element => Math.abs(report.projection[element] - reports[3].projection[element]) < 1e-5), '比較カメラの画角またはshiftが不一致');
    const data = buffers[index];
    assert.equal(data.length, 320 * 240 * 4);
    assert.ok(data.some((value, offset) => offset % 4 === 3 && value > 150), '比較画像が空です');
}
const diff = (a, b) => {
    let max = 0;
    let sum = 0;
    let activeSum = 0;
    let activeBytes = 0;
    for (let i = 0; i < a.length; i++) {
        const error = Math.abs(a[i] - b[i]);
        max = Math.max(max, error);
        sum += error;
        const alphaOffset = i - i % 4 + 3;
        if (a[alphaOffset] || b[alphaOffset]) {
            activeSum += error;
            activeBytes++;
        }
    }
    return { max, mean: sum / a.length, meanNonTransparent: activeSum / activeBytes };
};
const comparisons = labels.slice(0, -1).map((label, index) => ({ from: label, to: 'proof', ...diff(buffers[index], buffers[3]) }));
const comparison = { reports, comparisons, note: '同じ合成4 Gaussian、320x240、SH0、linear。clip面は各カメラの実測projectionに記録。速度優劣や大容量性能の根拠にはしない。' };
writeFileSync(join(directory, 'comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`);

const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const figures = [
    ['01-two-splats.png', '複数Splat', '左は赤、右は青が手前。2ファイルの前後関係が画面内で逆転する。'],
    ['02-right-expanded.png', '右側へ1.5倍拡張', '左320×240の構図を維持して480×240へ拡張。'],
    ['03-preview.png', 'previewのzoom / pan', '640×480の画面内、(51,37)から480×240が出力枠。'],
    ['04-composite.png', 'GLBとSplatの合成', '緑の不透明GLBを挟み、手前のSplatだけが遮蔽する。'],
    ['05-glb-original.png', 'PSDの元画像', '隠れる部分も残した未遮蔽GLB。'],
    ['06-glb-mask.png', 'PSDのレイヤーマスク', '白は表示、暗い部分がSplatによる遮蔽。元画像のalphaとは別に保持する。'],
    ['07-front-splats.png', 'GLBより手前のSplat', 'GLB深度で制限したalpha合成。'],
    ['08-reloaded.png', '保存して再読込', '共有resource、編集状態、撮影構図、GLBを再読込。']
];
const gpu = proof.results.find(item => item.name === 'WebGPUエラーなし').detail.adapter;
const rows = reports.map(report => `<tr><td>${escape(report.label)}</td><td>${escape(report.deviceType)} / ${escape(report.backend)}</td><td>${report.cpu.median.toFixed(3)} / ${report.cpu.p95.toFixed(3)}</td><td>${report.gpu.median.toFixed(3)} / ${report.gpu.p95.toFixed(3)}</td></tr>`).join('');
const html = `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SuperSplat v3 最初の実証</title>
<style>
body{margin:0;background:#10151b;color:#e5edf7;font:15px/1.75 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:36px 24px}h1{font-size:28px}h2{margin-top:40px}a{color:#8cc8ff}p{max-width:900px}.ok{color:#a5e6bb}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:20px}figure{margin:0;padding:16px;background:#1b242f;border-radius:8px}figure img{width:100%;height:245px;object-fit:contain;background:#303944}figcaption{margin-top:12px}small{color:#a8b8cc}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{text-align:left;border-bottom:1px solid #384a60;padding:10px}pre{font-size:12px;white-space:pre-wrap;word-break:break-all}summary{cursor:pointer}.links{display:flex;gap:20px;flex-wrap:wrap}
</style><main>
<h1>SuperSplat v3 最初の実証</h1>
<p class="ok">実GPU検証 ${proof.results.length} 項目 合格</p>
<p>固定基盤 v3.0.0 / Engine ${escape(proof.engineVersion)}。${escape(gpu?.vendor)} ${escape(gpu?.architecture)} / Chrome。実行 ${escape(proof.date)}。</p>
<p>撮影位置とQuaternion、片側のフレーム拡張、複数Splatの編集・保存、GLB用PSDマスクがv3基盤上で成立したことを確認するための実証です。</p>
<div class="links"><a href="glb-mask.psd">GLBマスクPSD</a><a href="v3-proof.ssproj">実証プロジェクト</a><a href="report.json">検証JSON</a><a href="comparison.json">比較JSON</a></div>
<h2>描画・出力</h2><div class="grid">${figures.map(([file, title, caption]) => `<figure><a href="${file}"><img src="${file}" alt="${escape(title)}"></a><figcaption><strong>${escape(title)}</strong><br><small>${escape(caption)}</small></figcaption></figure>`).join('')}</div>
<h2>同じ小素材での比較</h2><p>${escape(comparison.note)} CPUはupdate完了後からpostrenderまで。各値はms、中央値 / p95。</p>
<table><thead><tr><th>対象</th><th>描画基盤</th><th>CPU</th><th>GPU</th></tr></thead><tbody>${rows}</tbody></table>
<div class="grid">${labels.map(label => `<figure><img src="baseline-${label}.png" alt="${label}"><figcaption>${label}</figcaption></figure>`).join('')}</div>
<details><summary>画素差分と検証の詳細</summary><pre>${escape(JSON.stringify({ comparisons, results: proof.results }, null, 2))}</pre></details>
<h2>次の段階に残るもの</h2><p>${proof.limitations.map(escape).join('。')}。現行アプリの全面移行、旧保存形式の互換、実素材の性能はこの結果だけでは確認できません。</p>
</main></html>`;
writeFileSync(join(directory, 'review.html'), html);
console.log(JSON.stringify({ comparisons, timings: reports.map(({ label, cpu, gpu }) => ({ label, cpu, gpu })) }, null, 2));
console.log('閲覧: http://127.0.0.1:3340/__proof/artifact/review.html');
