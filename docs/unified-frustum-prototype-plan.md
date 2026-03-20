# Unified Frustum Prototype Plan

最終更新: 2026-03-20

この文書は **archived plan**。  
`codex/unified-frustum-prototype` の当初計画は、必要な範囲の多くがすでに `camera-frames` へ取り込まれた。

現在の作業判断には、次を参照する。

- [docs/render-backend-transition-status.md](/D:/GitHub/supersplat-cameraframes/docs/render-backend-transition-status.md)
- [docs/camera-frames-upstream-notes.md](/D:/GitHub/supersplat-cameraframes/docs/camera-frames-upstream-notes.md)

## 当初計画で重要だった問い

- PlayCanvas Engine の unified renderer を `CAMERA_FRAMES` の custom frustum で成立させられるか
- app adapter で吸収できるのか
- Engine patch が必要なのか

## 現在の答え

- display-only unified は trunk で成立している
- custom frustum / nearOverride / targetSize は camera 側の境界に寄せられている
- 問題の中心は `CAMERA_FRAMES` 固有機能そのものではなく、engine unified の内部変更に app adapter がどう追従するかへ移った

## まだ残るテーマ

- `unified-culling=true` の再評価
- unified-display を既定へ寄せるかどうか
- engine internal 依存
  - shader chunk override
  - `scene.gsplat` policy
  - unified manager / director 依存

## archive として残す理由

当初の

- culling
- sort
- LOD

の切り分け順

や、

- large PLY の `sortKey overflow`
- projection refresh 不足

の発見経緯を思い出したいときの参照先として意味があるため。
