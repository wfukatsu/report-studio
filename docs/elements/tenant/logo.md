# ロゴ (tenantLogo)

テナント設定のロゴ画像（`TenantInfo.logoBase64`）を自動表示する要素。汎用 `image` 要素と異なり、`src` を手動で指定する必要はありません。

- **ElementType**: `tenantLogo`
- **パレット**: テナント情報 → `ロゴ`
- **ファクトリ**: `createTenantLogoElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/tenantLogo/Renderer.tsx`
- **データソース**: `tenantSlice.logoBase64`

## 型定義

```ts
export interface TenantLogoElement extends ElementBase {
  type: 'tenantLogo'
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  opacity?: number
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `objectFit` | `'contain' \| 'cover' \| 'fill' \| 'none'` | ○ | `'contain'` | CSS `object-fit`。 |
| `opacity` | number? | ー | `1` | 0〜1。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 30, height: 20 }
objectFit: 'contain'
opacity:   1
```

## レンダリング挙動

1. `tenantSlice.logoBase64` を取得。
2. 未設定なら灰色プレースホルダを表示（印刷対象からは除外）。
3. 値があれば `<img src={logoBase64}>` として描画し、`object-fit: contain` 等を CSS で適用。

## 典型的な使用例

### ヘッダー左のロゴ
```ts
createTenantLogoElement({
  position: { x: 13, y: 10 },
  size: { width: 40, height: 15 },
  objectFit: 'contain',
})
```

### 透かしウォーターマーク（薄く大きく）
```ts
createTenantLogoElement({
  position: { x: 50, y: 100 },
  size: { width: 100, height: 80 },
  objectFit: 'contain',
  opacity: 0.08,
})
```

## PropertiesPanel の項目

- `objectFit`（contain / cover / fill / none）
- 透明度

ロゴ画像自体の差し替えはテナント設定画面から行います（各テンプレートでは編集不可）。

## 関連要素

- [画像 (image)](../shape-image/image.md) — 任意の画像を個別に埋めたい場合
- [会社名 (tenantCompanyName)](./companyName.md)
