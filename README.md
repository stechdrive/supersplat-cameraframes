## Camera Frames

![cameraframes-image](./static/images/screenshot-cameraframes.jpg)

**Key Features & Use Cases:**

-   **Animation Layout Workflow**: Specifically designed to support the Japanese animation production style (LO). It allows for defining camera work instructions (PAN, TU/TB) using multiple frames on a single large canvas.
-   **Viewport & Main Camera Workflow**: Compose your shots efficiently by switching between the **Viewport Camera** for free navigation and the **Main Camera** for the final view.
-   **High-Resolution Canvas**: The "Render Box" base size corresponds to **A4 paper at 150dpi (at 100% scale)**, and can be scaled up to **1000%**, enabling massive high-resolution outputs suitable for large-format layouts.
-   **Camera Work Instructions**: Place multiple "Camera Frames" to indicate camera movement (Start/End frames for PAN/Track Up). These are exported as vector-like outlines in a separate PSD layer.
-   **WYSIWYG Composition**: A fixed-aspect Render Box ensures your export (PNG/PSD) matches your preview pixel-perfectly.
-   **Integrated Multi-PLY Rendering**: Multiple PLY files are rendered with correct depth occlusion, allowing characters and backgrounds to be composed naturally.
-   **GLB Import & Display**: Load and view GLB assets directly to check layout alongside splats.

- Full Feature Guide: [CameraFramesFeatures_en.md](./docs/CameraFramesFeatures_en.md)

### Camera Frames (日本語)

**アニメーション制作の「レイアウト」出力に最適化されたワークフロー**

Camera Framesは、**日本のアニメーション制作における「レイアウト（LO）」工程**を想定して設計されたSuperSplatの拡張機能です。
3D Gaussian Splatを用いて正確な構図を決め、PANやTU（トラックアップ）などのカメラワーク指示を含むレイアウト用紙を作成できます。

**主な用途と機能:**

-   **アニメ制作等のレイアウト出力**: **100%設定でA4用紙（150dpi）相当**の解像度となり、そこから**最大1000%まで拡大**可能です。これにより、超高解像度のレイアウト用紙を作成・出力できます。
-   **ビューポートカメラとメインカメラ**: **ビューポートカメラ**で自由に移動しながら**メインカメラ**の調整を行い、効率的に構図を決めることができます。
-   **カメラワーク指示（撮影フレーム）**: 画面上に複数の「撮影フレーム」を配置することで、PAN（パン）やTU（トラックアップ）などのカメラワーク始点・終点を指示できます。
-   **PSDレイヤー出力**: 出力されたPSDファイルは、背景（レンダリング画像）とフレーム枠線（カメラワーク指示）が別レイヤーとして保持され、後工程での作業を効率化します。
-   **見た目通りの完全な書き出し**: ウィンドウサイズに依存しない「Render Box」により、プレビューと完全に一致するPNG/PSD出力を保証します。
-   **複数PLYの深度統合**: 複数のスプラットファイルを正しい前後関係（オクルージョン）で統合描画。背景と人物などを組み合わせたシーンも自然にレンダリングされます。
-   **GLBの読み込み・表示**: GLBアセットを直接読み込んで表示し、スプラットと並べてレイアウト確認が可能です。

- 詳細な機能説明: [CameraFramesFeatures.md](./docs/CameraFramesFeatures.md)


# SuperSplat - 3D Gaussian Splat Editor

[![Github Release](https://img.shields.io/github/v/release/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/releases)
[![License](https://img.shields.io/github/license/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/blob/main/LICENSE)
[![Discord](https://img.shields.io/badge/Discord-5865F2?style=flat&logo=discord&logoColor=white&color=black)](https://discord.gg/RSaMRzg)
[![Reddit](https://img.shields.io/badge/Reddit-FF4500?style=flat&logo=reddit&logoColor=white&color=black)](https://www.reddit.com/r/PlayCanvas)
[![X](https://img.shields.io/badge/X-000000?style=flat&logo=x&logoColor=white&color=black)](https://x.com/intent/follow?screen_name=playcanvas)

| [SuperSplat Editor](https://superspl.at/editor) | [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/) | [Blog](https://blog.playcanvas.com) | [Forum](https://forum.playcanvas.com) |

SuperSplat is a free and open source tool for inspecting, editing, optimizing and publishing 3D Gaussian Splats. It is built on web technologies and runs in the browser, so there's nothing to download or install.

A live version of this tool is available at: https://superspl.at/editor


![image](https://github.com/user-attachments/assets/b6cbb5cc-d3cc-4385-8c71-ab2807fd4fba)

To learn more about using SuperSplat, please refer to the [User Guide](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/).

## Local Development

To initialize a local development environment for SuperSplat, ensure you have [Node.js](https://nodejs.org/) 18 or later installed. Follow these steps:

1. Clone the repository:

   ```sh
   git clone https://github.com/playcanvas/supersplat.git
   cd supersplat
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Build SuperSplat and start a local web server:

   ```sh
   npm run develop
   ```

4. Open a web browser tab and make sure network caching is disabled on the network tab and the other application caches are clear:

   - On Safari you can use `Cmd+Option+e` or Develop->Empty Caches.
   - On Chrome ensure the options "Update on reload" and "Bypass for network" are enabled in the Application->Service workers tab:

   <img width="846" alt="Screenshot 2025-04-25 at 16 53 37" src="https://github.com/user-attachments/assets/888bac6c-25c1-4813-b5b6-4beecf437ac9" />

5. Navigate to `http://localhost:3000`

When changes to the source are detected, SuperSplat is rebuilt automatically. Simply refresh your browser to see your changes.

## Localizing the SuperSplat Editor

The currently supported languages are available here:

https://github.com/playcanvas/supersplat/tree/main/static/locales

### Adding a New Language

1. Add a new `<locale>.json` file in the `static/locales` directory.

2. Add the locale to the list here:

   https://github.com/playcanvas/supersplat/blob/main/src/ui/localization.ts

### Testing Translations

To test your translations:

1. Run the development server:

   ```sh
   npm run develop
   ```

2. Open your browser and navigate to:

   ```
   http://localhost:3000/?lng=<locale>
   ```

   Replace `<locale>` with your language code (e.g., `fr`, `de`, `es`).

## Contributors

SuperSplat is made possible by our amazing open source community:

<a href="https://github.com/playcanvas/supersplat/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=playcanvas/supersplat" />
</a>
