---
status: pending
priority: p2
issue_id: "052"
tags: [ux-review, ux, toolbar]
dependencies: []
---

# Toolbar Cognitive Overload

## Problem

Toolbar has 30+ icon-only buttons in a single row. Users cannot scan for tools; alignment/z-order/distribute tools have same visual weight as undo/export.

## Findings

`src/components/toolbar/Toolbar.tsx:91-284` — 30+ buttons, minimal dividers (w-px h-5), no grouping into dropdowns.

## Solutions

### A) Group into dropdowns (Recommended)

6 alignment buttons → "整列" dropdown, 2 distribute buttons included, 4 z-order buttons → "レイヤー順" dropdown. Reduces visible toolbar to ~15 buttons.

### B) Collapsible secondary toolbar row

Move alignment/distribute/z-order into a collapsible secondary toolbar row.

## Recommendation

**A**. Acceptance criteria: toolbar ≤15 visible buttons at default state, alignment/z-order accessible via dropdown.

## Files

- `src/components/toolbar/Toolbar.tsx`
