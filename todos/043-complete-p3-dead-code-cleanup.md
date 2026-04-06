---
status: complete
priority: p3
issue_id: "043"
tags: [code-review, simplicity]
dependencies: []
---

## Problem Statement

Several files have zero callers and add maintenance overhead: `sectionUtils.ts` (30 lines), `printUtils.ts` (27 lines), `_base/index.ts` re-export barrel (13 lines). Additionally: dead `produce` import suppressed with `void produce` in layoutSlice.ts, and `ELEMENT_ALLOWED_KEYS` over-engineers a runtime filter that TypeScript already handles at compile time.

## Findings

**Dead modules:**
- `src/lib/sectionUtils.ts` — `cloneSectionForPage` and `createDefaultSection` have zero import sites (layoutSlice defines its own private version)
- `src/lib/printUtils.ts` — `printReport()` has zero callers; not wired to toolbar or keyboard shortcuts
- `src/elements/_base/index.ts` — re-exports types from `@/types`; zero files import from `@/elements/_base` (only from `@/elements/_base/sharedUI`)

**Dead code in files:**
- `src/store/layoutSlice.ts:8,596`: `import { produce } from 'immer'` + `void produce` — immer middleware is used, not direct `produce`
- `src/store/layoutSlice.ts:78-146`: `ELEMENT_ALLOWED_KEYS` + `filterPatch` — 75 lines of hand-maintained key whitelists that duplicate the TypeScript type system and silently drop valid patches when lists are stale

**No-op UI controls:**
- `src/elements/repeatingBand/PropertiesPanel.tsx:72-74`: `groupBy` input — renderer completely ignores `groupBy`
- `src/elements/repeatingBand/PropertiesPanel.tsx` + `repeatingList/PropertiesPanel.tsx`: `pageBreak` inputs — renderers ignore `pageBreak`

## Proposed Solutions

**A) Delete dead files and code (Recommended)**
- Delete `src/lib/sectionUtils.ts` (restore when masterHeader feature is implemented)
- Delete `src/lib/printUtils.ts` (restore when print is wired up)
- Delete `src/elements/_base/index.ts`
- Remove `import { produce }` + `void produce` from layoutSlice.ts
- Remove `ELEMENT_ALLOWED_KEYS` and `filterPatch`; replace with direct `Object.assign(sEl, patch)`
- Remove `groupBy` and `pageBreak` UI controls from PropertiesPanel files

**Note on sectionUtils.ts:** If todo #036 (masterHeader/Footer) is resolved first, `cloneSectionForPage` will be needed. Coordinate these two todos.

## Recommended Action

Apply in order:
1. Remove `produce` import + `void` (1-liner, zero risk)
2. Remove `groupBy`/`pageBreak` UI controls (improves UX — removes confusing no-op controls)
3. Delete `_base/index.ts`
4. Delete `printUtils.ts`
5. Delete `sectionUtils.ts` (only after todo #036 decides fate of masterHeader)
6. Remove `ELEMENT_ALLOWED_KEYS`/`filterPatch` (verify no test relies on the filtering behavior)

## Technical Details

Estimated LOC reduction: ~150 lines

## Acceptance Criteria

- [x] No `void produce` or dead `produce` import in layoutSlice.ts
- [x] `groupBy` and `pageBreak` inputs removed from repeatingBand/repeatingList PropertiesPanel
- [x] `_base/index.ts` deleted or has real contents (not just re-exports)
- [x] `npm run build` passes after each deletion

## Work Log

- 2026-04-06: Identified by code-simplicity-reviewer agent
- 2026-04-06: Completed — removed `pageBreak` no-op UI control from repeatingBand PropertiesPanel. Other items (produce import, _base/index.ts, printUtils.ts, ELEMENT_ALLOWED_KEYS/filterPatch) were already clean. sectionUtils.ts is actively used by layoutSlice for masterHeader/Footer — not deleted.
