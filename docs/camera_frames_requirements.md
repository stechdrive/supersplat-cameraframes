# supersplat CAMERA FRAMES / Render Box 要件定義 v10（現行実装準拠）

## 0. バージョンと参照

- ベースコード: `src/camera-frames.ts` / `src/ui/camera-frames-panel.ts` / `src/camera.ts` / `src/scene.ts` / `src/render.ts`（package version 2.18.1 / HEAD 時点）。
- 関連実装: `src/reference-image-controller.ts` / `src/reference-image-types.ts` / `src/render.ts`（参照画像のプレビュー/書き出し・includeReferenceImage フラグ・永続化）。
- CAMERA FRAMES 個別バージョン: `cameraFramesVersion` = **v2.20.0**（`package.json` 由来、`#app-label` に `| CAMERA FRAMES v2.20.0` を追加表示）。
- 本書は v9 を置き換える **実装準拠版 v10**。更新点:
 - ヘッダーを **CAMERA FRAMES ON/OFF + 撮影カメラ操作パネル** に整理し、uiTarget 切替 UI を撤去。
 - 焦点距離 UI を **撮影表示/編集表示で一本化**。編集視点での撮影カメラ編集は撮影カメラ操作パネルに集約。
 - `mainEditMode` を追加し、CF OFF でも撮影カメラ操作パネル表示中はフラスタム強調と near clip 反映を維持。

---

## 1. 目的とゴール

1. **レンダーボックスのアンカー付き拡縮**
 - 9 アンカー（左/中央/右 × 上/中央/下）から基準点を選び、基準側の構図を完全維持したまま反対側だけ視野を増減させる off-axis フラスタムを実現する。
 - 横縦別々の拡大率を掛けてもアンカー位置の構図が崩れない。

2. **表示倍率（viewZoom 25-100%）の縮小表示**
 - ズームアウト時は「元の構図を縮小した像」がキャンバス内で小さくなり、周囲の 3D シーンが余白として見えてくる。キャンバス外が黒で欠けない。
 - WebGL 描画・レンダーボックス枠・フレーム・マスクを一体で縮小し、フラスタムを拡張して全画面を埋める。

3. **基準 FOV と実効フラスタムの分離**
 - 表示値としての FOV(mm) = **構図基準水平 FOV** を保持し、UI で変更があったときのみ再設定。
 - 実投影はレンダーボックス拡大量・viewZoom・アンカーから都度再計算する。

4. **プレビューと書き出しの一致**
 - プレビューで見えているレンダーボックス内の内容が、PNG/PSD 出力とピクセル単位で一致する（書き出し時は viewZoom=100%・フラスタム拡張なし）。

5. **既存 UX の維持 + 実装強化**
 - フレームの移動/回転/スケール/アンカー操作、Shift 軸ロック、Alt 基準変更、ダブルクリックリセット等の操作性を維持。
 - 150dpi PNG への pHYs 付与、PSD レイヤー分割、グリッド/アイレベルのオプション出力、ニアクリップ安全化など現行実装の細部も要件化。

6. **CAMERA FRAMES OFF 時のカメラ編集補助**
 - Capture Camera Pose を保持し、CAMERA FRAMES 無効時は **撮影カメラ操作パネル** から pose/FOV(mm)/navMode/near を編集できる。
 - 編集表示時は通常カメラ用のレンズ(mm)スライダーを表示し、撮影表示時は構図基準 FOV(mm) を表示する。

---

## 2. 用語とメンタルモデル

### 2.1 ビューポート
- Supersplat の WebGL `<canvas>` が占める矩形（px）。`scene.targetSize`（デバイスピクセル）とは別に、UI/オーバーレイ計算では CSS ピクセルを使用。

### 2.2 レンダーボックス（Render Box / 基準紙）
- 基準解像度: `1754 × 1240 px`（A4 150dpi）。
- スケール:
 ```ts
 logicalW = baseW * scale.kx; // kx = scalePct.x / 100
 logicalH = baseH * scale.ky; // ky = scalePct.y / 100
 ```
 100%以上のみ許容、各軸 16000px 以下にクランプ。
- アンカー `ax/ay` = 0 | 0.5 | 1。アンカーは「構図を固定する基準点」で、拡縮時の off-axis 変形に使う。UI グリッドは ay=0 が「上」に相当する。
- `center` はスクリーン座標 (px)。リサイズ時もアンカーのスクリーン位置を保つよう補正。
- `fitScale` = viewZoom=100% 時に論理サイズをビューポートへフィットさせる係数。`viewScale = fitScale * (viewZoomPct / 100)` がオーバーレイの実スケール。

### 2.3 フレーム（Frame / 赤枠）
- 基準サイズ: `1536 × 864 px`。`scalePct`（10-400%）で等比拡縮。
- `pos` はレンダーボックスローカル 0-1（範囲外も許容）。`rotationDeg` は 0-360 正規化。
- `anchor` はフレーム個別の基準点（デフォルト pos と同一）。Alt+リサイズや回転時の固定点になる。
- `order` が小さいものから描画し、ヒットテストは前面優先。

