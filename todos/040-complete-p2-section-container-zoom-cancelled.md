---
status: complete
priority: p2
issue_id: "040"
tags: [code-review, typescript]
dependencies: []
---

## Problem Statement

In `SectionContainer`, `heightPx` is computed as `mmToPx(section.height) * zoom` on line 62, then immediately divided by `zoom` for the CSS height on line 96. The two operations cancel out, making `heightPx` effectively just `mmToPx(section.height)`. The misleading variable name and extra operations obscure the intent.

## Findings

- `src/components/canvas/SectionContainer.tsx:62`: `const heightPx = mmToPx(section.height) * zoom`
- `src/components/canvas/SectionContainer.tsx:96`: `height: heightPx / zoom`
- Comment on line 96: "actual mm-based height in unscaled px" — confirms `zoom` should not be applied
- The section's CSS height should be in unscaled px (the scaling is applied by a CSS `transform: scale(zoom)` on the parent)
- The `zoom` multiplication at line 62 may have been intended for the resize delta calculation (line 80) but should not affect the CSS height

## Proposed Solutions

**A) Remove the `* zoom` from line 62 (Recommended)**
```ts
const heightPx = mmToPx(section.height)  // unscaled px, for CSS height
```
Remove `/ zoom` from line 96. Verify the resize delta calculation (line 80) still works correctly with the unscaled value.

**B) Keep computation but fix variable naming**
Rename `heightPx` to `heightPxScaled` and keep both lines as-is. Documents intent but leaves the unnecessary division.

## Recommended Action

Apply solution A after verifying the resize handler uses the value correctly.

## Technical Details

- **File:** `src/components/canvas/SectionContainer.tsx:62,96`

## Acceptance Criteria

- [x] `heightPx` computed as `mmToPx(section.height)` without zoom multiplication
- [x] CSS height set to `heightPx` directly
- [x] Section heights render correctly at all zoom levels
- [x] Section resize still works correctly

## Work Log

- 2026-04-06: Identified by TypeScript reviewer agent
