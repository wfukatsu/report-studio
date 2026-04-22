# 繰り返しリスト (repeatingList)

データ配列をカード／グリッド形式で繰り返し描画する要素。商品カタログや名刺一覧などの「表ではなくカード」レイアウトに最適。

- **ElementType**: `repeatingList`
- **パレット**: 繰り返し要素 → `繰り返しリスト`
- **ファクトリ**: `createRepeatingListElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/repeatingList/Renderer.tsx`

## 型定義

```ts
export interface RepeatingListElement extends ElementBase {
  type: 'repeatingList'
  dataSource: string
  layout: 'vertical' | 'horizontal' | 'grid'
  gridColumns: number
  itemWidth: number       // mm
  itemHeight: number      // mm
  gap: number             // mm
  fields: RepeatingListField[]
  maxItems: number
  borderColor?: string
  borderWidth?: number    // mm
  itemBackground?: string
  borderRadius?: number   // mm
  pageBreak: 'none' | 'before' | 'after'
}

export interface RepeatingListField {
  key: string
  label?: string
  x: number; y: number          // カード内の相対座標 (mm)
  width: number; height: number // カード内のサイズ (mm)
  style?: TextStyle
  isLabel?: boolean             // true: key 文字列を固定表示（ラベル扱い）
}
```

## 主要プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `dataSource` | string | `'items'` | バインドする配列フィールドキー。 |
| `layout` | `'vertical' \| 'horizontal' \| 'grid'` | `'grid'` | カード配置方向。 |
| `gridColumns` | number | `3` | `layout === 'grid'` の列数。 |
| `itemWidth`, `itemHeight` | number (mm) | `55`, `20` | 1 カードのサイズ。 |
| `gap` | number (mm) | `2` | カード間の間隔。 |
| `fields` | `RepeatingListField[]` | プリセット 3 件 | カード内の各フィールドの配置。 |
| `maxItems` | number | `0` (無制限) | 最大表示数。 |
| `borderColor`, `borderWidth` | string, mm | `'#d1d5db'`, `0.3` | カード枠線。 |
| `itemBackground` | string? | `'#ffffff'` | カード背景。 |
| `borderRadius` | number? | `1` (mm) | 角丸。 |
| `pageBreak` | `'none' \| 'before' \| 'after'` | `'none'` | ページ区切り。 |

### フィールド配置の定義

`fields[n]` はカード内の相対座標 `(x, y)` とサイズ `(width, height)` を持ちます。`style` で個別に文字スタイルを指定可能。`isLabel: true` のとき `key` 文字列自体を固定表示ラベルとして描画します（データ解決は行われない）。

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 175, height: 60 }
dataSource:   'items'
layout:       'grid'
gridColumns:  3
itemWidth:    55
itemHeight:   20
gap:          2
fields: [
  { key: 'name',  label: '名前', x: 2, y: 2,  width: 36, height: 5, style: { fontSize: 11, fontWeight: 'bold' } },
  { key: 'title', label: '役職', x: 2, y: 8,  width: 36, height: 4, style: { fontSize: 8.5, color: '#6b7280' } },
  { key: 'dept',  label: '部署', x: 2, y: 13, width: 36, height: 4, style: { fontSize: 8.5, color: '#6b7280' } },
]
maxItems:      0
borderColor:   '#d1d5db'
borderWidth:   0.3
itemBackground:'#ffffff'
borderRadius:  1
pageBreak:     'none'
```

## レンダリング挙動

1. `useDataResolver(dataSource)` で配列取得。`maxItems` で切り詰め。
2. `layout` に応じて外側コンテナを CSS フレックスボックスで配置：
   - `vertical`: 縦に積む（`flex-direction: column`）
   - `horizontal`: 横並び（`flex-direction: row`）
   - `grid`: `grid-template-columns: repeat(gridColumns, 1fr)` の CSS Grid
3. 各カード内で `fields` を絶対配置（`position: absolute`）で描画。
4. 各フィールドは `style` と（`isLabel !== true` であれば）解決値を使って `TextContent` で描画。

## 典型的な使用例

### 商品カタログ（3 列グリッド）
```ts
createRepeatingListElement({
  dataSource: 'products',
  layout: 'grid',
  gridColumns: 3,
  itemWidth: 60,
  itemHeight: 25,
  fields: [
    { key: 'name',  x: 2, y: 2,  width: 56, height: 5, style: { fontSize: 11, fontWeight: 'bold' } },
    { key: 'sku',   x: 2, y: 8,  width: 56, height: 4, style: { fontSize: 8, color: '#6b7280' } },
    { key: 'price', x: 2, y: 13, width: 56, height: 6, style: { fontSize: 12, textAlign: 'right' } },
  ],
})
```

### 連絡先リスト（縦）
```ts
createRepeatingListElement({
  dataSource: 'contacts',
  layout: 'vertical',
  itemWidth: 170,
  itemHeight: 12,
  fields: [
    { key: '連絡先:', x: 2, y: 4, width: 20, height: 4, isLabel: true, style: { fontSize: 9, color: '#6b7280' } },
    { key: 'name',    x: 24, y: 4, width: 80, height: 4, style: { fontSize: 10 } },
    { key: 'phone',   x: 110, y: 4, width: 50, height: 4, style: { fontSize: 10, textAlign: 'right' } },
  ],
})
```

## PropertiesPanel の項目

- データソース
- レイアウト切替（vertical / horizontal / grid）
- グリッド列数（grid のみ）
- カードサイズ・ギャップ
- フィールドエディタ（追加／削除／位置編集／個別スタイル）
- カード枠線・背景・角丸
- ページブレーク・最大件数

## 関連要素

- [繰り返しバンド (repeatingBand)](./repeatingBand.md) — 表組に最適
- [帳票テーブル (formTable)](./formTable.md) — 行列を明示したテーブル
