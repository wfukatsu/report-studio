# 要素型リファレンス（24種）

正は `schemas/element-types.json`（`npm run generate:schema` が生成）。
ここは主要プロパティの早見表。`?` は任意。

## 共通（ElementBase）

すべての要素が持つ:

```jsonc
{
  "id": "uuid",                    // addElement 時は省略可（CLI が採番）
  "type": "text",
  "position": { "x": 10, "y": 20 },     // mm。addElement では x/y でもよい
  "size": { "width": 60, "height": 8 }, // mm。addElement では width/height でもよい
  "zIndex": 1,
  "locked": false,
  "visible": true,
  "name": "要素名",                 // レイヤーパネル表示名
  "style": { }                      // TextStyle（テキスト系のみ意味を持つ）
}
```

`TextStyle` の主なキー: `fontSize` `fontFamily` `fontWeight` `fontStyle` `color`
`textAlign`(left/center/right) `verticalAlign`(top/middle/bottom) `lineHeight`
`letterSpacing` `writingMode`（縦書き）`backgroundColor` `borderColor` `borderWidth`。

フォントは `sans-serif` → Noto Sans JP、`serif` → Noto Serif JP に解決される
（サーバー PDF も `FontProvider.isSerifFamily` で同じ判定をする）。

## テキスト

| type | 主要プロパティ |
|------|---------------|
| `text` | `content` (必須) `style` `furigana?` `furiganaScale?` |

`content` に `{{fieldKey}}` を書くとデータバインドになる。

## データ表示

| type | 主要プロパティ |
|------|---------------|
| `dataField` | `fieldKey` (必須) `label?` `format?` `fallbackText?` `style` |
| `chart` | `chartType`(bar/line/pie/donut) `dataBinding?` `title?` `xAxisKey?` `yAxisKeys?` `colors?` `showLegend?` `showGrid?` |
| `repeatingBand` | `dataSource` `itemHeight` `fields[]` `showHeader` `showFooter` `totals[]` `maxItems` `pageBreak`(none/before/after) `oddRowColor` `evenRowColor` `borderColor` `borderWidth` `sortBy?` `groupBy?` `headerStyle?` `wrapText?` |
| `repeatingList` | `dataSource` `layout`(vertical/horizontal/grid) `gridColumns` `itemWidth` `itemHeight` `gap` `fields[]` `maxItems` `pageBreak` |

`dataSource` はスキーマの `dataKey`（detail グループ）を指す。プレビュー/PDF でのみ
実データが入り、エディタでは設計プレビュー（モック行）になる。

## 表

| type | 主要プロパティ |
|------|---------------|
| `formTable` | `columns[]` `rows[]` `dataSource?` `maxItems?` `borderColor` `borderWidth` `headerStyle?` `bodyStyle?` `oddRowColor?` `evenRowColor?` |

CSS Grid ベース。セル結合は `FormTableCell` の `colspan`/`rowspan`/`mergedInto`。
キャンバス上のセル編集（ダブルクリックで編集モード）は UI 専用機能。

## 図形・メディア

| type | 主要プロパティ |
|------|---------------|
| `shape` | `shape`(rectangle/circle/line) `fill?` `stroke?` `strokeWidth?` `borderRadius?` `strokeDash?` |
| `image` | `src` `alt` `objectFit`(contain/cover/fill/none) `opacity?` |
| `barcode` | `kind`(QR/CODE128/CODE39/EAN13) `value` `errorCorrection?`(L/M/Q/H) `darkColor?` `lightColor?` `showText?` |

## 入力・記入欄

| type | 主要プロパティ |
|------|---------------|
| `manualEntry` | `label` `labelPosition`(top/left/none) `displayMode`(line/box/grid/none) `lineColor` `gridCount?` `placeholder?` `furiganaEnabled?` `furiganaDataSource?` `furiganaRatio?` |
| `checkbox` | `checked` `checkmark` `label` `labelPosition?` `dataSource?` |
| `eraSelect` | `dataSource?` `layout?` `eras?` |

## 日本の帳票固有

| type | 主要プロパティ |
|------|---------------|
| `hanko` | `text` `shape`(circle/rectangle) `borderColor` `textColor` `fontSize` `writingMode` `doubleBorder` `binding?` |
| `approvalStampRow` | `cells[]` `labelPosition`(top/bottom) `borderColor` `borderWidth` `cellHeight` |
| `revenueStamp` | `amount?` `borderColor` `borderWidth` `showLabel` `showCancellationGuide` |

## 自動フィールド

| type | 主要プロパティ |
|------|---------------|
| `pageNumber` | `format` `customFormat?` `style` |
| `currentDate` | `format` `customFormat?` `style` |
| `divider` | `direction` `color` `thickness` `dashStyle`(solid/dashed/dotted) |

`pageNumber` / `currentDate` はエディタではトークン/書式のまま、プレビューと PDF で解決される。

## テナント（自社情報）

| type | 主要プロパティ |
|------|---------------|
| `tenantCompanyName` | `fallback?` `style` |
| `tenantAddress` | `fallback?` `displayMode?` `style` |
| `tenantPhone` | `fallback?` `style` |
| `tenantRepresentative` | `fallback?` `style` |
| `tenantLogo` | `objectFit` `opacity?` |
| `tenantCustom` | `fieldKey` `fallback?` `style` |

値はテナント設定（`rs` からは未対応、GUI か `/api/v2/tenant`）から解決される。
**テナント値と `fallback` の両方が未設定なら、プレビュー/PDF では何も描画されない。**

## 廃止済み

| 旧 | 現行 |
|----|------|
| `label` | `text` |
| `table` | `formTable` |
