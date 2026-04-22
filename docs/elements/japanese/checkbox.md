# チェックボックス (checkbox)

固定チェック状態／データバインドの両方に対応するチェックボックス。チェックマーク記号（✓ / × / ●）とラベル位置を選択可能。

- **ElementType**: `checkbox`
- **パレット**: 日本語帳票専用 → `チェックボックス`
- **ファクトリ**: `createCheckboxElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/checkbox/Renderer.tsx`

## 型定義

```ts
export type CheckmarkStyle = '✓' | '×' | '●'
export type CheckboxLabelPosition = 'left' | 'right' | 'top' | 'bottom'

export interface CheckboxElement extends ElementBase {
  type: 'checkbox'
  checked: boolean
  checkmark: CheckmarkStyle
  label: string
  labelPosition?: CheckboxLabelPosition
  dataSource?: string
  style?: TextStyle
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `checked` | boolean | ○ | `false` | 静的 ON/OFF（デザインプレビュー用）。 |
| `checkmark` | `'✓' \| '×' \| '●'` | ○ | `'✓'` | ON 時に描画するシンボル。 |
| `label` | string | ○ | `''` | 併記ラベル。空文字なら非表示。 |
| `labelPosition` | `'left' \| 'right' \| 'top' \| 'bottom'` | ー | `'right'` | ラベル配置。 |
| `dataSource` | string? | ー | 未設定 | データキー。解決値が空文字でなければ checked 扱い。 |
| `style` | `TextStyle?` | ー | 未設定 | ラベルの書体。 |

## データバインド挙動

`dataSource` が指定されている場合、`useDataResolver(dataSource)` の結果で ON/OFF を判定します：

- `''` / `null` / `undefined` → OFF
- それ以外（`"true"`, `"1"`, `"checked"`, 任意の値）→ ON

`dataSource` が未設定のときは `checked` プロパティを使用。

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 5, height: 5 }
checked:   false
checkmark: '✓'
label:     ''
```

## レンダリング挙動

1. `dataSource` が設定されていればデータ解決して ON/OFF 決定、なければ `checked` を使用。
2. サイズ `(size.width × size.height)` の矩形枠を描画。
3. ON のとき、中央に `checkmark` シンボルを配置（フォントサイズはボックスサイズに連動）。
4. `label` が非空なら `labelPosition` に従って配置。

## 典型的な使用例

### 同意チェック（固定プレビュー ON）
```ts
createCheckboxElement({
  checked: true,
  label: '上記内容に同意します',
  labelPosition: 'right',
  size: { width: 5, height: 5 },
})
```

### データバインド（回答データから）
```ts
createCheckboxElement({
  dataSource: 'answers.agreedToTerms',
  label: '規約に同意',
  labelPosition: 'right',
})
```

### × 印（取消記号として）
```ts
createCheckboxElement({
  checked: true,
  checkmark: '×',
  label: '該当なし',
})
```

## PropertiesPanel の項目

- `checked` スイッチ
- `checkmark` 選択（✓ / × / ●）
- `label` テキスト
- `labelPosition` 選択
- `dataSource`（`DataBindingSection`）
- `TextStyleSection`

## 関連要素

- [帳票テーブル (formTable)](../repeating/formTable.md) — `checkbox` セルとして組み込み可能
- [元号選択 (eraSelect)](./eraSelect.md)
