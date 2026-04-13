---
status: pending
priority: p2
issue_id: "265"
tags: [code-review, architecture, history, undo-redo]
dependencies: []
---

# 履歴（Undo/Redo）がスキーマと計算ルールを含まない

## Problem Statement

`historySlice.ts` は `pages` のスナップショットのみを保存し、`schema`・`calculationRules`・`validationRules` は対象外。スキーマグループや計算ルールを削除した後に Undo できず、設計者が誤操作でデータを失う可能性がある。

## Findings

`src/store/historySlice.ts:41`:
```ts
// Note: historySlice only snapshots pages, not schema/rules.
// Undo of schema or rule changes is not supported.
export type HistoryEntry = { pages: PageDef[] }
```

スキーマ設計は帳票定義の核であり、スキーマ変更のアンドゥができないことはユーザーエクスペリエンスとして重大な欠陥。

## Proposed Solutions

### Solution A: HistoryEntry に schema と rules を追加

```ts
export type HistoryEntry = {
  pages: PageDef[]
  schema: Schema
  calculationRules: CalculationRule[]
  validationRules: ValidationRule[]
}
```

スナップショットサイズが増加するため、上限を 50 → 30 に削減を検討。

- Effort: Medium
- Risk: Low（undo/redo ロジックの変更は局所的）

### Solution B: スキーマ変更のみ別途 schemaHistory を持つ

pages 履歴と schema 履歴を分離し、それぞれ独立して Undo できるようにする。

- Effort: Large
- Risk: Medium

## Acceptance Criteria

- [ ] スキーマグループ削除後に Undo で復元できる
- [ ] 計算ルール削除後に Undo で復元できる
- [ ] Undo/Redo ボタンのツールチップに操作内容が表示される

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
