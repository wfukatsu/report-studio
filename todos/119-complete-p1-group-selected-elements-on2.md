---
status: complete
priority: p1
issue_id: "119"
tags: [code-review, performance, state-management]
---

# `groupSelectedElements` の `Array.includes` が O(n²)

## Problem Statement

`groupSelectedElements` と同パターンが `removeElement`・`removeElements` にも存在する。
immer Proxy 内で `selectedIds.includes(id)` を全グループ×全メンバーに呼ぶため
O(G × K × M)。Ctrl+A で100要素全選択してグループ化すると M=100 になり体感遅延が出る。

## Findings

**パフォーマンスレビュー**（Critical #2）・**TSレビュー**（MEDIUM）
```typescript
// layoutSlice.ts:643–644
page.groups = page.groups
  .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !selectedIds.includes(id)) }))
//                                                                   ^^^ O(M) per element
```

immer Proxy 内のプロパティアクセスはネイティブより遅いため影響が大きい。

## Proposed Solutions

### Option A: `Set` に変換してから filter（推奨）

```typescript
groupSelectedElements: (pageId, name) => {
  const selectedIds = get().selection.selectedElementIds
  if (selectedIds.length < 2) return
  const selectedSet = new Set(selectedIds)  // O(M) once
  // ...
  set((s) => {
    // ...
    page.groups = page.groups
      .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !selectedSet.has(id)) }))
      .filter((g) => g.elementIds.length > 0)
  })
}
```

同じ修正を `removeElement`・`removeElements`・`leaveGroup` にも適用する。

## Technical Details

- **Files**: `src/store/layoutSlice.ts`
- **Affected actions**: `groupSelectedElements`, `removeElement`, `removeElements`, `leaveGroup`

## Acceptance Criteria

- [x] `groupSelectedElements` で `new Set(selectedIds)` を `set()` の外で作成する
- [x] `removeElement`・`removeElements` も同様に修正
- [x] 既存テスト全通過
- [x] 新規テスト: 50要素選択のグループ化が正しく動作する

## Work Log

- 2026-04-06: パフォーマンス・TSレビュー両エージェントが指摘。
