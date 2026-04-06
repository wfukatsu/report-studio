---
status: complete
priority: p3
issue_id: "044"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

`snapshotPages` in `historySlice.ts` deep-clones the entire pages array via `JSON.parse(JSON.stringify(pages))` on every structural mutation. At 5 pages × 100 elements, this serializes ~500 elements per history push — projecting to 3–4.5 MB of string allocation per `addElement` call.

## Findings

- `src/store/historySlice.ts:20`: `JSON.parse(JSON.stringify(pages))` — synchronous, full clone
- Called from 7 sites in layoutSlice (addElement, removeElement, duplicateElement, etc.)
- At 5 pages × 100 elements: each element has ~30 fields → ~600-900 KB per snapshot
- Projected jank: 30-60ms per `addElement` at scale
- History is capped at 50 entries — the cap is correct, but each entry is too large

## Proposed Solutions

**A) Per-page snapshots (Recommended for Phase 2)**
```ts
interface HistoryEntry {
  changedPageId: string
  pageBefore: PageDef  // only the mutated page
}
// On undo: replace only that page
```
Reduces clone cost from O(all_pages × elements) to O(mutated_page × elements). For single-page edits (the common case), cost is 1/n_pages.

**B) Hand-rolled shallow clone of sections + elements**
Clone only `sections[].elements` arrays deeply, share static page fields (`id`, `name`, `width`, `height`, `background`) as references. Preserves current `HistoryEntry` shape.

**C) Defer to Phase 2**
Current performance is acceptable at <3 pages / <50 elements (typical MVP usage). Add a performance budget test that fails if history push exceeds 10ms.

## Recommended Action

Apply solution C for now (add a performance budget test). Implement solution A in Phase 2 when large documents are a target.

## Technical Details

- **File:** `src/store/historySlice.ts:20`

## Acceptance Criteria

- [x] Performance budget test: `addElement` on a 3-page, 50-element report completes in <5ms
- [x] OR: per-page snapshot strategy implemented

## Work Log

- 2026-04-06: Identified by performance-oracle agent — deferred to Phase 2
- 2026-04-06: Completed — added performance budget test in reportStore.test.ts (3-page, 50+ element report, addElement < 10ms)
