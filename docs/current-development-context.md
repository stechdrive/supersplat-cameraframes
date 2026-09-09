# 継続開発コンテキストメモ

最終更新: 2026-04-21

このメモは、`camera-frames` の現状を短時間で掴んで次の作業に入るための入口です。詳細仕様は既存 docs を参照し、この文書では「今どこを見るべきか」と「いま注意すべきズレ」だけをまとめます。

## 1. 現在の trunk 状態

- 現在の branch: `camera-frames` (`origin/camera-frames` を追跡)
- 作業ツリー: 追加差分なし
- package version: `2.24.2`
- `cameraFramesVersion`: `v2.21.14`

直近の主要コミット:

- `dbfa757 feat(ui): add maintenance welcome board`
- `9f90016 fix(camera-frames): separate reference export gate`
- `0a3e6fb merge: add layered camera-frames export`
- `782fb6f docs(camera-frames): refresh manuals and help access`
- `acfdd21 perf(render): default to unified-display backend`

## 2. まず見るべき docs

仕様の source of truth は次です。

- 現在の機能基準: [CameraFramesFeatures.md](/D:/GitHub/supersplat-cameraframes/docs/CameraFramesFeatures.md)
- 実装要件の基点: [camera_frames_requirements.md](/D:/GitHub/supersplat-cameraframes/docs/camera_frames_requirements.md)
- render backend の現在地: [render-backend-transition-status.md](/D:/GitHub/supersplat-cameraframes/docs/render-backend-transition-status.md)
- upstream 追従の watch point: [camera-frames-upstream-notes.md](/D:/GitHub/supersplat-cameraframes/docs/camera-frames-upstream-notes.md)
- 保存モデル: [save-model.md](/D:/GitHub/supersplat-cameraframes/docs/save-model.md)
- 手動 QA 観点: [QA_SCENARIOS.md](/D:/GitHub/supersplat-cameraframes/docs/QA_SCENARIOS.md)

historical archive 扱い:

- [unified-frustum-prototype-handoff.md](/D:/GitHub/supersplat-cameraframes/docs/unified-frustum-prototype-handoff.md)
- [splat-render-stage4-notes.md](/D:/GitHub/supersplat-cameraframes/docs/splat-render-stage4-notes.md)

## 3. runtime / 起動時の前提

現在の stable 前提:

- `WebGL2` 固定
- `renderBackend.mode = unified-display`
- `renderBackend.unifiedCulling = false`
- `supportsStreamLod = false`

主要コード位置:

- runtime 設定: [scene-config.ts](/D:/GitHub/supersplat-cameraframes/src/scene-config.ts)
- 起動シーケンス: [main.ts](/D:/GitHub/supersplat-cameraframes/src/main.ts)
- CAMERA_FRAMES 本体: [camera-frames.ts](/D:/GitHub/supersplat-cameraframes/src/camera-frames.ts)
- export 実装: [camera-frames-export.ts](/D:/GitHub/supersplat-cameraframes/src/camera-frames-export.ts)
- export/backend 橋渡し: [camera-frames-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/camera-frames-render-backend.ts)
- renderer 境界: [splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts)
- 下絵実装: [reference-images-controller.ts](/D:/GitHub/supersplat-cameraframes/src/reference-images-controller.ts)
- `.sscam` 保存/読込: [camera-save.ts](/D:/GitHub/supersplat-cameraframes/src/camera-save.ts)
- `.ssproj` 保存/読込: [doc.ts](/D:/GitHub/supersplat-cameraframes/src/doc.ts)

起動直後の挙動:

- `app.ready` で welcome board を表示
- 最初の安全な `postrender` 後に `FPV` を有効化
- 同タイミングで `cameraFrames.setEnabled(true)` を実行

## 4. ヘルプ / ドキュメント UI の実態

ヘルプ文面の source は次です。

- 日本語: [camera_frames_manual.html](/D:/GitHub/supersplat-cameraframes/docs/camera_frames_manual.html)
- 英語: [camera_frames_manual_en.html](/D:/GitHub/supersplat-cameraframes/docs/camera_frames_manual_en.html)

配線:

