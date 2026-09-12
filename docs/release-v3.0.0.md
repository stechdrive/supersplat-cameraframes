# CAMERA FRAMES v3.0.0 公開前監査

確認日: 2026-09-13。作業ブランチ: `codex/v3-migration`。本家の履歴を一括mergeせず、v3.1.2のソースを基準に独自機能を移植した。Spark版は変更していない。

## 本家への追従範囲

`git fetch upstream --prune --tags`で再取得し、最新release `v3.1.2`と`upstream/main`がともに`0911f786db652a7700068fe6ccdfe32e24269e1d`であることを確認した。描画・編集データ・保存の基盤は現在の本家に追従している。GitHubのahead/behindは移植の有無を表さない。

| 本家の変更 | 採用方法 |
| --- | --- |
| v3.0.0のWebGPU、resource/instance分離、GPU投影・sort・選択、新編集ツール | 現在の通常エントリで使用。旧merged/unified rendererとEngine shader差し替えは撤去 |
| v3.0.1 `fecbbc9` 読込中ファイルへの上書き保護 | 保存前に資源を保護し、書込完了後にsourceを再接続。製品の履歴と作業保存にも適用 |
| v3.1.0 `998c5c4` / v3.1.1 `73a0760` 保存・出力フォルダ選択 | 本家I/Oとダイアログを採用。Ctrl+Sの作業保存とパッケージ保存は製品仕様を維持 |
| v3.1.2 `0487778` footprint半径修正 | projector・描画・選択を一組で採用 |
| v3.1.2 `d001a58` ホームボタン | 製品名へ変更して採用 |
| CI・翻訳検査 | Actions v7とlocale checkerを採用。Nodeは24、型検査・カメラ/保存テストを追加 |

本家`src/`の239ファイルのうち187は同一、52は製品の境界へ接続する変更があり、本家ファイルの削除はない（公開前差分）。撮影カメラ・分割ビュー・GLB・下絵・PNG/PSD・旧保存互換・PWAは追加実装。タイムラインのカメラはビューポートを対象とする。本家ソースを採用したことと、すべての機能を実機試験したことは区別する。機能の検証範囲は[移行検証記録](refactor-v3-migration-results.md)を参照。

## 依存関係・開発環境

- `npm audit`の9件（high 7、moderate 2）は開発ツールの間接依存だった。既存のsemver範囲内でlockfileを更新し、修正後は0件。`--force`や互換条件を無視するインストールは使用しない。
- 本家同等のPCUI 6.1.4、splat-transform 3.4.2、TypeScript 6.0.3を使用。Engineは公開後の修正2.22.2（shadow shaderとStandardMaterialの修正）へ進め、パッケージのソースは変更しない。
- Rollup 4.63.2、CommonJS plugin 29.0.3、Sass 1.104.1、mediabunny 1.56.2、autoprefixer 10.6.0へ更新。参照のない旧supersplat-viewerとcorsを削除。
- ESLint 9.39.4は意図した固定。本家設定が使う`eslint-plugin-import 2.32.0`と`eslint-plugin-jsdoc 50.8.0`のpeer範囲は9まで。ESLint 10へ強制更新しない。
- TypeScript 7.0.2とag-psd 31.0.2は別のmajor更新として保留。本家と同じTypeScript 6.0.3、およびPSDの読込・マスク互換を検証したag-psd 29.1.0を維持する。最新版との違いを隠さず、次回はcompiler API連携とPSD互換を個別に確認する。
- Sass pluginのlegacy JS API、mediabunnyの循環参照とTypeScript helper由来のビルド警告は残る。Sassのコンパイル失敗はビルドを失敗させる設定へ修正した。
- 英日には672キー。その他7言語は、既存の製品拡張193キーで英語fallbackを使用する。本家由来キーの欠落、英日間の欠落、古いキー、順序違反を`npm run lint:locales`とCIで検出する。

## 起動・更新

メンテナンス案内のコンポーネント・スタイル・翻訳・登録を削除。更新通知と未保存状態の確認は継続する。製品番号を`v3.0.0`へ上げ、本家Editorの`3.1.2`と分けて表示する。

翻訳URLにもビルド番号を付け、旧Service Workerが制御する最初の新版起動でも古い翻訳を再利用しない。キャッシュ更新は`superSplat-cFrames-`の旧キャッシュだけを削除し、同じoriginの別アプリのキャッシュに触れない。

## 公開前の検証結果

- 更新したlockfileで`npm ci --ignore-scripts`が成功。`npm audit`は0件。
- lint、locale lint、typecheck、Nodeテスト21件、旧投影照合4件が成功。
- GitHubの最初のCIでは、未生成の`build-info.ts`をlintが解決できなかった。生成前の型契約を`build-info.d.ts`に分け、生成済みファイルを削除したローカル環境でもlint・typecheck・テストが通るように修正。
- Engine 2.22.2の実Chrome/WebGPUで合成シーン16項目が成功。二つのビュー、選択、GLB深度、フレーム拡張、PNG/PSD、作業保存、パッケージ上書き・Undo・再読込を含む。WebGPU validation errorは0。削除した案内を試験側が呼んでいた参照も除去し、新規console errorがないことを確認。
- 通常の公開用ビルド`v3.0.0-1789250007`で更新試験を実施。旧公開版`v2.21.14-1776588945`のService Workerとキャッシュを残したまま、最初の新版起動で案内の撤去・日本語UI・新版キャッシュへの置換を確認。他アプリを模したキャッシュは保持した。
- 続けて同じローカル配信の接続を切断し、HTML/JS/CSS/翻訳がキャッシュから読み込まれ、ビュー操作まで初期化されることを確認。これは実ChromeでのService Worker更新試験であり、OSにインストールしたPWAウィンドウやショートカットの更新試験とは区別する。
- 通常ビルドに実証用ボタンとメンテナンス案内が含まれないことを検査。配布時は`VALIDATE_V3=0`を明示し、検証入口の誤配布を防ぐ。

ローカルの試験結果はignore対象の`.v3-proof/migration-results/report.json`、`pwa-upgrade-report.json`、`pwa-report.json`へ記録する。約463万Gaussianの旧パッケージ試験は先の移行時のEngine 2.22.1によるものであり、今回の2.22.2で大素材の試験を繰り返したとは扱わない。

## 公開手順

GitHub Pagesは`gh-pages`ブランチのルートを公開する既存設定。公開先は`https://stechdrive.github.io/supersplat-cameraframes/`。検査済みの`codex/v3-migration`をpushし、既存の`npm run deploy`でBASE_HREFを付けた通常ビルドを公開する。ソースブランチへ`dist/`やAGENTS.md、個人素材をコミットしない。

公開後はPagesの実行結果と実URLのビルド番号を照合し、旧版を開いたブラウザから再読込してメンテナンス案内が消えたことを確認する。

## 参照

- [SuperSplat v3.1.2](https://github.com/playcanvas/supersplat/releases/tag/v3.1.2)
- [PlayCanvas Engine v2.22.2](https://github.com/playcanvas/engine/releases/tag/v2.22.2)
- [TypeScript 7のcompiler API移行](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
