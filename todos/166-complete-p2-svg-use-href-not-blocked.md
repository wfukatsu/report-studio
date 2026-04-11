---
status: complete
priority: p2
issue_id: "166"
tags: [code-review, security, svg, xss]
dependencies: []
---

# isSafeImageSrc does not block SVG <use href> to external resources

## Problem Statement

`isSafeImageSrc` in `exportUtils.ts` rejects seven dangerous SVG patterns but does not block `<use href="//attacker.com/...">` or `<image href="...">`. These elements load external resources. While browsers sandbox SVG in `<img>` tags (making this not directly exploitable today), the gap should be closed for defence-in-depth before the SVG path is used in non-`<img>` rendering contexts.

## Findings

**File:** `src/lib/exportUtils.ts` — `SVG_DANGEROUS_PATTERNS`

A crafted payload:
```xml
<svg xmlns="http://www.w3.org/2000/svg">
  <use href="//attacker.com/payload.svg#exploit"/>
</svg>
```
Base64-encoded passes all seven current patterns.

`feImage href` also bypasses current patterns.

Confirmed by: Security reviewer (MEDIUM).

## Proposed Solutions

### Option A: Add specific patterns for use/image/href (Recommended)

```ts
const SVG_DANGEROUS_PATTERNS = [
  // ...existing patterns...
  /<use[\s>]/i,          // <use href> loads external resources
  /<image[\s>]/i,        // SVG <image> element (not HTML <img>) loads external
  /xlink:href\s*=/i,     // legacy xlink:href attribute
  // href= broadly: only flag external schemes, not fragment refs
  /href\s*=\s*["'](?!#)/i,  // href pointing to non-fragment (external URL)
]
```

**Effort:** Small | **Risk:** Low (adds false positive risk only if clean SVGs use external references, which logos don't)

### Option B: Allow-list approach

Only permit SVG elements from a known safe list (`<svg>`, `<rect>`, `<path>`, `<circle>`, `<text>`, `<g>`, etc.) and reject anything else.

**Effort:** Medium | **Risk:** Low but may reject legitimate complex SVGs

## Recommended Action

Option A with a note that `href` targeting fragment references (`#`) should still be allowed (they reference internal definitions).

## Acceptance Criteria

- [ ] `<use href="//external.com/...">` → `isSafeImageSrc` returns `false`
- [ ] `<use href="#localref">` (fragment ref) → still returns `true`
- [ ] `<image href="data:image/png;base64,...">` (inline) → still returns `true`
- [ ] Test cases added for each new pattern

## Work Log

- 2026-04-11: Flagged by Security reviewer. Currently neutralized by browser img sandboxing but needs defence-in-depth.
