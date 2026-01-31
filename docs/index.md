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
- メニュー `ファイル > 保存` / `保存して別名保存` は `.ssproj` として保存されます。
- `.ssproj` にはカメラフレーム設定・下絵・参照画像・読み込んだスプラット/モデルなどを含みます。

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
