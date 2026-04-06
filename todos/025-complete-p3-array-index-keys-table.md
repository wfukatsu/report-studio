---
status: pending
priority: p3
issue_id: "025"
tags: [code-review, quality]
dependencies: []
---

## Problem Statement

ElementRenderer.tsx:136,138 uses array indices (`rowIdx`, `colIdx`) as React keys for table rows and cells. For dynamically bound table data that can change row order or count, index keys cause incorrect reconciliation when rows are inserted or removed.

## Findings

TypeScript reviewer: ElementRenderer.tsx:136,138 — `key={rowIdx}` and `key={colIdx}`. For a report tool where table data is re-bound from a data source, row insertion/deletion will show wrong cells reusing old DOM nodes. Index keys are only safe for static, never-reordering data.

## Proposed Solutions

A) For static `element.data` tables: index keys are acceptable (data never reorders)

B) For bound tables (`element.dataBinding`): derive keys from row content hash or first cell value

C) Add a stable row identifier to the data model

## Recommended Action

<!-- Leave blank -->

## Technical Details

- React uses keys to identify which list items have changed, been added, or removed during reconciliation
- Index keys cause the wrong DOM nodes to be reused when rows are inserted/removed mid-list, leading to stale cell content
- A lightweight approach for solution B: use `${rowIdx}-${row[0] ?? rowIdx}` as a key — not perfectly stable but far better than pure index for most real-world data
- A robust approach (solution C) would add an `id` field to the `string[][]` data model, but this is a breaking type change
- The bug is only visible when table data is dynamically rebound; static reports are unaffected

## Acceptance Criteria

- [ ] Table row keys are not pure array indices when data is dynamically bound
- [ ] Cell keys within a row are stable or at minimum content-derived
- [ ] No visual regression in static table rendering
- [ ] A test case demonstrates correct reconciliation when a row is prepended to bound table data

## Work Log

## Resources

- Files: `src/components/canvas/ElementRenderer.tsx` lines 136–143
