# 電話番号 (tenantPhone)

テナント設定の電話番号を自動表示する要素。

- **ElementType**: `tenantPhone`
- **パレット**: テナント情報 → `電話番号`
- **ファクトリ**: `createTenantPhoneElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/tenantPhone/Renderer.tsx`
- **データソース**: `tenantSlice.phone`

## 型定義

```ts
export interface TenantPhoneElement extends ElementBase {
  type: 'tenantPhone'
  style: TextStyle
  fallback?: string
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `style` | `TextStyle` | ○ | `{fontSize:10, color:'#000000', textAlign:'left'}` | テキストスタイル。 |
| `fallback` | string? | ー | 未設定 | 未設定時の表示文字列。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 50, height: 6 }
style: { fontSize: 10, color: '#000000', textAlign: 'left' }
```

## レンダリング挙動

1. `tenantSlice.phone` を取得。
2. 値がなければ `fallback` を利用（無ければ空欄）。
3. `TextContent` で描画。整形（例: ハイフン挿入）は行わない — 設定された値をそのまま描画。

## 典型的な使用例

### ヘッダー右
```ts
createTenantPhoneElement({
  position: { x: 120, y: 20 },
  size: { width: 80, height: 6 },
  style: { fontSize: 10, textAlign: 'right' },
})
```

### 強調表示
```ts
createTenantPhoneElement({
  style: { fontSize: 13, fontWeight: 'bold' },
  fallback: '（電話番号未登録）',
})
```

## PropertiesPanel の項目

- `TextStyleSection`
- フォールバックテキスト

## 関連要素

- [会社名 (tenantCompanyName)](./companyName.md)
- [住所 (tenantAddress)](./address.md)
