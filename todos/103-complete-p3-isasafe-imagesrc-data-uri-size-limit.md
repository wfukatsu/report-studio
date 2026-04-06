---
status: complete
priority: p3
issue_id: "103"
tags: [code-review, security, image, data-uri]
dependencies: []
---

# 103 — isSafeImageSrc allows unbounded data URI size

## Problem Statement

`isSafeImageSrc` correctly blocks dangerous URL protocols (javascript:, data:text/, file://) but allows arbitrarily large `data:image/...` URIs. A crafted .rds.json file could embed a multi-megabyte data URI in an image element, causing memory pressure or UI freezing when the report is rendered.

## Findings

**File:** `src/lib/exportUtils.ts:30-37` (or wherever isSafeImageSrc is defined)

The function allows all `data:image/` URIs without a size cap.

## Proposed Solutions

### Option A: Add size cap for data URIs
```tsx
if (lower.startsWith('data:image/') && src.length > 2 * 1024 * 1024) {
  return false // reject data URIs over 2MB
}
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] data URIs over 2MB are blocked by isSafeImageSrc
- [ ] Normal small data URIs (icons, logos) still work
- [ ] Existing tests pass

## Work Log
- 2026-04-06: Filed from third-round UX review
