# supersplat-cameraframes

![CAMERA FRAMES screenshot](./static/images/screenshot-cameraframes.jpg)

CAMERA FRAMES is a fork of [PlayCanvas SuperSplat](https://github.com/playcanvas/supersplat) focused on Japanese animation layout workflows. It lets you compose shots on an A4-like master sheet, place multiple camera frames for PAN / TU / TB style instructions, and export PNG / PSD layouts that match the preview.

CAMERA FRAMES は、[PlayCanvas SuperSplat](https://github.com/playcanvas/supersplat) をベースに、アニメーション制作のレイアウト用途へ寄せて拡張した fork です。A4 相当の基準紙上で構図を作り、複数の撮影フレームを置き、プレビューと一致する PNG / PSD を書き出せます。

- Live app: [https://stechdrive.github.io/supersplat-cameraframes/](https://stechdrive.github.io/supersplat-cameraframes/)
- English UI: [https://stechdrive.github.io/supersplat-cameraframes/?lng=en](https://stechdrive.github.io/supersplat-cameraframes/?lng=en)
- Feature guide: [English](./docs/CameraFramesFeatures_en.md) / [日本語](./docs/CameraFramesFeatures.md)
- Detailed requirements: [English](./docs/camera_frames_requirements_en.md) / [日本語](./docs/camera_frames_requirements.md)
- User manual: [docs/camera_frames_manual.html](./docs/camera_frames_manual.html)

## Why CAMERA FRAMES

- **Layout-first shot design**: Build shots on an A4-like render sheet instead of a raw viewport.
- **Multiple camera frames on one sheet**: Mark start/end frames for pan, track up, and other camera instructions directly in the scene.
- **Anchored off-axis frustum**: Resize the render box without breaking the anchored composition.
- **Preview = export**: What you frame in the render box is what you get in PNG / PSD output.
- **PSD-friendly output**: Export render, frame lines, grid / eye-level overlays, and model layers in a production-friendly structure.
- **Dual camera workflow**: Separate the free edit camera from the capture camera used for final framing.
- **Reference-image aware workflow**: Manage reference-image presets and per-camera overrides, and include them in export when needed.
- **Hybrid 3DGS workflow**: Compose multiple splats and GLB assets together with practical occlusion handling for layout work.

## What Stands Out In This Fork

- Render Box based on **A4 at 150dpi** at 100% scale, with large upscaling for oversized layout output.
- CAMERA FRAMES ON/OFF workflow that keeps a dedicated capture camera while still allowing free viewport navigation.
- Multi-frame editing with move / rotate / scale / anchor controls and PSD frame-layer export.
- Reference-image integration designed for shot presets and export use.
- Perspective editing path tuned around the newer unified renderer integration to reduce fallback-heavy interaction costs.

## Fork Status

This repository is not a general mirror of upstream SuperSplat. It is a product-oriented fork that keeps the SuperSplat base while prioritizing CAMERA FRAMES features and workflow improvements.

Upstream links:

- SuperSplat repository: [playcanvas/supersplat](https://github.com/playcanvas/supersplat)
- SuperSplat editor: [https://superspl.at/editor](https://superspl.at/editor)
- SuperSplat user guide: [PlayCanvas documentation](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/)

If you want the general-purpose upstream editor, use the upstream project. If you want a fork focused on Japanese animation layout workflows with CAMERA FRAMES, use this repository.

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

Useful commands:

- `npm run develop`: watch build + local server
- `npm run build`: production build
- `npm run serve`: serve existing `dist`
- `npm run lint`: ESLint

If changes do not appear, clear browser cache and check Service Worker cache state before retesting.

## Localization

To test a locale locally:

- `http://localhost:3000/?lng=en`
- `http://localhost:3000/?lng=ja`

Locale files live in [static/locales](./static/locales).

## Acknowledgements

This fork builds on top of SuperSplat and the PlayCanvas ecosystem. The image below shows the upstream SuperSplat contributors:

<a href="https://github.com/playcanvas/supersplat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=playcanvas/supersplat" />
</a>
