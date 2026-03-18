# Unified Frustum Prototype Handoff

最終更新: 2026-03-18

## 目的

- `CAMERA_FRAMES` の stable を壊さずに、PlayCanvas Engine の unified renderer を将来取り込めるか検証する
- ただし本件の主題は editor 全体移行ではなく、まず `display-only unified` を安全に成立させること
- 特に `CAMERA_FRAMES` の custom frustum と unified renderer の camera model の齟齬を切り分ける

## 現在のブランチと checkpoint

- stable branch:
  - `camera-frames`
- experiment branch:
  - `codex/unified-frustum-prototype`
- 現在の最新 commit:
  - `012456c fix(render): stabilize unified display idle refresh`

直近の重要 commit:

- `012456c fix(render): stabilize unified display idle refresh`
  - direct mode 中の毎フレーム refresh 再投入をやめ、idle 放置時の sorter 暴走を抑止
  - `window unfocused` 時は merged fallback
- `2bb654c fix(render): bound unified display to safe camera modes`
  - orthographic camera は merged fallback
  - perspective のみ unified-display を継続評価
- `7eed0d9 fix(render): refresh unified display on projection changes`
  - `CAMERA_FRAMES OFF -> ON` 復帰時の表示崩れを修正
- `2cd8357 fix(render): restore large unified display bounds`
  - large PLY の `sortKey overflow` を修正

## 現在の安全境界

`codex/unified-frustum-prototype` の現時点の実験方針は次。

- perspective camera:
  - unified-display を使う
- orthographic camera:
  - merged fallback
- browser unfocused / hidden:
  - merged fallback
- projection 変化時:
  - unified 側へ refresh を入れる
- idle 中:
  - 毎フレーム refresh を積まない

## 現在の baseline URL

- baseline:
  - `http://localhost:3000/?render-backend.mode=unified-display`
- debug state:
  - `http://localhost:3000/?render-backend.mode=unified-display&render-backend.debug-state=true`
- culling 実験用:
  - `http://localhost:3000/?render-backend.mode=unified-display&render-backend.unified-culling=true`

通常の再開や耐久確認は baseline を使う。

## このブランチで確認できたこと

### 1. large PLY の初期崩れ

- 原因は `LoD` ではなく `sortKey overflow`
- direct engine `gsplat` に `customAabb = localBoundStorage` を渡すと、large PLY で sort 用 AABB が不足する
- `unified-display` 時は resource 既定 AABB を使うようにして解消した

### 2. `CAMERA_FRAMES OFF -> ON` 復帰時の表示崩れ

- 原因は projection 変化に対して unified-display 側の refresh が足りていなかったこと
- `customFrustum / nearOverride / targetSize / aspect / projection種別` の変化を監視して direct refresh をかけることで改善した

### 3. ortho での崩れ

- perspective では概ね成立
- ortho では
  - grid 表示
  - GLB 遮蔽
  - 3DGS 本体の compositing / clipping
  が不安定
- prototype では `orthographic camera -> merged fallback` を安全境界にした

### 4. idle 放置での `Array buffer allocation failed`

最初は次を疑った。

- ortho fallback と direct restore の往復
- browser unfocused 時の挙動

実際の根本原因として濃かったのは次。

- `onPreRender` で毎フレーム `syncEngineComponents()` を呼ぶ
- direct mode 中も毎フレーム `scheduleDirectRefresh()` が再投入される
- unified CPU sorter が並び替えバッファを繰り返し確保しようとする
- `gsplat-unified-sorter.js:135` で `Array buffer allocation failed`

修正後は、実データ変化時だけ refresh を再投入するようにした。

## 再開時に見るべきファイル

- [docs/unified-frustum-prototype-plan.md](/D:/GitHub/supersplat-cameraframes/docs/unified-frustum-prototype-plan.md)
- [docs/render-backend-transition-status.md](/D:/GitHub/supersplat-cameraframes/docs/render-backend-transition-status.md)
- [src/splat-render-backend.ts](/D:/GitHub/supersplat-cameraframes/src/splat-render-backend.ts)
- [src/splat.ts](/D:/GitHub/supersplat-cameraframes/src/splat.ts)

## 既知のノイズ

以下は今回の本筋ではない。

- `error: function not found 'selection.splatActive'`
- `Camera Camera does not render layer Reference Back/Front`
- `requestAnimationFrame handler took ...ms`
- service worker の `installing / waiting / activating`

## いまの判断

現時点では、prototype は次の停止線まで来ている。

- `perspective` では軽い unified-display を実用寄りに検証できる
- unsafe な条件
  - ortho
  - unfocused
  では merged へ逃がせる
- `CAMERA_FRAMES OFF -> ON` 復帰や large PLY 初期表示の既知クラッシュは抑えられている
- idle 放置時の sorter 暴走も、直近の修正でかなり改善した

## 次にやる候補

優先順は次。

1. perspective 常用時の安定性確認
   - 長時間放置
   - large scene
   - GLB + 3DGS
   - 複数 3DGS の移動
2. direct display を維持できる editor state を少し広げる
   - 現在は conservative に merged fallback へ倒している
3. unified culling の再評価
   - baseline を壊さない条件でだけ再開する
4. Engine patch の必要性再評価
   - custom frustum や ortho を unified 側で持つ価値があるかを判断する

## 再開時の注意

- まず `baseline` で確認する
- `culling` 実験 URL は混ぜない
- ブラウザの `localhost:3000` タブは 1 枚に絞る
- Console は `Preserve log` を ON にしておく
- 長いログが出たら、末尾だけでなく `fallback to merged` / `direct mode restored` / `Array buffer allocation failed` の並びを確認する
