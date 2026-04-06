---
status: pending
priority: p2
issue_id: "015"
tags: [code-review, architecture]
dependencies: []
---

## Problem Statement

The planned mm coordinate system (per brainstorm doc) has not been implemented. reportStore.ts, builtinTemplates.ts, and paperSizes.ts all use hardcoded px values (794 × 1123). The paperSizes.ts utility exists but is never called. Three separate places hardcode A4 pixel dimensions.

## Findings

Architecture reviewer + simplicity reviewer: reportStore.ts:6-7 DEFAULT_PAGE_WIDTH=794, DEFAULT_PAGE_HEIGHT=1123. paperSizes.ts has getPageDimensions() but zero app imports use it. builtinTemplates.ts hardcodes 794, 1123, unit:'px'. ReportSettings.unit allows 'px'|'mm'|'in' but all code treats values as px unconditionally.

## Proposed Solutions

A) Wire paperSizes.ts into reportStore.ts and builtinTemplates.ts, replacing hardcoded values. Add mmToPx utility in src/lib/coordinates.ts. Change internal model to mm, convert to px at canvas render boundary.

B) Keep px internally, use paperSizes.ts only for display labels — defers the mm migration to later phase

C) Delete paperSizes.ts and its tests; accept px-only as Phase 1 scope — simplest, removes dead code

## Recommended Action

## Technical Details

- If Option A: mm-to-px conversion at 96 DPI standard: 1mm = 3.7795px. A4 = 210mm × 297mm = 793.7px × 1122.5px (rounds to 794 × 1123 — consistent with current hardcoded values)
- Conversion boundary: ReportCanvas.tsx where page.width/height are applied to DOM style
- exportUtils.ts:27 also uses hardcoded width and would need to use getPageDimensions()
- If Option C: remove paperSizes.ts, paperSizes.test.ts, and the unit field from ReportSettings

## Acceptance Criteria

- [ ] (Option A) No hardcoded 794/1123 pixel values remain outside of paperSizes.ts
- [ ] (Option A) getPageDimensions() is the single source of truth for page pixel dimensions
- [ ] (Option C) paperSizes.ts and its dead test file are deleted; ReportSettings.unit is removed
- [ ] All existing template previews render at correct dimensions after change

## Work Log

## Resources

- src/store/reportStore.ts:6-7
- src/lib/paperSizes.ts
- src/templates/builtinTemplates.ts
- src/lib/exportUtils.ts:27
