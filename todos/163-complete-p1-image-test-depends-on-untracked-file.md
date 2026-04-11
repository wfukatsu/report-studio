---
status: complete
priority: p1
issue_id: "163"
tags: [code-review, testing, ci, image]
dependencies: []
---

# Renderer.test.tsx reads untracked file — will break CI

## Problem Statement

`src/elements/image/Renderer.test.tsx` uses `readFileSync` to read a real SVG file from `docs/sample/Scalar_LOGO-Horizontal.svg`. That path is currently **untracked** in git (`?? docs/sample/`). Any developer without this file (new clone, CI pipeline) will get a `ENOENT` error and test failures immediately.

## Findings

**File:** `src/elements/image/Renderer.test.tsx:39–41`

```ts
const svgPath = resolve(__dirname, '../../..', 'docs/sample/Scalar_LOGO-Horizontal.svg')
const svgBase64 = readFileSync(svgPath).toString('base64')
```

`docs/sample/` is listed as `??` (untracked) in `git status`. Tests must be self-contained — they cannot depend on files that are not committed.

Confirmed by: Kieran-TS (M5).

## Proposed Solutions

### Option A: Inline a minimal SVG string (Recommended)

```ts
// A clean SVG with no scripts — mirrors what the real logo file tests
const safeSvgXml = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
const svgBase64 = btoa(safeSvgXml)
const svgDataUrl = 'data:image/svg+xml;base64,' + svgBase64
```

Remove `readFileSync`, `resolve`, and `fs` imports. Tests are now self-contained and CI-safe.

**Effort:** Small | **Risk:** None

### Option B: Commit `docs/sample/Scalar_LOGO-Horizontal.svg`

Commit the file if the license allows.

**Effort:** Tiny | **Risk:** Low (binary asset in repo)

## Recommended Action

Option A — self-contained test with an inline SVG string. The test verifies `isSafeImageSrc` accepts clean SVGs; the exact file content is irrelevant.

## Acceptance Criteria

- [ ] `readFileSync` / `resolve` imports removed from `Renderer.test.tsx`
- [ ] SVG test uses an inline minimal SVG string
- [ ] All tests pass without `docs/sample/` being present
- [ ] CI would not fail on a fresh clone

## Work Log

- 2026-04-11: Flagged by Kieran-TS. Will break CI immediately.
