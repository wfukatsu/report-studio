# 印鑑 (hanko)

日本の社印・個人印を模した印鑑要素。円形／角形、縦書き／横書き、二重枠に対応。

- **ElementType**: `hanko`
- **パレット**: 日本語帳票専用 → `印鑑`
- **ファクトリ**: `createHankoElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/hanko/Renderer.tsx`

## 型定義

```ts
export interface HankoElement extends ElementBase {
  type: 'hanko'
  text: string
  shape: 'circle' | 'rectangle'
  borderColor: string
  textColor: string
  fontSize: number                   // mm 単位（TextStyle とは異なる）
  writingMode: 'vertical-rl' | 'horizontal-tb'
  doubleBorder: boolean
  binding?: string                   // データソースキー
}
```

> ⚠️ `HankoElement.fontSize` の単位は **mm** です。他の要素の `TextStyle.fontSize`（pt）とは異なる点に注意。

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `text` | string | `'印'` | 印鑑内の文字。 |
| `shape` | `'circle' \| 'rectangle'` | `'circle'` | 形状。 |
| `borderColor` | string | `'#cc0000'` | 外枠色。 |
| `textColor` | string | `'#cc0000'` | 文字色。 |
| `fontSize` | number (mm) | `4` | 文字サイズ。 |
| `writingMode` | `'vertical-rl' \| 'horizontal-tb'` | `'vertical-rl'` | 書字方向。 |
| `doubleBorder` | boolean | `true` | 二重枠の有無。 |
| `binding` | string? | 未設定 | 解決結果を `text` の代わりに表示（例: 担当者名）。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 20, height: 20 }
text:     '印'
shape:    'circle'
borderColor: '#cc0000'
textColor:   '#cc0000'
fontSize: 4                  // mm
writingMode: 'vertical-rl'
doubleBorder: true
```

## レンダリング挙動

1. `binding` があれば `useDataResolver(binding)` で値取得し、得られた文字を優先利用（なければ `text`）。
2. `shape === 'circle'` は `border-radius: 50%`。`shape === 'rectangle'` は角丸なしの枠。
3. `doubleBorder` が true のとき、内側にもう 1 つの枠を描画（疑似要素）。
4. `writingMode` に応じて文字列を縦書き／横書き配置。

## 典型的な使用例

### 社印（縦書き・二重枠）
```ts
createHankoElement({
  text: '株式会社 Example',
  size: { width: 25, height: 25 },
  fontSize: 3.5,
})
```

### 担当者印（データバインド）
```ts
createHankoElement({
  binding: 'approver.lastName',
  text: '',              // binding 優先
  shape: 'circle',
})
```

### 角印
```ts
createHankoElement({
  text: '検 印',
  shape: 'rectangle',
  doubleBorder: false,
  writingMode: 'horizontal-tb',
  size: { width: 18, height: 18 },
})
```

## PropertiesPanel の項目

- `text` / `binding`
- 形状（circle / rectangle）
- 書字方向
- 二重枠 ON/OFF
- 色（枠・文字）
- フォントサイズ（mm）

## 関連要素

- [多段印鑑欄 (approvalStampRow)](./approvalStampRow.md) — 承認フロー（担当 → 課長 → 部長 等）
- [収入印紙欄 (revenueStamp)](./revenueStamp.md)
