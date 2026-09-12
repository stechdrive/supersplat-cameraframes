# SuperSplat v3 最初の実証

固定した本家v3へ撮影カメラ・構図・GLBマスクを接続する隔離実証。現行アプリの `src/` と依存は置き換えない。実装と検証結果は [実証報告](../../docs/refactor-v3-first-proof.md) を参照。

## 起動と再実行

Node.js 24、Git、tar、WebGPUを利用できるChromeを使用する。リポジトリのルートで実行する。

```powershell
npm ci
# upstream.json の固定コミットがローカルにない場合のみ取得
git fetch --no-tags https://github.com/playcanvas/supersplat.git 12398f7f6997bd59bdd82876fd90fc87a6ec6f68
npm run setup:v3
npm ci --prefix .v3-proof/upstream --ignore-scripts
npm run lint:v3
npm run test:v3
npm run build:v3
npm run serve:v3
```

`http://127.0.0.1:3340/?proof` を開き「v3 実証を実行」を押す。`?proof&run` は起動時に実行する。検証中はタブを前面に置く。合成PLY・GLBを生成し、この実証ページのシーンを置き換える。

結果は `.v3-proof/results/` に保存する。

- `report.json`: 個別検証の結果・画素誤差・実行環境。
- `01-two-splats.png`〜`08-reloaded.png`: 複数Splat、右拡張、preview、GLB合成、未遮蔽GLB、マスク、前面Splat、再読込後の画像。
- `glb-mask.psd`: 未遮蔽GLBとそのレイヤーマスク、非表示の合成参照画像。
- `v3-proof.ssproj`: 本家version 1のresource/instancesと、実証用の撮影カメラ・構図・GLB拡張。

ソースを変えたら `setup:v3` → `build:v3` → ブラウザーを再読込する。依存を変えなければ `npm ci` は繰り返さなくてよい。

## 現行版・本家素の状態との比較

`upstream.json` の `base` コミットもローカルに必要。`setup-baselines.mjs` はその現行版と固定v3を展開し、共通の計測入口だけを追加する。renderer本体は変更しない。

```powershell
node experiments/v3/setup-baselines.mjs
npm --prefix .v3-proof/legacy run build
npm --prefix .v3-proof/baseline run build
```

同じサーバーで、次を**1ページずつ**開き、完了してから次へ進む。完了したタブは閉じてよい。

旧版のメンテナンス案内は「閉じる」で閉じる。計測が進まない場合はページを前面にし、左下の計測表示をクリックする。バックグラウンドではブラウザーが描画を抑制することがある。

1. `http://127.0.0.1:3340/legacy/?baseline=legacy-merged&renderBackend.mode=merged`
2. `http://127.0.0.1:3340/legacy/?baseline=legacy-unified&renderBackend.mode=unified-display`
3. `http://127.0.0.1:3340/baseline/?baseline=upstream`
4. `http://127.0.0.1:3340/?baseline=proof`

各ページの `baseline-*.json/.png/.rgba` を記録する。実描画サイズ320×240、world位置 `(0,0,5)`、同じ2 PLY・4 Gaussian・SH0・linearを使う。旧版のreadbackのみ上下反転する。CPU/GPUは60描画フレームのうち先頭15を除いた中央値とp95。CPU時間はupdate完了後からpostrenderまでで、アプリ全体の処理時間ではない。

`readyForCaptureMs` はimport開始から、描画と追加5フレームの待機完了まで。初回表示時間やFPSの指標にはしない。4 Gaussianは動作確認用なので、大規模素材の速度・RAM/VRAM・StreamLODについての判断には使わない。

```powershell
node experiments/v3/summarize.mjs
```

上記で画像差分と比較表を `comparison.json`、閲覧用ページを `review.html` にまとめる。閲覧先は `http://127.0.0.1:3340/__proof/artifact/review.html`。

## 接続箇所

| ファイル | 役割 |
| --- | --- |
| `src/render-view.ts` | 撮影位置/Quaternion・出力構図・preview gateからimmutableなviewを確定 |
| `src/apply-view.ts` | Engineの標準position/rotation・FOV/aspect/`projectionOffset`へ適用 |
| `src/capture.ts` | command queueでview更新と描画完了・readbackを直列化、GLB深度を残すalpha pass |
| `src/mask-psd.ts` | 元画像と `1 - 前面Splat alpha` マスクを分離してPSD化・再読込照合 |
| `src/proof.ts` | 実GPU試験、編集history、実証用保存拡張、最小実行パネル |
| `src/baseline.ts` / `fixtures.ts` | 共通計測入口と外部素材を含まない合成データ |
| `setup.mjs` | 固定コミットを展開し、camera・rendererのtarget寸法・doc・mainの接続箇所のみ変更 |

本家v3の `EditorSplatResource` / `GaussianInstances` / `ProjectedSplatRenderer` / picker / history / ZIP保存を使用する。旧merged rendererのCPU配列を実証版に並存させていない。

## 実証の境界

- sorted、SH0、単純な不透明GLB 1個、MSAA 1。PSDはGLB用マスク素材であり、交差する全レイヤーの汎用再合成機能ではない。
- 通常の本家UIから独自機能一式を操作できる製品版ではない。撮影viewの検証中はorbit操作で撮影姿勢を変更しない。
- 旧 `.ssproj` / `.sscam`、参照画像、timeline、断面、PNG150dpi、複雑な透明材質、大容量保存、PWA更新は対象外。実証用 `.ssproj` を旧版の互換検証に使わない。
- リポジトリのCIは数値試験・lint・ビルドまで。GPU試験はChromeで別途行う。
- `.v3-proof/` 全体はignore対象。ローカル `AGENTS.md` は展開先へコピーし、引き続きコミットしない。私的な `test/` 素材は不要。
- 本家のESLint 10とeslint-plugin-import 2.32で例外が起きるため、lintは親の固定lockfileにあるESLint 9と設定で実証ソース全体を検査する。本家のruntime依存は変更しない。
