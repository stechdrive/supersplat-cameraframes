# Render Backend Transition Status

最終更新: 2026-03-20  
対象 trunk: `camera-frames`  
現在の CAMERA_FRAMES 版: `v2.21.11`

## 目的

- `CAMERA_FRAMES` 固有機能
  - custom frustum
  - world 座標カメラ
  - render box / overlay / export
  を壊さずに upstream SuperSplat / PlayCanvas Engine へ追従する
- unified renderer を「別物として全面移植」するのではなく、app 側の境界を明確にして差し替えコストを下げる

## 現在地

`camera-frames` には、renderer 分離と projection contract の第一段に加えて、`unified-display` の実運用停止線まで入っている。

すでに trunk に入っている主要要素:

- `SplatRenderBackend` の role 分離
  - `lifecycle`
  - `display`
  - `data`
  - `picking`
  - `overlay`
- `SplatRenderSystem` の merged renderer core 化
- `renderBackend.mode` と `capabilities`
- camera projection contract 第一段
  - `customFrustum`
  - `nearOverride`
  - `targetSize`
  - ray basis / matrix fallback の整理
- `unified-display` 実装
  - large PLY 安定化
  - `CAMERA_FRAMES OFF -> ON` 復帰修正
  - idle refresh 暴走抑止
  - whole-splat color adjustments
  - per-splat state visuals
  - partial splat transform 中/後の direct 維持
  - `box / sphere` 選択結果の world-space 化
  - selection volume の depth-aware occlusion
  - `visible/unfocused` / `hidden/background/minimized` でも direct 維持
  - ortho layout 作業での direct 維持

## 現在の既定動作

コード上の既定 `renderBackend.mode` はまだ `merged`。  
`unified-display` は opt-in で使う前提になっている。

- 既定:
  - `merged`
- baseline:
  - `http://localhost:3000/?render-backend.mode=unified-display`
- debug:
  - `http://localhost:3000/?render-backend.mode=unified-display&render-backend.debug-state=true`
- 現在の前提:
  - `render-backend.unified-culling=false`

これは「unified が不安定だから」ではなく、upstream 追従と rollback 性を保つための運用上の保守設定。

## 現在の unified-display の判断

### 成立していること

- perspective での通常編集
- orthographic での layout 作業
  - 3DGS object 全体の move / scale
  - GLB を基準にした実寸合わせ
  - 視線方向スライス調整
- `visible but unfocused`
- `hidden / background tab / minimized`
- `CAMERA_FRAMES OFF -> ON` 復帰
- large PLY 初期表示
- `box / sphere` 選択結果と selection volume 表示

### 現在の fallback 境界

camera mode や window state ではなく、**direct 非互換な editor / splat 状態**が fallback 境界。  
つまり現在の主な設計思想は「安全な限り unified-display を維持する」。

## upstream 追従の観点で今強い点

### 1. custom frustum の責務が camera 側に寄った

`customFrustum` / `nearOverride` / `targetSize` は [camera.ts](/D:/GitHub/supersplat-cameraframes/src/camera.ts) と `camera-frames-*` 側へ寄っている。  
そのため、renderer が upstream 側で変わっても、camera policy の吸収点が比較的明確。

### 2. unified と merged の切替境界が 1 箇所に寄った

renderer 切替と direct/fallback の判断は主に [splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts) に集約されている。  
upstream の unified renderer 更新が来ても、影響範囲をここで受け止めやすい。

### 3. merged を完全に捨てていない

editor data / picking / overlay / fallback の土台として merged backing data を維持している。  
upstream 変更で unified 側が一時的に不安定でも、app 全体の保守性を落としにくい。

## upstream 追従時の要注意点

以下は upstream 取り込みでうっかり壊れやすい場所。

### 1. `gsplatCenterVS` shader chunk override

[splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts) で、`unified-display` 用に PlayCanvas の `gsplatCenterVS` を app 側で上書きしている。

理由:

- Engine 標準の unified shader chunk には near clip 判定がない
- `ortho + linear sort` で前後スライスを成立させるには、ここで near clip を補う必要がある

upstream 変更で

- chunk 名
- uniform 名
- GLSL/WGSL 両対応

が変わると、**ortho の slice / grid / GLB が再び壊れる**可能性がある。

### 2. `scene.gsplat` の policy 設定

[splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts) の `configureUnifiedDisplaySceneGsplat()` で、

- `culling`
- `radialSorting`
- `colorUpdateAngle`
- `colorUpdateDistance`

を明示的に制御している。

特に重要なのは:

- perspective: `radialSorting = true`
- orthographic: `radialSorting = false`

この前提が変わると、

- ortho で grid / GLB が崩れる
- slice が効かない

のどちらかへ戻りやすい。

### 3. projection refresh 署名

`unified-display` の projection refresh は

- `customFrustum`
- `nearOverride`
- `targetSize`
- `aspect`
- `projection type`
- `orthoHeight`

を署名に含めている。  
upstream 側で camera / layer update のタイミングが変わったら、まずここを疑う。

### 4. large PLY と `customAabb`

direct engine `gsplat` に editor 用 AABB をそのまま渡すと、large PLY で `sortKey overflow` を再発しやすい。  
現在は unified-display 時に resource 既定 AABB を使う前提。

upstream の AABB / culling 変更を取り込む際は、

- editor 用 bound
- engine sort / display 用 bound

を再び混ぜないこと。

### 5. merged backing data の役割

`unified-display` でも merged backing data はまだ必要。

主な理由:

- picking
- overlay
- fallback
- editor state の橋渡し

upstream 変更で「merged をもう消せるはず」と早く判断しないこと。

## いまの評価

いまの trunk は、

- `CAMERA_FRAMES` の特殊要件が重すぎて upstream 追従不能

という状態ではない。  
むしろ、

- **camera policy**
- **renderer adapter**
- **engine unified 内部依存**

の境界がかなり見えている。

つまり今後の勝負は、

- custom frustum を維持できるか

ではなく、

- unified renderer の内部変更に対して app 側 adapter をどれだけ薄く保てるか

に移っている。

## 残っている課題

- `unified-culling=true` の再評価
- `renderBackend.mode` の既定をいつ unified-display へ寄せるか
- `gsplatCenterVS` override のような engine internals 依存をどこまで減らせるか

## upstream 追従時の最小 smoke

upstream を batch で入れたら、最低限これを確認する。

- perspective で `unified-display`
- ortho で object move / scale
- ortho で前後スライス
- grid 表示
- GLB と 3DGS の重なり
- `CAMERA_FRAMES OFF -> ON`
- large PLY 初期表示
- `box / sphere` 選択結果と枠線表示

## 参照先

- [docs/camera-frames-upstream-notes.md](/D:/GitHub/supersplat-cameraframes/docs/camera-frames-upstream-notes.md)
- [docs/unified-frustum-prototype-handoff.md](/D:/GitHub/supersplat-cameraframes/docs/unified-frustum-prototype-handoff.md)
- [src/splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts)
- [src/camera.ts](/D:/GitHub/supersplat-cameraframes/src/camera.ts)
