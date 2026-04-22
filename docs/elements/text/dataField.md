# データフィールド (dataField)

単一のデータソースフィールドを表示する要素。書式（通貨、日付、和暦 等）を持ち、`fallbackText` で未解決時の表示を制御できます。`text` 要素が `{{token}}` で複数値を埋め込むのに対し、`dataField` は **単一値の表示に特化** しています。

- **ElementType**: `dataField`
- **パレット**: テキスト系 → `データフィールド`
- **ファクトリ**: `createDataFieldElement()`, `createDataFieldFromSchema()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/dataField/Renderer.tsx`

## 型定義

```ts
export interface DataFieldElement extends ElementBase {
  type: 'dataField'
  fieldKey: string                  // ドット記法 (例: customer.name)
  label?: string
  style: TextStyle
  format?: CalculationFormat
  fallbackText?: string
}

export interface CalculationFormat {
  type: NumberFormatType | DateFormatType | AddressFormatType
  decimalPlaces?: number
  customPattern?: string
}
```

- **NumberFormatType**: `integer` / `decimal` / `currency_jpy` / `currency_usd` / `percent` / `comma` / `kanji_numeral` / `custom`
- **DateFormatType**: `yyyy/MM/dd` / `yyyy年MM月dd日` / `MM/dd/yyyy` / `wareki_full` / `wareki_short` / `custom`
- **AddressFormatType**: `address_single` / `address_multiline`

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `fieldKey` | string | ○ | `'field.key'` | データキー（ドット記法対応）。スキーマドロップで自動設定。 |
| `label` | string? | ー | `'フィールド'` | UI 上の名前（レイヤーパネル等）。描画には出ない。 |
| `style` | `TextStyle` | ○ | `{fontSize:10, color:'#000000', textAlign:'left'}` | 書体。 |
| `format` | `CalculationFormat?` | ー | 未設定 | 値の書式化ルール。 |
| `fallbackText` | string? | ー | `''` | 未解決・null 時の表示文字。 |
| `schemaBinding` | `{fieldId}` | ー | 未設定 | スキーマフィールドの UUID。存在するとスキーマエディタで自動同期。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 40, height: 8 }
fieldKey: 'field.key'
label:    'フィールド'
style:    { fontSize: 10, fontWeight: 'normal', color: '#000000', textAlign: 'left' }
fallbackText: ''
```

## レンダリング挙動

1. `useDataResolver(fieldKey)` で値を解決。
2. 値が得られなければ `fallbackText` を描画（さらに空なら空欄）。
3. 値があり `format` が設定されていれば、型に応じて整形：
   - 数値系: `Intl.NumberFormat` + 単位文字列を付与（`¥`, `%`, 等）。`kanji_numeral` は大字変換。
   - 日付系: `date-fns` 互換トークン（`wareki_*` は年号算出）。
   - 住所系: `address_multiline` は改行挿入。
4. `TextContent` で `style` を適用。

## スキーマバインディングとの併用

スキーマフィールドをパレットからドラッグすると `createDataFieldFromSchema` が呼ばれ、`fieldKey` に加えて `schemaBinding.fieldId` が設定されます。`fieldId` は UUID で安定しているため、スキーマ側で `key` をリネームしても参照が切れません。

```ts
createDataFieldFromSchema({
  fieldId: '2f8a-...',
  fieldKey: 'customer.name',
  fieldLabel: '顧客名',
})
```

## 典型的な使用例

### 通貨表示
```ts
createDataFieldElement({
  fieldKey: 'invoice.total',
  format: { type: 'currency_jpy' },
  style: { fontSize: 14, fontWeight: 'bold', textAlign: 'right' },
})
```

### 和暦日付
```ts
createDataFieldElement({
  fieldKey: 'contract.signedAt',
  format: { type: 'wareki_full' },
  fallbackText: '（未署名）',
})
```

### カスタム数値パターン
```ts
createDataFieldElement({
  fieldKey: 'quantity',
  format: { type: 'custom', customPattern: '#,##0 個' },
})
```

## PropertiesPanel の項目

- `DataBindingSection`（`fieldKey` 入力 & スキーマ選択）
- `FormatSection`（書式タイプ、小数桁、カスタムパターン）
- `TextStyleSection`
- フォールバックテキスト入力

## 関連要素

- [テキスト (text)](./text.md) — 複数値や固定文字列と混在させる場合
- [繰り返しバンド (repeatingBand)](../repeating/repeatingBand.md) — 配列データの表組表示
