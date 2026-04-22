# カスタムフィールド (tenantCustom)

テナント設定のカスタムキー／値マップ（`TenantInfo.custom`）から任意のキーを取り出して表示する要素。標準項目（会社名・住所・電話番号・代表者名・ロゴ）に含まれない情報を埋め込むときに使います。

- **ElementType**: `tenantCustom`
- **パレット**: テナント情報 → `カスタムフィールド`
- **ファクトリ**: `createTenantCustomElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/tenantCustom/Renderer.tsx`
- **データソース**: `tenantSlice.custom[fieldKey]`

## 型定義

```ts
export interface TenantCustomElement extends ElementBase {
  type: 'tenantCustom'
  fieldKey: string               // custom マップ上のキー
  style: TextStyle
  fallback?: string
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `fieldKey` | string | ○ | `''` | `TenantInfo.custom` のキー（例: `invoiceRegistrationNumber`）。 |
| `style` | `TextStyle` | ○ | `{fontSize:10, color:'#000000', textAlign:'left'}` | テキストスタイル。 |
| `fallback` | string? | ー | 未設定 | 値が見つからない場合の表示。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 50, height: 6 }
fieldKey: ''
style: { fontSize: 10, color: '#000000', textAlign: 'left' }
```

## レンダリング挙動

1. `tenantSlice.custom?.[fieldKey]` を取得。
2. 値がなければ `fallback`、それも無ければ空欄。
3. `TextContent` で描画。

## 典型的な使用例

### インボイス登録番号
```ts
createTenantCustomElement({
  fieldKey: 'invoiceRegistrationNumber',
  style: { fontSize: 10 },
  fallback: 'T0000000000000',
})
```

### 事業者番号（太字強調）
```ts
createTenantCustomElement({
  fieldKey: 'businessRegistrationNumber',
  style: { fontSize: 11, fontWeight: 'bold' },
})
```

## PropertiesPanel の項目

- `fieldKey`（登録済みカスタムキーのドロップダウン + 自由入力）
- `TextStyleSection`
- フォールバックテキスト

> ✏️ カスタムキーそのものの登録・編集はテナント設定画面で行います。

## 関連要素

- [会社名 (tenantCompanyName)](./companyName.md) 等の標準テナント要素
- [テキスト (text)](../text/text.md) — 固定ラベル（例: 「登録番号:」）を添えたい場合
