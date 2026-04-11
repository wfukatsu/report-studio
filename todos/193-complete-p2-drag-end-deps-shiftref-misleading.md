---
status: pending
priority: p2
issue_id: "193"
tags: [code-review, react, hooks, canvas, drag]
dependencies: []
---

# handleDragEnd の deps 配列に shiftRef が不要で誤解を招く

## Problem Statement

`ReportCanvas.tsx` の `handleDragEnd` の `useCallback` deps に `shiftRef` が含まれているが、`useRef` の戻り値はコンポーネントライフタイム全体で identity が固定であり deps に含める必要がない。この記述は「shiftRef が変化しうる」という誤った印象を後続の開発者に与える。

## Findings

**File:** `src/components/canvas/ReportCanvas.tsx:201`

```ts
[page, moveElement, zoom, snapToGrid, gridSize, margins, shiftRef],  // ← shiftRef は不要
```

`useRef` オブジェクト自体は再レンダー間で同一参照を持つため、`handleDragEnd` が `shiftRef` の変化によって再生成されることはない。ただし deps に含めることで `eslint-plugin-react-hooks` の exhaustive-deps チェックと干渉する場合がある。

## Proposed Solutions

### Option A: deps から shiftRef を削除し理由をコメント追記

```ts
// shiftRef は useRef のため常に同一参照 — deps 不要
[page, moveElement, zoom, snapToGrid, gridSize, margins],
```

- **Pros:** deps の意図が明確になる。将来の開発者が混乱しない
- **Cons:** なし
- **Effort:** Small
- **Risk:** None

## Recommended Action

Option A を適用する。

## Technical Details

- **Affected files:** `src/components/canvas/ReportCanvas.tsx:201`
- **React docs:** stable refs (useRef, useCallback from stable sources) は deps に含めない慣習

## Acceptance Criteria

- [ ] `handleDragEnd` の deps から `shiftRef` が削除されている
- [ ] 削除後もテストが PASS する

## Work Log

- 2026-04-11: kieran-typescript-reviewer (HIGH) と performance-oracle の両エージェントが指摘 (PR #30 レビュー)
