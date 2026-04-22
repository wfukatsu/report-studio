# 繰り返しバンド (repeatingBand)

データ配列を表形式で繰り返し描画する要素。FastReport / JasperReports / DevExpress の "Detail Band" に相当します。請求書明細・注文明細などの典型的な表組表示に使います。

- **ElementType**: `repeatingBand`
- **パレット**: 繰り返し要素 → `繰り返しバンド`
- **ファクトリ**: `createRepeatingBandElement()`, `createRepeatingBandWithDefaults()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/repeatingBand/Renderer.tsx`

## 型定義

```ts
export interface RepeatingBandElement extends ElementBase {
  type: 'repeatingBand'
  dataSource: string
  itemHeight: number
  fields: RepeatingBandField[]
  showHeader: boolean
  showFooter: boolean
  totals: RepeatingBandTotal[]
  pageBreak: 'none' | 'before' | 'after'
  maxItems: number
  oddRowColor: string
  evenRowColor: string
  borderColor: string
  borderWidth: number
  // 罫線の細分制御
  headerBorderColor?: string;  headerBorderWidth?: number
  dataBorderColor?: string;    dataBorderWidth?: number
  columnBorderColor?: string;  columnBorderWidth?: number
  footerBorderColor?: string;  footerBorderWidth?: number
  // ソート・グループ化
  sortBy?: string; sortOrder?: 'asc' | 'desc'
  groupBy?: string
  showGroupSubtotals?: boolean
  groupStyle?: TextStyle
  // その他
  showEmptyRowLines?: boolean
  style?: TextStyle
  headerStyle?: TextStyle
  headerHeight?: number
  wrapText?: boolean
  footerLayout?: 'compact' | 'fixed'
  // 非推奨
  innerBorderColor?: string; innerBorderWidth?: number
}

export interface RepeatingBandField {
  key: string
  label: string
  width: number
  align?: 'left' | 'center' | 'right'
  format?: CalculationFormat
}

export interface RepeatingBandTotal {
  fieldKey: string
  formula: 'sum' | 'count' | 'avg' | 'min' | 'max'
  label?: string
}
```

## 主要プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `dataSource` | string | `''` | バインドする配列フィールドキー（例: `items`）。 |
| `itemHeight` | number (mm) | `8` | データ行 1 行の高さ。 |
| `fields` | `RepeatingBandField[]` | `[]` | 列定義。`width` の合計が `size.width` と一致するようにする。 |
| `showHeader` | boolean | `true` | ヘッダー行表示。 |
| `showFooter` | boolean | `false` | フッター（集計行）表示。 |
| `totals` | `RepeatingBandTotal[]` | `[]` | 集計列定義。 |
| `pageBreak` | `'none' \| 'before' \| 'after'` | `'none'` | ページ区切り挿入。 |
| `maxItems` | number | `0` (無制限) | 最大表示件数。超過分は切り捨て。 |
| `oddRowColor`, `evenRowColor` | string | `#ffffff`, `#f9fafb` | ゼブラストライプ。 |
| `borderColor`, `borderWidth` | string / mm | `#000000`, `0.3` | 外枠。 |
| `headerHeight` | number? | `itemHeight` | ヘッダー高さ（省略時は本体と同じ）。 |
| `wrapText` | boolean | `false` | セル内折り返し。`false` なら nowrap + ellipsis。 |
| `footerLayout` | `'compact' \| 'fixed'` | `'fixed'` | フッター配置。`compact` で行直下に詰める。 |
| `sortBy`, `sortOrder` | string, `'asc' \| 'desc'` | 未設定 | 表示前ソート。 |
| `groupBy` | string? | 未設定 | グループ化キー。`showGroupSubtotals` で小計行挿入。 |
| `showEmptyRowLines` | boolean? | `false` | 残り行の罫線を描く（行数不足時）。 |

### 罫線の優先解決

細分化された罫線プロパティはフォールバックチェーンで解決されます：

- ヘッダー下罫線: `headerBorderColor` → `innerBorderColor` → `borderColor`
- データ行間: `dataBorderColor` → `innerBorderColor` → `borderColor`
- 列区切り: `columnBorderColor` → `innerBorderColor` → `borderColor`
- フッター上: `footerBorderColor` → `borderColor`

幅も同様のチェーン。`innerBorder*` は後方互換用。

## デフォルト値（ファクトリ）

`createRepeatingBandElement()` は最小構成で返します：

```ts
position: { x: 13, y: 13 }
size:     { width: 175, height: 60 }
dataSource: ''
itemHeight: 8
fields: []
showHeader: true, showFooter: false
totals: []
pageBreak: 'none', maxItems: 0
oddRowColor:  '#ffffff'
evenRowColor: '#f9fafb'
borderColor:  '#000000', borderWidth: 0.3
style:       { fontSize: 10, color: '#000000' }
headerStyle: { fontSize: 10, fontWeight: 'bold', color: '#374151', backgroundColor: '#f3f4f6' }
```

`createRepeatingBandWithDefaults()` は請求書明細用の 6 列プリセット（No / 品目 / 数量 / 単位 / 単価 / 金額）と `totals: [{ fieldKey: 'amount', formula: 'sum' }]` を含む初期値を返します。

## レンダリング挙動

1. `useDataResolver(dataSource)` で配列を取得。`undefined` の場合はサンプル行表示（エディタでのみ）。
2. `sortBy` があれば比較関数で並び替え。
3. `groupBy` があればグループ境界で区切り、`showGroupSubtotals` で小計行を挿入。
4. `maxItems` で切り詰め。
5. 各行を `itemHeight` 分の高さで描画。各セルは `fields[n].width` で列幅決定し、`align` / `format` を適用。
6. `showFooter` が true なら `totals` を集計して末尾行に描画。

## 典型的な使用例

### 請求書明細
```ts
createRepeatingBandWithDefaults({
  dataSource: 'items',
  position: { x: 13, y: 80 },
  size: { width: 184, height: 120 },
})
```

### カテゴリ別グループ化 + 小計
```ts
createRepeatingBandElement({
  dataSource: 'items',
  fields: [
    { key: 'category', label: 'カテゴリ', width: 30 },
    { key: 'name',     label: '品名',     width: 80 },
    { key: 'amount',   label: '金額',     width: 30, align: 'right', format: { type: 'currency_jpy' } },
  ],
  groupBy: 'category',
  showGroupSubtotals: true,
  showFooter: true,
  totals: [{ fieldKey: 'amount', formula: 'sum', label: '合計' }],
})
```

## PropertiesPanel の項目

- データソース（スキーマグループ選択）
- 列エディタ（追加／削除／並び替え、各列の `key` / `label` / `width` / `align` / `format`）
- ヘッダー・フッター・グループ設定
- 罫線色・線幅（細分プロパティ含む）
- ゼブラストライプ色
- `headerStyle`, `style`, `groupStyle`（`TextStyleSection`）
- ページブレーク・最大件数・折り返し

## 関連要素

- [帳票テーブル (formTable)](./formTable.md) — 行列を明示的に定義した固定／動的ハイブリッド
- [繰り返しリスト (repeatingList)](./repeatingList.md) — カード・グリッドレイアウト