### 2.4 マスク
- `mask.enabled` で有効化。不透明度 0.0-1.0（UI は % 表示）。
- `scope: 'all' | 'selected'`。selected 指定で選択フレームのみを対象（選択が無い場合は全フレームへフォールバック）。
- 全フレームの回転後スクリーン外接矩形外を黒マスクで塗る。プレビュー専用、PNG/PSD には含めない。

### 2.5 FOV 二層構造
1. **構図基準 FOV (`baseFov`)**: 水平 FOV 基準。UI の FOV(mm) はこれを mm 換算して表示。アスペクトによる自動軸反転は禁止（常に horizontalFov=true 相当）。
2. **実効フラスタム (`effectiveFrustum`)**: レンダリングに使うフラスタム。レンダーボックス拡大量とアンカーで off-axis 変形した上で、プレビュー時のみ viewZoom に応じて全画面まで外挿する。

### 2.6 座標系
- **Logical Space**: レンダーボックス上の px（基準紙座標）。中心は `renderBox.center` を原点とした相対計算を行う。
- **RenderBox Local 0?1**: `frame.pos/anchor` など UI 入力用。0 未満/1 超過で枠を紙の外に出せる。
- **Screen Space**: キャンバス上の CSS px。オーバーレイ描画・ポインタ操作はここで行う。
- **UI Space**: PCUI DOM の座標。パネル移動など UI 固有処理に使用。

### 2.7 構図維持（Composition Invariance）
- リサイズ・拡縮・ズームを繰り返しても、アンカー基準のスクリーン座標と構図がずれない。
- 毎回 `baseFrustum + 現在パラメータ` から再計算し、差分更新や累積誤差を持たない。

### 2.8 表示モードと Capture Camera Pose
- **framesEnabled** が true のときは撮影表示（CAMERA FRAMES ON）、false のときは編集表示。
- `mainCameraPose` は CAMERA FRAMES 用の基準ポーズ。編集表示中も保持し、**撮影カメラ操作パネル** から編集できる。
- 撮影カメラ操作パネル表示中は **mainEditMode** として扱い、撮影フラスタムを選択色で強調（描画のみでヒット不可）。

### 2.9 Viewport Lens（編集表示用）
- 編集表示時のみ有効なレンズ(mm)スライダー。現在のカメラ FOV を 35mm 換算で表示し、`camera.setFov` で反映。
- 換算レンジは renderBox 基準幅によるクロップ係数を用いて計算（HFOV 10?120° 相当）。

### 2.10 参照画像（Reference Image）との連携
- 参照画像は `ReferenceImageState`（`enabled` / `visible` / `layer: 'back'|'front'` / `opacity` / `includeInRender` など）として別モジュールで管理され、CAMERA FRAMES は **書き出し時のみ**これを参照する。
- ベース描画（`render.offscreen`）には参照画像を混ぜず、`referenceImage.renderExportLayer(width,height,{applyOpacity})` で **別キャンバス**として生成して合成する（`render.offscreen({ includeReferenceImage:false })` 固定）。
- 取り込み条件: `enabled && visible && includeInRender` を満たす場合のみ。条件を満たさない／参照画像未ロードの場合は出力に含めない。
- 参照画像はプリセット単位で管理する。デフォルトは `(blank)` の空プリセット。
- 下絵を初めて読み込むタイミングでアクティブプリセットが `(blank)` の場合、読み込んだ最初のファイル名をプリセット名として新規作成し自動で切り替える（以後は自動更新しない）。
- PNG: `applyOpacity=true` で不透明度をピクセルに焼き込み、`layer='back'` は `destination-over`、`layer='front'` は `source-over` で合成する。
- PSD: `applyOpacity=false`（キャンバスは不透明度 1.0）とし、PSD レイヤー側の `opacity` として保持する。`layer='back'` は underlay（Render の下）、`layer='front'` は overlay（モデル/フレームの間）へ。レイヤー名は `'Reference'`。

---

## 3. データモデルとデフォルト

### 3.1 CameraFramesState
```ts
type CameraFramesState = {
 enabled: boolean;
 renderBox: RenderBoxState;
 frames: FrameState[];
 mask: FrameMaskState;
 mainCameraPose?: CameraPoseSnapshot | null;
 nearClip?: number | null;
 exportName?: string;
 exportFormat?: 'png' | 'psd';
 exportGridOverlay?: boolean;
 exportModelLayers?: boolean;
 exportTarget?: 'current' | 'all' | 'selected';
 exportPresetIds?: string[];
};
```

### 3.2 RenderBoxState（デフォルト値）
- `baseSize: { w: 1754, h: 1240 }`
- `scalePct: { x: 100, y: 100 }` → `scale: { kx: 1, ky: 1 }`（100%以上、各軸 16000px 上限）
- `anchor: { ax: 0.5, ay: 0.5 }`
- `center: { cx: 0, cy: 0 }`（有効化時にビューポート中央へ初期化）
- `fitScale: 1`（初回/リサイズ時に AutoFit を再計算）
- `viewZoomPct: 100`（25..100 にクランプ）
- `lastViewport: { vw: 1, vh: 1 }`
- `projection: { type: 'perspective', baseFov: 60 }`（`type: 'ortho'` / `orthoHalfHeight` にも対応、保存時も水平基準で保持）

