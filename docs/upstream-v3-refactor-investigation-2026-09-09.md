# SuperSplat Editor 3.0.0追従とカメラ基盤再設計の調査

調査日: 2026-09-09。対象は `D:\GitHub\supersplat-cameraframes`。実装変更・upstream merge・Spark版の改修は行っていない。

次の開発スレッドは [リファクタ引き継ぎ](refactor-v3-handoff.md) から読む。GLB用PSDマスクの追加確認と、その後の指示整理は同文書にまとめた。本書は調査時点の詳細根拠として残す。

## 1. 結論

追従する技術的な理由は十分にある。ただし、Engineのバージョン更新とレンダラーの差し替えだけでは成立しない。本家3.0のスプラット基盤を、リソース所有権・編集状態・選択・Undo・保存まで一体として取り込み、その上にCamera Framesの機能を再接続する方針が適切である。

カメラはこの機会に、撮影用の位置・Quaternionを正とするモデルへ変更する。オービットはカメラの保存形式ではなく、カメラを操作するコントローラーに限定する。本家3.0へ更新するだけでは、この問題は解消しない。

最も有用な発見は、採用先のEngine 2.22.0に標準の `CameraComponent.projectionOffset` があること。現在の「見えている絵を保ちながらフレームを片側だけ広げる」機能は維持しながら、矩形の非対称フラスタムを独自行列で注入する処理は、標準の画角・アスペクト比・レンズシフトに置き換えられる。

ただし、本家で複数スプラットのグローバルソートが実現したことと、GLBとの遮蔽・PSD用マスク・断面表示・Spark相当のLOD性能が実現したことは別である。後者は個別に移植・検証する必要がある。

## 2. 比較したバージョン

| 項目 | 現行フォーク | 本家 |
| --- | --- | --- |
| Git | `camera-frames` / `aec31eb9230d5800ee98ebb469ecb26639a37ee5` | `v3.0.0` / `12398f7f6997bd59bdd82876fd90fc87a6ec6f68` |
| パッケージ表記 | SuperSplat 2.24.2 / Camera Frames v2.21.14 | SuperSplat 3.0.0 |
| PlayCanvas | 2.17.0 | 2.22.0 |
| splat-transform | 1.8.2 | 3.3.3 |
| PCUI | 5.8.0 | 6.1.4 |
| TypeScript | 5.9.3 | 6.0.3 |
| 描画API | WebGL2 | WebGPU |

`git fetch upstream --prune` 後、`upstream/main` と `v3.0.0` は同一コミットだった。3.0.0はalpha表記ではない正式リリースで、確認時点のmainにタグ以後の差分はない。タグのコミット日時は2026-09-08 11:32:30 +01:00。

`git diff --stat HEAD v3.0.0 -- src` は282ファイル、追加19,979行・削除43,720行。ただし、これは両ツリーの差であり、本家には存在しない独自機能も含む。「本家更新の純粋な変更量」ではない。

