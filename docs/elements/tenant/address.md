# 住所 (tenantAddress)

テナント設定の住所を自動表示する要素。郵便番号込みの 1 行表示と、都道府県・番地を改行する複数行表示を切替可能。

- **ElementType**: `tenantAddress`
- **パレット**: テナント情報 → `住所`
- **ファクトリ**: `createTenantAddressElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/tenantAddress/Renderer.tsx`
- **データソース**: `tenantSlice.postalCode`, `.address`, `.address1`, `.address2`
- **整形**: `src/elements/_blocks/formatAddress.ts`

## 型定義

```ts
export type AddressDisplayMode = 'single' | 'multiLine'

export interface TenantAddressElement extends ElementBase {
  type: 'tenantAddress'
  style: TextStyle
  fallback?: string
  displayMode?: AddressDisplayMode
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `style` | `TextStyle` | ○ | `{fontSize:10, color:'#000000', textAlign:'left'}` | テキストスタイル。 |
| `fallback` | string? | ー | 未設定 | 住所未設定時の表示文字列。 |
| `displayMode` | `'single' \| 'multiLine'` | ー | `'single'` | 表示形式。 |

## 表示モード

| `displayMode` | 組み立てルール |
|---|---|
| `single` | `〒{postalCode} {address}`（address 優先） or `{address1} {address2}` を 1 行で。 |
| `multiLine` | 郵便番号 / 都道府県市区町村 / 番地建物名 を改行で分けた複数行。 |

詳細な整形ロジックは `src/elements/_blocks/formatAddress.ts` を参照。

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 80, height: 6 }      // multiLine の場合 15 に初期化
displayMode: 'single'
style: { fontSize: 10, color: '#000000', textAlign: 'left' }
```

`createTenantAddressElement({ displayMode: 'multiLine' })` で呼び出すと、初期高さは 15 mm に拡張されます（改行分を見越した既定値）。

## レンダリング挙動

1. テナント情報から住所フィールドを取得。
2. `displayMode` に応じて整形。
3. 未設定の場合 `fallback` → 空欄の順にフォールバック。
4. `TextContent` で `style` 適用。`multiLine` のとき `lineHeight` の影響を受ける。

## 典型的な使用例

### ヘッダー右上の住所（1 行）
```ts
createTenantAddressElement({
  position: { x: 110, y: 10 },
  size: { width: 90, height: 6 },
  displayMode: 'single',
  style: { fontSize: 9, textAlign: 'right' },
})
```

### 複数行（差出人欄用）
```ts
createTenantAddressElement({
  displayMode: 'multiLine',
  size: { width: 80, height: 20 },
  style: { fontSize: 10, lineHeight: 1.4 },
  fallback: '（住所未設定）',
})
```

## PropertiesPanel の項目

- `displayMode`（single / multiLine）
- `TextStyleSection`
- フォールバックテキスト

## 関連要素

- [会社名 (tenantCompanyName)](./companyName.md)
- [電話番号 (tenantPhone)](./phone.md)
- [データフィールド (dataField)](../text/dataField.md) — 顧客住所など動的データの場合