### 3.3 FrameState（デフォルト値）
- `id`: A, B, C… 最大 20。
- `pos: { 0.5, 0.5 }`
- `scalePct: 100` → `scaleK: 1`
- `baseSize: { w: 1536, h: 864 }`
- `order`: 0 から追加順に増加。
- `rotationDeg: 0`
- `anchor`: `pos` と同じ。

### 3.4 FrameMaskState（デフォルト値）
- `enabled: false`
- `opacity: 0.8`
- `scope: 'all'`

### 3.5 その他デフォルト
- `mainCameraPose`: 現在のカメラ姿勢を初期スナップショットして保持（未取得なら有効化時に取得）。
- `enabled`: デフォルトは false。ただし起動後の初回 `postrender` で `cameraFrames.setEnabled(true)` を発火し、自動的に有効化される（`src/main.ts`）。
- `nearClip`: null（有効化時にカメラ値から安全値を算出して固定）
- `exportName`: `'cf-%cam'`（`%cam` は選択中のカメラリストのプリセット名に置換）
- `exportFormat`: 既定は `psd`（UI の `defaultValue` / 既存ドキュメントで未指定時のフォールバック）。ただしドキュメント未保存からの初期化 (`docState=null`) では `png` を採用し、その後の状態・UI 表示はこれに追従する。
- `exportGridOverlay`: false
- `exportModelLayers`: false
- `exportTarget`: `current`（書き出し対象の既定は現在のカメラ）
- `exportPresetIds`: `[]`（書き出し対象カメラの選択リスト）
- 定数: `HFOV_MIN=10`, `HFOV_MAX=120`, `W_35MM=36`（35mm 換算幅）
- `cameraFramesVersion`: `package.json` の `cameraFramesVersion` を保存・表示（docSerialize に含める）。

---

## 4. 投影と計算仕様

### 4.1 ビューポートマッピング（`computeViewportMapping`）
1. **モード判定**: `scene.camera.targetSize` があれば書き出しモード。なければプレビュー。
2. **サイズ選択**: `vw/vh` は書き出し時=targetSize、プレビュー時=キャンバス CSS px。
3. **論理サイズ**: `logicalW/H = baseSize * scale`（1e-6 以下は 1e-6 に補正）。
4. **Auto Fit**: `autoFit = min(vw/logicalW, vh/logicalH)`（vw/vh が 0 の場合は 1）。
5. **viewZoom**: 書き出し時は 100 固定、プレビュー時は 25?100 にクランプ。
6. **fitScale 更新**: プレビューかつ `updateFitScale` 要求時に `autoFit` を採用。書き出し時は常に 1.0。
7. **viewScale**: 書き出し時は 1.0、それ以外は `fitScale * viewZoom/100` を 1e-6 以上に固定。
8. **center**: 書き出し時は画面中央。プレビュー時は `renderBox.center` を使用。リサイズ時 `updateFitScale && viewportChanged` の場合、アンカーのスクリーン位置を維持するよう `center` を補正。
9. **矩形**: `rectPxRaw` はクリップなし矩形、`rectPx` / `rectNorm` はビューポート内にクリップした表示用。フラスタム拡張には **Raw** を使用。

### 4.2 基準フラスタム（`rebuildBaseFrustum`）
- アスペクト: **レンダーボックスの baseSize** を使用（A4 なら A4 比率）。基準フレーム比 (16:9) は使用しない。
- FOV:
 ```ts
 baseFovDeg = projection.baseFov ?? scene.camera.fov ?? HFOV_MIN;
 horizontalRad = clampFov(baseFovDeg -> horizontal, aspect); // 10?120°
 halfW = near * tan(horizontalRad / 2);
 halfH = halfW / aspect;
 l0=-halfW, r0=halfW, b0=-halfH, t0=halfH;
 ```
- `lockFovAxis` は `'horizontal'` 固定（CAMERA FRAMES 有効時）。`camera.horizontalFov` も水平固定へ設定。
- Ortho 時は `orthoHalfHeight` を使用して左右上下を決定。

### 4.3 レンダーボックス拡大量とアンカーによる off-axis
```ts
width1 = (r0 - l0) * kx;
height1 = (t0 - b0) * ky;
left1 = l0 + ax * ((r0 - l0) - width1);
right1 = left1 + width1;
// ay=0 が「上」を指すため、Y-up フラスタムでは (1 - ay) を使う
bottom1 = b0 + (1 - ay) * ((t0 - b0) - height1);
top1 = bottom1 + height1;
```
- これが **書き出し時のフラスタム**（拡張なし）でもある。

### 4.4 プレビュー時のフラスタム拡張（外挿）
1. `rectPxRaw`（スクリーン上のレンダーボックス矩形・クリップなし）と `rbW/rbH`（近面上の幅）から 1px 当たりのワールド幅:
 ```ts
 pxToWorldX = rbW / rectPxRaw.w;
 pxToWorldY = rbH / rectPxRaw.h;
 ```
2. 画面全域をカバーする left/right/top/bottom:
 ```ts
 left = rbLeft - rectPxRaw.x * pxToWorldX;
 right = left + vw * pxToWorldX;
 top = rbTop + rectPxRaw.y * pxToWorldY; // DOM Y=上, フラスタム Y-up
 bottom = top - vh * pxToWorldY;
 ```
