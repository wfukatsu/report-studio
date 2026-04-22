# 帳票テーブル (formTable)

行・列を明示的に定義し、固定レイアウト表と動的バインド表の両方に対応する帳票専用テーブル。Excel 風の直接編集モードを備えます。

- **ElementType**: `formTable`
- **パレット**: 繰り返し要素 → `帳票テーブル`
- **ファクトリ**: `createFormTableElement()` (`src/lib/elementFactories.ts`)
- **Renderer**: `src/elements/formTable/Renderer.tsx`
- **Editor**: `src/elements/formTable/TableEditor.tsx`
- **共通ロジック**: `src/elements/formTable/tableOperations.ts`（PropertiesPanel と Editor で共用）

## 型定義

```ts
export interface FormTableElement extends ElementBase {
  type: 'formTable'
  columns: FormTableColumn[]
  rows: FormTableRow[]
  dataSource?: string
  maxItems?: number
  borderColor: string
  borderWidth: number
  headerStyle?: TextStyle
  bodyStyle?: TextStyle
  oddRowColor?: string
  evenRowColor?: string
}

export interface FormTableColumn {
  id: string                        // UUID
  width: number                     // mm (最小 3)
  align?: 'left' | 'center' | 'right'
  style?: TextStyle                 // cell.style より低優先
}

export interface FormTableRow {
  id: string                        // UUID
  role: 'header' | 'body' | 'footer'
  height: number                    // mm
  cells: FormTableCell[]            // length は columns.length と一致
}

export type FormTableCellType =
  'label' | 'input' | 'dataField' | 'checkbox' | 'eraSelect'

export interface FormTableCell {
  id: string
  type: FormTableCellType
  // 共通系
  text?: string; placeholder?: string
  // dataField 系
  fieldKey?: string
  format?: CalculationFormat
  fallbackText?: string
  // スタイル（cell > column > row-role の優先）
  style?: TextStyle
  // checkbox 系
  checked?: boolean
  checkmark?: CheckmarkStyle
  checkboxDataSource?: string
  // eraSelect 系
  eraDataSource?: string
  eraLayout?: EraSelectLayout
  // フリガナ（input セル用）
  furiganaEnabled?: boolean
  furiganaDataSource?: string
  // セル結合
  colspan?: number
  rowspan?: number
  mergedInto?: string               // 結合先セル ID
}
```

## 主要プロパティ

| プロパティ | 型 | 説明 |
|---|---|---|
| `columns` | `FormTableColumn[]` | 列定義。幅は mm 絶対値（最小 3）。 |
| `rows` | `FormTableRow[]` | 行定義。`role` で header / body / footer を区別。 |
| `dataSource` | string? | 配列キー。設定時は `role === 'body'` の行をこの配列長で展開。 |
| `maxItems` | number? | 0 または未設定で無制限。`repeatingBand` と同等。 |
| `borderColor`, `borderWidth` | string, mm | 外枠。 |
| `headerStyle`, `bodyStyle` | TextStyle? | 行 role 毎の基本スタイル。 |
| `oddRowColor`, `evenRowColor` | string? | body 行ゼブラ（cell / column スタイルが優先）。 |

### セルタイプ

| type | 動作 |
|---|---|
| `label` | `text` を固定テキストとして描画（header 行に多い）。 |
| `input` | `placeholder` を薄色表示。空欄の記入欄として使える。`furiganaEnabled` でフリガナ行付加。 |
| `dataField` | `fieldKey` を `useDataResolver` で解決 / `format` で整形 / 未解決は `fallbackText`。 |
| `checkbox` | `checked` or `checkboxDataSource` で ON/OFF。`checkmark` はシンボル。 |
| `eraSelect` | 元号選択。`eraDataSource` で選択値を決定、`eraLayout` で並び。 |

### スタイル解決の優先順位

1. `cell.style`
2. `column.style`
3. `row.role` 毎の `headerStyle` / `bodyStyle`

### セル結合

`colspan` / `rowspan` は CSS Grid span に変換されます。結合で隠れる側の `mergedInto` は結合先セル ID を参照。

