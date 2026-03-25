# supersplat CAMERA FRAMES 実装要件 / 保守基点 v11

## 0. この文書の目的

この文書は、現在の `camera-frames` ブランチのコードを正として、
CAMERA_FRAMES の「あるべき現在地」を固定するための実装基点です。

- 対象バージョン: `cameraFramesVersion = v2.21.14`
- 対象ブランチ: `camera-frames`
- 主な参照実装:
  - `src/camera-frames.ts`
  - `src/ui/camera-frames-panel.ts`
  - `src/ui/main-camera-props-panel.ts`
  - `src/reference-images-controller.ts`
  - `src/camera-save.ts`
  - `src/camera-frames-render-backend.ts`
  - `src/camera-frames-render-bridge.ts`
  - `src/scene-config.ts`
  - `src/main.ts`

この文書は、今後の保守と Spark 2.0 上での再現の両方に使う。
そのため、理想論ではなく「現行 stable 実装が保証していること」と「まだ保証していないこと」を明示する。

---

## 1. 製品の定義

CAMERA_FRAMES は、SuperSplat 上で以下を成立させるための拡張である。

1. A4 相当の基準紙上に複数の撮影フレームを配置できること
2. 撮影カメラと編集カメラを分離して運用できること
3. Render Box のアンカー付き off-axis フラスタムで構図を保てること
4. 下絵・ガイド・GLB・3DGS を合わせて layout 用の PNG / PSD を出せること
5. `.ssproj` と `.sscam` により、作業単位とカメラ単位の保存 / 引き継ぎができること

CAMERA_FRAMES の価値は、単なる viewport overlay ではなく、
`render box + capture camera + presets + export + reference images`
を一貫した作業系として持っている点にある。

---

## 2. 現在の runtime 基準

### 2.1 描画基盤

- Graphics API は `WebGL2` 固定
  - `src/main.ts` の `createGraphicsDevice(..., { deviceTypes: ['webgl2'] })`
- 既定の render backend は `unified-display`
  - `src/scene-config.ts`
- `unified-culling` の既定値は `false`
  - `src/scene-config.ts`
- `supportsStreamLod` は `false`
  - `src/splat-render-backend.ts`
- つまり現行 stable は
  - `WebGL2 + unified-display`
  - culling は opt-in
  - streaming LoD は未導入
 という状態である

### 2.2 起動直後の状態

- アプリ起動後、最初の安全な `postrender` で
  - `camera.setNavMode('fpv')`
  - `cameraFrames.setEnabled(true)`
  が発火する
- したがって通常起動時の初期状態は
  - CAMERA_FRAMES ON
  - FPV ナビゲーション
 である

### 2.3 現在の stable 判断

現行 stable の性能 / 安定性議論は、WebGPU や LoD を前提にしてはならない。
評価対象はあくまで `WebGL2 + unified-display` の到達点である。

---

## 3. データモデルの基準

### 3.1 `CameraFramesState`

現在の主要状態は以下を含む。

- `enabled`
- `renderBox`
- `frames`
- `mask`
- `mainCameraPose`
- `nearClip`
- `exportName`
- `exportFormat`
- `exportGridOverlay`
- `exportModelLayers`
- `exportSplatLayers`
- `cameraPresets`
- `exportTarget`
- `exportPresetIds`
- `selectedPresetId`

### 3.2 既定値

#### Render Box

- `baseSize = 1754 x 1240`
- `scalePct = 100 / 100`
- `anchor = center`
- `viewZoomPct = 100`
- `projection.type = 'perspective'`
- `projection.baseFov = 60`

#### Frame

- 基準サイズ `1536 x 864`
- 位置 `0.5, 0.5`
- scale `100%`
- 回転 `0`
- 最大数 `20`

#### Mask

- `enabled = false`
- `opacity = 0.8`
- `scope = 'all'`

#### Export

- `exportName = 'cf-%cam'`
- `exportFormat = 'psd'`
- `exportGridOverlay = true`
- `exportModelLayers = true`
- `exportSplatLayers = false`
- `exportTarget = 'current'`
- `exportPresetIds = []`

