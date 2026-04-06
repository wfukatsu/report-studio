---
status: pending
priority: p3
issue_id: "026"
tags: [code-review, quality, architecture]
dependencies: []
---

## Problem Statement

`HistoryEntry` (reportStore.ts:42-44) stores only `pages: Page[]`. Undo/redo restores element layout but not dataSource associations. This is an implicit design decision not documented in the type or code. When the store migrates to slices (layout/rules/variants/submission), undo scope becomes critical — if only `layoutSlice` is snapshotted, undoing a layout change won't restore corresponding rule changes.

## Findings

TypeScript reviewer: `HistoryEntry` only has `pages` field. Simplicity reviewer noted this is probably intentional but not explicit. Architecture reviewer: the planned `useHistoryStore` must snapshot all slices for atomic undo.

## Proposed Solutions

A) Add a comment to `HistoryEntry` documenting that `dataSource` and `settings` are excluded from undo, and why

B) Expand `HistoryEntry` to include `dataSource` — straightforward now

C) Plan `useHistoryStore` to snapshot all 4 slices atomically (per brainstorm doc) — deferred to slice migration

## Recommended Action

<!-- Leave blank -->

## Technical Details

- Current `HistoryEntry`: `{ pages: Page[] }` — only the element layout is undoable
- Excluding `dataSource` from undo is likely intentional: data source changes are infrequent and large, snapshotting them would bloat history
- The implicit assumption becomes dangerous during slice migration: each slice author must know which state belongs in history
- Solution A is zero-risk and documents intent for future contributors
- Solution C (atomic multi-slice history) is the correct long-term design; it should be planned before the slice refactor begins

## Acceptance Criteria

- [ ] `HistoryEntry` type has a comment documenting the explicit scope of undo (pages only) and what is excluded
- [ ] A follow-up task or note captures the multi-slice atomic undo requirement for the store migration
- [ ] No behavior change in existing undo/redo functionality

## Work Log

## Resources

- Files: `src/store/reportStore.ts` lines 42–44
