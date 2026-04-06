---
status: pending
priority: p2
issue_id: "020"
tags: [code-review, quality, ux]
dependencies: []
---

## Problem Statement

Toolbar.tsx uses `disabled={historyIndex <= 0}` to disable the undo button. But historyIndex 0 is a valid state (the initial snapshot before any edits) — undo at index 1 should return to index 0. The button is incorrectly disabled at the first real edit.

## Findings

Simplicity reviewer: Toolbar.tsx:46 — `disabled={historyIndex <= 0}`. reportStore.ts undo guard at line 301-303 uses `if (s.historyIndex <= 0) return` — this is correct (can't undo past initial snapshot). But the toolbar guard disabled={<=0} is also triggered at index 0 which is a real state, meaning after the first action the undo button shows as disabled until a second action is taken. One-character fix.

## Proposed Solutions

A) Change Toolbar.tsx guard to `disabled={historyIndex < 1}` — the undo action is available as long as there is a previous entry (index >= 1)

B) Add a canUndo computed property to the store — `canUndo: historyIndex > 0`

C) Change the undo guard in the store to `historyIndex < 1` and keep toolbar consistent

## Recommended Action

## Technical Details

- The store undo guard (reportStore.ts:301-303) uses `<= 0` which is equivalent to `< 1` — no change needed there, it is correct
- Only the toolbar display guard is wrong: `<= 0` disables when index is 0, but index 0 means "first snapshot exists and can be returned to from index 1"
- Option B (canUndo selector) would make the intent more explicit and prevent future inconsistencies

## Acceptance Criteria

- [ ] After the first user action, the undo button is enabled (not disabled)
- [ ] Undo at historyIndex 1 correctly returns to historyIndex 0
- [ ] At historyIndex 0, the undo button is disabled (cannot undo past initial state)
- [ ] Redo button guard is reviewed for the same class of off-by-one error

## Work Log

## Resources

- src/components/toolbar/Toolbar.tsx:46
