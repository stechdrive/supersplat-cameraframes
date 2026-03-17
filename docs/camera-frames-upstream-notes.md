# CAMERA_FRAMES Upstream Notes

このメモは、`camera-frames` 系の upstream 追従で判断を忘れないための短いログです。
`codex/upstream-2.24.2-staged-integration` 以降の作業で参照する前提です。

render backend の移行方針と stable / prototype の境界は `docs/render-backend-transition-status.md` を参照。

## 方針

- 一括 merge はしない
- batch ごとに取り込む
- `camera.ts` / `render.ts` / `timeline` / overlay を触ったら実機確認を入れる
- stable bugfix は先に `camera-frames` で直し、その後 separation/integration ブランチへ取り込む

## 変形取り込み・skip

### `#811 Fix video codec reclamation when tab is backgrounded`

- そのままではなく変形取り込み
- upstream の `Web Lock` と encoder 再生成は採用
- 以下は CAMERA_FRAMES 側実装を維持
  - `includeReferenceImage`
  - reference layer の一時 disable / restore
  - `scene.renderSystem.waitForSorter()` ベースの sort 待機

### `#831 Upgrade viewer export format to v2 with per-pose FOV and loop mode`

- そのままではなく変形取り込み
- 採用
  - viewer export format v2
  - per-pose `fov`
  - loop mode UI
  - `docDeserialize.poseSets(..., document.camera?.fov)`
- 維持
  - CAMERA_FRAMES の `customFrustum`
  - world pose / backend 分離
  - merged renderer 前提の `splat-overlay`

### `#833 Fix splat overlay rendering performance`

- 現時点では skip
- upstream の意図は splat overlay の軽量化
  - 毎フレームの VAO 作成回避
  - `material.update()` 削減
  - `gl_FragDepth` 書き込み削除
- この fork では前提が違う
  - merged splat renderer
  - CAMERA_FRAMES の `customFrustum`
  - 独自の overlay 投影/位置合わせ
- そのまま適用すると表示崩れの再発リスクが高い
- 将来 `splat render backend` を upstream 側へ寄せられたら再評価する

## 既知課題

### Timeline / Camera Pose

- upstream の timeline camera animation は SuperSplat 標準の camera pose 前提
- CAMERA_FRAMES は world pose + output/viewpoint 分離 + `customFrustum` 前提
- 現状は「キーを打てる / 再生できる」が、再生時の座標系が完全一致しない
- これは timeline バグではなく `camera backend` 統合課題として扱う

## 実機確認の最小セット

- 無限平面グリッド
- XYZ gizmo
- CAMERA_FRAMES の白枠 / 赤枠
- render box の Shift ドラッグ / 表示倍率
- PNG / PSD export
- GLB PSD layer mask
- timeline key drag / copy
- splat separate / duplicate

## 残作業の推奨順

1. 低リスクの小修正を先に取り込む
2. 依存更新は commit 単位で何度も cherry-pick せず、最後に最終状態へ手動同期する
3. `#833` は skip 継続
4. camera animation 座標差は upstream 取り込み完了後に別タスクで直す
