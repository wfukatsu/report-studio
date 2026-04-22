# 画像 (image)

任意の画像を埋め込む要素。`src` には URL もしくは Base64 data-URI を受け付けます。

- **ElementType**: `image`
- **パレット**: 図形・画像 → `画像`
- **ファクトリ**: `createImageElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/image/Renderer.tsx`

## 型定義

```ts
export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  alt: string
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  opacity?: number
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `src` | string | ○ | `''` | 画像 URL もしくは `data:image/...` 形式の Base64。 |
| `alt` | string | ○ | `''` | スクリーンリーダー・PDF アクセシビリティ用代替テキスト。 |
| `objectFit` | `'contain' \| 'cover' \| 'fill' \| 'none'` | ○ | `'contain'` | CSS `object-fit` に対応。 |
| `opacity` | number? | ー | `1` | 0〜1 の透明度。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 40, height: 26 }
src:      ''
alt:      ''
objectFit: 'contain'
opacity:   1
```

## レンダリング挙動

- `src` が空なら灰色のプレースホルダを表示。
- 通常は `<img>` で描画し、`object-fit` を CSS で適用。
- PDF エクスポート時も `html2canvas` 経由でラスタライズされるため、data-URI が安全。

## セキュリティと保存形式

- ユーザーがローカル画像をドラッグアップロードすると data-URI に変換されてテンプレートに埋め込まれます。大きな画像はファイルサイズ肥大の原因となるため、事前に縮小することを推奨。
- 外部 URL を使う場合、PDF 生成サーバから到達できる必要があります。

## 典型的な使用例

### ロゴ画像（テナント共通ロゴを使いたい場合は `tenantLogo` を推奨）
```ts
createImageElement({
  src: 'data:image/png;base64,...',
  alt: '会社ロゴ',
  position: { x: 13, y: 10 },
  size: { width: 40, height: 15 },
})
```

### 署名画像（透過・フィット）
```ts
createImageElement({
  src: '/assets/signature.png',
  objectFit: 'contain',
  opacity: 0.9,
})
```

## PropertiesPanel の項目

- 画像選択（アップロード or URL）
- Alt テキスト
- `objectFit`（contain / cover / fill / none）
- 透明度スライダ

## 関連要素

- [ロゴ (tenantLogo)](../tenant/logo.md) — テナント設定から画像を自動解決する場合
- [図形 (shape)](./shape.md)
