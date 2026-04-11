---
status: pending
priority: p3
issue_id: "196"
tags: [code-review, quality, canvas, resize]
dependencies: []
---

# isCorner 判定を Set.has() で置き換えて可読性を改善

## Problem Statement

`CanvasElement.tsx` の `isCorner` 判定が 4 つの `===` 比較の OR 連結で書かれており、将来新しいコーナーハンドル名が追加される場合に変更箇所が分散する。

## Findings

**File:** `src/components/canvas/CanvasElement.tsx:148`

```ts
const isCorner = handle === 'se' || handle === 'sw' || handle === 'ne' || handle === 'nw'
```

## Proposed Solutions

### Option A: ファイルスコープ定数 + Set.has()

```ts
const CORNER_HANDLES = new Set<ResizeHandle>(['se', 'sw', 'ne', 'nw'])
// onPointerMove クロージャ内:
const isCorner = CORNER_HANDLES.has(handle)
```

- **Pros:** 意図が明確。`ResizeHandle` 型と連動しており追加漏れを型チェックで検出可能
- **Effort:** Small
- **Risk:** None

## Acceptance Criteria

- [ ] `CORNER_HANDLES` 定数が `CanvasElement.tsx` のファイルスコープに定義されている
- [ ] `isCorner` が `CORNER_HANDLES.has(handle)` で判定されている

## Work Log

- 2026-04-11: kieran-typescript-reviewer (MEDIUM)、code-simplicity-reviewer が指摘 (PR #30 レビュー)
