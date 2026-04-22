# バーコード (barcode)

QR コードおよび 1D バーコード（CODE128 / CODE39 / JAN13）を描画する要素。パレット上は QR 用とバーコード用の 2 項目がありますが、いずれも同一の `barcode` 型です。

- **ElementType**: `barcode`
- **パレット**:
  - データ表示 → `QRコード`（`createBarcodeElement()`、`kind: 'qr'`）
  - データ表示 → `バーコード`（`createBarcodeCode128Element()`、`kind: 'code128'`）
- **Renderer**: `src/elements/barcode/Renderer.tsx`（内部で `_blocks/renderers/BarcodeContent.tsx` を使用）

## 型定義

```ts
export type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13'

export interface BarcodeElement extends ElementBase {
  type: 'barcode'
  kind: BarcodeKind
  value: string                                     // {{token}} 展開可
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'           // QR のみ
  darkColor?: string
  lightColor?: string
  showText?: boolean
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `kind` | `BarcodeKind` | ○ | パレットで決定 | バーコード種別。 |
| `value` | string | ○ | パレット依存 | エンコード値。`{{token}}` でデータ埋め込み可能。 |
| `errorCorrection` | `'L'\|'M'\|'Q'\|'H'` | ー | `'M'` | QR 誤り訂正レベル（QR のみ利用）。 |
| `darkColor` | string? | ー | `'#000000'` | 暗パターン色。 |
| `lightColor` | string? | ー | `'#ffffff'` | 明パターン色。 |
| `showText` | boolean? | ー | `'qr' → false` / `'code128' → true` | 下部に値文字列を表示するか。 |

## デフォルト値（ファクトリ）

```ts
// createBarcodeElement (QR)
size:     { width: 30, height: 30 }
kind:     'qr'
value:    'https://example.com'
errorCorrection: 'M'
darkColor: '#000000'
lightColor: '#ffffff'
showText:  false

// createBarcodeCode128Element
size:     { width: 60, height: 15 }
kind:     'code128'
value:    '0000000000'
showText:  true
```

## レンダリング挙動

1. `value` 中の `{{token}}` を `useDataResolver` で置換。
2. `BarcodeContent` ブロックで種別に応じたライブラリを呼び出し：
   - `qr`: QR 生成。`errorCorrection` を指定。
   - `code128` / `code39` / `jan13`: 1D バーコード生成。`showText` が true なら下部にテキスト行。
3. 正方比率が重要な `qr` 以外は自由なアスペクト比で描画可能。

## バリデーション

- `jan13` は 12 or 13 桁の数値文字列を要求。不正値は赤字エラー表示（エディタ上）。
- `code39` は `A-Z`, `0-9`, `-` `.` `$` `/` `+` `%` スペースのみ許可。

## 典型的な使用例

### QR コードにシリアル番号を埋め込み
```ts
createBarcodeElement({
  kind: 'qr',
  value: '{{product.serial}}',
  errorCorrection: 'H',
  size: { width: 25, height: 25 },
})
```

### JAN13 商品コード
```ts
createBarcodeElement({
  kind: 'jan13',
  value: '4901234567894',
  showText: true,
  size: { width: 40, height: 18 },
})
```

## PropertiesPanel の項目

- 種別（qr / code128 / code39 / jan13）
- `value` 入力（`{{token}}` 展開のプレビュー表示）
- `errorCorrection`（QR のみ）
- `darkColor`, `lightColor`
- `showText`

## 関連要素

- [データフィールド (dataField)](../text/dataField.md) — 同一値をテキストで併置したい場合
- [画像 (image)](../shape-image/image.md) — 既成のバーコード画像を使う場合