#### 初期 preset / frame

- camera preset は空で始まる
- CAMERA_FRAMES 有効化時に frame が 0 枚なら 1 枚自動生成する

---

## 4. Render Box / Camera / Frame の仕様

### 4.1 Render Box

- A4 相当の基準紙を viewport 上の logical space として扱う
- 幅 / 高さは別々に拡縮できる
- アンカー 3x3 で「どこを構図固定点にするか」を指定する
- `Canvas Zoom` は preview 専用で 25〜100%
- 書き出し時は常に `viewZoom = 100%`

### 4.2 投影

- CAMERA_FRAMES 有効時は水平 FOV 基準を維持する
- Render Box の幅 / 高さ / アンカーに応じて off-axis フラスタムを都度再計算する
- preview と export は同じ基準フラスタムから作られる
- export 時は `targetSize` を使って一時的に export 専用フラスタムへ同期し、完了後に preview へ戻す

### 4.3 撮影カメラと編集カメラ

- `enabled = true` の時が撮影表示
- `enabled = false` の時が編集表示
- `mainCameraPose` は撮影カメラの基準 pose として保持される
- 編集表示中でも、撮影カメラ操作パネル経由で `mainCameraPose` を編集できる
- 撮影カメラ操作パネルは OFF 中のみ開ける

### 4.4 ナビゲーション

- 起動直後の既定は FPV
- 左ドラッグによる FPV look は pointer lock を使わない
- そのためブラウザの pointer-lock トーストは出ない
- 一方で、長いドラッグは画面端で止まる

---

## 5. Export の契約

### 5.1 フォーマット

- `png`
- `psd`

### 5.2 書き出し対象

- `current`
- `all`
- `selected`

`selected` の場合は camera preset 一覧から export 対象を選ぶ。

### 5.3 preset ごとの export 設定

以下は camera preset ごとに保持される。

- `exportFormat`
- `exportGridOverlay`
- `exportModelLayers`
- `exportSplatLayers`
- `exportName`

一方で、`exportTarget` と `exportPresetIds` は「今回どの preset を書き出すか」の操作状態であり、
camera preset の意味そのものとは別に扱う。

### 5.4 書き出し内容

#### PNG

- base render
- 必要に応じて Grid / Eye-level
- front / back reference images
- frame overlay
- 150dpi の `pHYs` を付与

#### PSD

- residual `Render` layer
  - 個別レイヤー化していない残りだけを持つ
  - 残りが空なら PSD へ出さない
- `ガイド` グループ
  - Grid
  - Eye-level
  - Grid は multiply
- visible GLB model layers
- visible PLY / SOG object layers
  - `exportSplatLayers = true` の時だけ
  - `exportModelLayers = true` が前提
- `下絵` グループ
- frame overlays

#### PSD object-layer export のルール

- `exportSplatLayers` は `exportModelLayers` に従属し、単独では有効化しない
- 3DGS object layer の積み順は Scene Manager の並び順を正とする
- 最下段の 3DGS は背景扱いで mask を持たない
- 上位 3DGS は `単独 / 自身+下位 / 下位のみ` の 3 枚から mask を導出する
- GLB mask は従来どおり「自分以外の GLB + splat occlusion」を相手にする

### 5.5 全カメラ書き出し時の安定化

現行 stable では、全カメラ書き出しや target size 切り替え直後に
3DGS がまだ出そろっていないフレームを取らないよう、
offscreen capture 前に splat sorter と追加 render を待つ。

要件としては次を守る。

- unified-display でも「3DGS が消えた Render レイヤー」を極力出さない
- preset 切り替え直後でも export の見た目が preview と乖離しない

---

## 6. 下絵（Reference Images）の契約

### 6.1 基本状態

`ReferenceImageState` の既定値:

- `enabled = false`
- `visible = false`
- `layer = 'front'`
- `opacity = 0.7`
- `scalePct = 100`
- `offset = 0, 0`
- `includeInRender = false`

