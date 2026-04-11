---
title: feat: プレビュー・PDF出力でデータ空要素を自動非表示
type: feat
status: completed
date: 2026-04-11
origin: docs/brainstorms/2026-04-11-preview-hide-empty-data-elements-brainstorm.md
---

# feat: プレビュー・PDF出力でデータ空要素を自動非表示

## Overview

プレビューモードおよび PDF/PNG 出力時に、データバインディングが設定されているにもかかわらず
実際のデータが空（未解決・null・空文字列・0 件配列）な要素を自動的に非表示にする。

`readonly = true` のときのみ適用し、エディタ上での既存の表示動作は変更しない
（see brainstorm: `docs/brainstorms/2026-04-11-preview-hide-empty-data-elements-brainstorm.md`）。

## Problem Statement / Motivation

現在のプレビュー・PDF 出力では以下が起きる:

| 要素タイプ | データなし時の現在の表示 | 望ましい挙動 |
|---|---|---|
| `dataField` | フィールドキー名をグレーイタリック表示 | 非表示 |
| `text` (`{{}}` あり、データなし) | `''` (空文字列) が表示領域を占有 | 非表示 |
| `repeatingBand` (0 件) | ヘッダー行と空領域が表示される | 全体を非表示 |
| `chart` (0 件配列) | サンプルデータにフォールバック表示 | 非表示 |

これにより、「データ埋め込み型帳票」として使う際に、未入力フィールドの痕跡が
PDF に残ってしまう問題がある。

## Proposed Solution

(see brainstorm §Chosen Approach: A)

`ElementRenderer.tsx` の既存 visibility チェックに、**readonly 時限定の空データ検出**を追加する。
コアロジックは新規ファイル `src/lib/previewUtils.ts` の `isDataEmptyInPreview()` に分離する。

```tsx
// ElementRenderer.tsx に追加
if (readonly && isDataEmptyInPreview(element, mergedData)) return null
```

### 技術的詳細

#### `isDataEmptyInPreview` 関数仕様

**配置**: `src/lib/previewUtils.ts`（新規）

```typescript
import type { ReportElement } from '@/types'
import { resolveField } from './dataBinding'
import { interpolate } from './dataBinding'

const HAS_TEMPLATE = /\{\{[^}]+\}\}/

/**
 * Returns true when an element has data binding configured but the data
 * resolved to empty — used in readonly (preview/export) mode to suppress
 * placeholder display.
 *
 * Static elements (no binding) always return false.
 * Only applies to: dataField, text (with {{}}), repeatingBand, chart.
 */
export function isDataEmptyInPreview(
  element: ReportElement,
  data: Record<string, unknown>,
): boolean {
  switch (element.type) {
    case 'dataField':
      // resolveField() は missing / null / undefined → '' を返す（セキュリティガード込み）
      return resolveField(data, element.fieldKey) === ''

    case 'text': {
      // {{...}} を持たない静的テキストは対象外
      if (!HAS_TEMPLATE.test(element.content)) return false
      const resolved = interpolate(element.content, data)
      // resolved === '' : 全フィールドが未解決で空文字列化された場合
      // HAS_TEMPLATE.test(resolved) : $page 等のシステム変数が pageContext なしで残存した場合
      return resolved === '' || HAS_TEMPLATE.test(resolved)
    }

    case 'repeatingBand': {
      if (!element.dataSource) return false
      const items = data[element.dataSource]
      return !Array.isArray(items) || items.length === 0
    }

    case 'chart': {
      if (!element.dataBinding) return false
      const items = data[element.dataBinding]
      return !Array.isArray(items) || items.length === 0
    }

    default:
      return false
  }
}
```

#### `interpolate()` の動作に関する重要な注意

`interpolate()` は `{{missing_key}}` を `''`（空文字列）に**置換する**（残存させない）:

```
"{{customer_name}}" → resolveField → ''    → result: ''            → 非表示 ✓
"注文者: {{name}}"  → resolveField → ''    → result: '注文者: '     → 表示 ✓（静的テキストあり）
"{{$page}}"         → システム変数, pageContext なし → '{{$page}}' → 非表示 ✓（残存パターン）
```

ブレインストームの「`{{...}}` が残存する」ケースは、`$page` 等のシステム変数で
`pageContext` が渡されない場合にのみ発生する
（`TextRenderer` は `interpolate(el.content, data)` を pageContext なしで呼ぶため）。

#### `label` 要素について

`LabelElement` は `el.text` に静的テキストを持ち、`{{}}` テンプレート展開をサポートしない
（`LabelRenderer` は `TextContent` に `el.text` を直接渡す）。  
`migrateLabelToText()` により store 上の `label` 要素は `text` に変換されるが、
安全のため `isDataEmptyInPreview` の `default:` ケースで `false` を返しスキップする。

#### ElementRenderer への統合（行レベル）

```tsx
// src/components/canvas/ElementRenderer.tsx — 既存 visibility チェックの直後に追加

// 既存（変更なし）
if (!element.visible || !isConditionVisible) return null

// 追加（readonly かつデータが空のとき）
const isEmptyInPreview = useMemo(() => {
  if (!readonly) return false
  return isDataEmptyInPreview(element, mergedData)
}, [readonly, element, mergedData])

if (isEmptyInPreview) return null
```

## System-Wide Impact

### Interaction Graph

