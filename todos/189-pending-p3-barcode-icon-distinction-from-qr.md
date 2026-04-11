---
status: pending
priority: p3
issue_id: "189"
tags: [code-review, ui-ux, element-palette, icons]
dependencies: []
---

# バーコード要素アイコンが QR コードと同一で区別できない

## Problem Statement

要素パレットにおいて、QR コード要素とバーコード（CODE128等）要素が同じアイコン（`Rows3`）を使用しており、視覚的に区別できない。

## Findings

**File:** `src/components/sidebar/ElementPalette.tsx:115-123`

```tsx
{ type: 'barcode', label: 'QRコード', icon: QrCode, ... },   // QrCode アイコン ✓
{ type: 'barcode', label: 'バーコード', icon: Rows3, ... },   // Rows3 = 汎用アイコン ✗
```

`lucide-react` には `Barcode` アイコンが存在する。

Confirmed by: Sidebar UI/UX review (2026-04-11).

## Proposed Solution

```tsx
import { Barcode } from 'lucide-react'  // lucide-react に存在

{ type: 'barcode', label: 'バーコード', icon: Barcode, description: 'CODE128/CODE39/JAN13バーコードを表示', ... },
```

**Effort:** Tiny | **Risk:** None

## Acceptance Criteria

- [ ] バーコード要素に `Barcode` アイコンが使用されている
- [ ] QR コードアイコンと視覚的に区別できる

## Work Log

- 2026-04-11: Sidebar UI/UX レビューで発見。
