# SuperSplat 3.0 リファクタ引き継ぎ

更新日: 2026-09-09。次の開発スレッドは、この文書を入口にする。

2026-09-13追記: `codex/v3-migration` で本家3.1.2への製品移行を実施した。現在の実装は[移行計画](refactor-v3-migration-plan.md)、確認した動作と制約は[検証記録](refactor-v3-migration-results.md)を参照。以下は当初の調査・引き継ぎ時点の記録として残す。

2026-09-12追記: 実装開始の依頼を受け、`codex/v3-first-proof` で最初の隔離実証を行った。[実証結果と次の統合単位](refactor-v3-first-proof.md) を参照。以下の「未実施」は引き継ぎ作成時点の記録。

同日追記: 本格移行では独自改変の削減、撮影カメラの再設計、独立したビューポートカメラ、分割ビューでの編集を設計条件とする。[本家との境界と複数カメラ・画面分割](refactor-v3-camera-and-views.md) を次の実装計画に適用する。

## 1. 現在地と依頼範囲

対象は `supersplat-cameraframes`。本家SuperSplat Editor 3.0のWebGPU基盤へ追従し、独自の撮影カメラ・構図調整・編集可能な画像出力を維持するためのリファクタを予定している。

この引き継ぎまでに行ったのはコード調査、数値検証、ローカル `AGENTS.md` の整理、文書化。アプリの実装変更、本家の取り込み、依存更新、WebGPU実機検証はまだ行っていない。この文書の保存・コミット依頼は、実装着手や公開の依頼とは別である。

ユーザーはSpark版Camera Framesを実運用している。この作業では別リポのSpark版を変更しない。Spark版へのUI統一や、このアプリのUI全面改修を初回の条件にしない。

## 2. 新しいスレッドの開始時

1. この文書を含む `camera-frames` のコミットを起点にする。リポの既定ブランチから始めた場合も、本書と対象コードが存在するか確認する。
2. Git状態とローカル `AGENTS.md` を確認する。実装を依頼されたら `codex/*` ブランチで進め、`camera-frames` へupstreamを一括mergeしない。
3. [詳細調査書](upstream-v3-refactor-investigation-2026-09-09.md)を読み、今回触る範囲の現行コードと固定した本家タグを照合する。以後の新しいupstream差分は調査時点の基準と分けて評価する。
4. 最初の実装範囲は本書の「最初の実証」に絞る。既存機能の仕様はコードと文書から抽出し、ユーザーへ一から仕様書の作成を求めない。

### AGENTS.mdとローカル素材

- `AGENTS.md` はユーザーの運用方針によりignoreのまま維持し、コミット・pushしない。`git add -f` やignore解除で含めない。本書へAGENTS全文を転記する運用にも変更しない。
- 同じ作業フォルダなら更新済みのローカルファイルを利用できる。別worktreeではGitだけでは引き継がれないため、元の作業フォルダにあるローカルファイルを必要に応じて引き継ぐ。コピー先でもGit管理対象外を維持する。
- ローカル `test/` もignore対象。素材と `test/test-scenario.md` は新worktreeに自動では現れない。利用可否を確認し、私的なSplat・GLB・PSD・参照画像をコミットしない。共有する回帰テストには合成データ等を別途用意する。
- シェル・検索コマンド・権限昇格の固定指定は、今回のAGENTS整理で削除した。古い会話や文書から復活させない。

## 3. 調査した基準

| 対象 | 固定した内容 |
| --- | --- |
| フォークの調査対象 | `camera-frames` / `aec31eb9230d5800ee98ebb469ecb26639a37ee5`。今回の文書コミット以前のコード基準 |
| フォークの依存 | PlayCanvas 2.17.0、splat-transform 1.8.2、PCUI 5.8.0、WebGL2 |
| 本家 | `v3.0.0` / `12398f7f6997bd59bdd82876fd90fc87a6ec6f68` |
| 本家の依存 | PlayCanvas 2.22.0、splat-transform 3.3.3、PCUI 6.1.4、WebGPU |