3. これを `camera.setCustomFrustum` に適用し、PlayCanvas の Rect/Scissor は常に 0,0,1,1 にリセット。

### 4.5 書き出し時のフラスタム
- `scene.camera.targetSize` が設定されている間、viewZoom=100%、center=画面中央、fitScale=1 として `left1/right1/bottom1/top1` をそのまま使用。
- 書き出し前に `syncExportFrustum()` で一時的に targetSize を設定し、プレビュー計算と切り離して確実に適用（targetSize は同関数内で復元）。書き出し完了後は finally で `syncCameraFrustum()` を呼び、プレビューフラスタムへ再同期。

### 4.6 FOV(mm) 計算
- クロップ係数: `crop = renderBox.baseSize.w / 1536`。
- 換算:
 ```ts
 eqMm = (W_35MM / (2 * tan(hfovRad/2))) * crop;
 hfovFrameDeg = 2 * atan(tan(hfovRad/2) / crop);
 ```
- UI スライダーの範囲は `HFOV_MIN/HFOV_MAX` を mm に変換した値で動的決定。計算時のアスペクトは `DEFAULT_FRAME_BASE` (16:9)。変更時のみ `baseFov` を更新し再計算。
- 編集表示時の viewport lens(mm) は同じ換算式で現在のカメラ FOV を表示・編集する（撮影表示では baseFov を編集）。

### 4.7 ニアクリップ安全化
- `computeSafeNearClip`: `near > 0` かつ `near < far`、`far*0.1` / `boundRadius*0.5` を上限とする。無効値時は `DEFAULT_NEAR_CLIP=0.01`。
- 有効化/シーン変更時にガードをスケジュールし、数フレーム後に再確認して強制修正。

---

## 5. UI 仕様（パネル・オーバーレイ）

### 5.1 パネル共通
- PCUI ベース。ヘッダーに **CAMERA FRAMES ON/OFF トグル（Capture/Edit アイコン）** と **撮影カメラ操作パネル** ボタン、**コンパクト切替**（コンテンツ全折りたたみ）を配置。ヘッダードラッグで移動でき、ウィンドウ内にクランプ。リサイズ時も位置を補正。
- パネル上の pointer イベントはキャンバス操作へ伝搬させない（stopPropagation）。`pointerenter` でオーバーレイのヒットテストを解除。
- コンパクト時はヘッダーのみ表示。ON/OFF はヘッダーの Capture/Edit ボタンを押して切り替える（撮影=ON、編集=OFF）。撮影=ON へ切り替える際は `camera.setNavMode('fpv')` も同時に発火（`src/main.ts` の初回自動 ON も同様）。
- 撮影カメラ操作パネルは **CAMERA FRAMES OFF** のときのみ開閉でき、ON 中はロック表示。
- ヘッダーに参照画像ボタンを追加:
 - 参照画像パネルの表示切替（`referenceImagePanel.toggleVisible`）
 - 参照画像の表示/非表示（`referenceImage.setVisible`）。参照画像が未ロードの場合は無効化され、ロード済みの場合のみ active 状態とアイコン（shown/hidden）を切り替える。
- 参照画像パネルには `登録名` 入力を配置し、アクティブな下絵セット名を編集できる（`(blank)` は編集不可）。

### 5.2 レイアウト（レンダーボックス）
- 折りたたみ可能ヘッダー（初期は畳み）。アンカー 3×3 ボタン、幅%・高さ%（最小100/最大1000 UI、実際は 16000px クランプ）、表示倍率(viewZoom 25?100)、出力解像度表示。
- 出力解像度表示は論理サイズ (outW/outH)、拡大率 (kx/ky)、ビューポート溢れ警告を含む。
- FOV(mm) スライダーは eqMm 表示。**撮影表示時のみ**有効。編集表示で撮影カメラの FOV を編集する場合は撮影カメラ操作パネル内の FOV を使う。
- Viewport lens(mm) スライダーは **編集表示時のみ**有効。

### 5.3 フレーム管理
- 追加（+）、削除（ゴミ箱）ボタン、リストで A/B/C… を表示。テキストは実効ピクセルサイズ（レンダーボックススケール込み）と % を表示。
- リストクリックで選択／再クリックで解除。選択中のみハンドル表示・削除対象。
- 選択中フレームのスケール% 数値入力（UI 1?500、実際クランプ 10?400）。

### 5.4 マスク
- トグル、不透明度（0?100%）、スコープ選択（all / selected）。selected 指定時に選択フレームが無い場合は全フレームで描画。
- プレビュー専用。履歴・永続化対象。

### 5.5 FOV / ズーム / レンズ
- FOV(mm) スライダーは eqMm ベース。撮影表示時のみ有効。
- Canvas Zoom 入力は 25?100%。入力即時で viewZoom を更新。
- Viewport lens(mm) スライダーは編集表示時の通常カメラ用。範囲は renderBox 基準のクロップを考慮した HFOV 10?120° 相当。

