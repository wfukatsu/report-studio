# 図形 (shape)

矩形 / 円 / 線の 3 種類を描画する汎用図形要素。枠線・塗り・角丸・破線パターンを持ちます。

- **ElementType**: `shape`
- **パレット**: 図形・画像 → `矩形` / `円` / `線`（いずれも `shape` 型、`shape` プロパティのみ異なる）
- **ファクトリ**: `createShapeElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/shape/Renderer.tsx`

## 型定義

```ts
export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: 'rectangle' | 'circle' | 'line'
  fill?: string
  stroke?: string
  strokeWidth?: number
  borderRadius?: number
  strokeDash?: 'solid' | 'dashed' | 'dotted'
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `shape` | `'rectangle' \| 'circle' \| 'line'` | ○ | `'rectangle'` | 形状。パレットの 3 項目で初期値が変わる。 |
| `fill` | string? | ー | `'transparent'` | 塗りつぶし色。`line` では無視。 |
| `stroke` | string? | ー | `'#000000'` | 線色。 |
| `strokeWidth` | number? | ー | `0.3` | 線幅 (mm)。 |
| `borderRadius` | number? | ー | 未設定 | `rectangle` の角丸 (mm)。 |
| `strokeDash` | `'solid' \| 'dashed' \| 'dotted'` | ー | `'solid'` | 線種。 |

## デフォルト値（ファクトリ）

```ts
// rectangle (デフォルト)
position: { x: 13, y: 13 }
size:     { width: 26, height: 16 }
shape:    'rectangle'
fill:     'transparent'
stroke:   '#000000'
strokeWidth: 0.3
strokeDash:  'solid'

// line（パレット「線」）
size:  { width: 53, height: 0.5 }
shape: 'line'

// circle（パレット「円」）
size:  { width: 26, height: 16 }   // 楕円扱い
shape: 'circle'
```

## レンダリング挙動

- **rectangle**: `<div>` の `border` と `background-color`。`borderRadius` で角丸。
- **circle**: `border-radius: 50%`。`size` が非正方形なら楕円になる。
- **line**:
  - 幅 > 高さ → 水平線。CSS `border-top` を使用。
  - 幅 ≤ 高さ → 垂直線。CSS `border-left` を使用。
  - `fill` は無視。

## 典型的な使用例

### 枠囲み
```ts
createShapeElement({
  shape: 'rectangle',
  position: { x: 10, y: 40 },
  size:     { width: 190, height: 60 },
  stroke:   '#333333',
  strokeWidth: 0.3,
  borderRadius: 2,
})
```

### 署名欄の下線
```ts
createShapeElement({
  shape: 'line',
  size:  { width: 80, height: 0.3 },
  stroke: '#000000',
})
```

### 円形アイコン
```ts
createShapeElement({
  shape: 'circle',
  size:  { width: 12, height: 12 },
  fill:  '#fbbf24',
  stroke: 'transparent',
})
```

## PropertiesPanel の項目

- 形状（rectangle / circle / line）
- 塗り色（`ColorSection`、`line` では非表示）
- 線色・線幅・線種（`BorderSection` に相当）
- 角丸（rectangle のみ）

## 関連要素

- [区切り線 (divider)](../common/divider.md) — シンプルな罫線専用
- [画像 (image)](./image.md)
