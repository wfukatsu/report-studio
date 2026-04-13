---
status: pending
priority: p3
issue_id: "270"
tags: [code-review, architecture, store, coupling]
dependencies: []
---

# schemaSlice が uiSlice 所有の livePreviewData を直接書き換える

## Problem Statement

`livePreviewData` は `uiSlice` が所有するが、`schemaSlice` の複数のアクション（`removeSchemaGroup`、`removeSchemaField`、`bindGroupToTable`）が `set()` 内で直接 `null` に書き換えている。スライス間の所有権境界が曖昧になり、`uiSlice` の実装を変えた際に `schemaSlice` も変更が必要になる。

## Findings

`src/store/schemaSlice.ts`（複数箇所）:
```ts
removeSchemaGroup: (groupId) => set((s) => {
  // ...
  s.livePreviewData = null  // ← uiSlice 所有のフィールドを直接操作
})
```

## Proposed Solutions

### Solution A: 無効化アクションを uiSlice に追加

```ts
// uiSlice.ts
invalidateLivePreviewData: () => set((s) => { s.livePreviewData = null })

// schemaSlice.ts - スライス境界を越えずにアクションを呼ぶ
removeSchemaGroup: (groupId) => {
  set((s) => { /* スキーマ変更のみ */ })
  get().invalidateLivePreviewData()  // 委譲
}
```

- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] `schemaSlice.ts` が `livePreviewData` を直接変更しない
- [ ] 無効化ロジックが `uiSlice` に集約されている

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
