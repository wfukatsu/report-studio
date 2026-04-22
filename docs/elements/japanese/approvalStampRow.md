# 多段印鑑欄 (approvalStampRow)

承認フロー（担当 → 係長 → 課長 → 部長 → 社長 等）を横並びで描画する印鑑欄。各セルに役職名ラベルと押印スペースを持ちます。

- **ElementType**: `approvalStampRow`
- **パレット**: 日本語帳票専用 → `多段印鑑欄`
- **ファクトリ**: `createApprovalStampRowElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/approvalStampRow/Renderer.tsx`

## 型定義

```ts
export interface ApprovalStampCell {
  role: string                    // ラベル（例: 担当 / 係長）
  stampSrc?: string               // 押印済み画像（Base64/URL）
  width: number                   // mm
}

export interface ApprovalStampRowElement extends ElementBase {
  type: 'approvalStampRow'
  cells: ApprovalStampCell[]
  labelPosition: 'top' | 'bottom'
  borderColor: string
  borderWidth: number             // mm
  cellHeight: number              // mm
}
```

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `cells` | `ApprovalStampCell[]` | 5 件（担当/係長/課長/部長/社長） | 各セル定義。 |
| `labelPosition` | `'top' \| 'bottom'` | `'bottom'` | ラベル位置。 |
| `borderColor` | string | `'#000000'` | 枠線色。 |
| `borderWidth` | number (mm) | `0.3` | 枠線幅。 |
| `cellHeight` | number (mm) | `15` | 各セル高さ（押印スペース）。 |

### `ApprovalStampCell`

| プロパティ | 型 | 説明 |
|---|---|---|
| `role` | string | 役職ラベル（空文字可）。 |
| `stampSrc` | string? | 押印済み画像 URL / data-URI。未設定なら空のスペース。 |
| `width` | number (mm) | このセルの幅。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 75, height: 20 }
cells: [
  { role: '担当', width: 15 },
  { role: '係長', width: 15 },
  { role: '課長', width: 15 },
  { role: '部長', width: 15 },
  { role: '社長', width: 15 },
]
labelPosition: 'bottom'
borderColor: '#000000'
borderWidth: 0.3
cellHeight:  15
```

## レンダリング挙動

1. 左から順に `cells[n]` を `width` 分の幅でレイアウト。
2. 各セル内に `cellHeight` 分の押印スペース + `labelPosition` に応じてラベル行を配置。
3. `stampSrc` が指定されていれば押印スペース中央に画像表示（`object-fit: contain`）。
4. セル間の縦罫線と外枠が `borderColor` / `borderWidth` で描画される。

`cells[n].width` の合計が `size.width` を超過・不足する場合は、描画エンジン側で比率調整されます。

## 典型的な使用例

### 4 段承認（担当 → 課長 → 部長 → 社長）
```ts
createApprovalStampRowElement({
  cells: [
    { role: '担当', width: 18 },
    { role: '課長', width: 18 },
    { role: '部長', width: 18 },
    { role: '社長', width: 18 },
  ],
  labelPosition: 'bottom',
  cellHeight: 18,
  size: { width: 72, height: 22 },
})
```

### 押印済みイメージをプリレンダ（決裁済みプレビュー）
```ts
createApprovalStampRowElement({
  cells: [
    { role: '担当', width: 18, stampSrc: 'data:image/png;base64,...' },
    { role: '課長', width: 18, stampSrc: 'data:image/png;base64,...' },
    { role: '部長', width: 18 },
  ],
})
```

## PropertiesPanel の項目

- セル追加・削除・並び替え
- 各セルの `role` / `width` / `stampSrc`
- ラベル位置（top / bottom）
- 枠線色・幅
- セル高さ

## 関連要素

- [印鑑 (hanko)](./hanko.md) — 単独の印鑑枠
- [帳票テーブル (formTable)](../repeating/formTable.md) — 承認行をカスタム配置したい場合