- Rollup が上記 HTML を `dist/help/` にコピーする
- service worker が `help/*.html` を cache 対象に含める
- 現在の Camera Frames パネルの help ボタンは「別タブで manual を開く」動作

関連コード:

- help path / iframe panel 実装: [camera-frames-help-panel.ts](/D:/GitHub/supersplat-cameraframes/src/ui/camera-frames-help-panel.ts)
- Camera Frames パネル header: [camera-frames-panel.ts](/D:/GitHub/supersplat-cameraframes/src/ui/camera-frames-panel.ts)
- build copy 設定: [rollup.config.mjs](/D:/GitHub/supersplat-cameraframes/rollup.config.mjs)
- service worker cache: [sw.ts](/D:/GitHub/supersplat-cameraframes/src/sw.ts)

補足:

- `CameraFramesHelpPanel` 自体は実装済みだが、現状は toggle イベントを送る呼び出し元が見当たらない
- つまり「ドッキング可能な内蔵 help panel」は半分残っており、実際の導線は別タブ open が本線

## 5. 直近 UI 変更の実態

welcome board は [welcome-board.ts](/D:/GitHub/supersplat-cameraframes/src/ui/welcome-board.ts) で実装され、[editor.ts](/D:/GitHub/supersplat-cameraframes/src/ui/editor.ts) の `app.ready` で常時表示される。

文言は locale にある:

- 日本語: [ja.json](/D:/GitHub/supersplat-cameraframes/static/locales/ja.json)
- 英語: [en.json](/D:/GitHub/supersplat-cameraframes/static/locales/en.json)

現状のメッセージは「maintenance mode」案内で、新しい `https://stechdrive.github.io/camera-frames/` への誘導になっている。

## 6. export / reference images の重要点

現在の実装上の重要前提:

- export は `current / all / selected` を持つ
- `exportReferenceImages` は `exportModelLayers` / `exportSplatLayers` とは独立ゲート
- 全カメラ export や splat layer export では sorter 安定待ちを入れる
- 下絵は preset と camera override の二層管理

確認すると効く場所:

- state default / serialize: [camera-frames.ts](/D:/GitHub/supersplat-cameraframes/src/camera-frames.ts)
- render/export pipeline: [camera-frames-export.ts](/D:/GitHub/supersplat-cameraframes/src/camera-frames-export.ts)
- 下絵 preset / asset 管理: [reference-images-controller.ts](/D:/GitHub/supersplat-cameraframes/src/reference-images-controller.ts)

## 7. いま見えている docs のズレ

英語 docs の一部に古い version 表記が残っている。

- [camera_frames_requirements_en.md](/D:/GitHub/supersplat-cameraframes/docs/camera_frames_requirements_en.md) に `v2.21.3`
- [CameraFramesFeatures_en.md](/D:/GitHub/supersplat-cameraframes/docs/CameraFramesFeatures_en.md) に `v2.21.3`

一方で、コードと日本語 docs、manual HTML は `v2.21.14` 基準で揃っている。

そのため、今後 help 文面や英語 docs を直す場合は、まず version 表記と現行機能との差分整理から始めるのが安全。

## 8. 自動 UI 撮影まわりの現状

repo 内には Playwright / Puppeteer などの自動 UI 撮影基盤は見当たらない。あるのは [QA_SCENARIOS.md](/D:/GitHub/supersplat-cameraframes/docs/QA_SCENARIOS.md) の手順メモだけ。

つまり現状は:

- 手動 QA の観点は docs 化されている
- 自動撮影フレームワーク自体は repo に未同梱
- Codex 側で今すぐ repo だけを使って UI 自動撮影を継続する準備はまだない

## 9. 次に着手しやすいテーマ

現状から Codex で継続しやすいのは次。

1. help/manual 文面修正と docs 整理
2. 英語 docs の version / 内容ズレ修正
3. 未使用の `CameraFramesHelpPanel` を実導線に戻すか、別タブ導線に一本化するかの整理
4. welcome board の表示条件や文言調整
5. export / reference image の追加不具合修正

逆に、いま repo だけではそのまま継続しにくいのは:

- ブラウザ UI の自動撮影
- 自動化された E2E 証跡収集

必要なら次の作業では、このメモを起点に docs 整理から着手する。