```
PreviewPane / PreviewModal / ExportUtils
  └─ ReportCanvas(readonly=true)
       └─ SectionContainer
            └─ CanvasElement
                 └─ ElementRenderer(readonly=true, element, data)
                      ├─ [既存] element.visible チェック
                      ├─ [既存] conditionalDisplay チェック
                      └─ [新規] isDataEmptyInPreview(element, mergedData) チェック
                           └─ isDataEmptyInPreview() — src/lib/previewUtils.ts
                                ├─ resolveField() — src/lib/dataBinding.ts
                                └─ interpolate() — src/lib/dataBinding.ts
```

### API Surface Parity

`readonly = true` を渡す全パスに影響する:

| 呼び出し元 | `readonly` | 空データ非表示の適用 |
|---|---|---|
| `PreviewPane.tsx` | `true` | ✓ 適用 |
| `PreviewModal.tsx` → `LivePreviewPanel` | `true` | ✓ 適用 |
| PDF/PNG export (`exportUtils.ts`) | `true` | ✓ 適用 |
| エディタキャンバス | `false` | ✗ 非適用（既存表示維持） |

### State Lifecycle Risks

- **部分非表示の視覚的ずれ**: テキスト要素のうち一部フィールドが空で残りが埋まる場合
  (`"注文者: {{name}}" → "注文者: "`) は **表示される**。これは意図した動作
  （see brainstorm §Key Decisions #3）。
- **パフォーマンス**: `isDataEmptyInPreview` は `useMemo` でメモ化するため、
  `element` と `mergedData` が変わらない限り再評価されない。

## Acceptance Criteria

### Functional

- [ ] `dataField` 要素: `resolveField()` が `''` を返す時、`readonly=true` で非表示
- [ ] `text` 要素 (`{{}}` あり): `interpolate()` が `''` を返す時、`readonly=true` で非表示
- [ ] `text` 要素 (`{{}}` あり): `interpolate()` 結果に `{{...}}` が残存する時、`readonly=true` で非表示
- [ ] `text` 要素 (`{{}}` なし): 静的テキストのみの場合は常に表示
- [ ] `text` 要素: 一部フィールドが空でも残りの静的テキストが残る場合は表示（例: `"注文者: "`)
- [ ] `repeatingBand`: データ配列が 0 件の時、`readonly=true` でバンド全体を非表示
- [ ] `chart`: データ配列が 0 件の時、`readonly=true` で非表示
- [ ] `readonly=false`（エディタモード）では既存の表示を維持する
- [ ] `shape`/`image`/`pageNumber`/`currentDate` 等の静的要素は変更なし

### Testing

- [ ] `src/lib/previewUtils.test.ts` (新規): `isDataEmptyInPreview` のユニットテスト
  - dataField: 空文字、非空、fieldKey なし の各ケース
  - text: `{{}}` なし、`{{}}` が空解決、`{{}}` が残存、静的テキスト残存 の各ケース
  - repeatingBand: 0件配列、非空配列、undefined の各ケース
  - chart: 0件配列、非空配列、dataBinding なし の各ケース
  - 各 default ケース（常に false）
- [ ] `ElementRenderer.extended.test.tsx` (既存): `readonly=true` + 空データ = `null` を検証するケースを追加
- [ ] 全既存テスト（1607 件）が通過する

### Quality Gates

- [ ] `tsc --noEmit` でエラーなし
- [ ] `npm run lint` で新規エラーなし
- [ ] テストカバレッジ 80% 以上

## Implementation Order (TDD)

1. **`src/lib/previewUtils.ts` の `isDataEmptyInPreview` を実装（テスト先行）**
   - `src/lib/previewUtils.test.ts` を先に作成（RED）
   - 実装して GREEN
   
2. **`ElementRenderer.tsx` に統合**
   - `ElementRenderer.extended.test.tsx` に `readonly + empty data` テストを追加（RED）
   - `useMemo` で `isDataEmptyInPreview` を呼ぶ実装を追加（GREEN）

3. **全スイート通過確認**

## Out of Scope

(see brainstorm §Out of Scope)

- エディタ上での空データ表示変更
- 要素ごとに「空データ時に非表示」を ON/OFF する設定 UI
- `formTable` セルレベルの空判定
- `repeatingList` の空データ非表示（`repeatingBand` と同様の対応が必要だが本プランでは対象外）

## Dependencies & Risks

| リスク | 影響 | 緩和策 |
|---|---|---|
| `interpolate()` の動作変更 | 高 | `resolveField()` が `''` を返すことを単体テストで保証済み |
| テキスト要素の部分空表示（`"注文者: "`）が意図と違う | 中 | ブレインストームで明示的に「表示する」と決定済み |
| 静的テキスト要素を誤って非表示にする | 中 | `HAS_TEMPLATE.test(content)` で `{{}}` がない場合は早期リターン |
| repeatingList が対象外で一貫性が崩れる | 低 | Out of Scope として明記。フォローアップ todo に追記 |

## Sources & References

### Origin

- **Brainstorm document:** `docs/brainstorms/2026-04-11-preview-hide-empty-data-elements-brainstorm.md`
  - Key decisions carried forward:
    1. アプローチ A: ElementRenderer に集中フィルタ（変更ファイル最小化）
    2. `readonly = true` 全体に適用（プレビュー + PDF 出力の両方）
    3. 静的テキスト（`{{}}` なし）は常に表示

### Internal References

- `src/components/canvas/ElementRenderer.tsx` — 実装箇所（visibility チェックの直後）
- `src/lib/dataBinding.ts` — `resolveField()`, `interpolate()` の実装
- `src/elements/dataField/Renderer.tsx` — `useDataResolver` パターン（参考）
- `src/elements/chart/Renderer.tsx:19-40` — dataBinding 解決パターン（参考）
- `src/components/canvas/ElementRenderer.extended.test.tsx` — テスト追加先