2026-09-09のfetch時点では `upstream/main` と `v3.0.0` は同じコミット。3.0.0は正式リリースで、alphaではない。[本家リリース](https://github.com/playcanvas/supersplat/releases/tag/v3.0.0)

## 4. 維持したい機能と設計方向

### 撮影カメラ

撮影用カメラはworld positionとQuaternionを正とし、シーン上のカメラオブジェクトとして扱う方向。orbitの注視点・方位角・正規化距離を撮影姿勢の保存形式にしない。orbitは編集ビューや入力コントローラーとして残せる。

現行はworld transformからorbit snapshotへ戻す処理があり、距離復元も `sceneRadius` と `fovFactor` に依存する。本家3.0も通常の操作カメラはorbit/fly由来なので、更新だけでは解決しない。360出力用 `poseOverride` の恒久流用も避ける。

撮影カメラ、構図、viewport表示、ナビゲーションを分離し、描画・pick・gizmo・参照画像・出力には同じ確定済みviewを渡す案が有力。型名・モジュール分割はまだ確定していない。[現行カメラ型](../src/camera-frames-types.ts)、[姿勢の変換](../src/camera-frames.ts)、[本家camera](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/camera.ts)

### フレーム拡張とレンズシフト

ユーザーが必要としているのは、2D背景制作の発想で「既に見えている絵を保ちながら、右側だけ等の見える範囲を広げる」操作。出力縦横比・画角・レンズシフトをまとめて変える機能である。

同じ位置・向きの中央光軸カメラで広く描き、非対称cropした結果と幾何学的に等価。維持するのはこの操作と出力であり、独自 `calculateProjection` callbackそのものではない。

Engine 2.22の `projectionOffset` に置き換える候補は次。透視投影でnear面の境界を `l,r,b,t`、nearを `n` とする。

```text
horizontalFov = false
aspectRatio = (r - l) / (t - b)
fovY = 2 * atan((t - b) / (2 * n)) * 180 / PI
projectionOffset = ((r + l) / (r - l), (t + b) / (t - b))
```

正射影は `orthoHeight = (t - b) / 2` と同じaspect/offsetを使用する。FOV変更に連動してカメラ位置まで動かさない。previewのzoom/panは出力の構図から分離する。[現行frustum計算](../src/camera-frames-camera.ts)、[Engine投影](https://github.com/playcanvas/engine/blob/v2.22.0/src/scene/camera.js)

光軸の交点を点として表示したいという話も出ている。出力枠外でも、ズームバックしたviewport内なら実位置に表示する。主点の正規化座標は `u=(1-offsetX)/2, v=(1+offsetY)/2`。ピック用のclampされた座標を表示に流用しない。これはまだ未実装。[既存の光軸投影関数](../src/camera-matrices.ts)

### Splat基盤

本家 `ProjectedSplatRenderer` は複数Splatを共有バッファへ投影し、GPU radix sortとindirect drawを行う。Engineの `unified` を有効化するだけの更新ではない。

`EditorSplatResource` と `GaussianInstances` に合わせ、resource、instance、選択、Undo、pick、保存の所有権を整合させる。旧merged rendererの全量CPU配列を新rendererの裏側で恒久維持する形を避ける。[本家renderer](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/projected-splat-renderer.ts)

## 5. GLB混在時のPSDマスク: 調査後の追加確認

**コード上は実現可能性が高い。独自の深度ソートを残す必要がある、という結論ではない。** 本家はメッシュと同じ深度基準でSplatを描き、通常のsorted経路はdepth test有効・depth write無効で、Gaussianの半透明alphaを合成する。

不透明・alpha-testのGLBを主な初期対象として、次の出力passを実証する。

1. 対象GLBだけの未遮蔽カラー画像を保存し、同じviewでGLB深度を用意する。
2. GLB深度を保持したまま、色とalphaを空にした別passへSplatを描く。対象GLBより手前のSplatだけをdepth testで通し、Splat自身は深度を書かない。
3. 合成alphaを `A` とすると、GLBに対するSplat透過率は `T = 1 - A`。Gaussianごとのalphaでは `T = product(1 - alpha_i)`。
4. 他のGLBによる遮蔽を反映したvisibilityとTからマスクを作り、元画像とは別にPSDへ格納する。元画像のalphaを二重に掛けない。

背景、grid、選択色、rings等はマスクへ混ぜない。stochasticを使わず、出力品質のalpha合成を使う。カラーを空にする際に深度までclearしない。ターゲットの解像度・投影・MSAA条件を揃え、WebGPUのY/Z規約とGPU完了後のreadbackを確認する。

本家pickerの深度は半透明合成した代表深度であり、それだけからGLBより手前の遮蔽率は復元できない。必要なのは「GLB深度で制限したalpha合成」。本家のprojection/cache/描画を再利用し、必要なpass・material variantを追加する案であり、そのまま呼べるPSDマスクAPIを確認したわけではない。

半透明GLB、交差するレイヤー、輪郭AA、PSD再合成の一致は未検証。初回の単純ケースを通してから広げる。

根拠: [現行GLBマスク](../src/model-occlusion-export.ts)、[現行occlusion shader](../src/shaders/splat-shader.ts)、[本家renderer](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/projected-splat-renderer.ts)、[本家shader](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/shaders/projected-splat-shader.ts)、[本家picker](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/picker.ts)。

## 6. 移行時に落とせないもの

- **保存互換:** 独自 `.ssproj` は `version=0 / schemaVersion=4`、本家3.0はresource/instanceを分ける `version=1`。同じ拡張子やversion数値の受付だけでは互換にならない。旧 `.sscam` v1/v2/v3、camera preset、参照画像、GLB、作業保存も対象。
- **非破壊な出力:** PSDの元画像と遮蔽マスクを分離し、隠れた画素を残す。参照PSDのレイヤー、前面/背面配置、PNGの150dpi等を最終的な回帰対象にする。
- **大容量保存:** 現行writerはJSON上のZIP64フラグに対応するZIP64ヘッダーを生成していない。本家採用writerにも非ZIP64の約4GiB制約がある。実際の大容量再現は未実施。破損防止を検証し、実績あるZIP64 writerまたは明示的な容量拒否を検討する。
- **断面:** 本家shaderのclip Z clampだけでは現行near/far sliceと等価とは限らない。描画・pick・マスクが同じclip条件を使うことを確認する。
- **非同期と履歴:** view切替前の投影cacheをreadbackしない。カメラの値0、真上/真下、roll、sceneRadius変化、旧timeline補間、共有resource複製後の片側だけの編集を検証する。

旧 `camera-frames-upstream-notes.md` 等のWebGL2/mergedに関する記述は、旧実装の保守資料として読む。「旧構造を永久に残す」という制約にはしない。詳細調査書には古い文書と現行コードのずれも記録している。

## 7. 最初の実証

次のスレッドで実装を依頼された場合の推奨範囲。大規模移植の前に必要な成立性を確認し、最終製品の全機能を先に作らない。

1. 現行の構図・保存・出力の基準を、小さな素材と再現手順で押さえる。フラスタム数式の検証を常設テストへ落とす。
2. 固定した本家v3基盤の隔離環境で、2つのSplatの読み込み・重なり・選択・編集・保存再読込を通す。
3. position/Quaternionの撮影カメラと、標準 `projectionOffset` による片側フレーム拡張を接続する。previewと出力の一致を確認する。
4. 単純なGLBを1つ加え、手前と奥のSplatを分けたalphaマスクを出力し、元画像とPSDマスクの分離を確認する。
5. 同条件の現行版・本家素の状態・実証版を測定し、差分と不足機能を報告して次の統合単位を決める。

本家のCPUコピー削減には期待できるが、Spark級の速度は未実測。Editorが視点依存でチャンクを入れ替えるStreamLODを備えているとも確認していない。GPUソート、画素サイズによるカリング、stochastic、StreamLODを混同しない。

実証の最小合格条件は、前後関係が正しいこと、フレーム拡張で基準画像が意図通り保たれること、カメラ切替で姿勢が変わらないこと、保存再読込で編集状態が維持されること、単純なGLBマスクが合成と一致すること。大容量・複雑な透明材質・全PSD機能は続く段階で検証する。

## 8. 済んでいる検証と残っている検証

| 項目 | この会話での結果 |
| --- | --- |
| 現行lint/build | 成功。Sass/Browserslist/ag-psd等の既存警告あり |
| 現行型チェック | `tsc --noEmit` は依存型・DOM/WebWorker宣言で失敗。`--skipLibCheck` は成功 |
| 現行frustum計算 | 81組合せ、1,539項目。crop等価性・anchor・preview/outputを確認、最大誤差約 `4.55e-13 px` |
| Engine標準shiftとの行列比較 | Engine 2.22の投影計算を抽出し現行の行列演算で比較。透視/正射影96ケース、1,536要素で一致 |
| 常設テスト | 上記数値試験はin-memory実行。テストファイルは未追加 |
| WebGPU・GLBマスク・PSD実機 | 未実施。コード上の成立性まで |
| 実大容量保存・FPS/GPU時間比較 | 未実施 |

文書を引き継いだだけで、GPU描画やPSD実機テストが済んだことにしない。現行CIはNode18・main向けbuild/lint中心。本家依存はNode `>=20.19.0` なので、実装時に依存とCIを整合させる。

## 9. 次のスレッドに渡す依頼文

以下は、ユーザーが実装開始を指示するときの文案。文書を読んだだけで実行する指示ではない。

```text
docs/refactor-v3-handoff.md と詳細調査書、ローカルのAGENTS.mdを読み、SuperSplat 3.0追従リファクタの最初の実証に着手してください。この文書を含むcamera-framesのコミットを起点にcodex/*で進めてください。
複数Splat、position/Quaternionの撮影カメラ、標準レンズシフトによるフレーム拡張、選択・保存再読込、単純なGLB用PSDマスクを対象にします。既存UIの全面改修やSpark版の変更は含めません。確認済みの調査を活用し、必要な現行コードの確認から実装・検証まで進めてください。
AGENTS.mdはignoreのまま維持し、コミットしないでください。別worktreeにない場合は元の作業フォルダのローカルファイルを引き継いでください。
```
