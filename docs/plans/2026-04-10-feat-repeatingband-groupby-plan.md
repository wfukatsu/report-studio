---
title: "feat: RepeatingBand groupBy グルーピング機能"
type: feat
status: completed
date: 2026-04-10
origin: docs/brainstorms/2026-04-10-repeatingband-groupby-brainstorm.md
---

# feat: RepeatingBand groupBy グルーピング機能

## Overview

RepeatingBandElement の `groupBy` フィールド（型定義に既存、レンダラー未実装）を実装し、
データ行を指定フィールドでグルーピング表示できるようにする。
Scalar見積書テンプレートの「システム別小計」要件を実現する中核機能。

## Problem Statement / Motivation

Scalar見積書テンプレートでは `groupBy: 'system_name'` が設定されているが、
RepeatingBandRendererにgroupBy処理ロジックが存在しないため、全明細がフラットに表示される。
仕様では「対象システムごとの小計」が求められており、グルーピング機能が必要。
(see brainstorm: docs/brainstorms/2026-04-10-repeatingband-groupby-brainstorm.md)

## Proposed Solution

既存の `RepeatingBandLiveRenderer` のパイプラインに groupBy 処理を挿入する（Approach A）。

**レンダリングパイプライン（変更後）:**
```
records → maxItems制限(※) → グルーピング → グループ内ソート → レンダリング
```

※ `maxItems` は groupBy 有効時「総表示行数」（データ行 + ヘッダー行 + 小計行の合計）を意味する。

## Technical Approach

### Phase 1: 型定義の拡張

**ファイル:** `src/types/index.ts`

RepeatingBandElement に以下のフィールドを追加:

```ts
// 既存: groupBy?: string (line 436) — 変更不要

/** グループ小計行を表示するか (default: false) */
showGroupSubtotals?: boolean

/** グループ小計行のスタイル (default: 薄い背景色 + 太字) */
groupStyle?: TextStyle
```

- `showGroupSubtotals` は `showFooter` とは独立。showFooter = 総合計行、showGroupSubtotals = グループ末尾小計行
- `groupStyle` のデフォルト: `{ backgroundColor: '#e8ecef', fontWeight: 'bold' }`

### Phase 2: グルーピングユーティリティ関数

**新規ファイル:** `src/lib/grouping.ts`

```ts
interface GroupedData {
  groupKey: string
  groupValue: string
  records: Record<string, unknown>[]
}

/**
 * レコードをgroupByフィールドでグルーピングする。
 * グループの順序はデータ出現順を維持する。
 */
export function groupRecords(
  records: Record<string, unknown>[],
  groupByField: string,
): GroupedData[]

/**
 * groupBy有効時のmaxItems制限を適用する。
 * maxItems = 総表示行数（データ行 + ヘッダー行 + 小計行）。
 * グループを先頭から処理し、行数が上限に達したら残りを切り捨てる。
 */
export function applyGroupedMaxItems(
  groups: GroupedData[],
  maxItems: number,
  hasGroupSubtotals: boolean,
): GroupedData[]
```

### Phase 3: Renderer の拡張

**ファイル:** `src/elements/repeatingBand/Renderer.tsx`

#### RepeatingBandLiveRenderer の変更

1. **グルーピング分岐** (sort後):
   - `groupBy` 未設定 → 従来のフラットレンダリング（変更なし）
   - `groupBy` 設定 → `groupRecords()` でグルーピング → グループ内で `sortBy`/`sortOrder` 適用

2. **グループヘッダー行レンダリング:**
   - 全列を結合（1つの div で全幅）
   - テキスト: `■ {グループフィールドの値}`
   - スタイル: 既存 `headerStyle` を適用（背景色を `oddRowColor` より少し濃く）
   - 高さ: `itemHeight` と同じ

3. **データ行レンダリング:**
   - グループ内で奇偶行交互色をリセット
   - `groupBy` フィールドが `fields` 配列に含まれる場合、そのセルは空白にする（自動非表示）

4. **グループ小計行レンダリング** (`showGroupSubtotals` が true の場合):
   - 先頭列: 「小計」ラベル
   - 各列: `totals` 定義に対応するフィールドがあれば `aggregateField(groupRecords, fieldKey, formula)` の結果を表示
   - 対象外の列: 空白
   - スタイル: `groupStyle` を適用（デフォルト: 薄い背景 + 太字）
   - 高さ: `itemHeight` と同じ

5. **空行罫線:**
   - 全グループ処理後に計算
   - 消費行数 = Σ(1ヘッダー + データ行数 + (showGroupSubtotals ? 1小計 : 0)) per group
   - 空行数 = max(0, maxItems - 消費行数)

#### RepeatingBandDesignPreview の変更

- `groupBy` が設定されているとき、プレビューにグループ構造を表示:
  - グループヘッダー行のモック（背景色付き帯）
  - 2行のデータ行モック
  - 小計行のモック（showGroupSubtotals時）

### Phase 4: PropertiesPanel の拡張

**ファイル:** `src/elements/repeatingBand/PropertiesPanel.tsx`

「ソート・グループ」セクション（line 65）に追加:

- `groupBy`: テキスト入力（フィールドキーを指定）
- `showGroupSubtotals`: チェックボックス（groupBy設定時のみ表示）

