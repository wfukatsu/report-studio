---
status: complete
priority: p3
issue_id: "083"
tags: [code-review, ux, icons, toolbar]
dependencies: []
---

# 083 — Zoom icon wrong (shows Layers icon) + "ページに合わせる" label misleading

## Problem Statement

Two minor icon/label issues in the Toolbar zoom area:

1. The zoom dropdown button uses a "Layers" icon instead of a "ZoomIn" or "Search" icon — visually misleading.
2. The "ページに合わせる" option resets zoom to 1.0 (100%) which is not actually "fit to page" — it's just 100% zoom. True "fit to page" would calculate zoom based on canvas viewport size.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx`

Zoom button should use `ZoomIn` from lucide-react, not `Layers`.

"ページに合わせる" sets `zoom = 1` which is a fixed 100%, not a viewport-aware fit. Either:
- Rename to "100%" for accuracy
- Or implement true fit-to-page calculation

## Proposed Solutions

### Option A: Fix icon + rename label (Fast)
- Replace zoom button icon with `ZoomIn`
- Rename "ページに合わせる" → "100%"

**Pros:** Accurate, minimal  
**Effort:** Small  
**Risk:** Low

### Option B: Fix icon + implement true fit-to-page
Calculate zoom as `viewportWidth / (pageWidthMm * mmToPx)`.

**Pros:** Better UX  
**Cons:** Requires viewport measurement  
**Effort:** Medium  
**Risk:** Low

## Recommended Action

Option A first (accuracy), Option B as enhancement.

## Technical Details

**Files affected:**
- `src/components/toolbar/Toolbar.tsx`

**Acceptance Criteria:**
- [ ] Zoom button uses ZoomIn icon
- [ ] "ページに合わせる" either renamed to "100%" or implements actual fit calculation

## Work Log

- 2026-04-06: Filed from second-round UX review
