# Unified Frustum Prototype Handoff

最終更新: 2026-03-20

この文書は **historical archive**。  
`codex/unified-frustum-prototype` で確認した主な知見のうち、現在も意味があるものだけを残す。

現在の source of truth は次。

- [docs/render-backend-transition-status.md](/D:/GitHub/supersplat-cameraframes/docs/render-backend-transition-status.md)
- [docs/camera-frames-upstream-notes.md](/D:/GitHub/supersplat-cameraframes/docs/camera-frames-upstream-notes.md)

## trunk に取り込まれた成果

以下は現在 `camera-frames` trunk に入っている。

- `unified-display` の display-only 実装
- large PLY の `sortKey overflow` 回避
- `CAMERA_FRAMES OFF -> ON` 復帰修正
- idle refresh 暴走抑止
- whole-splat color adjustments
- per-splat state visuals
- partial splat transform 中/後の direct 維持
- `box / sphere` 選択結果の world-space 化
- selection volume の depth-aware occlusion
- `visible/unfocused` と `hidden/background/minimized` での direct 維持
- orthographic layout 作業での direct 維持

## prototype から残った重要知見

### 1. large PLY では editor 用 AABB を engine sort に流さない

direct engine `gsplat` に editor 用 `customAabb` を渡すと、large PLY で `sortKey overflow` を起こしやすい。  
現在も「engine display/sort 用 bound は resource 既定を優先」が重要。

### 2. projection 変化は refresh 署名で監視する

`customFrustum / nearOverride / targetSize / aspect / projection type / orthoHeight` の変化で direct refresh を入れないと、

- `CAMERA_FRAMES OFF -> ON`
- ortho / perspective 切替

で表示崩れが出やすい。

### 3. ortho は `linear sort + near clip` の組み合わせが要点

prototype 初期は

- `ortho + merged fallback`
- `ortho + radial sort hack`

を通ったが、現在の trunk では

- `ortho + linear sort`
- unified shader chunk への near clip 補完

で、

- grid
- GLB
- slice

を同時に成立させている。

### 4. hidden / unfocused fallback は必須ではなかった

当初の fallback は保守的な安全弁だった。  
refresh 制御を整理した結果、現在の trunk では direct 維持で実害が出ていない。

## いま見なくてよい古い前提

以下は現状では obsolete。

- `orthographic camera -> merged fallback`
- `window unfocused -> merged fallback`
- `prototype を stable へ staged merge する` という作業前提

## 次に見る場所

- [docs/render-backend-transition-status.md](/D:/GitHub/supersplat-cameraframes/docs/render-backend-transition-status.md)
- [docs/camera-frames-upstream-notes.md](/D:/GitHub/supersplat-cameraframes/docs/camera-frames-upstream-notes.md)
