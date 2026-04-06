---
status: complete
priority: p2
issue_id: "079"
tags: [code-review, accessibility, aria, wcag]
dependencies: []
---

# 079 — Delete toast missing ARIA live region + aria-selected invalid on role="button"

## Problem Statement

Two ARIA issues found in second-round review:

1. **Delete toast** (`App.tsx:237`) has no ARIA live region — screen readers won't announce "N件の要素を削除しました" automatically.
2. **CanvasElement** (`CanvasElement.tsx:173`) uses `aria-selected` on `role="button"`, which is invalid per WAI-ARIA spec. `aria-selected` is only valid on roles: gridcell, option, row, tab, treeitem, columnheader, rowheader.

## Findings

**File:** `src/App.tsx:237-247`
```tsx
<div className="fixed bottom-4 left-1/2 ... z-50">
  <span>{deleteToast.count}件の要素を削除しました</span>
```
Missing: `role="status"` or `aria-live="polite"`.

**File:** `src/components/canvas/CanvasElement.tsx` (aria-selected on role="button")
```tsx
<div role="button" ... aria-selected={isSelected}>
```
`aria-selected` is not a valid attribute for `role="button"`. Should use `aria-pressed` for toggle state. Alternatively, change role to a custom widget or use CSS classes only for visual selection state.

**WCAG:** 4.1.2 Name, Role, Value (Level AA)

## Proposed Solutions

### Option A: Fix both independently (Recommended)

**Toast:** Add `role="status" aria-live="polite"` to the toast container.

**CanvasElement:** Replace `aria-selected` with `aria-pressed={isSelected}` — or remove the attribute if selection is communicated through `aria-label` (which already says "選択中").

**Pros:** Minimal, targeted fix  
**Cons:** None  
**Effort:** Small  
**Risk:** Low

### Option B: Use role="option" on CanvasElement
Change `role="button"` to `role="option"` inside a `role="listbox"` parent on the canvas.

**Pros:** Semantically correct selection model  
**Cons:** Large change, requires canvas rework, listbox semantics don't fit a 2D canvas  
**Effort:** Large  
**Risk:** Medium

## Recommended Action

Option A — minimal targeted fixes.

## Technical Details

**Files affected:**
- `src/App.tsx` — add `role="status" aria-live="polite"` to toast div
- `src/components/canvas/CanvasElement.tsx` — replace `aria-selected` with `aria-pressed`

**Acceptance Criteria:**
- [ ] Delete toast announced by screen readers via ARIA live region
- [ ] No invalid ARIA attribute warnings (aria-selected on role="button" removed)
- [ ] CanvasElement selection state still communicated to AT via aria-pressed or aria-label

## Work Log

- 2026-04-06: Filed from second-round UX review
