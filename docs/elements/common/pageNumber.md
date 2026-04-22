# ページ番号 (pageNumber)

現在ページ番号と総ページ数を自動表示する要素。エクスポート時に `{{page}}` / `{{pages}}` がランタイム値に置換されます。

- **ElementType**: `pageNumber`
- **パレット**: 帳票共通 → `ページ番号`
- **ファクトリ**: `createPageNumberElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/pageNumber/Renderer.tsx`

## 型定義

```ts
export interface PageNumberElement extends ElementBase {
  type: 'pageNumber'
  format: PageNumberFormat
  customFormat?: string
  style: TextStyle
}

export type PageNumberFormat =
  | '{{page}}'                       // 1
  | '{{page}} / {{pages}}'           // 1 / 3
  | '{{page}}/{{pages}}'             // 1/3
  | 'Page {{page}} of {{pages}}'     // Page 1 of 3
  | '{{page}}ページ'                  // 1ページ
  | 'custom'
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `format` | `PageNumberFormat` | ○ | `'{{page}} / {{pages}}'` | 表示書式。`custom` を選ぶと `customFormat` を使う。 |
| `customFormat` | string? | ー | 未設定 | 自由書式。`{{page}}` と `{{pages}}` が置換される。 |
| `style` | `TextStyle` | ○ | `{fontSize:8.5, color:'#666666', textAlign:'center'}` | テキストスタイル。 |

継承プロパティは [共通事項](../README.md#共通事項) を参照。

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 30, height: 6 }
format:   '{{page}} / {{pages}}'
style:    { fontSize: 8.5, color: '#666666', textAlign: 'center' }
```

## レンダリング挙動

1. 現在描画中のページ index (1 始まり) と総ページ数をコンテキストから取得。
2. `format === 'custom'` の場合は `customFormat` を、そうでなければ `format` 文字列をそのまま使用。
3. `{{page}}` と `{{pages}}` を数値で置換。
4. `TextContent` ブロックで `style` を適用し描画。

## 典型的な使用例

### フッター中央に「1 / 3」を表示
```ts
createPageNumberElement({
  position: { x: 90, y: 285 },
  size:     { width: 30, height: 6 },
  format:   '{{page}} / {{pages}}',
})
```

### カスタム書式で「第1頁／全3頁」
```ts
createPageNumberElement({
  format: 'custom',
  customFormat: '第{{page}}頁／全{{pages}}頁',
})
```

## PropertiesPanel の項目

- 書式プリセット（`PageNumberFormat` ドロップダウン）
- カスタム書式入力（`format === 'custom'` のときのみ）
- `TextStyleSection`（フォント／色／配置）

## 関連要素

- [現在日付 (currentDate)](./currentDate.md) — フッターで併用することが多い
- [テキスト (text)](../text/text.md) — 固定文字を併置する場合
