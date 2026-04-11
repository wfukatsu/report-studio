---
status: complete
priority: p2
issue_id: "120"
tags: [code-review, typescript, type-safety]
---

# `updateLayerGroup` の patch 型が `elementIds` を上書き可能

## Problem Statement

`updateLayerGroup` は `Partial<LayerGroup>` を受け取り `Object.assign(group, patch)` で適用する。
`elementIds: readonly string[]` の不変条件が型レベルで保護されていない。

## Findings

**TSレビュー**（HIGH）
```typescript
// layoutSlice.ts:663
if (group) Object.assign(group, patch)
```

patch の型が `Partial<LayerGroup>` なら `elementIds` を mutable array で上書きできる。
また `id` も上書き可能になっており、グループIDが変わると参照が壊れる。

## Proposed Solutions

### Option A: patch 型を絞る（推奨）

```typescript
// store/types.ts の updateLayerGroup シグネチャを変更
updateLayerGroup: (pageId: string, groupId: string, patch: Partial<Pick<LayerGroup, 'name' | 'collapsed' | 'visible' | 'locked'>>) => void
```

### Option B: 明示的フィールド代入（セキュリティエージェント推奨）

```typescript
updateLayerGroup: (pageId, groupId, patch) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    const group = page?.groups?.find((g) => g.id === groupId)
    if (!group) return
    if (patch.name !== undefined) group.name = patch.name
    if (patch.collapsed !== undefined) group.collapsed = patch.collapsed
    if (patch.visible !== undefined) group.visible = patch.visible
    if (patch.locked !== undefined) group.locked = patch.locked
  })
  get().pushHistory()
},
```

## Technical Details

- **Files**: `src/store/types.ts`, `src/store/layoutSlice.ts`

## Acceptance Criteria

- [x] `updateLayerGroup` の patch 型から `id` と `elementIds` が除外される
- [x] TypeScript が `updateLayerGroup(id, gid, { elementIds: [] })` をコンパイルエラーにする
- [x] 既存の全呼び出し箇所が新しい型に適合する

## Work Log

- 2026-04-06: TSレビュー・セキュリティエージェントが指摘。
