---
status: pending
priority: p1
issue_id: "002"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

`<img src={element.src} />` in ElementRenderer.tsx:58 places the user-editable src value directly into the DOM. `data:` URIs with `text/html` or `SVG+script` payloads are XSS vectors at html2canvas export time. `javascript:` URIs in future anchor/iframe elements follow the same unvalidated pattern.

## Findings

- `ImageElement.src` is a writable string field with no validation constraints in the type definition.
- `ElementPalette` creates new image elements with `src: ''` — no validation runs at creation time.
- `PropertiesPanel.tsx` allows free-text editing of src with no sanitization.
- html2canvas fetches the src URL at export time — a `data:text/html,<script>…</script>` URI can execute code in some html2canvas versions.
- The pattern is also a risk for any future anchor or iframe element types following the same unguarded approach.

## Proposed Solutions

**A) Add `isSafeImageSrc()` validator at store boundary and render time** — Implement a validator that only allows `https://`, `http://`, and `data:image/*` schemes. Reject all other `data:` subtypes and `javascript:` URIs. Apply in `updateElement` (store boundary) and in `ElementRenderer` (defense in depth).

**B) Sanitize at render time only (in ElementRenderer)** — Allows bad data to be written into the store but blocks rendering. Simpler but leaves corrupted store state.

**C) Use URL constructor validation** — More robust URL parsing, but allows `data:text/` if not explicitly blocked via an allowlist. Requires same explicit scheme filtering as option A anyway.

**Recommended: A** — validate at store boundary (`updateElement`) and at render time (`ElementRenderer`) for defense in depth.

## Recommended Action

## Technical Details

- Affected render path: `ElementRenderer.tsx:58` renders `<img src={element.src} />` without sanitization.
- Store mutation path: `reportStore.ts:198-205` `updateElement` accepts any string for `src`.
- Type definition: `src: string` in `src/types/index.ts` — no constraint type.
- Allowlist: `https://`, `http://`, `data:image/png`, `data:image/jpeg`, `data:image/gif`, `data:image/webp`, `data:image/svg+xml` (SVG must be validated separately due to embedded script risk).

## Acceptance Criteria

- `updateElement` called with `{ src: 'javascript:alert(1)' }` is rejected (no store update).
- `updateElement` called with `{ src: 'data:text/html,<script>x</script>' }` is rejected.
- `updateElement` called with `{ src: 'data:image/png;base64,...' }` is accepted.
- `updateElement` called with `{ src: 'https://example.com/image.png' }` is accepted.
- `ElementRenderer` renders an empty or placeholder src when an invalid value is encountered.

## Work Log

## Resources

- src/components/canvas/ElementRenderer.tsx:58
- src/store/reportStore.ts:198-205
- src/types/index.ts