`groupStyle` のカスタマイズUIは初期実装ではスコープ外（デフォルト値のみ使用）。

### Phase 5: テンプレート更新

**ファイル:** `src/templates/scalarQuotationTemplate.ts`

- `showGroupSubtotals: true` を追加
- `totals` に `line_subtotal` の `sum` を追加（グループ小計用）
- `maxItems` を調整（3ヘッダー + 5データ + 3小計 = 11行 → 12で空行1行、適切）

### Phase 6: ファクトリ関数更新

**ファイル:** `src/lib/elementFactories.ts`

`createRepeatingBandElement` のデフォルト値に追加:
- `showGroupSubtotals: false`
- `groupStyle: undefined`

## Edge Cases

| ケース | 動作 |
|--------|------|
| groupByフィールドの値がnull/undefined/空文字 | グループ名「(未分類)」で1つのグループにまとめる |
| グループが1件のデータのみ | ヘッダー + 1データ行 + 小計行を正常表示 |
| records が空配列 | groupBy無関係にフラット表示と同じ（空行罫線のみ） |
| maxItems が 0（無制限） | 全グループ・全行を表示、空行罫線なし |
| groupByフィールドがfieldsに含まれない | ヘッダーにグループ名表示、fieldsにないのでデータ行への影響なし |
| sortBy = groupByと同じフィールド | グループ内ソートは全レコード同じ値なので実質no-op |

## Acceptance Criteria

- [x] `groupBy` 未設定時、既存の動作に変更がないこと（後方互換）
- [x] `groupBy` 設定時、データがグループ化され、グループヘッダー行が表示されること
- [x] `showGroupSubtotals: true` 時、各グループ末尾に小計行が表示されること
- [x] 小計行の集計値が `totals` 定義に従って正しく計算されること
- [x] `maxItems` が総表示行数（データ行 + ヘッダー行 + 小計行）として機能すること
- [x] `showEmptyRowLines: true` 時、全グループ後に残り行数分の空行罫線が表示されること
- [x] グループの表示順がデータ配列の出現順を維持すること
- [x] グループ内のソート（sortBy/sortOrder）が正常に動作すること
- [x] `groupBy` フィールドが `fields` に含まれる場合、データ行でそのセルが空白になること
- [x] PropertiesPanel で `groupBy` と `showGroupSubtotals` を設定できること
- [x] デザインプレビューで groupBy 設定時にグループ構造が表示されること
- [x] Scalar見積書テンプレートでシステム別グルーピングが正しく表示されること
- [x] 既存テスト（Renderer.test.tsx の3グループ9テスト）が全てパスすること

## Testing Requirements

### 新規テスト（src/elements/repeatingBand/Renderer.test.tsx）

```
describe('groupBy rendering')
  - グループヘッダー行が表示されること
  - データ行がグループ内に正しく配置されること
  - groupByフィールドのデータセルが空白になること
  - 奇偶行色がグループごとにリセットされること

describe('showGroupSubtotals')
  - 小計行が各グループ末尾に表示されること
  - aggregateField による集計値が正しいこと
  - showGroupSubtotals=false で小計行が非表示になること

describe('maxItems with groupBy')
  - 総表示行数がmaxItemsを超えないこと
  - 行数超過時にグループが切り捨てられること

describe('showEmptyRowLines with groupBy')
  - 空行数 = maxItems - (データ行 + ヘッダー行 + 小計行)
  - 空行が全グループ後に表示されること

describe('edge cases')
  - 空配列でのgroupBy
  - null/undefinedのgroupByフィールド値
  - groupByフィールドがfieldsに含まれないケース
```

### ユーティリティテスト（src/lib/grouping.test.ts）

```
describe('groupRecords')
  - データ出現順でグルーピングされること
  - 空配列で空配列が返ること
  - null値レコードが「(未分類)」グループに入ること

describe('applyGroupedMaxItems')
  - maxItems制限が正しく適用されること
  - グループが途中で切り捨てられること
  - maxItems=0で全グループ返却されること
```

## Dependencies & Risks

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| 既存テストの破壊 | 高 | groupBy未設定時のコードパスを完全に分離 |
| maxItems解釈変更の影響 | 中 | groupBy有効時のみ「総表示行数」解釈を適用 |
| パフォーマンス（大量レコード） | 低 | groupRecords は O(n)、aggregateField は既存の reduce ベース |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-10-repeatingband-groupby-brainstorm.md](docs/brainstorms/2026-04-10-repeatingband-groupby-brainstorm.md)
  - Key decisions: 既存レンダラー拡張、totals再利用、グループ出現順維持

### Internal References

- RepeatingBandElement type: `src/types/index.ts:405-443`
- Renderer: `src/elements/repeatingBand/Renderer.tsx` (193 lines)
- Renderer tests: `src/elements/repeatingBand/Renderer.test.tsx` (89 lines)
- PropertiesPanel: `src/elements/repeatingBand/PropertiesPanel.tsx:65-72`
- aggregateField: `src/lib/aggregation.ts` (41 lines)
- Element factory: `src/lib/elementFactories.ts:255-284`
- Scalar template: `src/templates/scalarQuotationTemplate.ts:300-321`
- aggregation Stack Overflow fix: `docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md`
