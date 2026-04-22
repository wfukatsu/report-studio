# グラフ (chart)

Recharts をラップしたグラフ描画要素。棒・線・円・ドーナツの 4 種類に対応。

- **ElementType**: `chart`
- **パレット**: データ表示 → `グラフ`
- **ファクトリ**: `createChartElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/chart/Renderer.tsx`（内部で `_blocks/renderers/ChartContent.tsx` を使用）

## 型定義

```ts
export interface ChartElement extends ElementBase {
  type: 'chart'
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  dataBinding?: string
  title?: string
  xAxisKey?: string
  yAxisKeys?: string[]
  colors?: string[]
  showLegend?: boolean
  showGrid?: boolean
}
```

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `chartType` | `'bar' \| 'line' \| 'pie' \| 'donut'` | `'bar'` | グラフ種別。 |
| `dataBinding` | string? | 未設定 | 配列データのキー。未設定時はサンプルデータ描画（エディタ上）。 |
| `title` | string? | `'グラフ'` | タイトル。 |
| `xAxisKey` | string? | `'name'` | カテゴリ軸に使うキー（bar / line 用）。 |
| `yAxisKeys` | string[]? | `['value']` | 値軸のキー。複数指定で系列数になる。 |
| `colors` | string[]? | 未設定 | カスタムカラーパレット。未指定時は Recharts 既定色。 |
| `showLegend` | boolean? | `true` | 凡例表示。 |
| `showGrid` | boolean? | `true` | グリッド表示（bar / line のみ）。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 80, height: 53 }
chartType: 'bar'
title:     'グラフ'
xAxisKey:  'name'
yAxisKeys: ['value']
showLegend: true
showGrid:   true
```

## レンダリング挙動

1. `dataBinding` を `useDataResolver` で解決。
2. 配列が得られなければサンプルデータ（`[{name:'A', value:400}, ...]`）で描画。
3. `ChartContent` ブロックが内部で Recharts のコンポーネントを切り替え：
   - `bar` → `BarChart`, 複数 `yAxisKeys` で複数 `Bar`。
   - `line` → `LineChart`, 複数 `yAxisKeys` で複数 `Line`。
   - `pie` / `donut` → `PieChart`（`donut` は `innerRadius` を設定）。`yAxisKeys[0]` を値キーとし、`xAxisKey` をラベル。
4. `title` は `Renderer` 上部に別要素として描画。

## データ形式

```jsonc
// bar / line
[
  { "name": "1月", "sales": 120, "profit": 40 },
  { "name": "2月", "sales": 150, "profit": 50 }
]
// chart 設定: xAxisKey: 'name', yAxisKeys: ['sales', 'profit']
```

```jsonc
// pie / donut
[
  { "name": "東京", "value": 40 },
  { "name": "大阪", "value": 25 }
]
// chart 設定: xAxisKey: 'name', yAxisKeys: ['value']
```

## 典型的な使用例

### 月次売上（棒グラフ、2 系列）
```ts
createChartElement({
  chartType: 'bar',
  dataBinding: 'monthlyKpi',
  title: '月次売上推移',
  xAxisKey: 'month',
  yAxisKeys: ['sales', 'target'],
  colors: ['#3b82f6', '#ef4444'],
})
```

### シェア（ドーナツ）
```ts
createChartElement({
  chartType: 'donut',
  dataBinding: 'regionShare',
  title: '地域シェア',
  xAxisKey: 'region',
  yAxisKeys: ['share'],
  showGrid: false,
})
```

## PropertiesPanel の項目

- グラフ種別
- `dataBinding`（スキーマ配列フィールド選択）
- タイトル
- `xAxisKey` / `yAxisKeys`（複数追加）
- カラーパレット（色追加／削除）
- 凡例・グリッド表示

## 注意

PDF エクスポート時は `html2canvas` で現在のレンダリング結果をラスタライズします。ページサイズに対して高精細印刷したい場合は要素サイズを大きめに確保してください。

## 関連要素

- [繰り返しリスト (repeatingList)](../repeating/repeatingList.md) — カード形式の数値表示
- [データフィールド (dataField)](../text/dataField.md)
