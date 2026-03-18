# Unified Frustum Prototype Plan

## 目的

- PlayCanvas Engine の unified renderer を `CAMERA_FRAMES` の custom frustum で成立させられるかを検証する
- app 側の editor 機能ではなく、Engine unified が見ている camera model の齟齬を切り分ける
- 成立に必要な差分が
  - app adapter で吸収できるのか
  - Engine patch が必要なのか
  を最小範囲で特定する

## 実験ブランチ

- branch: `codex/unified-frustum-prototype`
- baseline: `camera-frames`
- reference only: `codex/unified-display-prototype`
- handoff:
  - `docs/unified-frustum-prototype-handoff.md`

旧 `codex/unified-display-prototype` は破棄せず、既知の崩れ方と試行ログの参照用として残す。
ただし新しい実験はそこへ継ぎ足さず、`camera-frames` の stable から clean にやり直す。

## 第一段の対象

第一段は `display-only unified` に限定する。

- 3DGS 表示
- GLB と 3DGS の遮蔽
- culling
- sort
- LOD

## 第一段で意図的に対象外にするもの

原因切り分けを濁らせるので、最初は入れない。

- picking
- selection 表示
- transform
- separate / duplicate
- hidden / deleted / lock / tint
- overlay
- save / load parity

## 実験順

1. culling
2. sort
3. LOD

理由:

- culling は `projectionMatrix / viewMatrix` 側の整合を見る最短経路
- sort は `forward` 前提のズレを炙りやすい
- LOD は `forward / fov` の仮定が強く、最後に見る方が切り分けしやすい

## 成功条件

- `CAMERA_FRAMES` ON で unified display が崩れない
- custom frustum で visible region が merged renderer と実質一致する
- GLB と 3DGS の遮蔽が破綻しない
- どの差分が Engine 側で必要かを具体的に言語化できる

## 失敗条件

- camera model の齟齬が Engine patch なしでは吸収不能
- sort / cull / LOD のどこで破綻するか切り分け不能
- app 側 workaround が増えすぎて stable 保守を悪化させる

## 次の判断

第一段の結果で次を決める。

- 小さい patch で済む: fork 側で Engine patch を持つ案を評価
- patch が大きい: unified 実験は凍結し、merged を維持しつつ upstream を待つ
- app adapter で吸収可能: `display` backend のみ unified へ差し替える実験を続ける

## 2026-03-17 時点の追加所見

- large PLY の初期崩れは `LoD` ではなく CPU sort の `sortKey overflow` が主因だった
- warning:
  - `[SortWorker] ... splats lost due to sortKey overflow. Check resource AABB bounds contain all the splats.`
- prototype で direct engine `gsplat` に `customAabb = localBoundStorage` を渡すと、large PLY では sort 用 AABB が不足しやすい
- `unified-display` 時は resource 既定 AABB を使うことで、ロード直後の large PLY 表示は正常化した

この時点での結論:

- `display-only unified` の入口自体は成立する
- custom frustum 以前に、prototype adapter 側で direct engine `gsplat` へ何の bounds を渡すかが重要

## 2026-03-18 時点の追加所見

- `CAMERA_FRAMES OFF -> ON` 復帰直後の表示崩れは、projection 変化に対して unified-display 側の refresh が足りていなかったのが主因だった
- `customFrustum / nearOverride / targetSize / aspect / projection種別` を監視して direct refresh を走らせることで改善した
- 現在の prototype baseline は
  - `render-backend.mode=unified-display`
  - `render-backend.unified-culling=false`
  である
- 次の論点は、baseline を崩さずに `culling` を再導入したとき custom frustum と両立するかどうか

### 現時点の安全境界

- perspective camera:
  - unified-display を継続評価してよい
- orthographic camera:
  - 3DGS 本体の compositing / clipping がまだ安定しない
  - prototype では merged fallback を安全境界とする
