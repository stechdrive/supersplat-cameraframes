# supersplat-cameraframes

![CAMERA FRAMES screenshot](./static/images/screenshot-cameraframes.jpg)

## English

CAMERA FRAMES is a production-oriented fork of [PlayCanvas SuperSplat](https://github.com/playcanvas/supersplat), built for creating background layouts and layout sheets for Japanese animation.

It was made for a practical workflow: using 3DGS and scene assets from real or modeled locations to build background reference, decide framing, place multiple camera frames for PAN / TU / TB style instructions, and export PNG / PSD sheets that match the preview.

### Who This Is For

- Artists making layout sheets or background key drawings for Japanese animation.
- Teams working from modeled locations, scanned environments, or photogrammetry-derived scene reference.
- People who need to check framing, camera moves, and sheet composition in one place.

### Why This Fork Exists

- **Background-layout workflow instead of a generic viewer**: The goal is not just to inspect 3DGS, but to turn location-based 3D reference into usable layout output.
- **Render sheet, not just viewport**: Compose on an A4-like sheet sized for layout work, not only inside a raw editor viewport.
- **Multiple camera frames on one sheet**: Mark start / end frames for pans, track-ups, and other shot instructions directly on the page.
- **Preview = export**: The framed result in the render box matches PNG / PSD output.
- **PSD-ready delivery**: Export frame lines, overlays, and model layers in a format that fits downstream production work.
- **Capture camera and edit camera are separated**: Keep a stable shot camera while still inspecting the scene freely.
- **Reference-image aware**: Use imported reference images and per-camera overrides as part of the layout workflow.
- **3DGS + GLB hybrid scene setup**: Use splats and models together to build practical shot reference for background work.

### Quick Links

- Live app: [https://stechdrive.github.io/supersplat-cameraframes/](https://stechdrive.github.io/supersplat-cameraframes/)
- English UI: [https://stechdrive.github.io/supersplat-cameraframes/?lng=en](https://stechdrive.github.io/supersplat-cameraframes/?lng=en)
- Feature guide: [English](./docs/CameraFramesFeatures_en.md)
- Detailed requirements: [English](./docs/camera_frames_requirements_en.md)
- In-app help manual: [English](./docs/camera_frames_manual_en.html)

## 日本語

CAMERA FRAMES は、[PlayCanvas SuperSplat](https://github.com/playcanvas/supersplat) をベースにした、**日本のアニメ制作で背景原図やレイアウト用紙を作るための実制作向け fork** です。

モデル地のある作品や、フォトグラメトリ・スキャン・3D モデルから起こした空間資料をもとに、3DGS を背景参照として使いながら構図を決め、PAN / TU / TB などの撮影指示フレームを 1 枚の紙面上に配置し、プレビューと一致する PNG / PSD を出力するために作っています。

### どういう人向けか

- アニメのレイアウトや背景原図を作る人。
- モデル地、スキャン環境、フォトグラメトリ由来の空間資料を背景作業に使いたい人。
- 構図決め、撮影フレーム指定、紙面設計、PSD 出力を 1 つのツールでやりたい人。

### この fork の価値

- **3DGS ビューアではなく背景原図ツール**: 3DGS を見ること自体ではなく、空間資料をレイアウト作業へ変換することが目的です。
- **ビューポートではなく基準紙で考える**: A4 相当の Render Box 上で紙面として構図を組めます。
- **複数の撮影フレームを 1 枚に置ける**: PAN や TU などの始点・終点を同じ紙面上で設計できます。
- **プレビューと書き出しが一致する**: Render Box に見えている構図が、そのまま PNG / PSD の出力結果になります。
- **後工程に渡しやすい**: フレーム線、オーバーレイ、モデルレイヤーを PSD に分けて出せます。
- **撮影カメラと編集カメラを分離**: 構図を固定したまま、別視点から空間確認ができます。
- **下絵連携が強い**: 下絵の読み込み、プリセット管理、カメラ別 override、書き出し連携ができます。
- **3DGS と GLB を併用できる**: 背景参照と当たりモデルを同じ scene で確認できます。

### 主な導線

- 公開版: [https://stechdrive.github.io/supersplat-cameraframes/](https://stechdrive.github.io/supersplat-cameraframes/)
- 日本語 UI: [https://stechdrive.github.io/supersplat-cameraframes/?lng=ja](https://stechdrive.github.io/supersplat-cameraframes/?lng=ja)
- 機能概要: [日本語](./docs/CameraFramesFeatures.md)
- 要件メモ: [日本語](./docs/camera_frames_requirements.md)
- アプリ内ヘルプ元: [日本語](./docs/camera_frames_manual.html)

## Fork Status

This repository is not a general mirror of upstream SuperSplat. It is a product-oriented fork that keeps the SuperSplat base while prioritizing CAMERA FRAMES and Japanese animation layout workflows.

この repository は upstream SuperSplat の単純な複製ではありません。SuperSplat を土台にしつつ、CAMERA FRAMES と日本のアニメ向けレイアウト用途を優先して育てている fork です。

Upstream links:

- SuperSplat repository: [playcanvas/supersplat](https://github.com/playcanvas/supersplat)
- SuperSplat editor: [https://superspl.at/editor](https://superspl.at/editor)
- SuperSplat user guide: [PlayCanvas documentation](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/)

## Local Development

Requirements:

- Node.js 18 or later

Setup:

```powershell
git clone https://github.com/stechdrive/supersplat-cameraframes.git
cd supersplat-cameraframes
npm install
npm run develop
```

Then open:

- [http://localhost:3000](http://localhost:3000)
- English UI: [http://localhost:3000/?lng=en](http://localhost:3000/?lng=en)
- 日本語 UI: [http://localhost:3000/?lng=ja](http://localhost:3000/?lng=ja)

Useful commands:

- `npm run develop`: watch build + local server
- `npm run build`: production build
- `npm run serve`: serve existing `dist`
- `npm run lint`: ESLint

If changes do not appear, clear browser cache and check Service Worker cache state before retesting.

## Localization

This fork mainly targets English and Japanese UI/documentation.

To test locally:

- `http://localhost:3000/?lng=en`
- `http://localhost:3000/?lng=ja`

Locale files live in [static/locales](./static/locales).