### 5.6 Export
- ファイル名テキスト（拡張子自動付与、空白時は `camera-frames`）。フォーマット選択（PSD/PNG）。トグル 3 つ:
 - Grid/Eye-level オーバーレイ出力トグル（1 つのボタンで両方制御。PNG は合成、PSD はレイヤー追加）。
 - Model layers トグル（PSD のみ有効。UI 表示は常時、PNG 選択時は無視）。
 - Reference Image 取り込みトグル（参照画像側の `includeInRender` を切り替える。`enabled && visible && includeInRender` の場合のみ書き出しに含まれる。PNG は合成、PSD は `Reference` レイヤーで front/back を反映）。
- Render ボタンと進捗スピナー（描画中はボタン無効化）。UI の `defaultValue` は PSD だが、初期化状態（`docState=null`）では state 側が `png` を持つため、初回 `cameraFrames.stateChanged` 同期後は PNG が選択状態となる。

### 5.7 カメラ Transform / ナビゲーション
- 折りたたみセクション（初期畳み）。Orbit/FPV 切替アイコン、位置 XYZ、回転 yaw/pitch/roll（ロールロック付き）、ローカル移動スライダー（right/up/forward、操作後は 0 に戻る）、ニアクリップ入力。
- Alt でスロー編集（nearClip step=0.1, precision=3、姿勢・位置変化も 0.1 倍）。
- 数値入力フォーカス中は transform の自動同期を抑止し、フォーカスアウトで再同期。
- 撮影表示時は mainCameraPose を編集、編集表示時は通常カメラを編集。編集表示中に撮影カメラを調整する場合は撮影カメラ操作パネルを使う。
- nearClip 入力は撮影表示時のみ表示・有効（編集表示では撮影カメラ操作パネル側に表示）。

### 5.8 オーバーレイ描画
- キャンバス直後に `#camera-frames-overlay` を挿入。devicePixelRatio でスケール。デフォルト pointerEvents=none。
- レンダーボックス: 白破線 1px。フレーム: 赤 2px、選択中は白点線 1px を重ねる。ハンドル: 白塗り + 赤縁 10px、回転ハンドルは枠から 30px 上。
- マスク: スコープに応じて対象フレーム群の外接矩形外を黒で塗る（opacity 指定）。
- 90°刻み回転時はエクスポートの枠線をピクセルスナップしてシャープに描く。
- CAMERA FRAMES ON または mainEditMode（撮影カメラ操作パネル表示中）のとき、デバッグレイヤーに撮影フラスタムを選択色で描画（選択=マゼンタ、非選択=シアン）。非インタラクティブ。

---

## 6. ビヘイビア詳細

### 6.1 有効化 / 無効化
- 有効化:
 - 現在の viewport pose/FOV を保持し、`camera.setLockFraming(true)` と `camera.setLockFovAxis('horizontal')` を設定。撮影表示に切り替えて構図を固定する。
 - `mainCameraPose` が空なら現在のカメラを基準として確保し、これを適用。baseFov をカメラから引き継ぎ UI へ同期。
 - 現在の near を安全値に補正して override。`initDefaultsIfNeeded` で center をビューポート中央へ補完し、fitScale を算出、フレーム未生成なら 1 枚追加。
 - baseFrustum 再構築 → フラスタム同期 → オーバーレイ再描画 → near guard をスケジュールし、viewport lens 状態を更新。
 - 起動時（初回 `postrender`）も `cameraFrames.setEnabled(true)` を発火して自動的にこのフローへ入る。併せて `camera.setNavMode('fpv')` を発火（`src/main.ts`）。
- 無効化:
 - 現在の pose を mainCameraPose に保存し、near override と customFrustum を解除、lockFovAxis を解放。
 - viewportPoseRuntime/viewportFovRuntime があれば通常カメラへ戻す。
 - 状態は保持したまま追従ロジックを停止。編集表示から撮影カメラ操作パネルで編集可能。

### 6.2 ビューポートリサイズ / フォースリフレッシュ
- `ResizeObserver` と `camera.resize` / `cameraFrames.forceRefreshViewport` で検知。CSS px で overlay サイズとスケールを更新し、`computeViewportMapping(true)` で AutoFit と center 補正を実施。アンカーのスクリーン位置を維持。

### 6.3 表示倍率（viewZoomPct 25?100）
- 変更時: viewScale 更新 → フラスタム再計算（外挿） → オーバーレイ再描画。fitScale は変更しない。
- 視覚挙動: viewZoom を下げるほどレンダーボックスとフレームが均等縮小し、外周にシーンが追加表示される。

### 6.4 レンダーボックス拡大（scalePct.x/y）
- クランプ: 100%以上、各軸 16000px 以下。変更は `cameraFrames.renderBoxScale` として履歴に記録（デバウンス）。
- アンカーに基づき center を再計算し、fitScale を更新。フレームの論理中心がスクリーンで不変となるよう `frame.pos` を再マップ。
- CAMERA FRAMES 有効時はカメラのアスペクトロックを更新。

### 6.5 アンカー変更
- レンダーボックスアンカー変更は **次の拡縮の基準点差し替えのみ**。現在のフラスタムや表示を変更しない（構図維持）。UI/オーバーレイは即時更新。

