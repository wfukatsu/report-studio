---
title: XSS / Prototype Pollution — Image src Validation & JSON Import Safety
problem_type: security_issue
component: dataBinding, ElementRenderer, ApprovalStampRowRenderer, migration, exportUtils, index.html
severity: p1
tags:
  - xss
  - prototype-pollution
  - image-validation
  - json-import
  - csp
  - ssrf
  - defense-in-depth
date: 2026-04-06
resolved_todos:
  - 001 (prototype pollution in resolveField)
  - 002 (unvalidated image src XSS)
  - 033 (approval stamp unsafe img src)
  - 032 (import from JSON unsafe cast)
  - 010 (html2canvas SSRF image validation)
  - 022 (missing CSP header)
---

## Overview

Six interconnected security vulnerabilities were fixed using a defense-in-depth strategy:
validation at store boundaries, at render time, and at the network level (CSP).

---

## Issue 1: Prototype Pollution in `resolveField`

### Problem
`src/lib/dataBinding.ts` split `fieldKey` on `.` and walked the data object using bracket
notation without filtering dangerous keys. A key like `__proto__`, `constructor`, or
`prototype` traverses JavaScript's prototype chain, enabling prototype pollution attacks.

### Fix
```typescript
// src/lib/dataBinding.ts
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function resolveField(data: Record<string, unknown>, fieldKey: string): string {
  const parts = fieldKey.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return ''  // guard
    if (current == null || typeof current !== 'object') return ''
    current = (current as Record<string, unknown>)[part]
  }
  return current == null ? '' : String(current)
}
```

### Impact if Unfixed
Attackers can inject `{"__proto__": {"isAdmin": true}}` via JSON data import and poison
`Object.prototype`, potentially bypassing guards or injecting properties across all objects.

---

## Issue 2: XSS via Unvalidated Image `src` (ImageElement)

### Problem
`<img src={element.src} />` rendered user-editable values directly into the DOM.
`data:text/html,...` URIs and `javascript:` URIs can execute scripts at export time via
html2canvas.

### Fix — `isSafeImageSrc` guard (`src/lib/exportUtils.ts`)
```typescript
const SAFE_DATA_PREFIXES = [
  'data:image/png', 'data:image/jpeg',
  'data:image/gif', 'data:image/webp',
]

export function isSafeImageSrc(src: string): boolean {
  if (!src) return false
  const lower = src.toLowerCase().trim()
  if (lower.startsWith('data:')) {
    return (
      src.length <= 2 * 1024 * 1024 &&          // 2 MB cap
      SAFE_DATA_PREFIXES.some((p) => lower.startsWith(p))
    )
  }
  return lower.startsWith('https://')
}
```

```tsx
// src/elements/image/Renderer.tsx
const safeSrc = isSafeImageSrc(el.src) ? el.src : ''
if (!safeSrc) return <div>📷 画像</div>
return <img src={safeSrc} alt={el.alt} draggable={false} />
```

---

## Issue 3: XSS in ApprovalStampRow (Inconsistent Guard)

### Problem
`ApprovalStampRowRenderer` rendered `cell.stampSrc` directly in `<img src>` without
the `isSafeImageSrc` guard that already existed for ImageElement — a newly introduced
attack surface in Phase 1–7 refactoring.

### Fix
```tsx
// src/elements/approvalStampRow/Renderer.tsx
import { isSafeImageSrc } from '@/lib/exportUtils'

{cell.stampSrc && isSafeImageSrc(cell.stampSrc) &&
  <img src={cell.stampSrc} draggable={false} />}
```

**Lesson:** Every image rendering path must use `isSafeImageSrc`. Do not add `<img>`
tags without it.

---

## Issue 4: Unsafe Type Cast in JSON Import

### Problem
`importFromJSON` (`src/lib/migration.ts`) validated only three fields (`id`, `pages`,
array check) then blindly cast `obj as unknown as ReportDefinition`. Malformed or
adversarial JSON entered the store and caused silent runtime failures.

### Fix
New format validated via Zod schema; legacy format has structural guards:
```typescript
if (obj['$schema'] === SCHEMA_VERSION) {
  const result = ReportDefinitionSchema.safeParse(obj)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      ok: false,
      error: `Invalid report-definition/v1: ${first?.path.join('.')}: ${first?.message}`,
    }
  }
  return { ok: true, definition: ensurePageSections(result.data as ReportDefinition) }
}
```

This also prevents `dataSources[].fields` from containing prototype-pollution keys that
would bypass the `FORBIDDEN_KEYS` guard deeper in the stack.

---

## Issue 5: SSRF via html2canvas

### Problem
`exportUtils.ts` called html2canvas with `useCORS: true` and no URL allowlist.
Any image src URL was fetched during export, enabling SSRF (probing internal network
addresses) and same-site cookie leakage to external image servers.

### Fix
The `isSafeImageSrc` guard (Issue 2) is applied at render time before any element
reaches html2canvas. Only `https://` URLs and allowlisted `data:image/*` URIs can
be rendered — all others show a placeholder `<div>` and never reach the exporter.

---

## Issue 6: Missing Content-Security-Policy

### Problem
`index.html` had no CSP meta tag. Without CSP, a successful XSS has no additional
containment layer.

### Fix
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self';
           img-src 'self' https: data:image/*;
           style-src 'self' 'unsafe-inline';
           script-src 'self' 'unsafe-inline';" />
```

- `img-src` restricts SSRF to `https:` + safe `data:image/*`
- `default-src 'self'` blocks external script/font/frame injection
- `unsafe-inline` required for React inline styles and Vite HMR

---

## Defense-in-Depth Layers

```
User input / JSON import
        ↓
[1] importFromJSON — Zod schema validation (rejects malformed structure)
        ↓
[2] resolveField — FORBIDDEN_KEYS guard (blocks prototype traversal)
        ↓
[3] isSafeImageSrc at render — allowlist (blocks XSS in <img>)
        ↓
[4] html2canvas — only receives pre-validated DOM (no raw URLs)
        ↓
[5] CSP header — blocks exfiltration even if XSS occurs
```

---

## Prevention Checklist

- [ ] Every `<img src>` tag uses `isSafeImageSrc(src)` before rendering
- [ ] All JSON import paths use Zod schema validation, not `as unknown as T`
- [ ] `resolveField` / `resolveBinding` calls always go through the guarded helper
- [ ] CSP meta tag preserved in `index.html` — do not remove or weaken `img-src`
- [ ] New element types with image fields: add `isSafeImageSrc` check in Renderer
