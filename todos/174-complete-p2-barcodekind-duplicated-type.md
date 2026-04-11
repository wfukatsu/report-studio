---
status: complete
priority: p2
issue_id: "174"
tags: [code-review, types, barcode]
dependencies: []
---

# BarcodeContent.tsx re-declares BarcodeKind locally instead of importing from @/types

## Problem Statement

`BarcodeContent.tsx` defines its own `type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13'` which duplicates the canonical type in `src/types/index.ts`. If a new barcode format is added to the canonical union, `BarcodeContent` will silently use the old union.

## Findings

**File:** `src/elements/_blocks/renderers/BarcodeContent.tsx:6`

```ts
type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13'  // ← duplicate
```

Should be:

```ts
import type { BarcodeKind } from '@/types'
```

Confirmed by: Kieran-TS (MEDIUM #5).

## Acceptance Criteria

- [ ] Local `BarcodeKind` type removed from `BarcodeContent.tsx`
- [ ] Imported from `@/types` instead

## Work Log

- 2026-04-11: Kieran-TS (MEDIUM #5). One-line fix.