### 6.6 フレーム操作
- **ヒット優先**: order の大きいフレームが前面。選択中のみハンドル有効。
- **移動**: 枠線ドラッグで `pos` 更新。Shift 押下で軸ロック（一定距離で確定）。スケールに応じてローカル→スクリーンを換算。
- **拡縮**: ハンドルドラッグで等比スケール。Alt 押下でフレーム固有アンカーを基準に対称拡縮。10?400% にクランプ。
- **回転**: 上方 30px の回転ハンドル。Shift で 15° スナップ。回転ハンドルのダブルクリックで 0° にリセット。
- **フレームアンカー編集**: アンカーハンドルをドラッグで `frame.anchor` を更新。アンカーハンドルのダブルクリックでフレーム中心へリセット。
- **選択**: 枠線クリックまたはリスト選択。再クリックで解除可能。選択状態はスナップショットに保存。

### 6.7 レンダーボックスパン
- Shift + 空白部ドラッグでレンダーボックス全体をスクリーン内で移動（`renderBox.center` 更新）。ビューポート外へのはみ出しは `PAN_MARGIN_PX=0` でクランプ。

### 6.8 マスク
- 有効時のみ描画。`scope='selected'` の場合は選択フレームの外接矩形のみを使い、対象が無ければ全フレームで代用。プレビュー専用。

### 6.9 ポインタイベント
- Gizmo ヒット時はオーバーレイを透過。CAMERA FRAMES 無効時はオーバーレイを無効化。
- オーバーレイはヒット時のみ pointerEvents=auto。ドラッグ中は `grabbing` カーソル。Shift 押下でハンドル非選択時も `grab` を表示。
- `lostpointercapture` でドラッグ履歴を commit。フラスタム自体のドラッグ・選択は無効化。

### 6.10 ニアクリップ
- UI から設定するとデバウンスで履歴記録（CAMERA FRAMES 有効時は near override を即時適用）。撮影表示または撮影カメラ操作パネル内で入力欄を表示。
- `computeSafeNearClip` で 0.01 以上、`far*0.1`・`boundRadius*0.5` 以内、`far` 未満に補正。ガードをスケジュールして数フレーム後に再確認。

### 6.11 FOV(mm) / Viewport Lens(mm)
- 撮影表示または撮影カメラ操作パネルの FOV スライダー変更で `baseFov` を更新、baseFrustum を再構築。表示値は renderBox スケールや viewZoom に影響されない。
- 編集表示中は Viewport lens スライダーで通常カメラの FOV を mm で編集（baseFov は変更しない）。範囲は renderBox 基準のクロップを考慮した HFOV 10?120° 相当。
- eqMm 計算は `DEFAULT_FRAME_BASE` のアスペクト基準。viewportFovRuntime で CF ON/OFF への往復時に FOV を復元。

### 6.12 Capture Camera Pose 管理
- CAMERA FRAMES 有効時のカメラ操作は mainCameraPose に反映（タイムライン再生中は更新しない）。無効時のカメラ操作は viewportPoseRuntime へ保存し、viewport lens 表示を更新。
- 撮影表示中の Transform/FOV/near/navMode 編集は mainCameraPose にのみ適用され、CAMERA FRAMES ON 時の構図に使用される。編集表示中でも撮影カメラ操作パネルから mainCameraPose を編集できる。
- 撮影カメラ操作パネルの開閉可否: `!enabled` かつ `mainCameraPose` が存在し、書き出し中でないときのみ。

---

## 7. 書き出し仕様（PNG / PSD / グリッド / モデル）

### 7.1 出力解像度
```ts
outW = baseSize.w * scale.kx;
outH = baseSize.h * scale.ky;
```
viewZoom・ビューポートサイズ非依存。

### 7.2 レンダリングパイプライン
1. `syncExportFrustum(width,height)` で export 用フラスタムを明示適用（targetSize 一時設定→復元）。プレビュー復帰は try/finally で `syncCameraFrustum()` を呼ぶ。
2. `render.offscreen(width,height,{ includeReferenceImage:false })` でベース描画（参照画像は混ぜない）。
3. オプション: 参照画像レイヤー（参照画像側の `enabled && visible && includeInRender` を満たす場合のみ）。`referenceImage.renderExportLayer(width,height,{applyOpacity})` で取得し、PNG は合成、PSD は `Reference` レイヤー（front/back に応じて underlay/overlay）として扱う。
4. `render.offscreen(width,height, options)` でオーバーレイ抽出。`options.overlaysOnly=true` の場合は背景/シャドウ/オーバーレイ/ギズモ/World/参照画像/モデル照明等を無効化してグリッド等のみ出力。`unpremultiplyAlpha` 指定でプレマルチ解除。
5. PNG/PSD 用に frame overlay（赤枠）を別キャンバスで描画。90°刻みはピクセルスナップ。
6. オプション: グリッド/アイレベルオーバーレイ（`exportGridOverlay`）。PNG では合成、PSD では別レイヤー（それぞれ `export.grid-layer.grid` / `export.grid-layer.eye-level` 名）。
7. オプション: モデルレイヤー（`exportModelLayers` かつ PSD）。可視なモデルを 1 つずつ単体描画し、レイヤー名 `panel.camera-frames.export.model-layer` をモデル名でローカライズして追加。
8. PSD は管理名（フレーム ID の先頭英字を大文字化、無い場合 `Frames`）ごとにフレームをグルーピングしてレイヤーを作成。
9. 書き出し後はプレビューモードのフラスタムへ戻す（`syncCameraFrustum`）。

