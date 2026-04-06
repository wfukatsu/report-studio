---
status: complete
priority: p1
issue_id: "033"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

`ApprovalStampRowRenderer` renders `cell.stampSrc` directly into an `<img src>` attribute without going through the `isSafeImageSrc` guard that `ImageElement` correctly uses. This is a new attack surface introduced in the Phase 1-7 refactoring.

## Findings

- `src/elements/approvalStampRow/Renderer.tsx:21`:
  ```tsx
  {cell.stampSrc && <img src={cell.stampSrc} ... />}
  ```
- `ImageElement`'s renderer in `src/elements/image/Renderer.tsx` correctly uses:
  ```tsx
  const safeSrc = isSafeImageSrc(cell.src) ? cell.src : ''
  ```
- `isSafeImageSrc` is already implemented in `src/lib/exportUtils.ts` and blocks `javascript:`, `data:text/`, `file://`
- `stampSrc` can come from `importFromJSON` (attacker-controlled) or `BindingPanel` test data
- The current CSP's `img-src https:` permits HTTP requests to internal IP addresses

## Proposed Solutions

**A) Apply isSafeImageSrc guard (Recommended — 1-line fix)**
```tsx
// src/elements/approvalStampRow/Renderer.tsx
import { isSafeImageSrc } from '@/lib/exportUtils'

// In the render:
{cell.stampSrc && isSafeImageSrc(cell.stampSrc) && <img src={cell.stampSrc} ... />}
```

**B) Extract isSafeImageSrc to a shared lib module**
Move `isSafeImageSrc` from `exportUtils.ts` to `src/lib/urlUtils.ts` for cleaner dependency. Then both `image/Renderer.tsx` and `approvalStampRow/Renderer.tsx` import from the same place. Slightly more involved but architecturally cleaner.

## Recommended Action

Apply solution A immediately (1-line fix). Plan B as a cleanup in the next sprint.

## Technical Details

- **File:** `src/elements/approvalStampRow/Renderer.tsx:21`
- **Reference implementation:** `src/elements/image/Renderer.tsx` (isSafeImageSrc usage)
- **Guard function:** `src/lib/exportUtils.ts` → `isSafeImageSrc`

## Acceptance Criteria

- [ ] `cell.stampSrc` passes through `isSafeImageSrc` before rendering
- [ ] `javascript:alert(1)` as `stampSrc` does not render an `<img>` tag
- [ ] `https://example.com/stamp.png` as `stampSrc` renders normally
- [ ] Test added to cover unsafe src rejection in ApprovalStampRow

## Work Log

- 2026-04-06: Identified by security-sentinel agent — new finding not previously in todos
