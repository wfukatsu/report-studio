---
status: pending
priority: p3
issue_id: "024"
tags: [code-review, quality]
dependencies: []
---

## Problem Statement

`snapshot()` in reportStore.ts:89 uses `JSON.parse(JSON.stringify(...))` while undo/redo at lines 307/319 use `structuredClone()`. `duplicateElement` also uses `JSON.parse(JSON.stringify)`. The CLAUDE.md notes immer proxies cannot be `structuredClone`'d (which is why `JSON.parse` is used inside `produce`), but snapshot and duplicateElement outside `produce` should use `structuredClone` for consistency and performance.

## Findings

TypeScript reviewer and simplicity reviewer both flagged this. Inside immer `produce`: `JSON.parse/JSON.stringify` must be used (proxy not `structuredClone`-able). Outside `produce` (snapshot fn, undo/redo): use `structuredClone` for consistency. `snapshot()` is called inside `produce` — this is the conflict point.

## Proposed Solutions

A) Move `snapshot()` call outside of `produce` callbacks; pass the snapshot in as a parameter — then snapshot can use `structuredClone`

B) Keep `JSON.parse/JSON.stringify` inside `produce`, use `structuredClone` outside — document the distinction in a comment

C) Consolidate on `JSON.parse/JSON.stringify` everywhere — backward compatible but slower

## Recommended Action

<!-- Leave blank -->

## Technical Details

- `structuredClone` is faster than `JSON.parse(JSON.stringify(...))` for most data shapes and handles `undefined` values, `Date` objects, and circular references correctly
- The immer proxy constraint is the key reason for the inconsistency: immer wraps draft objects in Proxies that `structuredClone` cannot handle
- Solution B is lowest risk: add a comment block above each clone call explaining which strategy is used and why
- Solution A is architecturally cleaner but requires refactoring the `pushHistory` call sites

## Acceptance Criteria

- [ ] Clone strategy inconsistency is resolved or explicitly documented
- [ ] Each clone call site has a comment explaining the chosen strategy and the immer proxy constraint where applicable
- [ ] All existing undo/redo tests continue to pass
- [ ] `duplicateElement` uses `structuredClone` if called outside `produce`

## Work Log

## Resources

- Files: `src/store/reportStore.ts` lines 89, 249, 305–321