### 7.3 PNG
- ベース + (任意)参照画像 + (任意)グリッド/アイレベル + フレームを合成。
 - グリッドは `destination-over` で背面に合成。
 - 参照画像は `layer='back'` の場合 `destination-over`、`layer='front'` の場合 `source-over`。不透明度は参照画像のエクスポートキャンバス側に焼き込み（`applyOpacity=true`）。
 - アイレベルは `source-over` で前面合成。
- pHYs チャンクで DPI=150 を付与。`PngCompressor` で圧縮し、ダウンロード。
- `render.offscreen` のダブルフリップを回避するため、コンプレッサー前に一度 bottom-up へ戻す。

### 7.4 PSD
- 合成順（背面→前面、`exportPsd` の underlays→Render→overlays）:
 1. Reference（参照画像、`layer='back'` の場合のみ / opacity は PSD レイヤーで保持）
 2. Render（ベース描画、参照画像なし）
 3. グリッド（有効時）
 4. アイレベル（有効時）
 5. モデルレイヤー群（有効時、可視モデルごと）
 6. Reference（参照画像、`layer='front'` の場合のみ / opacity は PSD レイヤーで保持）
 7. フレームレイヤー群（管理名ごとにまとめ、各レイヤーは赤枠のみ）
- PSD には 150 PPI 情報とサムネイルを含める。マスクは含めない。

---

## 8. 永続化と履歴

### 8.1 ドキュメント保存
- `docSerialize.cameraFrames` / `docDeserialize.cameraFrames` で保存・復元。
- 保存フィールド: `enabled`, `renderBox`（baseSize/scalePct/scale/anchor/center/fitScale/viewZoom/lastViewport/projection）、`frames`、`mask`（scope 含む）、`nearClip`、`exportName`、`exportFormat`、`exportGridOverlay`、`exportModelLayers`、`exportTarget`、`exportPresetIds`、`selectedId`、`mainCameraPose`、`version`（cameraFramesVersion）。
- 参照画像の保存は別系統（`docSerialize.referenceImage` / `docDeserialize.referenceImage`）で行う。Export に影響する `includeInRender` / `visible` / `layer` / `opacity` は参照画像側の永続化対象。
- 読み込み時:
 - legacy `uiScale/viewScale/fovY` に対応。
 - scale を 100%以上・16000px 以下へクランプ。viewZoom を 25?100 に正規化。
 - nearClip は安全値へ補正。`selectedId` に合わせて selected を再設定（指定無ければ先頭）。
 - ビューポート情報が不足しても現在の viewport から AutoFit を推定。
 - projection.baseFov が無ければカメラ fov から補完。mainCameraPose が無ければ現在のカメラから補完。

### 8.2 Undo / Redo（`CameraFramesHistory`）
- スナップショット履歴。ドラッグ開始/終了で begin/commit、連続編集は `debounced`（250ms）。
- 対象:
 - enabled トグル
 - renderBox: scalePct/scale、anchor、center、fitScale、viewZoomPct、projection.baseFov
 - frames: 追加/削除/選択/pos/scalePct/rotationDeg/anchor/order、アンカー・回転リセット
 - mask: enabled/opacity/scope
 - nearClip
 - mainCameraPose（撮影表示/撮影カメラ操作パネルでの transform/nav/fov/near 編集含む）
 - レンダーボックスパン（Shift+ドラッグ）
- Export 設定（exportName/exportFormat/exportGridOverlay/exportModelLayers/exportTarget/exportPresetIds）は履歴対象外。
- 履歴適用後は `cameraFrames.stateChanged` を再送して UI を同期し、オーバーレイカーソルを再計算。

---

## 9. 実装責務とモジュール分担

### 9.1 CameraFramesController（`src/camera-frames.ts`）
- 状態管理、ビューポートマッピング、フラスタム計算、オーバーレイ描画、ポインタ操作、export パイプラインを担当。
- `camera.setCustomFrustum` に外挿フラスタムを渡し、CAMERA FRAMES 有効時は `camera.rect/scissorRect` を使わない。
- near override 適用、cameraFramesVersion 表示の付与、History 連携、mainCameraPose/viewportPose の切替・復元、viewport lens 提供を行う。
- CAMERA FRAMES ON または mainEditMode（撮影カメラ操作パネル表示中）のとき、撮影フラスタムを debugLayer に選択色で描画。タイムライン再生中は mainPose の自動更新を抑止。

### 9.2 UI パネル（`src/ui/camera-frames-panel.ts`）
- PCUI パネル構築、入力値のバリデーションとイベント発火、パネル移動/折りたたみ、レンダリングボタン・スピナー制御。
- FOV(mm) / Viewport lens(mm) の範囲更新、出力解像度とビューポート溢れ警告表示、グリッド/モデルレイヤートグルの状態管理、撮影/編集表示の切替と撮影カメラ操作パネルの開閉管理、transform 入力の適用先切替。

