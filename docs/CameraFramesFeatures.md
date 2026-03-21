# CAMERA FRAMES 機能一覧と再現チェックポイント

この文書は、`camera-frames` ブランチの現在の stable 機能を短く把握するための一覧です。
将来 Spark 2.0 上で再現する時のチェックリストとしても使います。

対象バージョン: `v2.21.12`

---

## 1. 現在の stable 基準

- 既定 render backend は `unified-display`
- Graphics API は `WebGL2`
- `unified-culling` 既定値は `false`
- streaming LoD は未接続
- 起動後は CAMERA_FRAMES ON + FPV が自動で有効化される

---

## 2. CAMERA_FRAMES コア機能

- A4 相当の Render Box を基準に shot layout を組める
- Render Box は幅 / 高さ別拡縮、アンカー 3x3、Canvas Zoom を持つ
- off-axis フラスタムでアンカー側の構図を維持できる
- 赤い frame を最大 20 枚まで配置できる
- frame は移動 / 回転 / 拡縮 / アンカー変更に対応
- Shift で軸ロック / 角度スナップ、Alt でアンカー基準の対称拡縮ができる
- 撮影表示と編集表示を切り替えられる
- OFF 中だけ撮影カメラ操作ポップアップを開ける

---

## 3. カメラと preset

- camera preset ごとに main camera を保持する
- camera preset ごとに render box / frames / mask / export 設定を保持する
- selected preset は CAMERA_FRAMES 状態に保存される
- `.sscam` で camera preset 群を外部保存 / 読込できる

---

## 4. Export

- PNG / PSD に対応
- 書き出し対象は `current / all / selected`
- export の既定値は
  - `format = psd`
  - `grid/eye-level = on`
  - `model layers = on`
  - `filename = cf-%cam`
- 全カメラ書き出し時は unified splat の安定待ちを入れている
- PNG は 150dpi の `pHYs` を付与する
- PSD は render / guide / model / reference / frame を分けて出力できる

---

## 5. 下絵（Reference Images）

- `png / jpg / jpeg / webp / psd` を下絵として扱える
- PSD はレイヤーごとに下絵へ展開する
- 下絵は front / back に分けられる
- 並び順、可視、出力、位置、スケール、不透明度を持つ
- export に入るのは `enabled && visible && includeInRender` のものだけ
- 初期 preset は `(blank)`
- camera preset ごとに下絵 override を持てる
- override は reset で shared 状態へ戻せる

---

## 6. 保存形式

### `.ssproj`

- シーン全体の保存
- splats / models / CAMERA_FRAMES / 下絵状態 / 下絵 asset / lighting を含む

### `.sscam`

- camera preset 交換用
- camera preset と reference image preset の ID / name を含む
- 3D asset、下絵実データ、camera ごとの下絵 override は含まない

---

## 7. 操作感まわり

- 起動後の既定 nav mode は FPV
- FPV 左ドラッグは pointer lock を使わない
- そのためブラウザの pointer-lock トーストは出ない
- 数値入力の Undo / Redo は主要 CAMERA_FRAMES UI で自動 commit 付き
  - CAMERA_FRAMES パネル
  - 撮影カメラ操作ポップアップ
  - 下絵パネル
  - Scene Manager の light / ambient
  - Transform パネル

---

## 8. 現在 baseline に含めないもの

- WebGPU 起動
- streaming LoD
- `lod-meta.json` runtime
- `unified-culling=true` を既定 ON にした運用

---

## 9. Spark 2.0 再現の最低チェック項目

次を満たして初めて「現行 CAMERA_FRAMES の再現」とみなす。

- Render Box のアンカー付き構図維持
- 撮影表示 / 編集表示の切替
- camera preset ごとの状態保存
- 全カメラ export
- 下絵 preset と camera override
- `.ssproj` / `.sscam` の保存意味の維持
- preview と export の一致
- numeric input 編集中の自然な undo / redo

この条件を満たさない移植は、見た目が近くても CAMERA_FRAMES の要件を満たしていない。
