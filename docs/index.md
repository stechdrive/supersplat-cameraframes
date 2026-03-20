# SuperSplat Camera Frames ユーザーガイド

SuperSplat Camera Frames はブラウザで動作する 3D Gaussian Splat エディタです。Camera Frames 機能により、A4相当の基準紙上で複数フレームを配置し、LO 用の PNG/PSD を書き出せます。

## 起動
- 公開版: https://stechdrive.github.io/supersplat-cameraframes/
- ローカル: `npm install` → `npm run develop` → `http://localhost:3000`

## 読み込み

### シーン（.ssproj）
- メニュー `ファイル > 開く` から .ssproj を読み込みます。
- ドラッグ&ドロップでも読み込み可能です。

### 3Dデータ / 3Dモデル
- メニュー `ファイル > インポート` またはドラッグ&ドロップで読み込みます。
- 対応拡張子:
  - 3Dデータ: `.ply` / `.splat` / `.sog` / `.lcc`
  - 3Dモデル: `.glb`

### 下絵（参考画像）
- 画像ファイルのみをドロップした場合、下絵として読み込まれます。
- 対応拡張子: `.png` / `.jpg` / `.jpeg` / `.webp` / `.psd`

### URL から読み込み
- `?load=<URL>` で URL から読み込めます。
- 必要に応じて `&filename=<拡張子付き名>` を併用すると拡張子判定が安定します。

## 保存
- 初回保存では `.ssproj` を作成します。
- 2回目以降の `ファイル > 保存` / `Ctrl+S` は、同じブラウザ環境で続きから再開するための **ローカル作業状態保存** です。
- `ファイル > プロジェクトパッケージを保存` / `Ctrl+Shift+S` は、共有・受け渡し用の `.ssproj` 本体を更新する **完全保存** です。
- 左上の `*` は作業状態に未保存の変更、`PKG` は `.ssproj` 本体が最新ではないことを表します。
- NAS や他の人へ渡す前には `PKG` が消えるまで **プロジェクトパッケージを保存** してください。
- 詳細な運用ルール: `docs/save-model.md`

## 書き出し（エクスポート）
- メニュー `ファイル > エクスポート` からシーンを書き出せます。
  - `.ply`（圧縮版の選択可）
  - `.splat`
  - `.sog`
  - Viewer（HTML / ZIP）
- Camera Frames の PNG/PSD 出力は右側の Camera Frames パネルの「書き出し」から実行します。

## Camera Frames 機能
- 操作マニュアル: `docs/camera_frames_manual.html`
- 機能概要: `docs/CameraFramesFeatures.md`