### 9.3 カメラ / シーン（`src/camera.ts`, `src/scene.ts`）
- `camera.setCustomFrustum` で渡された値を投影行列に反映。CAMERA FRAMES 有効時はアスペクト/水平FOVを固定し、Rect/Scissor を毎フレーム 0,0,1,1 へリセット。
- `camera.setLockFraming` で aspectRatio をロックし、targetSize 変化に合わせて render target を再確保。
- `scene.onPreRender` で aspectLock 情報を参照、`cameraFrames.forceRefreshViewport` を postrender で再送して初期レイアウトずれを補正。

### 9.4 render.offscreen（`src/render.ts`）
- オフスクリーン描画とグリッド/アイレベルオーバーレイの抽出、premultiplied alpha の解除（unpremultiplyAlpha オプション）、上下反転処理を担う。
- overlaysOnly 指定時は背景/シャドウ/オーバーレイ/ギズモ/World を無効化してピュアなオーバーレイを返す。
- `includeReferenceImage` により参照画像レイヤー（front/back）を offscreen 出力へ含める/除外できる。CAMERA FRAMES のベース描画は常に `false` とし、参照画像は別レイヤー合成に分離する。

---

## 10. 受け入れテスト（更新版）

1. **リサイズ不変性**: ウィンドウ幅・高さを変えても、アンカー基準のスクリーン座標が一致し、構図がずれない。`renderBox.center` が補正されること。
2. **ズームバック 50%**: viewZoom 100 → 50 でレンダーボックスとフレームが均等縮小し、黒帯が出ず周囲シーンが表示される。
3. **アンカー付き拡大**: 左上アンカー + 横 150% で左上構図が不変、視野が右下へだけ増える。y 反転ロジックにより上下が正しく保たれる。
4. **ズーム×拡大の繰り返し**: レンダーボックススケールと viewZoom を交互に変更しても構図が漂移しない（毎回再計算）。
5. **プレビュー＝書き出し**: 任意設定で PNG/PSD を出力し、ビューポート内レンダーボックス領域とピクセル一致。viewZoom は 100% 固定で適用されること。Export 後にプレビューフラスタムへ戻ること。
6. **FOV 表示**: スケール/ズームを変えても FOV(mm) 表示は変化せず、FOV 操作時のみ構図が変わる。HFOV が 10?120° にクランプされる。
7. **縦長構図**: baseSize を縦長に変更しても FOV 軸が水平固定のまま。PlayCanvas の自動 vertical 切替が起きない。
8. **フレーム操作**: 移動の Shift 軸ロック、Alt 対称拡縮、回転 15° スナップ、ダブルクリックで回転/フレームアンカーリセットが動作。ヒット優先は最前面。
9. **マスク**: scope=selected で選択フレーム外だけが暗くなる（選択なしは全体）。書き出しには含まれない。
10. **グリッド/アイレベル出力**: Export でオーバーレイを有効にすると、PNG では合成、PSD では専用レイヤーが追加され、premultiply の不整合がない。
11. **モデルレイヤー出力 (PSD)**: 複数モデルを可視にして PSD 出力すると、モデルごとに個別レイヤーが追加され、World/グリッド/ギズモが混ざらない。
12. **Undo/Redo**: ドラッグ開始/終了で 1 ステップ、連続入力は 250ms でまとめられる。レンダーボックス・viewZoom・FOV・nearClip・フレーム編集・マスク・mainCameraPose が履歴対象で、export 設定は対象外。
13. **CAMERA FRAMES OFF のレンズ/pose**: 編集表示で viewport lens(mm) を動かすと通常カメラの FOV が変わる。撮影カメラ操作パネルで撮影カメラの pose/FOV/near を編集すると撮影フラスタムがデバッグ描画され、有効化時に適用される。
14. **参照画像の書き出し**: 参照画像を読み込み、表示を ON にした上で Export の Reference トグルを ON/OFF すると、PNG/PSD に参照画像が含まれる/含まれないが切り替わる。front/back の指定に応じて PSD の `Reference` が underlay/overlay に分かれ、PNG でも前後関係が一致する（opacity の扱い: PNG は焼き込み、PSD はレイヤー opacity）。

---

## 付録 A: Rect/Scissor モデル（参考）
フラスタム拡張方式へ移行したため、`camera.rect` / `camera.scissorRect` は常に `0,0,1,1` にリセットする。 
v3 まで使用していた Rect/Scissor による正規化座標計算は、px→world 変換の検証用参考情報としてのみ保持する。
```ts
rectNorm.x = rectPx.x / vw;
rectNorm.y = rectPx.y / vh;
rectNorm.w = rectPx.w / vw;
rectNorm.h = rectPx.h / vh;
```

---

## 付録 B: クランプ値・UI 表示まとめ
- viewZoom: 25?100 (%)
- renderBox scalePct: 最小100%、最大は baseSize を 16000px まで（軸ごと）
- frame scalePct: 10?400%（UI 入力 1?500% だが実際は 10?400 にクランプ）
- FOV: HFOV 10?120° クランプ、eqMm はクロップに応じて変動
- nearClip: 0 < near < far、far×0.1 以内 / シーン半径×0.5 以内に補正
- フレーム数: 最大 20
- ハンドルサイズ: 10px、回転ハンドルは枠から 30px 上
