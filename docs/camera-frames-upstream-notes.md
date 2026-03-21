# CAMERA_FRAMES Upstream Notes

最終更新: 2026-03-20

このメモは、`camera-frames` への upstream 追従で **見落とすと壊れやすい点** を短く残すためのもの。  
現在の trunk 状態そのものは [docs/render-backend-transition-status.md](/D:/GitHub/supersplat-cameraframes/docs/render-backend-transition-status.md) を参照。

## 基本方針

- `camera-frames` を直接壊さない
- 必ず `codex/*` 作業ブランチで batch 取り込みする
- `camera.ts` / `camera-frames*` / `splat-render-backend.ts` / `splat-render-system.ts` / shader 周辺は後半 batch に回す
- batch ごとに `lint/build` と実機確認を入れる

## unified / custom frustum の watch points

### 1. `gsplatCenterVS` override

[src/splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts) で、PlayCanvas の `gsplatCenterVS` を GLSL/WGSL 両方とも上書きしている。

理由:

- Engine unified 標準の chunk には near clip 判定がない
- `ortho + linear sort` で slice を成立させるには app 側補正が必要

upstream 変更で

- chunk 名
- uniform 名
- `ShaderChunks` の API

が変わったら、**ortho の grid / GLB / slice を最優先で再確認**すること。

### 2. `scene.gsplat` policy

`applyUnifiedDisplaySceneGsplatPolicy()` の前提:

- `unifiedCulling=false`
- perspective は `radialSorting=true`
- orthographic は `radialSorting=false`
- `colorUpdateAngle=0`
- `colorUpdateDistance=0`

upstream 取り込みでこの前提を崩すと、

- ortho compositing
- slice
- unnecessary refresh

が壊れやすい。

### 3. projection refresh 署名

`getUnifiedDisplayProjectionSnapshot()` で見ている項目:

- `customFrustum`
- `nearOverride`
- `targetSize`
- `aspect`
- `projection type`
- `orthoHeight`

upstream 側の camera update / render pass 順が変わったら、`CAMERA_FRAMES OFF -> ON` や ortho/perspective 切替の崩れをここから疑う。

### 4. large PLY と AABB

direct engine `gsplat` に editor 用 AABB をそのまま渡さない。  
large PLY では `sortKey overflow` を再発しやすい。

原則:

- editor 用 bound
- engine display/sort 用 bound

は分ける。

### 5. merged backing data はまだ必要

`unified-display` を使っていても、merged backing data は次でまだ必要。

- editor data
- picking
- overlay
- fallback

upstream 側が進んでも、ここを急いで消さない。

## camera / CAMERA_FRAMES 側の watch points

### 1. projection contract を bypass しない

`customFrustum` / `nearOverride` / `targetSize` の計算は camera 側 helper に寄せている。  
upstream 取り込み時に、旧来の `projectionMatrix / fov / viewMatrix` 直参照へ戻さないこと。

### 2. `CAMERA_FRAMES` の機能ポリシーは camera.ts に残してよい

抽象化しすぎない。

- `setCustomFrustum()`
- serialize / deserialize
- `nearOverride`
- clipping policy
- render box / main camera pose

は `CAMERA_FRAMES` 機能そのもの。

## 既存の変形取り込み / skip メモ

### `#811 Fix video codec reclamation when tab is backgrounded`

- 変形取り込み
- `Web Lock` と encoder 再生成は採用
- 以下は CAMERA_FRAMES 側を維持
  - `includeReferenceImage`
  - reference layer の一時 disable / restore
  - `scene.renderSystem.waitForSorter()` ベースの sort 待機

### `#831 Upgrade viewer export format to v2 with per-pose FOV and loop mode`

- 変形取り込み
- 採用
  - viewer export format v2
  - per-pose `fov`
  - loop mode UI
- 維持
  - `customFrustum`
  - world pose / backend 分離
  - CAMERA_FRAMES 側 overlay/export 前提

### `#833 Fix splat overlay rendering performance`

- いまも skip 寄り
- この fork は
  - custom frustum
  - merged backing data
  - 独自 overlay 投影
  の前提差が大きい
- upstream 側 overlay の前提が変わったら再評価する

## upstream batch 後の最小 smoke

- perspective で `unified-display`
- ortho で object move / scale
- ortho で前後スライス
- grid
- GLB と 3DGS の重なり
- `CAMERA_FRAMES OFF -> ON`
- large PLY
- `box / sphere` 選択結果と枠線遮蔽
- reference image の前後表示
- PNG / PSD export
