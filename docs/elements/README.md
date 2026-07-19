# 要素ドキュメント

Report Studio で利用できる要素 (ReportElement) の仕様を、1 要素 1 ファイルで記述したものです。

各ページには、実際にアプリを操作して撮影した **操作デモ GIF**（パレットからの配置 → プロパティパネルでの設定）、**設定例のスクリーンショット**（編集画面）、および **設定後のプレビュー表示**（プレビュー画面 / PDF 出力のイメージ）を埋め込んでいます（画像は [`_media/`](./_media/) に格納。`{要素}.png` = 編集画面、`{要素}-preview.png` = プレビュー表示）。ドキュメントの記述どおりに動作することを UI 上で確認済みです。

## 共通事項

すべての要素は `ElementBase` を継承します。

| プロパティ | 型 | 説明 |
|---|---|---|
| `id` | string (UUID) | 要素 ID。変更不可。 |
| `type` | ElementType | 要素種別（下記参照）。判別ユニオンのタグ。 |
| `position` | `{x, y}` mm | セクション相対座標。 |
| `size` | `{width, height}` mm | 幅・高さ。 |
| `zIndex` | number | レイヤー順。大きいほど前面。 |
| `locked` | boolean | ロック。編集・移動・リサイズ不可。 |
| `visible` | boolean | 表示可否。false なら描画されない。 |
| `name` | string? | レイヤーパネルに表示される名前。 |
| `conditionalDisplay` | `ConditionalDisplay?` | AND/OR の表示条件。データ値で表示を切替。 |
| `printable` | boolean? | 印刷対象か（default: true）。 |
| `schemaBinding` | `{ fieldId }?` | SchemaField.id へのバインド。 |

座標・サイズはすべて mm 単位です。`fontSize` などの活字単位は pt、印鑑専用の `fontSize` のみ mm です（各ドキュメント参照）。

## カテゴリ一覧

パレット上の並びに沿って分類されています。各リンク先に詳細仕様を記述しています。

### 帳票共通 [`common/`](./common/)
- [ページ番号 (pageNumber)](./common/pageNumber.md)
- [現在日付 (currentDate)](./common/currentDate.md)
- [区切り線 (divider)](./common/divider.md)

### テキスト系 [`text/`](./text/)
- [テキスト (text)](./text/text.md)
- [データフィールド (dataField)](./text/dataField.md)

### 図形・画像 [`shape-image/`](./shape-image/)
- [図形 (shape)](./shape-image/shape.md) — 矩形 / 円 / 線
- [画像 (image)](./shape-image/image.md)

### 繰り返し要素 [`repeating/`](./repeating/)
- [繰り返しバンド (repeatingBand)](./repeating/repeatingBand.md)
- [繰り返しリスト (repeatingList)](./repeating/repeatingList.md)
- [帳票テーブル (formTable)](./repeating/formTable.md)

### データ表示 [`data-display/`](./data-display/)
- [グラフ (chart)](./data-display/chart.md)
- [バーコード (barcode)](./data-display/barcode.md) — QR / CODE128 / CODE39 / JAN13

### 記入欄 [`input/`](./input/)
- [記入欄 (manualEntry)](./input/manualEntry.md)

### 日本語帳票専用 [`japanese/`](./japanese/)
- [印鑑 (hanko)](./japanese/hanko.md)
- [多段印鑑欄 (approvalStampRow)](./japanese/approvalStampRow.md)
- [収入印紙欄 (revenueStamp)](./japanese/revenueStamp.md)
- [チェックボックス (checkbox)](./japanese/checkbox.md)
- [元号選択 (eraSelect)](./japanese/eraSelect.md)

### テナント情報 [`tenant/`](./tenant/)
- [会社名 (tenantCompanyName)](./tenant/companyName.md)
- [住所 (tenantAddress)](./tenant/address.md)
- [電話番号 (tenantPhone)](./tenant/phone.md)
- [代表者名 (tenantRepresentative)](./tenant/representative.md)
- [ロゴ (tenantLogo)](./tenant/logo.md)
- [カスタムフィールド (tenantCustom)](./tenant/custom.md)

## 要素タイプ一覧（ElementType）

`src/types/index.ts` の `ElementType` 定義順：

```
text, dataField, chart, repeatingBand, repeatingList,
shape, image, barcode, manualEntry,
hanko, approvalStampRow, revenueStamp,
formTable, checkbox, eraSelect,
pageNumber, currentDate, divider,
tenantCompanyName, tenantAddress, tenantPhone,
tenantRepresentative, tenantLogo, tenantCustom
```

全 23 種（`label` と `table` は廃止済みで `text` / `formTable` に統合）。

## 廃止済み要素

| 旧タイプ | 統合先 | 備考 |
|---|---|---|
| `label` | `text` | `ElementRenderer` が自動変換 |
| `table` | `formTable` | 旧データは警告表示 |

## 共通ブロック

Renderer / PropertiesPanel は `src/elements/_blocks/` の共通ブロックから合成されます：

- **renderers/**: `ElementFrame`, `TextContent`, `GridLines`, `ChartContent`, `BarcodeContent`, `ElementErrorBoundary`
- **hooks/**: `useDataResolver`（フィールド解決 + 書式適用）
- **panels/**: `TextStyleSection`, `BorderSection`, `DataBindingSection`, `FormatSection`, `FuriganaSection`, `ColorSection`

各要素ページでも、該当する共通ブロックを明記しています。
