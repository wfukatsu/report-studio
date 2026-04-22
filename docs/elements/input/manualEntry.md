# 記入欄 (manualEntry)

手書き・印刷後記入を想定した「空欄 + ラベル + 下線／マス」のスタイル付き記入枠。プレースホルダ値とフリガナゾーンをサポート。

- **ElementType**: `manualEntry`
- **パレット**: 記入欄 → `記入欄`
- **ファクトリ**: `createManualEntryField()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/manualEntry/Renderer.tsx`

## 型定義

```ts
export type ManualEntryDisplayMode = 'line' | 'box' | 'grid' | 'none'

export interface ManualEntryField extends ElementBase {
  type: 'manualEntry'
  label: string
  labelPosition: 'top' | 'left' | 'none'
  displayMode: ManualEntryDisplayMode
  lineColor: string
  gridCount?: number
  placeholder?: string
  style: TextStyle
  furiganaEnabled?: boolean
  furiganaDataSource?: string
  furiganaRatio?: number
}
```

## プロパティ

| プロパティ | 型 | 必須 | 既定値 | 説明 |
|---|---|---|---|---|
| `label` | string | ○ | `'記入欄'` | ラベル文字。 |
| `labelPosition` | `'top' \| 'left' \| 'none'` | ○ | `'top'` | ラベル配置。 |
| `displayMode` | `'line' \| 'box' \| 'grid' \| 'none'` | ○ | `'line'` | 枠の見た目。 |
| `lineColor` | string | ○ | `'#000000'` | 線色。 |
| `gridCount` | number? | ー | 未設定 | `grid` 時の文字マス数。 |
| `placeholder` | string? | ー | `'（記入）'` | 薄色で表示するガイド。 |
| `style` | `TextStyle` | ○ | `{fontSize:10, color:'#000000'}` | 文字スタイル。 |
| `furiganaEnabled` | boolean? | ー | `false` | 上段にフリガナ行を設ける。 |
| `furiganaDataSource` | string? | ー | 未設定 | フリガナ行のデータキー（プレビュー用）。 |
| `furiganaRatio` | number? | ー | `0.35` | 全高に対するフリガナ行高さの割合。 |

## 表示モード

| `displayMode` | 見た目 |
|---|---|
| `line` | 下部の 1 本線（下線式）。 |
| `box` | 4 辺の枠。 |
| `grid` | `gridCount` で指定した数の縦罫線で文字マス化。 |
| `none` | 線なし（プレースホルダのみ）。 |

## デフォルト値（ファクトリ）

```ts
position: { x: 13, y: 13 }
size:     { width: 60, height: 8 }
label:    '記入欄'
labelPosition: 'top'
displayMode:   'line'
lineColor:     '#000000'
placeholder:   '（記入）'
style: { fontSize: 10, color: '#000000' }
```

## レンダリング挙動

- `labelPosition`:
  - `top`: 上部にラベル、下部に入力枠。
  - `left`: 左側にラベル、右側に入力枠。
  - `none`: 枠のみ。
- `displayMode` ごとに CSS border を描画。`grid` は `repeating-linear-gradient` で縦線を均等配置。
- `furiganaEnabled` が true のとき、入力枠上側に `furiganaRatio` の割合でフリガナ行を確保。`furiganaDataSource` が解決されればその値をプレビュー表示（印刷時は空）。

## 典型的な使用例

### 氏名欄（フリガナ付き）
```ts
createManualEntryField({
  label: 'お名前',
  displayMode: 'line',
  furiganaEnabled: true,
  furiganaDataSource: 'customerFurigana',
  size: { width: 90, height: 12 },
})
```

### 漢字 1 文字ずつのマス目（5 文字）
```ts
createManualEntryField({
  label: '氏',
  displayMode: 'grid',
  gridCount: 5,
  labelPosition: 'left',
  size: { width: 80, height: 10 },
})
```

### 枠のみ（住所記入）
```ts
createManualEntryField({
  label: '住所',
  displayMode: 'box',
  placeholder: '',
  size: { width: 170, height: 18 },
})
```

## PropertiesPanel の項目

- ラベル・ラベル位置
- 表示モード（line / box / grid / none）
- `gridCount`（grid のみ）
- 線色
- プレースホルダ
- `FuriganaSection`（有効化・データソース・比率）
- `TextStyleSection`

## 関連要素

- [テキスト (text)](../text/text.md) — 既存文字を埋めたいとき
- [帳票テーブル (formTable)](../repeating/formTable.md) — 複数の記入欄を表で並べるとき（`input` セル）