根拠: [本家リリース](https://github.com/playcanvas/supersplat/releases/tag/v3.0.0)、[固定タグの依存関係](https://github.com/playcanvas/supersplat/blob/v3.0.0/package.json)、[現行依存関係](../package.json)。

## 3. 本家の描画基盤はどこまで進んだか

### 3.1 複数スプラットのグローバルソート

本家 `ProjectedSplatRenderer` は各Splatのplacementを共通バッファへ投影し、生存Gaussianの件数をGPUで集計する。共有キーに対してGPU radix sortを行い、indirect drawする。オブジェクト単位の描画順で代用する方式ではなく、複数SplatのGaussianをまとめた深度順処理である。

これはEngine標準GSplatコンポーネントの `unified` を有効にするだけの構成ではない。Editor側に `ProjectedSplatRenderer`、`EditorSplatResource`、`GaussianInstances` があり、独自の編集用データとGPU投影キャッシュを管理している。`EditorSplatResource` では標準のGSplatDirectorを利用しないことに合わせ、layer参照数も管理している。

根拠: [renderer](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/projected-splat-renderer.ts)、[resource](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/editor-splat-resource.ts)、[instances](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/gaussian-instances.ts)。

### 3.2 フォークの既存backendを差し替えるだけでは不足する

現行の `splat-render-backend.ts` は良い切り分けの出発点だが、完全な境界ではない。描画以外にworld center、pick ID、ソーター待機、overlay用テクスチャとglobal offsetを公開しており、旧merged rendererの内部形式が契約に漏れている。

`unified-display` でもmerged rendererを作成し、編集・選択・overlay等のために維持する構造が残る。新rendererを足してもこの裏方を温存すると、CPU側の全量配列や同期処理を減らせず、新基盤の利益を取りこぼす。

本家の不変ソース行と編集インスタンスへの分離は、旧 `splatData.getProp()`、全量中心座標配列、削除フラグ、transform index、ローカルpick indexの扱いまで変える。旧データを新rendererへ毎回変換する互換層を恒久化するべきではない。

根拠: [backend](../src/splat-render-backend.ts#L524)、[merged renderer](../src/splat-render-system.ts)、[Splat](../src/splat.ts#L586)、[serializer](../src/splat-serialize.ts#L307)。

### 3.3 Engineの機能とEditorの機能を分ける

- **複数Splatのソート:** 本家3.0に実装済み。ただし透明Gaussianをソートして合成する方式としての近似は残る。
- **StreamLOD:** 本家loaderはロード時にLODを選び、そのデータを利用する。調査した経路では、視点に応じてチャンクを入れ替える常駐管理・ロード・破棄は確認できない。EngineがLOD機能を持つことをもって、EditorもSpark同等とは言えない。
- **stochastic:** 操作中の速度改善策として存在するが、sorted描画とは品質条件が異なる。比較時は同じモードに揃える。
- **通常メッシュとの深度:** sorted splat描画はdepth test有効・depth write無効。先行描画されたメッシュの深度を参照できることと、任意の透明オブジェクト間遮蔽やPSDマスクが正しく出ることは別。

根拠: [loader](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/io/read/loader.ts)、[rendererのdepth stateと描画分岐](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/projected-splat-renderer.ts)。速度優位やSparkとの同等性は未実測。

### 3.4 編集機能と配布環境の追従

本家3.0には、Selection DepthとSelection Footprintの分離、3D Sphere Brush、Appearance/Overlaysの再編、GPU histogram・選択計算、GPU frame time表示も含まれる。レンダラーだけ残して旧選択ツールをそのまま載せると、新しい編集データの利点だけでなく、これらの改善も失う。Camera Frames独自の構図UIと、本家が所有するSplat編集UIを区別して取り込む。

本家の公表例では4.4M Gaussianのロード後JS heapがv2の1,557MBからv3の105MBへ減っている。これはCPU全量コピーを減らす方針を支持する参考値だが、本フォークの実測でもFPS比較でもなく、GPUメモリの減少を意味する数値でもない。

WebGPU必須化によりWebGL2 fallbackはなくなる。また本家はservice worker/offline cacheを削除している。現行の配信・キャッシュ・インストール済みアプリの更新経路を、単なる依存更新とは別に検証する必要がある。

根拠: [本家3.0リリースの機能・計測・削除項目](https://github.com/playcanvas/supersplat/releases/tag/v3.0.0)。

## 4. 現行カメラの問題はどこにあるか

### 4.1 Entityの位置・回転が最終的な正ではない

現行 `CameraPoseSnapshot` は `focalPoint / azim / elev / distance / roll / navMode / fpvPosition` を保持する。CameraPresetにはworld positionとEuler rotationもあるため、同じ撮影カメラについて二つの表現が存在する。

Camera Framesでworld位置や回転を指定しても、`setMainCameraPosition`、`setMainCameraRotation` は注視点・距離・方位角へ戻している。回転設定にはpitchの±89.9度制限もある。プリセット復元でもworld transformを再びorbit snapshotへ変換する。

実際のCamera Entityは毎更新でtween状態から書き直される。姿勢適用用backendが `docDeserialize` を呼ぶ経路もあり、保存形式、ナビゲーション、実行中の姿勢変更が密結合している。

根拠: [型](../src/camera-frames-types.ts#L68)、[snapshot](../src/camera-frames-types.ts#L125)、[world操作の変換](../src/camera-frames.ts#L603)、[復元](../src/camera-frames.ts#L2145)、[Entity同期](../src/camera.ts#L949)、[backend](../src/camera-frames-camera-backend.ts#L80)。

### 4.2 撮影カメラから外すべき依存

`buildCameraBasis` 等は、orbitの正規化距離をworld距離に戻す際に実行中の `sceneRadius` と `fovFactor` を参照する。撮影位置の再現にシーン境界や操作カメラ状態が必要になること自体が、移行時の注意点である。

保存カメラのworld transformとsnapshotが矛盾する場合、どちらを採用するか明示した旧形式importerが必要になる。単に型を置換するだけでは過去の構図が変わる可能性がある。

また、`Number(value) || fallback` のような正規化は0をfallback扱いするため、位置0・角度0を移行テストに含める。既存の `calcForwardVec` の向きは通常のカメラ前方という名前から推測せず、実際の基底と符号で扱う。

根拠: [カメラ基底と距離変換](../src/camera-frames-camera.ts#L316)。

### 4.3 本家3.0も撮影カメラモデルにはなっていない

本家も通常経路はorbit/flyの状態からEntityの姿勢を更新する。positionとQuaternionを受け取る `poseOverride` はあるが、360度出力向けの一時的な経路である。これを常時流用すると、通常経路だけで更新されるdisplay transformや、tweenから算出されるorthoHeight等との整合性が残る。

したがって、独自の撮影カメラを一時overrideへ押し込む方式は解決ではない。本家の描画・編集基盤に対し、明示的なカメラ姿勢と投影を渡す統合箇所を設ける。

根拠: [本家camera](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/camera.ts)、[本家camera poses](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/camera-poses.ts)。

## 5. カスタムフラスタムを標準レンズシフトへ置き換える

### 5.1 機能の意味は変えない

現在の機能は、固定したカメラ位置・向きに対して、投影する画像の窓を非対称に広げる操作である。出力縦横比、画角、レンズシフトを一緒に更新するため、通常の「同じ窓の中で絵を動かす」レンズシフトUIとは操作感が異なる。

維持するのはこの操作の意味であり、独自 `calculateProjection` callbackという実装手段ではない。「位置を固定」は新旧画像で常に同じ正規化座標という意味ではなく、アンカーで定める基準に対して既存の画像座標・倍率を保つという契約にする。例えば左固定で右だけ拡張すれば、左端からの対象物のピクセル位置は保たれる。

現行 `computeEffectiveFrustum` は基準frustumと拡縮率、3×3アンカーからこの画像窓を作る。`syncCameraFrustum` は出力用の窓と、ズームバックしたviewport全体の窓を分けている。この純粋な幾何学は再利用できる。

根拠: [有効frustum](../src/camera-frames-camera.ts#L562)、[出力とpreview](../src/camera-frames-camera.ts#L603)、[viewport変換](../src/camera-frames-viewport.ts#L5)。

### 5.2 Engine 2.22の標準APIで同じ行列になる

Engine 2.22.0の `CameraComponent.projectionOffset` は、半frustum幅・高さを単位とした2次元シフトである。透視・正射影の双方に適用され、投影行列だけでなく逆投影とfrustum corner計算にも反映される。XRでは無視される仕様だが、今回の通常viewport用途には当てはまらない。

近クリップ面上の境界を `left, right, bottom, top`、nearを `n` とすると、透視投影は次で表現できる。

```text
width  = right - left
height = top - bottom
horizontalFov = false
aspectRatio = width / height
fovY = 2 * atan(height / (2 * n)) * 180 / PI
projectionOffset.x = (right + left) / width
projectionOffset.y = (top + bottom) / height
```

正射影は `orthoHeight = height / 2` とし、同じaspectとoffsetを使う。アスペクトは出力ゲートまたはpreview窓から明示的に設定し、Canvasの自動アスペクトに上書きさせない。

これは非対称投影を別のパラメーターで表しただけで、光軸をフレーム中央へ戻す操作ではない。広く対称に描画して非対称cropする場合とも同じ投影結果になる。透視の `fovY` はこのパラメーター化における対称基準FOVであり、ずれた窓の上下端がなす角度の単純な合計と混同しない。

本家projectorは中心をview-projection行列で投影し、Gaussian footprintには焦点距離成分を使うため、この矩形off-axis投影を受け取れる構造である。なお、行列を変える際に旧orbitのFOV連動dollyを実行してカメラ位置まで変えてはいけない。

根拠: [Engine component](https://github.com/playcanvas/engine/blob/v2.22.0/src/framework/components/camera/component.js)、[Engine projectionと逆投影](https://github.com/playcanvas/engine/blob/v2.22.0/src/scene/camera.js)、[本家projector](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/shaders/projected-splat-projector-shader.ts)、[現行の独自行列注入](../src/camera-frames-camera-integration.ts#L38)。

### 5.3 光軸の表示

透視カメラの光軸と画像面の交点、つまり主点を表示する。top-downの正規化画像座標なら、上記offsetから次で得られる。

```text
u = (1 - projectionOffset.x) / 2
v = (1 + projectionOffset.y) / 2
```

`u,v` が0〜1の外でも有効。出力gateのraw矩形からviewportへ写せば、出力範囲外かつズームバックした描画範囲内にある光軸を表示できる。点を出力枠の端へclampしない。viewport外の方向インジケーターを追加するなら、実位置の点とは区別する。

現行にも `getOpticalAxisScreenCoordsWithProjectionData` があり、カメラ軸上の点を実際の投影行列で画面化している。表示へ利用するならこの下位関数が候補。`Camera.getOpticalAxisScreenPoint` はピック用にviewport内へclampするため、そのまま使うと誤表示になる。

光軸は出力枠の中心、orbit pivot、注視点、アイレベル線とは別物。表示はoverlayのみとし、出力画像に含めるかは独立した設定にする。正射影では透視の主点とは意味が異なるため、必要なら「カメラ軸」として区別する。

根拠: [投影関数](../src/camera-matrices.ts#L221)、[ピック用clamp](../src/camera.ts#L890)、[既存overlay](../src/camera-frames-overlay.ts#L69)。

## 6. 推奨する責務分離

以下は設計案であり、既存UIを全面的に作り直す提案ではない。まず内部の正となるデータを分ける。

| 責務 | 保持するもの | 保持しないもの |
| --- | --- | --- |
| ShotCamera | ID、名前、world position、Quaternion、投影方式、光学条件、clip条件 | orbit角、正規化距離、sceneRadius |
| FrameComposition | 基準画角・画像窓、出力サイズ、アンカー操作、赤いFrame群 | viewportのfit、pan、zoom |
| CameraNavigationState | 操作モード、pivot、操作距離、減衰、必要な水平制約 | 撮影カメラの代替となる保存姿勢 |
| ViewportState | editor cameraまたは撮影cameraの参照、preview倍率とpan | 最終出力の画角・構図 |
| RenderViewSnapshot | 確定済み姿勢、CPU投影、clip条件、解像度、gateとCSS/DPR変換、pass設定 | 更新中のUIやtweenへの参照 |

データの流れは、撮影カメラと構図から `RenderViewSnapshot` を作り、描画・pick・gizmo・参照画像・アイレベル・書き出しが同じsnapshotを使う形にする。FOV・shift・画像窓を互いに独立して保存し、矛盾する三重の正を作らない。

EngineのEntity/Cameraには撮影カメラの姿勢と投影を反映する。orbit操作はその姿勢を変更する入力手段とし、モードを切り替える際は現在のworld姿勢からpivot等を導出する。切替のためにworld姿勢を動かさない。

複数の撮影カメラを保存しても、各カメラにSplatデータや重いrendererを複製する必要はない。まずはリソースを共有し、viewportと書き出しのviewを直列に処理する。本家の投影キャッシュはview依存なので、view切替後の投影完了前に前viewのcacheをpick/readbackしない契約が必要になる。

旧camera pose/timelineはposition+targetやorbit由来である。キーだけQuaternionへ変換するとキー間補間の軌道が変わり得る。旧形式の評価器をimport互換として残すか、評価結果を検証しながら変換する。

## 7. 本家更新だけでは保全されない機能

### 7.1 前後クリップと断面

現行backendにはnear clip等の独自shader処理がある。一方、本家projectorの透視経路はカメラ後方を除外するが、調査箇所ではnear/far外を除外する判定は見られない。描画shaderはclip Zを範囲内へclampしている。

このため、near/farを変更するだけで現行の前後断面表示と同じになるとは判断できない。選択対象の除外、通常描画、pick、出力マスクで共有する明示的なclip/filter条件を設計する。これは本家の不具合断定ではなく、本アプリの断面機能との契約差である。

根拠: [現行shader注入](../src/splat-render-backend.ts#L262)、[本家projector](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/shaders/projected-splat-projector-shader.ts)、[本家描画shader](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/shaders/projected-splat-shader.ts)。

### 7.2 GLB、参照画像、PSD

現行PSD出力は単なる完成画像のレイヤー分割ではない。遮蔽前の画像を残してマスクを添付し、隠れた画素も後から編集できるようにしている。これを本家の最終画像readbackだけに置き換えると、制作上の重要な性質を失う。

GLBとスプラットの深度合成、個別Splat出力と他レイヤーによる遮蔽、前面/背面参照画像、PSD原レイヤー、alpha/unpremultiplyを、それぞれ出力passとして維持する。`render.offscreen` に対する現在の上下反転補正はWebGL経路由来のため、WebGPUへ機械的に移さない。

現行は可視状態を切り替え、ソーター完了と数フレームの安定化を待つ。本家はGPU投影cacheの更新順に依存するため、「3〜6フレーム待つ」処理を温存せず、指定view/passの完了を保証してから読み出す。

追加確認: 本家のsorted描画はメッシュと同じ深度基準でdepth testし、depth writeせずにGaussian alphaを合成する。対象GLBの深度を保持し、色とalphaだけをclearしたpassでSplatを描けば、GLBより手前の合成alpha `A` から透過率 `1-A` を得る構成が考えられる。他GLBの遮蔽と合わせてPSDマスクへ渡す。この用途のために旧merged rendererを残す必要性は低く、本家の描画に出力passを追加する方針が有力。ただし、pickerの代表深度だけでは必要な遮蔽率は復元できず、GLB深度で制限したalpha合成が必要。半透明GLB・輪郭AA・PSD再合成の一致は実機未検証。

根拠: [render backend](../src/camera-frames-render-backend.ts#L104)、[render bridge](../src/camera-frames-render-bridge.ts#L55)、[上下反転補正](../src/camera-frames-export.ts#L88)、[Splat PSD遮蔽](../src/splat-occlusion-export.ts#L300)、[Model遮蔽](../src/model-occlusion-export.ts#L206)。

### 7.3 保存形式と大容量ファイル

本家3.0の `.ssproj` は `document.version = 1`。共有する静的ソースを `resource_N.ply`、各レイヤーのインスタンスとpaletteを `instances_N.bin` として分離する。保存時に全レイヤーが参照するソース行の和集合を取り、row番号を再マップする。複製したモデルごとに静的データを重複保存しない利点がある。

ソースはFloat32 PLYへ保存し、transformや色編集は別に保つ。ただし、SOGから失われた情報が復元するわけではない。また、表示用GPUデータのpacking精度と、プロジェクトのソース保存精度は別に評価する。

現行フォークは `version = 0 / schemaVersion = 4` の独自拡張で、Camera Frames、GLB、参照画像、IndexedDB作業保存と配布パッケージの連携を持つ。未編集素材について、元Blobまたは前回ZIP entryを再利用する実装もすでにある。`docs/save-model.md` の「未実装」記述より現在のコードを優先する。

現行loaderはversion 0〜4という数値を受け付けるが、本家v1の `resources / instances` は解釈しない。各Splatのfilename、なければ `splat_N.ply` を探すので、本家v1対応とは言えない。逆に本家のv0互換も固定の `splat_N.ply` を探すため、SOG等を含む独自v0プロジェクトの互換性を保証しない。

新形式は本家resource/instance形式を土台に、独自機能を名前空間付きextensionとしてversion管理する案が適切。ただし本家で開いて再保存すればextensionが保持されるとは限らない。旧独自 `.ssproj`、`.sscam` v1/v2/v3のimportは別の責務とする。元SOGの無変換再利用を新形式でも続ける場合、sourceRowとソースの並び順・再マップの整合を検証する必要がある。

**大容量保存には、移行前に把握すべき既存リスクがある。** 現行 `doc.ts` は容量から `zip64: true` をJSONへ書くが、実際の `DeflateZipFileSystem` は32bitのsize/offsetと通常EOCDを書いており、ZIP64 extra field/EOCDを生成していない。JSONフラグだけではZIP64にならない。4GiB境界を超えるsizeやoffsetの桁落ちによる不正archiveの可能性がある。実大容量ファイルでの再現は未実施。

本家の採用するZipFileSystemにも非ZIP64の約4GiB制約がある。こちらはentry終了時にoffset上限を検査してエラーにする処理があるが、本家へ更新するだけでは大容量保存の最終解決にならない。2GB級PLYのストリーミングと、4GiB級ZIPの形式上限は別問題である。実績あるZIP64 writerの評価か、明示的な容量拒否を含む対応が必要。今回の作業では保存実装を変更していない。

根拠: [本家doc](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/doc.ts)、[本家source serializer](https://github.com/playcanvas/supersplat/blob/v3.0.0/src/splat-serialize.ts)、[現行source再利用](../src/doc.ts#L912)、[現行version判定](../src/doc.ts#L1893)、[現行ZIP選択](../src/doc.ts#L1530)、[現行writer](../src/io/write/deflate-zip-file-system.ts#L219)、[sscam](../src/camera-save.ts#L11)。

ZIP上限の根拠: [本家採用版splat-transform 3.3.3のwriter](https://github.com/playcanvas/splat-transform/blob/v3.3.3/src/lib/io/write/zip-file-system.ts)。

## 8. 段階的な移行案

一括mergeはしない。実装を始める際は `codex/*` ブランチで行い、現行 `camera-frames` を比較基準として残す。大きな既存ファイルを分割すること自体ではなく、データ所有権と機能境界を変えることを目的にする。

| 段階 | 作業 | 次へ進む条件 |
| --- | --- | --- |
| 0 | 現行の基準画像、保存fixture、操作シナリオ、数式テスト、CIを整備 | 既存の正しい動作を再現可能 |
| 1 | camera/frame/保存互換の純粋モデルとadapter境界を抽出。低リスクの依存・UI・locale差分を個別評価 | 現行rendererで出力・操作が変わらない |
| 2 | 固定したv3.0.0を使う別worktreeで最小の実証版。2つのSplat、position/Quaternion camera、shift gate、pick、保存 | 深度・構図・保存・速度を測定して採否判断 |
| 3 | v3のresource/instances/renderer/編集/picker/保存を整合する単位で取り込み、撮影カメラと標準projectionOffsetを接続 | 基本編集と旧形式importが成立 |
| 4 | GLB、参照画像、Frame、camera preset、PSD、作業保存を順に接続 | 各機能の視覚・出力回帰を通過 |
| 5 | 大容量、非同期切替、履歴、既存project互換を検証し、旧merged配列・shader override・orbit変換を削除 | 全体の実機確認と性能基準を達成 |

実証版の目的はUI完成ではなく、本家3.0の土台に本アプリの核心が載るかを判断すること。本家の新しい基盤に独自機能を再接続する方向を推奨するが、全ファイルを一度に置き換えるという意味ではない。

既存のFrame UI、プリセット、参照画像、命名、150dpi PNG、PSD編集性などは現行コードと `docs/CameraFramesFeatures.md` から仕様を抽出する。別のSpark版UIへの統一は今回の依頼外であり、移行条件に追加しない。

skipまたは変形取り込みした差分はupstream notesへ記録する。特に本家に残す改変点は、view注入、断面/filter、独自出力pass、拡張保存に絞り、汎用的な複数エンジン対応フレームワークへ広げない。

## 9. 検証結果と今後の合格条件

### 今回実施した検証

- 現行 `npm run lint`: 成功。
- 現行 `npm run build`: 成功。Sass legacy API、Browserslist、ag-psd等の既存警告あり。
- `tsc --noEmit`: DOM/WebWorker重複や依存型宣言の不整合で失敗。`--skipLibCheck` 付きは成功。型チェック全体が完全に通っているとは報告しない。
- 現行 `computeEffectiveFrustum / syncCameraFrustum` をソースから抽出した数値試験: 9アンカー、横3倍率、縦3倍率の81組合せ、異なる深度の点で1,539項目を確認。非対称crop等価性、anchor、preview/outputの整合の最大誤差は約 `4.55e-13 px`。
- Engine 2.22.0の実際の `_evaluateProjectionMatrix` を抽出し、現行Engineの行列演算で比較: 透視・正射影、frame外の主点を含む96ケース、1,536行列要素で `setFrustum / setOrtho` と完全一致。
- 上記数値試験は一時的なin-memory検証であり、常設テストはまだ追加していない。Engine 2.22を使うアプリ全体やGPU描画を実行した結果ではない。
- 本家WebGPU実機、画面比較、GLB/PSD出力、実大容量保存、速度比較は未実施。今回のアプリビルド検証は現行フォークのみ。

### 実装開始前に常設化するテスト

| 領域 | 最低限のケース |
| --- | --- |
| 投影 | 9アンカー、片側拡張、縦横比、透視/正射影、frame外主点、preview zoom/pan、DPR |
| 姿勢 | camera切替で移動しない、sceneRadius/FOV変更で位置が変わらない、roll、上下方向、値0、旧snapshot復元 |
| GPU | WebGPUのY/Z変換、canvasとoffscreen一致、readback直前のview切替、pickとgizmoの位置一致 |
| 遮蔽 | 交差する2Splat、GLB前後、透明境界、near/far断面、PSD原画像とマスク、レイヤー順 |
| 編集 | 共有resource複製後に片方だけ削除・変形、Undo/Redo、sourceRow再マップ、保存前後のFloat32比較 |
| 互換 | 独自ssprojのPLY/SOG/参照画像/GLB、sscam v1/v2/v3、timeline補間、壊れた/欠落したasset |
| 大容量 | 2GB級素材、4GiB ZIP境界、メモリ使用量、キャンセル、保存失敗時の旧ファイル保全 |

現行CIはNode18とmain対象のbuild/lint中心であり、本家のNode `>=20.19.0` と作業ブランチ検証に合わせる必要がある。既存の `docs/QA_SCENARIOS.md` は手動シナリオで、自動回帰の代わりにはならない。

性能比較は同一PC/GPU・ブラウザ・素材・解像度・カメラ・SH設定で行う。現行unified-display、現行merged経路、本家3.0素の状態、移植実証版を区別し、1M/5M/10M Gaussian、画面上の重なり密度、初回表示、操作中FPS、GPU frame time中央値/95th percentile、RAM/VRAM、停止後sorted復帰、出力時間を記録する。sorted/stochasticを混ぜた比較はしない。

## 10. 次に決めること

ユーザーに設計書を一から書いてもらう必要はない。今回のコードから抽出した機能を基準に、次の点だけ実装前に確認すれば進められる。

1. 最初の目標は「既存Camera Framesの操作・出力を維持したv3基盤化」とし、Spark版へのUI統一は別段階にする。
2. 撮影カメラはposition/Quaternionを正とし、orbitは編集ビューと入力コントローラーとして残す。
3. フレーム拡張の操作は維持し、内部投影は標準FOV/aspect/projectionOffsetにする。
4. 既存プロジェクトの読込互換、PSDの隠れた画素の保持、大容量保存の破損防止を移行の合格条件にする。
5. 大規模移植の前に、段階2の実証と実測で継続判断する。

これらは推奨案であり、実装の承認を得たものではない。
