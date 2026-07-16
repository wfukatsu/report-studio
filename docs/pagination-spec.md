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

## splitPolicy（multi_row_table）

- `forbidden`: **対応** — ユニット単位のページ割当（上記 stride 方式）に
  より、ユニットは常にページ内に収まる
- `allowed-between-rows` / `allowed-inside-unit`: **未対応** — 現状は
  `forbidden` と同じ挙動（ページ末尾の部分ユニット描画は未実装）

## 未実装（今後のスコープ）

- グループ改ページ（groupBy 境界での強制改ページ)
- `RelativeLayoutResolver`（押し下げレイアウト）のページ下端自動改ページ
- マージンのクリッピング強制（`pageSetup.margins` は現状データ保持のみ）
- デザイナー側のあふれ警告 UX（フロントエンド）
- V2 `repeatingBand` / `repeatingList` 要素のセクションへのマッピング（#53/#52）
