# Splat Render Stage 4 Notes

## 目的

- `camera-frames` を保守しやすく維持する
- 将来 PlayCanvas Engine 側に
  - 複数 3DGS の統合レンダラ
  - streaming LoD
  が入ったとき、現在の独自 merged renderer から乗り換えやすくする

## 現在の到達点

`camera-frames` には Stage 3 まで反映済み。

- SuperSplat version: `2.24.2`
- CAMERA FRAMES version: `v2.20.11`
- 直近 merge: `a519251 merge: integrate splat render system stage3`

補足:

- Stage 4 の入口として、TypeScript 側には `ProcessorInputLayout` 契約を入れる
- shader 側はまだ merged renderer 前提の uniform 名を維持し、data-processor 内部でだけ橋渡しする
- `SplatRenderBackend` は役割別 contract へ分割し、将来 backend を差し替える境界を細かくする
- backend factory は、同一インスタンスをそのまま配る形ではなく、役割別 wrapper と合成 backend を返す

## Stage 2 / Stage 3 でやったこと

### Stage 2

- `SplatRenderBackend` から raw な renderer 内部表現の leak をかなり減らした
- 主な反映:
  - `src/splat-render-backend.ts`
  - `src/splat-render-system.ts`
  - `src/splat.ts`
  - `src/splat-overlay.ts`
  - `src/splat-serialize.ts`
  - `src/camera.ts`
  - `src/editor.ts`

具体例:

- runtime texture を `Splat` から外した
- raw center 配列アクセスを `readWorldCenter` / `writeWorldCenter` に置換
- `getMergedInstance` / `getTransformPaletteTexture` / `getSplatRange` の外部依存を削減
- `DataProcessor` 呼び出しを render backend 経由に寄せた

### Stage 3

- `SplatRenderSystem` 内部の bookkeeping を `entries` に統合
- `data-processor` への入力を `ProcessorContext.resources` に束ねた
- `mergedResource` の texture / textureDimensions 参照を `mergedResourceInfo` に集約
- `Scene` は backend bundle を受け取り、call site は `lifecycle / display / data / picking / overlay` の narrow interface を使う
- backend factory は role 別 wrapper を返し、将来 `display=unified / data=merged` の混成構成を差し込みやすくした
- `SplatRenderSystem` は merged renderer の core として残し、role backend 実装は別クラスが core を使う形にした
- `data backend` は delegate ではなく、core から渡す context を使って processor context / bound / position / intersect を自前実装する形にした
- `display backend` も `state / params / transform` 更新経路は context ベースの自前実装へ寄せた
- `picking / overlay` も context ベースに切り出し、core の `globalIdToSplat` / merged material / merged texture 群を直接 backend へ渡す形にした

主な反映:

- `src/splat-render-system.ts`
- `src/data-processor/types.ts`
- `src/data-processor/calc-bound.ts`
- `src/data-processor/calc-positions.ts`
- `src/data-processor/intersect.ts`

## まだ残っている本質依存

次の本命は `data-processor` と shader 群が前提にしている GPU レイアウトそのもの。

現状の shader は次を前提にしている。

- `transformA`
  - splat center texture
- `splatTransform`
  - per-splat transform index texture
- `transformPalette`
  - transform matrix palette texture
- `splatState`
  - state texture
- `globalSplatParams`
  - global texture width と総数ベースの UV 計算

該当ファイル:

- `src/shaders/bound-shader.ts`
- `src/shaders/position-shader.ts`
- `src/shaders/intersection-shader.ts`

つまり、いま残っているのは「現在の merged renderer の GPU 入力契約」そのもの。

## 次にやるなら

次に進める場合は、実装より先に contract を整理する。

### 1. `ProcessorInputLayout` を定義する

候補:

- center source
- transform index source
- transform palette source
- state source
- global UV params

重要:

- いまの texture 名をそのまま contract にしない
- shader が必要とする意味を contract にする

現状メモ:

- TypeScript 側の入口として `ProcessorContext.inputLayout` を使う
- `data-processor` は `inputLayout` から現在の shader uniform へマップする
- これにより、次の実装では `SplatRenderSystem` 以外の backend も同じ `ProcessorInputLayout` を返せる
- `SplatRenderBackend` は `lifecycle / display / data / picking / overlay` の contract に分解する
- `Scene` は単一 backend を直接 new するのではなく、backend bundle を受け取る形へ寄せる
- 将来は `display=unified / data=merged / picking=adapter` のような混成構成を factory で表現する

### 2. `SplatRenderSystem` をその contract の 1 実装にする

- `createProcessorContext()` をさらに用途ベースへ寄せる
- `data-processor` は layout contract だけを見るようにする
- factory は `SplatRenderSystem` を role backend 群へ束ねるだけに留める
- 次の段階では `SplatRenderSystem` core の内部実装も role 単位に分離していく

### 3. shader 側は一気に抽象化しない

現時点では Engine 側 unified render / streaming LoD の実際の GPU 表現がまだ無い。
そのため、先回りで shader 側まで大きく抽象化すると外す可能性が高い。

方針:

- まず TypeScript 側の contract を整理
- shader は必要になった段階で差し替え可能な単位に切る

## いま無理にやらないほうがいいこと

- `data-processor` の shader 群を今の時点で generic にしすぎること
- `transformPalette` の表現を先回りで変更すること
- upstream の `#833` をそのまま戻すこと
  - 理由は `docs/camera-frames-upstream-notes.md` を参照

## 再開時の確認ポイント

実装を再開したら、毎回最低限これを見る。

- splat の通常表示
- 選択と gizmo
- クリック / 矩形 / リング / ブラシ選択
- splat separate / duplicate
- `.ssproj` 保存 / 読み込み
- CAMERA_FRAMES の白枠 / 赤枠

## 再開位置

現時点では `camera-frames` に Stage 3 までマージ済み。
新しい作業は、`camera-frames` から新しい `codex/` ブランチを切って始めること。
