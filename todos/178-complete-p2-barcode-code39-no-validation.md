---
status: complete
priority: p2
issue_id: "178"
tags: [code-review, barcode, robustness, validation]
dependencies: []
---

# Barcode renderer doesn't validate CODE39 character set — JsBarcode throws on invalid chars

## Problem Statement

CODE39 barcodes support only uppercase A–Z, 0–9, and specific special characters. `BarcodeContent.tsx` passes the resolved value directly to `ReactBarcode` without validation. If the value contains characters outside the CODE39 character set, JsBarcode throws a native `Error` that is not caught, crashing the element renderer.

## Findings

**File:** `src/elements/_blocks/renderers/BarcodeContent.tsx`

`ReactBarcode` with `format="CODE39"` will throw on characters like lowercase letters, Japanese, or most punctuation.

Confirmed by: Security reviewer (Medium robustness).

## Proposed Solutions

1. Validate the barcode value before rendering; show an error placeholder if invalid
2. Wrap the barcode in a try/catch or React error boundary
3. For CODE39, auto-uppercase the value (common convention)

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] Invalid CODE39 characters show a visible error placeholder instead of crashing
- [ ] OR: the value is validated before passing to ReactBarcode with clear error messaging

## Work Log

- 2026-04-11: Security (Medium robustness). JsBarcode throws on invalid char.
