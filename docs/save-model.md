# CAMERA FRAMES 保存モデルメモ

最終更新: 2026-03-20

2026-09-13追記: `codex/v3-migration` でも以下の作業保存／パッケージ保存の区別を維持する。新パッケージの内部形式は本家version 1のPLY資源とinstanceデータへ移行した。旧形式の読込、保存先の遅延読込資源の保護、容量と互換性の制約は[移行検証記録](refactor-v3-migration-results.md)を参照。

## 目的

`CAMERA FRAMES` では、制作中の `Ctrl+S` を軽く保ちながら、`.ssproj` を受け渡し可能な完全パッケージとして維持するために、保存責務を 2 段階に分けている。

- 普段の作業継続を守る保存
- NAS や他人への受け渡しを守る保存

本書は、その現在の運用ルールを trunk 基準で固定するためのメモである。

## 用語

### `.ssproj`

共有・受け渡し用の **完全パッケージ**。  
このファイル単体で開けることを前提にする。

### ローカル作業状態

ブラウザの IndexedDB に保存する **軽量な続き作業用スナップショット**。  
同じ PC / 同じブラウザ / 同じプロファイル / 同じサイトデータが残っている環境でのみ復元を期待する。

### `*`

左上 document chip の `*` は、**作業状態に未保存の変更がある**ことを表す。  
通常は `Ctrl+S` で消える。

### `PKG`

左上 document chip の `PKG` は、**`.ssproj` 本体が現在の作業状態に追いついていない**ことを表す。  
共有・受け渡し前には、これを消すために `Save Package` が必要。

## 保存コマンドの意味

### 1. 初回保存

まだ projectId を持たない新規シーンでは、`Save` も実質 `Save Package As` として動く。  
ここで最初の `.ssproj` を作り、以後の軽量保存の基点を決める。

### 2. `Save` / `Ctrl+S`

`Save` は **ローカル作業状態保存**。  
保存先は IndexedDB で、`.ssproj` 本体は書き換えない。

保存するものの例:

- カメラ
- CAMERA_FRAMES
- タイムライン / pose set / view state
- 下絵状態
- scene 上の object 配置や表示状態
- per-splat 編集結果
- package 外 asset の続き作業に必要な blob

この保存は、同じ環境で reopen したときの復元を優先する。

### 3. `Save Project Package` / `Ctrl+Shift+S`

`.ssproj` を更新する **完全保存**。  
共有・NAS 受け渡し・別環境での再開前にはこちらが必要。

保存するものの例:

- `.ssproj` 内の `document.json`
- splat / model / 下絵を含む package 本体
- 現在の CAMERA_FRAMES 状態

成功すると current project のローカル作業状態は削除され、`*` と `PKG` は消える。

## 現在の運用ルール

### 同じ環境で続きから作業したい

- こまめに `Ctrl+S`
- `PKG` が残っていてもよい

### NAS へ置く / 他の人へ渡す / 別環境で再開する

- `Save Project Package`
- `PKG` が消えたことを確認してから受け渡す

### 作業中に閉じる

close / open / new / reset の遷移時は、現在の dirty 状態に応じて

- パッケージ保存
- 作業状態保存
- 保存せず続行
- キャンセル

を選べる。

## 復元の前提

ローカル作業状態は次の条件で復元を期待する。

- 同じ PC
- 同じブラウザ
- 同じブラウザプロファイル
- サイトデータが削除されていない
- 同じ `.ssproj` を開く

次のケースではローカル作業状態は期待しない。

- 別の PC
- 別のブラウザ
- 別 profile
- シークレットウィンドウ
- サイトデータ / IndexedDB を消した後

## 何が `PKG` を必要にするか

現在の trunk では、`.ssproj` 本体とローカル作業状態を明確に分けるため、`Ctrl+S` 後も `PKG` は基本的に残る。

例:

- カメラを動かした
- CAMERA_FRAMES を調整した
- 下絵を追加・調整した
- GLB を追加した
- per-splat の削除や変形をした

つまり `PKG` は「重い asset 編集だけ」の印ではなく、**今の状態を `.ssproj` 単体で他人に渡せるか**の印である。

## ローカル作業状態の cleanup

ローカル保存が hidden cache として膨らみ続けないよう、cleanup を入れている。

### 自動 cleanup

- `Save` 後に、現在の project を残して古いローカル作業状態を pruning
- `Save Package` 後に、現在の project のローカル作業状態を削除
- document load 時にも orphan link を整理

現在の上限:

- 最大 16 project
- 合計およそ 512MB まで

### 手動 cleanup

`File > ローカル作業状態を削除...`

- ブラウザに保存されたローカル作業状態だけを削除する
- `.ssproj` ファイル自体は変更しない
- 現在の document に package 未保存の変更がある場合、その変更は再読み込み後に復元できなくなる

## 現在のトレードオフ

この保存モデルで解決したこと:

- 作業中の `Ctrl+S` を軽くできた
- per-splat 編集や下絵追加があっても、同じ環境なら続きから戻りやすい
- `.ssproj` の共有前に `PKG` で注意を出せる

まだ残っているコスト:

- `Save Package` は重い
- 圧縮入力 (`.sog` など) でも、完全保存時は重い再シリアライズが走る
- untouched asset をそのまま package に流用する最適化はまだ未実装

## 次の改善候補

優先候補は次。

1. untouched な splat / model / 下絵 asset を package save 時にそのまま流用する
2. whole-object transform と asset 本体保存をさらに分離する
3. cleanup 結果や local storage 使用量の見せ方を必要最小限で改善する

このメモは、上の改善を行うときの基準として維持する。
