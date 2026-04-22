# 代表者名 (tenantRepresentative)

テナント設定の代表者名を自動表示する要素。

- **ElementType**: `tenantRepresentative`
- **パレット**: テナント情報 → `代表者名`
- **ファクトリ**: `createTenantRepresentativeElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/tenantRepresentative/Renderer.tsx`
- **データソース**: `tenantSlice.representativeName`

## 型定義

```ts
export interface TenantRepresentativeElement extends ElementBase {
  type: 'tenantRepresentative'
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

1. `tenantSlice.representativeName` を取得。
2. 未設定なら `fallback`、それも未設定なら空欄。
3. `TextContent` で描画。

## 典型的な使用例

### 契約書署名欄
```ts
createTenantRepresentativeElement({
  position: { x: 120, y: 240 },
  size: { width: 80, height: 10 },
  style: { fontSize: 12, fontWeight: 'bold', textAlign: 'right' },
  fallback: '（代表者未登録）',
})
```

### 役職と併記するパターン
代表者名の前に「代表取締役」などの役職を入れたい場合は、隣接する [テキスト (text)](../text/text.md) 要素と併置してください。

## PropertiesPanel の項目

- `TextStyleSection`
- フォールバックテキスト

## 関連要素

- [会社名 (tenantCompanyName)](./companyName.md)
- [印鑑 (hanko)](../japanese/hanko.md) — 代表者印とセットで配置
