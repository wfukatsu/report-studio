---
status: pending
priority: p2
issue_id: "058"
tags: [ux-review, ux, master-layout, multi-page]
dependencies: []
---

# Master Header/Footer Workflow Missing

## Problem

`ReportDefinition` type supports `masterHeader`/`masterFooter` but there is no UI to create, edit, or assign them. The "H/F" toolbar button only controls section resize mode for existing header/footer sections. Multi-page business documents (請求書, 見積書) need consistent headers/footers across all pages.

## Findings

- `src/types/index.ts:474-477` — `masterHeader?: Section`, `masterFooter?: Section` on ReportDefinition
- `src/store/layoutSlice.ts` — `setMasterHeader`/`setMasterFooter` actions now exist (added in P1 fixes) but no UI surfaces them
- `src/components/toolbar/Toolbar.tsx:196-203` — H/F button toggles `headerEditMode` only

## Solutions

### A) Master header/footer settings UI

Add "マスターヘッダー/フッター設定" button or menu item that:
1. Creates a new blank Section if masterHeader doesn't exist
2. Assigns it via `setMasterHeader()`
3. Activates headerEditMode so user can edit it

### B) Visual representation on canvas

Show masterHeader/Footer as a special section at top/bottom of each page canvas with a "M" badge.

## Recommendation

**A + B** together.

## Files

- `src/components/toolbar/Toolbar.tsx:196-203`
- `src/store/layoutSlice.ts`
