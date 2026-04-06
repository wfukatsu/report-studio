---
status: pending
priority: p3
issue_id: "064"
tags: [ux-review, ux, icons, toolbar]
dependencies: []
---

# Export Button Icons

## Problem

PNG and PDF export buttons both use the same `Download` icon, differentiated only by tiny text labels. When scanning the toolbar quickly, they look like duplicate buttons.

## Findings

`src/components/toolbar/Toolbar.tsx:275-283` — both buttons use `<Download className="w-4 h-4" />` with "PNG" and "PDF" text labels; visually identical at a glance.

## Solutions

### A) Use distinct icons (Recommended)

Use `FileImage` icon for PNG export and `FileText` icon for PDF export (both available in lucide-react).

### B) Consolidate into a single "エクスポート" dropdown

Single dropdown with format options.

## Recommended

Option A — minimal change.

## Files

- `src/components/toolbar/Toolbar.tsx:275-283`
