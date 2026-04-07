---
date: 2026-04-08
topic: form-table-element
---

# FormTableElement — 帳票専用テーブル要素型

## What We're Building

帳票デザインスタジオに `FormTableElement` という新しい要素型を追加する。

この要素型は次の **2つのモード** を統一的に扱う:

1. **固定レイアウトモード**: 扶養控除等申告書のような行・列が確定した公的帳票向け。各セルに `label` / `input` / `dataField` を配置し、ビジュアルエディタで構造を定義する。
2. **データバインドモード**: `dataSource` に配列を指定し、body 行をデータ件数分自動展開する。RepeatingBandElement の上位互換として機能する。

ユーザーはプロパティパネルで列幅（mm 数値入力）を調整し、各セルの種別とコンテンツを設定する。

## Why This Approach

**Approach A（専用要素型）を選んだ理由:**

- 既存の `TableElement`（静的データ表示のみ）や `RepeatingBandElement`（単純行繰り返し）では、セルごとに異なる入力種別を持つ帳票を表現できない。
- `ManualEntry` の積み上げ方式（現在の扶養控除等申告書テンプレート）では 300+ 要素になり、位置ずれ・メンテ困難・パフォーマンス劣化が発生する。
- 専用型にすることで型安全性を保ちながら、将来の colspan 対応や印刷最適化を追加しやすくなる。

## Key Decisions

- **セル定義**: `FormTableCell[][]`（2D 配列）。Phase 1 は rowspan/colspan なし、グリッドのみ。
- **セル種別**: `'label' | 'input' | 'dataField'`の3種。それぞれ `text`、`placeholder`、`fieldKey` を持つ。
- **行定義**: `FormTableRow[]`。`role: 'header' | 'body' | 'footer'` を持ち、body 行のみデータバインドで繰り返し展開される。
- **列定義**: `FormTableColumn[]`。`width: number`（mm）、`align`、`style` を持つ。
- **入力モード**: セルが `input` の場合、デザイン時は空の ManualEntry 風プレースホルダーを表示。実際の入力は SubmitResponseModal でも、キャンバス上の inline 編集でも両方対応できる設計にする。
- **スタイル**: `headerStyle`、`bodyStyle`、`borderColor`、`borderWidth`、`oddRowColor`、`evenRowColor`（RepeatingBandElement から流用）。
- **UI エディタ**: プロパティパネルに専用タブ（「テーブル構造」）を追加。列追加/削除、行追加/削除、セル種別変更ができる。

## Type Shape (参考スケッチ — 確定は `/workflows:plan` で行う)

> ⚠️ これは WHAT を伝えるための概念スケッチです。フィールド名・型は計画フェーズで変更される可能性があります。

```typescript
export type FormTableCellType = 'label' | 'input' | 'dataField'

export interface FormTableCell {
  id: string
  type: FormTableCellType
  // label / input
  text?: string
  placeholder?: string
  // dataField
  fieldKey?: string
  format?: CalculationFormat
  // style override per cell
  style?: TextStyle
  // future: colspan/rowspan
}

export type FormTableRowRole = 'header' | 'body' | 'footer'

export interface FormTableRow {
  id: string
  role: FormTableRowRole
  height: number   // mm
  cells: FormTableCell[]
}

export interface FormTableColumn {
  id: string
  width: number    // mm
  align?: 'left' | 'center' | 'right'
  style?: TextStyle
}

export interface FormTableElement extends ElementBase {
  type: 'formTable'
  columns: FormTableColumn[]
  rows: FormTableRow[]
  /** データバインドモード: body 行をこの配列で展開 */
  dataSource?: string
  /** 最大展開件数 (0=無制限) */
  maxItems?: number
  /** スタイル */
  borderColor: string
  borderWidth: number
  headerStyle?: TextStyle
  bodyStyle?: TextStyle
  oddRowColor?: string
  evenRowColor?: string
}
```

## Resolved Questions

- **モード**: 固定レイアウト・データバインド両方対応 ✅
- **UI**: ビジュアルエディタ（プロパティパネル）のみ ✅
- **セル複雑度**: Phase 1 はシンプルグリッド（colspan なし）✅
- **入力モデル**: 読み取り専用表示 + インライン編集の両方を設計上サポート ✅
- **アプローチ**: A（専用要素型）✅

## Scope (Phase 1)

**含む:**
- `FormTableElement` 型定義（`src/types/index.ts`）
- `createFormTableElement` ファクトリ（`src/lib/elementFactories.ts`）
- `FormTableRenderer` コンポーネント（`src/elements/formTable/Renderer.tsx`）
- `ElementRenderer` への switch 追加
- `ElementPalette` への追加
- プロパティパネル: テーブル構造タブ（列追加/削除・行追加/削除・セル種別変更）
- デザインプレビュー + データバインドライブレンダリング

**含まない（Phase 2 以降）:**
- colspan / rowspan
- ドラッグによる列幅リサイズ
- ページをまたぐ繰り返しバンド
- セル内ネストテーブル

## Next Steps

→ `/workflows:plan` で実装計画を作成
