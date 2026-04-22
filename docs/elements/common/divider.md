# 区切り線 (divider)

セクション境界や装飾用の水平／垂直罫線。

- **ElementType**: `divider`
- **パレット**: 帳票共通 → `区切り線`
- **ファクトリ**: `createDividerElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/divider/Renderer.tsx`

## 型定義

```ts
export interface DividerElement extends ElementBase {
  type: 'divider'
  direction: 'horizontal' | 'vertical'
  color: string
  thickness: number          // mm
  dashStyle: 'solid' | 'dashed' | 'dotted'
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `direction` | `'horizontal' \| 'vertical'` | ○ | `'horizontal'` | 罫線方向。 |
| `color` | string | ○ | `'#000000'` | 線色。 |
| `thickness` | number (mm) | ○ | `0.3` | 線の太さ。 |
| `dashStyle` | `'solid' \| 'dashed' \| 'dotted'` | ○ | `'solid'` | 実線／破線／点線。 |

## デフォルト値（ファクトリ）

```ts
position:  { x: 13, y: 13 }
size:      { width: 170, height: 0.5 }
direction: 'horizontal'
color:     '#000000'
thickness: 0.3
dashStyle: 'solid'
```

## レンダリング挙動

- `direction === 'horizontal'`: 上端に `thickness` mm の罫線、`size.width` に伸長。
- `direction === 'vertical'`: 左端に `thickness` mm の罫線、`size.height` に伸長。
- `dashStyle` は CSS `border-style` にそのまま対応。

## 典型的な使用例

### ヘッダー下の仕切り線
```ts
createDividerElement({
  position: { x: 13, y: 30 },
  size:     { width: 184, height: 0.5 },
  color:    '#d1d5db',
  thickness: 0.2,
})
```

### 左右の列を分ける縦線
```ts
createDividerElement({
  direction: 'vertical',
  position:  { x: 105, y: 40 },
  size:      { width: 0.3, height: 200 },
})
```

## PropertiesPanel の項目

- 方向（horizontal / vertical）
- 線色（`ColorSection`）
- 太さ（mm スライダ）
- 線種（solid / dashed / dotted）

## 関連要素

- [図形 (shape)](../shape-image/shape.md) — `shape: 'line'` でも類似の線を描画可能
