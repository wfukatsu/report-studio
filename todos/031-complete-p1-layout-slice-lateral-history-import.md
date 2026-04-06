---
status: complete
priority: p1
issue_id: "031"
tags: [code-review, architecture]
dependencies: []
---

## Problem Statement

`layoutSlice.ts` directly imports `snapshotPages` and `pushHistoryEntry` from `historySlice.ts` — a lateral peer-slice dependency. This creates a latent circular dependency risk, splits ownership of history mutation across two slices, and violates the slice boundary model.

## Findings

- `src/store/layoutSlice.ts:21`: `import { snapshotPages, pushHistoryEntry } from './historySlice'`
- `pushHistoryEntry` is called at 7 sites in layoutSlice (addElement, removeElement, duplicateElement, alignElements, setZOrder, cutElements, pasteElements)
- `historySlice.ts` also exposes a `pushHistory()` action that does the same thing via `get()` — two code paths to one side effect
- If `historySlice` ever needs to import `flattenPageElements` or any layout utility from `layoutSlice`, a circular import becomes live
- History state (`s.history`, `s.historyIndex`) is mutated directly inside layoutSlice's `set()` callbacks — bypassing the history slice's ownership

## Proposed Solutions

**A) Extract shared utilities to `src/store/historyUtils.ts` (Recommended)**
Move `snapshotPages` and `pushHistoryEntry` into a neutral module that neither slice owns. Both slices import pure utilities from it.
```ts
// src/store/historyUtils.ts
export function snapshotPages(pages: PageDef[]): PageDef[] { ... }
export function pushHistoryEntry(draft: StoreState, pages: PageDef[]): void { ... }
```

**B) Use `get().pushHistory()` in layoutSlice**
Replace all `pushHistoryEntry` calls in layoutSlice with `get().pushHistory()` (calling the historySlice action). The history slice remains the sole owner of history mutation.
```ts
// In layoutSlice actions, at the end of structural mutations:
get().pushHistory()
```
Simpler, but requires that layoutSlice has access to `get` — which it already does as the second argument to StateCreator.

**C) Keep as-is, accept the coupling**
Works today but accumulates tech debt and makes future refactoring harder.

## Recommended Action

Apply solution B — it's the smallest change and follows the Zustand cross-slice coordination pattern. Each layoutSlice action that structurally mutates data calls `get().pushHistory()` at the end instead of importing from historySlice.

## Technical Details

- **Files:** `src/store/layoutSlice.ts:21`, `src/store/historySlice.ts`
- Call sites in layoutSlice: lines 337-339, 373-375, 420-422, 471-473, 499-501, 554-556, 589-591

## Acceptance Criteria

- [ ] No import of `historySlice` in `layoutSlice.ts`
- [ ] History push is triggered via `get().pushHistory()` or equivalent indirect call
- [ ] All 7 structural mutation actions still correctly push history
- [ ] `npm run build` passes
- [ ] `npm test -- --run` passes

## Work Log

- 2026-04-06: Identified by architecture-strategist agent during Phase 1-7 refactoring review
