---
status: pending
priority: p3
issue_id: "065"
tags: [ux-review, ux, 帳票, multi-page]
dependencies: []
---

# Page Number System Variables

## Problem

No built-in system variables for page number, total pages, or print date. Multi-page Japanese business documents (請求書, 見積書, 納品書) almost always display "ページ X / Y" in the footer.

## Findings

`src/types/index.ts:88-93` — TemplateVariable exists but has no system/built-in variables; text elements support `{{fieldKey}}` interpolation via `src/lib/dataBinding.ts` but no special handling for system variables; `interpolate()` function resolves from data only.

## Solutions

### A) Add system variables resolved at preview/export time (Recommended)

- `{{$page}}` — current page number (1-based)
- `{{$totalPages}}` — total page count
- `{{$printDate}}` — current date formatted as YYYY年MM月DD日

Resolve in `interpolate()` before field lookup: check for `$` prefix.

### B) Add as special TemplateVariable type

With `isSystem: true`.

## Recommended

Option A — simpler to implement.

## Files

- `src/lib/dataBinding.ts`
- `src/lib/exportUtils.ts`
