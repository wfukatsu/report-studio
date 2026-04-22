# 収入印紙欄 (revenueStamp)

契約書や領収書に貼付する収入印紙のスペースを示す枠。金額ラベルと消印ガイドを任意表示できます。

- **ElementType**: `revenueStamp`
- **パレット**: 日本語帳票専用 → `収入印紙欄`
- **ファクトリ**: `createRevenueStampElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/revenueStamp/Renderer.tsx`

## 型定義

```ts
export interface RevenueStampElement extends ElementBase {
  type: 'revenueStamp'
  amount?: string
  borderColor: string
  borderWidth: number              // mm
  showLabel: boolean
  showCancellationGuide: boolean
}
```

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `amount` | string? | 未設定 | 金額表示（例: `'200円'`, `'4万円'`）。 |
| `borderColor` | string | `'#000000'` | 枠線色。 |
| `borderWidth` | number (mm) | `0.3` | 枠線幅。 |
| `showLabel` | boolean | `true` | 「収入印紙」のラベル表示。 |
| `showCancellationGuide` | boolean | `true` | 消印用の斜線ガイド表示。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 40, height: 25 }
borderColor: '#000000'
borderWidth: 0.3
showLabel:   true
showCancellationGuide: true
```

## レンダリング挙動

1. `borderColor` / `borderWidth` で矩形枠を描画。
2. `showLabel === true` のとき、枠上部中央に「収入印紙」、`amount` があれば下部に金額を表示。
3. `showCancellationGuide === true` のとき、左下から右上への点線で消印ラインを描画（印紙に跨る割印のガイド）。

## 典型的な使用例

### 契約書用（4 万円印紙）
```ts
createRevenueStampElement({
  amount: '4万円',
  size: { width: 50, height: 30 },
})
```

### 領収書用・シンプル
```ts
createRevenueStampElement({
  showLabel: false,
  showCancellationGuide: false,
  size: { width: 30, height: 20 },
})
```

## PropertiesPanel の項目

- 金額テキスト（`amount`）
- 枠色・線幅
- ラベル表示 ON/OFF
- 消印ガイド表示 ON/OFF

## 関連要素

- [印鑑 (hanko)](./hanko.md) — 割印を手動で配置したい場合
- [図形 (shape)](../shape-image/shape.md) — 代替として枠のみ使いたい場合
