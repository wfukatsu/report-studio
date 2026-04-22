# 会社名 (tenantCompanyName)

テナント設定（`TenantInfo.companyName`）を自動表示する要素。ユーザー入力を必要とせず、組織単位で同じ値が全テンプレートに反映されます。

- **ElementType**: `tenantCompanyName`
- **パレット**: テナント情報 → `会社名`
- **ファクトリ**: `createTenantCompanyNameElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/tenantCompanyName/Renderer.tsx`
- **データソース**: `tenantSlice.companyName`

## 型定義

```ts
export interface TenantCompanyNameElement extends ElementBase {
  type: 'tenantCompanyName'
  style: TextStyle
  fallback?: string
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `style` | `TextStyle` | ○ | `{fontSize:14, color:'#000000', textAlign:'left', fontWeight:'bold'}` | テキストスタイル。 |
| `fallback` | string? | ー | 未設定 | テナント情報が未設定のとき表示する文字列。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 60, height: 8 }
style: { fontSize: 14, color: '#000000', textAlign: 'left', fontWeight: 'bold' }
```

## レンダリング挙動

1. `tenantSlice.companyName` から値取得。
2. 未設定（undefined / 空文字）の場合、`fallback` を描画。`fallback` も未設定なら空欄。
3. `TextContent` ブロックで `style` を適用して描画。

## 典型的な使用例

### ヘッダーの会社名
```ts
createTenantCompanyNameElement({
  position: { x: 13, y: 10 },
  size: { width: 120, height: 10 },
  style: { fontSize: 18, fontWeight: 'bold' },
  fallback: '（会社名未設定）',
})
```

## PropertiesPanel の項目

- `TextStyleSection`
- フォールバックテキスト

## 関連要素

- [住所 (tenantAddress)](./address.md)
- [ロゴ (tenantLogo)](./logo.md)
- [カスタムフィールド (tenantCustom)](./custom.md)
