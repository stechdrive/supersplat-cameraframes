# Render Backend Transition Status

## 目的

- `camera-frames` の現行 merged renderer を安定運用したまま upstream SuperSplat 追従を続ける
- 将来 PlayCanvas Engine / upstream SuperSplat が unified renderer を editor 側で採用したときに、差し替えコストを下げる
- `CAMERA_FRAMES` 固有機能
  - custom frustum
  - world 座標カメラ
  - 白枠 / 赤枠
  - overlay / export
  を壊さずに保守する

## stable に入れた範囲

`camera-frames` には `codex/stage4-processor-layout` の停止線まで入っている。

- `ProcessorInputLayout` 導入
- `SplatRenderBackend` の role 分離
  - `lifecycle`
  - `display`
  - `data`
  - `picking`
  - `overlay`
- `SplatRenderSystem` の merged renderer core 化
- `rebuild()` の build/apply フェーズ分割
- `renderBackend.mode` と `capabilities` の導入

この状態での既定動作は従来通り `merged`。

## stable に入れていない範囲

次はまだ `camera-frames` へ戻していない。

- per-splat engine `gsplat` binding
- `unified-display` 実験実装
- `worldLayer` での engine direct display 試験
- `CAMERA_FRAMES` custom frustum と Engine unified の整合確認コード

これらは `codex/unified-display-prototype` に残している。

## なぜ分けたか

PlayCanvas Engine の unified renderer は存在するが、この fork の `CAMERA_FRAMES` は custom frustum を前提にしている。
一方で、現時点の Engine unified 側は culling / sort / 表示判定で `camera.projectionMatrix` / `viewMatrix` / `fov` を直接参照するため、
custom frustum と整合しない可能性が高い。

そのため、stable には「将来の差し替え土台」だけを戻し、
実際の unified 表示実験は別ブランチに隔離する方が安全。

## 現在の到達点

2026-03-17 時点の stable 判断は次。

- stable branch: `camera-frames`
- stable 停止線 commit: `580e16f`
- experimental branch: `codex/unified-display-prototype`

projection contract の抽出は別レーンで継続している。

- work branch: `codex/camera-projection-contract`
- 導入済み
  - `CameraProjectionData`
  - `buildCameraProjectionData()`
  - `screenToWorld / getRay / worldToScreen` の contract 経由化
  - `invViewProjection` を含む派生行列の共通化
  - optical axis / forward-pick の screen 座標導出を projection contract へ移動
  - camera uniform 用 ray basis の組み立てを helper 化
  - legacy fallback 条件を `resolveCameraRayBasis()` に集約
  - `screenToWorld / getRay` の projection/fallback 解決を helper 化
  - current matrix fallback を `resolveCameraProjectionData()` に集約
- 目的
  - custom frustum を renderer の偶発的な実装詳細ではなく、projection override として明示する
  - 将来 unified backend や upstream 実装が入っても、camera 側の境界で吸収しやすくする

### 第一段の停止候補

projection contract の第一段は、次の条件を満たした時点で一度止めてよい。

- `camera.ts` の `worldToScreen / screenToWorld / getRay / optical axis / ray basis / projection fallback` が helper 経由になっている
- `eye-level / infinite-grid / splat-overlay` が `resolveCameraProjectionData()` を通る
- `customFrustum` の直接参照が「projection の数式」ではなく「CAMERA_FRAMES の機能ポリシー」に限られている

2026-03-17 時点では、この停止候補に到達している。

### まだ camera.ts に残してよいもの

以下は projection contract へ無理に押し込まない。

- `setCustomFrustum()` と serialize / deserialize
- clipping plane policy
  - `nearOverride`
  - `customFrustum` 有無による near/far 調整
- clip log / debug log
- CAMERA_FRAMES 固有の UI / state 同期

これらは camera projection の抽象化ではなく、CAMERA_FRAMES 機能そのものだから。

## 次に進むときの方針

1. stable では引き続き upstream SuperSplat 追従を優先する
2. unified 実験は `codex/unified-display-prototype` で続ける
3. renderer より先に `camera projection contract` を抽出し、custom frustum を projection override として扱う境界を明確にする
4. 必要なら Engine 側差分か adapter 層で吸収する
5. unified が stable に戻るのは、表示だけでなく編集機能と CAMERA_FRAMES 機能の整合が見えた後
