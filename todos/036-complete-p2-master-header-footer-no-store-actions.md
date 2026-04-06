---
status: complete
priority: p2
issue_id: "036"
tags: [code-review, architecture, agent-native]
dependencies: []
---

## Problem Statement

`ReportDefinition` declares `masterHeader?: Section` and `masterFooter?: Section`, but there are no store actions to set them, and `addPage` completely ignores these fields. The feature is structurally dead — the type promise is broken and `cloneSectionForPage` in `sectionUtils.ts` exists to support this but is never called.

## Findings

- `src/types/index.ts:474-477`: `masterHeader?: Section`, `masterFooter?: Section` on ReportDefinition
- `src/store/layoutSlice.ts:277-282`: `addPage` creates bare pages with a single body section, ignoring masterHeader/Footer
- `src/lib/sectionUtils.ts`: `cloneSectionForPage()` exists for exactly this purpose but has zero callers
- No `setMasterHeader`, `setMasterFooter`, `syncMasterToPages` actions exist anywhere
- Programmatic callers (agents) cannot set master sections at all

## Proposed Solutions

**A) Implement master section store actions (Recommended)**
Add to `layoutSlice`:
```ts
setMasterHeader: (section: Section | null) => set(draft => {
  draft.definition.masterHeader = section ?? undefined
  if (section) {
    draft.definition.pages.forEach(page => {
      const idx = page.sections.findIndex(s => s.sectionType === 'header')
      if (idx !== -1) page.sections[idx] = cloneSectionForPage(section)
    })
  }
}),
setMasterFooter: (section: Section | null) => set(draft => { /* same */ }),
```
Update `addPage` to clone masterHeader/Footer when present.

**B) Remove masterHeader/masterFooter from ReportDefinition until Phase 2**
Cleaner API — no broken promise. Remove the fields, re-add when the feature is implemented.

## Recommended Action

Apply solution A if Phase 2 is imminent. Apply solution B if the timeline is uncertain — better to have no API than a broken one.

## Technical Details

- **Files:** `src/types/index.ts:474-477`, `src/store/layoutSlice.ts:277-282`, `src/lib/sectionUtils.ts`
- Also affects: `src/store/types.ts` (StoreState interface needs new action types)

## Acceptance Criteria

- [ ] `setMasterHeader(section)` store action exists and syncs to all pages via `cloneSectionForPage`
- [ ] `setMasterFooter(section)` store action exists
- [ ] `addPage` calls `cloneSectionForPage(masterHeader)` when masterHeader is set
- [ ] OR: `masterHeader`/`masterFooter` removed from types and initial state until implemented

## Work Log

- 2026-04-06: Identified by architecture-strategist and agent-native-reviewer agents
