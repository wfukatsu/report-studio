# ページ分割仕様（サーバ PDF エンジン）

Issue [#55](https://github.com/wfukatsu/report-studio/issues/55) のページネーション/オーバーフローエンジンの仕様。
実装は `server/src/main/java/com/report/server/pdf/` の `PdfRenderer` /
`DetailTableSectionRenderer` / `MultiRowTableSectionRenderer` / `SectionRenderHelper`。
検証は `PdfPaginationParseBackTest` / `PdfGoldenTemplateTest`。

## 対象セクション種別

| セクション type | ページ分割 | 行の単位 |
|---|---|---|
| `page_base`（V2 `body` 含む） | しない（全ページに描画、`pageScope` で all/first/last 制御） | — |
| `detail_table` | する | `row_block` 1行 = 1レコード |
| `multi_row_table` | する | 複数 `row_block` の集合 = 1レコード（ユニット） |
| `free` / `repeat` / 未知 type | しない（`free` フォールバック） | — |

## 行領域の導出（`SectionRenderHelper.computeRowRegion`）

セクション内の `row_block` 要素から行ユニットの形状を導出する。

- **開始 Y** = 全 `row_block` の `frame.y` の最小値（mm、ページ絶対座標）
- **ユニット高（stride）** = `max(frame.y + frame.height) − min(frame.y)`
  - `detail_table` で行要素が横に並ぶ場合はその行高そのもの
  - `multi_row_table` で行要素が縦に並ぶ場合はユニット全体の高さ

各レコードの描画位置は `開始Y + stride × (rowIdx % rowsPerPage)`。
**stride はユニット全体の高さで進む**ため、ユニット内の要素が重なったり
ユニットがページ間で分断されることはない。

## rowsPerPage の決定

1. **fixed モード**: `detail_table` は `tableMode: "fixed"` + `fixedRowCount`、
   `multi_row_table` は `fixedRowCount` が正の値なら、その値をそのまま使用
2. **variable モード（既定）**: 実測ベース —
   `floor((section.y + section.height − 開始Y) / stride)`（最小 1）
3. ジオメトリが導出できない場合（`row_block` なし・高さ 0 等）のみ、
   レガシー既定値 10 にフォールバック

## ページ数と複数セクションの独立分割

- 各ページ分割セクション i について
  `pages_i = ceil(countRows_i / rowsPerPage_i)`
- **ドキュメントのページ数 = max(pages_i, 1)**
- 各セクションは自分の `rowsPerPage_i` / `totalRows_i` で独立にフローする
- 自セクションのデータを描き終えたセクションは、以降のページには
  **ヘッダも含めて何も描画しない**（2ページ目以降のみ。1ページ目は
  データ 0 件でもヘッダを描く）

## ヘッダ繰返し

- `detail_table`: `repeatHeader: true` で `row_block` 以外の要素
  （列見出し・装飾）を継続ページにも描画
- `multi_row_table`: `continuationHeader: true` で同様

## 繰越小計（carry-over totals）

ページ分割セクション（`detail_table` / `multi_row_table`）内に専用要素を
配置すると、ページごとの累積合計を描画する。位置は要素自身の `frame` で制御。

| kind | 表示条件 | 値 |
|---|---|---|
| `carryover_footer` | 続きのページがある場合（「次頁へ続く」） | 行 [0, endRow) の合計 |
| `carryover_header` | 継続ページ（「前頁より繰越」） | 行 [0, startRow) の合計 |

要素フィールド: `carryField`（行グループ内のフィールド名。値は数値であること）、
`prefix` / `suffix`（前後テキスト）、`format`（CalculationFormat、例 `{"type":"comma"}`）、
`style`（TextStyle）。

実装: `SectionRenderHelper.renderCarryOverElements`。
検証: `PdfCarryOverParseBackTest`。

## グループ改ページ（group page-break）

`detail_table` セクションに `groupBy: "fieldName"` を設定すると、行がその
フィールド値でグループ化され（行順を保持）、**各グループが新しい物理ページから
始まる**（グループはページを共有しない）。大きなグループはそのグループ内で
`rowsPerPage` 単位に分割され、その後に次のグループが改ページする。

`group_header` 要素（`prefix`/`suffix`/`style`）を置くと、各グループの先頭
ページにグループ値が描画される。ページプランは
`SectionRenderHelper.buildPagePlan` が構築し、物理ページ数は
`SectionPdfRenderer.physicalPages` が返す。検証: `PdfGroupBreakParseBackTest`。

## splitPolicy（multi_row_table）

`rowUnitSize` 物理行からなる論理ユニットのページ分割方針。

- `forbidden`（既定）: **対応** — ユニット単位のページ割当。1ページの容量は
  収まる**ユニット数**（`floor(available / ユニット高)`）で、ユニットは常に
  ページ内に収まる
- `allowed-between-rows` / `allowed-inside-unit`: **対応** — 物理行単位の
  ページ割当。1ページの容量は**物理行数**（`floor(available / 物理行高)`、
  物理行高 = ユニット高 / rowUnitSize）で、ユニットの各行がページ境界を
  またいで分割され得る（継続ページの先頭は行領域先頭から再開）。2方針は
  離散行モデルでは同一挙動

実装: `MultiRowTableSectionRenderer` ＋ `SectionRenderHelper.renderSplitRow`。
検証: `PdfSplitPolicyParseBackTest`。

## 押し下げレイアウトの自動改ページ（pushdown page-overflow）

`layoutMode: "relative"` のセクション（`page_base` / `free` / `repeat`）で、
押し下げ（`props.layout.pushDown` + `anchorTo`）の解決後にセクション下端
（`section.y + section.height`）を超えた要素は、**継続ページに自動で送られる**
（従来はページ外に描画され欠落していた）。

- 割当: 要素の解決後 Y について `page = floor((y − top) / 高さ)`、
  描画位置は `top + (y − top) % 高さ`（折返し）
- **下端をまたぐ要素**は、1ページに収まる高さなら次ページ先頭に繰上げ
- **領域より背の高い要素**は移動せず、そのページでクリップされる
- **1ページ目に収まる要素は従来どおり**（セクションが描画される全物理ページに
  繰返し描画。`pageScope` の first/last 制御も従来どおり全体に効く —
  `pageScope: "first"` のセクションでは継続ページの要素も描画されない点に注意）
- 継続ページ数は他のページ分割セクションと同様に文書ページ数の max に寄与
- 上限 100 継続ページ（`RelativeLayoutResolver.MAX_PUSHDOWN_PAGES`）
- ジオメトリは V1 `frame` / V2 `position`+`size` の両対応

実装: `RelativeLayoutResolver.paginate` ＋ `SectionRenderHelper.renderElementsPaged`。
検証: `PdfPushdownParseBackTest` / `RelativeLayoutResolverTest`。

## マージンクリッピング（opt-in）

`pageSetup.clipToMargins: true`（V2 は `pageSettings.clipToMargins`）を設定すると、
全ページの描画内容が `margins` の内側の矩形にクリップされる。既定は **false**
（`margins` はデータ保持のみ — 既存テンプレートはマージン領域に要素を配置して
いることがあるため、破壊的変更を避けてオプトイン）。

- クリップ矩形はページごとにそのページのサイズから再計算（V2 のページ別サイズ対応）
- マージンがページより大きい等の退化ケースではクリップを適用しない（白紙化防止）

実装: `PageContext.setClipToMargins` / `PdfRenderer.resolveClipMargins`。
検証: `PageContextClipTest`。

## V2 バンドフロー（repeatingBand / repeatingList）

V2 の `repeatingBand` / `repeatingList` **要素**は、バインドされたレコードが
要素枠を超える場合に**継続ページへ行をフローする**（従来は枠内クリップで欠落）。
セクション種別は変えず、`page_base` / `free` の描画時にページごとの
レコードウィンドウ（`[page × 容量, (page+1) × 容量)`）を要素に渡す方式 —
罫線・ヘッダ等のバンド描画は `RepeatingBandPdfRenderer` /
`RepeatingListPdfRenderer` のまま。

- **容量**: band = `floor((枠高 − ヘッダ高) / itemHeight)`
  （`headerHeight` 未指定時は `itemHeight`）、
  list(vertical) = `floor((枠高 + gap) / (itemHeight + gap))`。
  フロントのあふれ警告（`overflowWarning.ts`）と同一の式
- **maxItems** による打ち切りは設計者の明示的な選択としてフローさせない
  （maxItems 適用後のセットをフローする）
- **ヘッダ**は各継続ページで繰返し描画（スライスごとに再描画されるため）
- list の `grid` / `horizontal` レイアウトは対象外（従来どおりクリップ）
- 静的要素は従来どおり全物理ページに繰返し描画
- 継続ページ数は他のページ分割セクションと同様に文書ページ数の max に寄与
  （上限 200: `SectionRenderHelper.MAX_BAND_PAGES`）

実装: `SectionRenderHelper.bandCapacity / bandFlowPages / applyBandWindow`。
検証: `PdfBandFlowParseBackTest`。

デザイナー側のあふれ警告 UX はフロントエンド実装
（`src/lib/overflowWarning.ts` + `CanvasElement` のバッジ表示）を参照。
警告ツールチップの「サーバPDF出力ではページ分割されます」はこの機能を指す。