## デフォルト値（ファクトリ）

3 列 × 2 行（ヘッダー + 本体）のプリセット：

```ts
columns: [
  { width: 40, align: 'left' } × 3
]
rows: [
  { role: 'header', height: 8, cells: [label × 3 ("項目 1"〜"項目 3")] },
  { role: 'body',   height: 8, cells: [input × 3] },
]
borderColor: '#000000', borderWidth: 0.3
size: { width: 120, height: 24 }
```

## レンダリング挙動

- Renderer は CSS Grid (`grid-template-columns: columns[].width`, `grid-template-rows: rows[].height`)。
- `dataSource` がセットされているとき：
  - `useDataResolver(dataSource)` の配列を取得。
  - `role === 'body'` の行テンプレートを「配列長」だけ展開。
  - `dataField` セルの `fieldKey` はそのレコードのフィールドを参照（例: `fieldKey: 'name'` は `items[i].name`）。
  - `maxItems` で切り詰め。
- 固定レイアウト時（`dataSource` 未設定）は定義した行がそのまま描画される。

## Excel 風インタラクティブ編集

キャンバス上で以下を直接操作できます（`TableEditor`）:

| 操作 | キー／ジェスチャ |
|---|---|
| 編集モード進入 | 要素ダブルクリック |
| 編集モード解除 | `Esc` / 外クリック |
| セル選択 | クリック |
| 範囲選択 | `Shift + クリック` / `Shift + 矢印` |
| セル移動 | 矢印 / `Tab` / `Shift+Tab` |
| インライン編集 | セルダブルクリック / `Enter`（ポップオーバー起動） |
| 行列挿入・削除・移動 | 右クリックメニュー |
| 列幅／行高さ調整 | 境界ドラッグ（最小 3 mm） |
| コピー／ペースト／切り取り | `Ctrl+C` / `Ctrl+V` / `Ctrl+X`（Excel TSV 互換） |
| Undo | 編集モード専用スタック（モード離脱時に store-level で 1 エントリに統合） |

## 典型的な使用例

### 固定レイアウト（申請書の記入枠）
```ts
createFormTableElement({
  columns: [
    { width: 30, align: 'left' },
    { width: 90, align: 'left' },
  ],
  rows: [
    { role: 'body', height: 10, cells: [
      { type: 'label', text: '氏名' },
      { type: 'input', placeholder: '', furiganaEnabled: true, furiganaDataSource: 'customerFurigana' },
    ]},
    { role: 'body', height: 10, cells: [
      { type: 'label', text: '電話番号' },
      { type: 'dataField', fieldKey: 'customer.phone' },
    ]},
  ],
})
```

### 動的バインド（明細）
```ts
createFormTableElement({
  dataSource: 'items',
  columns: [
    { width: 15, align: 'center' },
    { width: 90, align: 'left' },
    { width: 30, align: 'right' },
  ],
  rows: [
    { role: 'header', height: 8, cells: [
      { type: 'label', text: 'No.' },
      { type: 'label', text: '品名' },
      { type: 'label', text: '金額' },
    ]},
    { role: 'body', height: 8, cells: [
      { type: 'dataField', fieldKey: 'no' },
      { type: 'dataField', fieldKey: 'name' },
      { type: 'dataField', fieldKey: 'amount', format: { type: 'currency_jpy' } },
    ]},
  ],
})
```

## PropertiesPanel の項目

- 行列構造エディタ（行追加・削除、列追加・削除、選択セルタイプ変更）
- 各セルの詳細（type ごとの項目：text / placeholder / fieldKey / checkbox / eraSelect 等）
- 列の `width` / `align`
- 行の `role` / `height`
- `borderColor` / `borderWidth` / ゼブラカラー
- `headerStyle`, `bodyStyle`

## 関連要素

- [繰り返しバンド (repeatingBand)](./repeatingBand.md) — 列幅に合わせた標準明細表向け
- [記入欄 (manualEntry)](../input/manualEntry.md) — 単一の記入欄を置く場合
