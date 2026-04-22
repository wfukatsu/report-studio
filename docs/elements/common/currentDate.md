# 現在日付 (currentDate)

帳票出力日を自動表示する要素。ロケール／和暦対応の書式プリセットを備えます。

- **ElementType**: `currentDate`
- **パレット**: 帳票共通 → `現在日付`
- **ファクトリ**: `createCurrentDateElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/currentDate/Renderer.tsx`

## 型定義

```ts
export interface CurrentDateElement extends ElementBase {
  type: 'currentDate'
  format: CurrentDateFormat
  customFormat?: string
  style: TextStyle
}

export type CurrentDateFormat =
  | 'yyyy/MM/dd'
  | 'yyyy年MM月dd日'
  | 'yyyy-MM-dd'
  | 'MM/dd/yyyy'
  | 'wareki_full'             // 令和8年4月10日
  | 'wareki_short'            // R8.04.10
  | 'yyyy年MM月dd日 (ddd)'    // 2026年04月10日 (木)
  | 'custom'
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `format` | `CurrentDateFormat` | ○ | `'yyyy年MM月dd日'` | プリセット書式。 |
| `customFormat` | string? | ー | 未設定 | `format === 'custom'` 時に利用する書式文字列。 |
| `style` | `TextStyle` | ○ | `{fontSize:8.5, color:'#000000', textAlign:'left'}` | テキストスタイル。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 40, height: 6 }
format:   'yyyy年MM月dd日'
style:    { fontSize: 8.5, color: '#000000', textAlign: 'left' }
```

## 書式の解決ルール

- 和暦系 (`wareki_full` / `wareki_short`) はクライアント側ライブラリで年号を算出。
- `custom` は `date-fns` 互換トークン（`yyyy`, `MM`, `dd`, `HH` など）を展開。
- レンダリング時点の `new Date()` を利用します（スクリーン / PDF いずれでも出力時刻）。

## 典型的な使用例

### 和暦フル表示（ヘッダー右）
```ts
createCurrentDateElement({
  position: { x: 140, y: 10 },
  format: 'wareki_full',
  style: { fontSize: 11, color: '#000000', textAlign: 'right' },
})
```

### カスタム書式 `2026年04月10日 (木)` のようにして強調
```ts
createCurrentDateElement({
  format: 'yyyy年MM月dd日 (ddd)',
  style: { fontSize: 12, fontWeight: 'bold' },
})
```

## PropertiesPanel の項目

- 書式プリセット（和暦含むドロップダウン）
- カスタム書式入力（`format === 'custom'` のみ）
- `TextStyleSection`

## 関連要素

- [ページ番号 (pageNumber)](./pageNumber.md)
- [データフィールド (dataField)](../text/dataField.md) — DB 上の日付列を表示する場合はこちら