画像を読み込むと preview 用には `enabled = true / visible = true` になる。
ただし export には自動で入れない。

### 6.2 書き出し条件

下絵は以下を全て満たした時だけ書き出しに入る。

- `enabled`
- `visible`
- `includeInRender`

### 6.3 preset と override

- 下絵は reference image preset 単位で管理する
- 初期 preset は `(blank)`
- `(blank)` は名称変更不可
- camera preset が選択されているとき、
  - 表示
  - 出力
  - 並び順
  - 位置
  - スケール
  - 不透明度
 などは camera ごとの override を持てる
- override がある項目は reset で shared 状態に戻せる

### 6.4 preset 名の自動生成

- 最初の画像読込時、必要に応じてファイル名ベースの preset を自動作成する
- 以後は自動で名前を追従させない

---

## 7. 保存 / 交換形式の契約

### 7.1 `.ssproj`

`.ssproj` は full working project であり、以下を含む。

- splats
- models
- camera state
- timeline / pose sets
- CAMERA_FRAMES state
- reference images state
- reference image assets
- lighting

### 7.2 `.sscam`

`.sscam` は camera preset 交換用であり、以下を含む。

- camera presets
- reference image preset の ID / name
- `cameraFramesVersion`

以下は含まない。

- 3D assets
- reference image の実画像データ
- per-camera reference image overrides

したがって `.sscam` は「shot preset の受け渡し」用であり、
完全な再現は `.ssproj` に委ねる。

---

## 8. Undo / Redo の契約

### 8.1 目的

数値入力中に Enter や blur を強制しないまま、
app 側の Undo / Redo を自然に使えること。

### 8.2 現在保証する範囲

`Ctrl+Z / Ctrl+Shift+Z` 時に未確定入力を自動 commit する対象:

- CAMERA_FRAMES パネル
- 撮影カメラ操作ポップアップ
- 下絵パネル
- Scene Manager の light / ambient
- Transform パネル

### 8.3 現在保証しない範囲

app 全体の全 NumericInput を統一挙動にしているわけではない。
CAMERA_FRAMES 非対象のダイアログは base app の挙動を取ることがある。

---

## 9. Scene Manager / Lighting / Transform の契約

- Scene Manager で splat / model / light rig を一覧管理できる
- Scene Manager の splat / model 一覧は上下ボタンで並び替えできる
- この並び順は PSD の object layer 重ね順へ反映される
- Transform パネルで選択要素の位置・回転・スケールを数値編集できる
- Lighting で model light の表示、選択、方向リセット、強度、ambient を扱える
- これらの主要 numeric input も CAMERA_FRAMES の undo 改善対象に含める

---

## 10. 明示的な非対応 / 非ゴール

現行 stable は次を目標にしていない。

- WebGPU 起動
- streaming LoD
- `lod-meta.json` 資産の runtime 利用
- `unified-culling=true` を既定性能レバーとして運用すること

補足:

- Engine 側には WebGPU や LoD の仕組みがあっても、
  現行 app はそこへまだ接続していない
- したがって Spark 2.0 との差は「まだ未導入の層」として扱うべきであり、
  現行 stable の不具合とは分けて考える

---

## 11. Spark 2.0 再現時に維持すべき不変条件

今後 Spark 2.0 上で CAMERA_FRAMES を再現する際は、最低でも次を維持すること。

1. Render Box のアンカー付き off-axis 構図維持
2. 撮影表示 / 編集表示の二層カメラ運用
3. camera preset ごとの main camera / render box / export 設定保持
4. frame 配置・回転・アンカー編集の操作感
5. reference image preset と camera override の連動
6. `.ssproj` と `.sscam` の意味の違い
7. preview と export の一致
8. 全カメラ export 時の splat 安定待ち
9. numeric input 編集中でも自然に undo / redo できること

この 9 項目を満たさない移植は、見た目が似ていても現行 CAMERA_FRAMES の再現とは見なさない。
