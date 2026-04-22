# テキスト (text)

固定テキストおよび `{{fieldKey}}` トークンによる動的テキスト表示を担う、最も基本的な要素。ラベル用途としても使います（旧 `label` は本要素に統合されました）。

- **ElementType**: `text`
- **パレット**: テキスト系 → `テキスト`
- **ファクトリ**: `createTextElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/text/Renderer.tsx`
- **InlineEditor**: `src/elements/text/InlineEditor.tsx`（キャンバス上ダブルクリックで起動）

## 型定義

```ts
export interface TextElement extends ElementBase {
  type: 'text'
  content: string
  style: TextStyle
  furigana?: string          // ルビ
  furiganaScale?: number     // 既定 0.5
}
```

`TextStyle` は 16 のプロパティを持ちます（全て optional）:

| グループ | プロパティ |
|---|---|
| フォント | `fontSize` (pt), `fontFamily`, `fontWeight`, `fontStyle`, `textDecoration` |
| 色 | `color`, `backgroundColor` |
| 配置 | `textAlign`, `verticalAlign` |
| 余白・行間 | `letterSpacing` (em), `lineHeight`, `paddingTop/Right/Bottom/Left` (mm) |
| 日本語 | `writingMode` (`horizontal-tb` / `vertical-rl`) |
| フィット | `textFit` (`shrinkText` / `expandFrame`) |

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `content` | string | ○ | `'テキスト'` | 表示する文字列。`{{fieldKey}}` を含むとランタイム解決される。 |
| `style` | `TextStyle` | ○ | `{fontSize:10, fontWeight:'normal', color:'#000000', textAlign:'left'}` | テキストスタイル全般。 |
| `furigana` | string? | ー | 未設定 | ルビ文字列。CSS `ruby` ではなく独自にスケール表示。 |
| `furiganaScale` | number? | ー | `0.5` | 本文フォントサイズに対する倍率。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 53, height: 10 }
content:  'テキスト'
style:    { fontSize: 10, fontWeight: 'normal', color: '#000000', textAlign: 'left' }
```

## レンダリング挙動

1. `content` 中の `{{fieldKey}}` を `useDataResolver` で解決。未解決キーは空文字になる（後方互換のためエラーにしない）。
2. `furigana` がある場合、本文の上に `furiganaScale` 倍のフォントサイズで追加行を配置。
3. `style.writingMode === 'vertical-rl'` で縦書き。句読点の回転は `TextContent` ブロック内で補正。
4. `style.textFit`:
   - `shrinkText`: 枠に収まるよう `fontSize` を自動縮小。
   - `expandFrame`: コンテンツに合わせて `size.height` を拡張。

## インライン編集

ダブルクリックで `InlineEditor`（contentEditable ベース）を起動し、`content` を直接編集できます。`Escape` or 外クリックで確定。

## 典型的な使用例

### 固定タイトル
```ts
createTextElement({
  position: { x: 13, y: 10 },
  size: { width: 180, height: 12 },
  content: '請 求 書',
  style: { fontSize: 22, fontWeight: 'bold', textAlign: 'center' },
})
```

### フィールド埋め込み
```ts
createTextElement({
  content: 'お客様: {{customer.name}} 様',
  style: { fontSize: 11 },
})
```

### ルビ付き
```ts
createTextElement({
  content: '代表取締役',
  furigana: 'だいひょうとりしまりやく',
  furiganaScale: 0.4,
})
```

## PropertiesPanel の項目

- `TextStyleSection`（フォント全般）
- `FuriganaSection`（`furigana`, `furiganaScale`）
- `BorderSection`（枠線、`style.backgroundColor` は `ColorSection` で設定）

## 関連要素

- [データフィールド (dataField)](./dataField.md) — 単一フィールドの表示に特化
- [記入欄 (manualEntry)](../input/manualEntry.md) — 下線付き入力欄
