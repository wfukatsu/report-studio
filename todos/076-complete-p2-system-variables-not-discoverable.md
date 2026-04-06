---
status: complete
priority: p2
issue_id: "076"
tags: [ux-review, ux, discoverability, 帳票]
dependencies: []
---

## Problem

System variables (`{{$page}}`, `{{$totalPages}}`, `{{$printDate}}`) are implemented in `dataBinding.ts` but invisible from the UI. A 帳票作成者 has no way to discover or use them without reading the source code.

## Findings

- `src/lib/dataBinding.ts:28-35` — system vars defined
- No UI component shows them
- DataSourcePanel, BindingPanel, and text PropertiesPanel all lack mention of system variables

## Solutions

### A) Add a "システム変数" section in BindingPanel or DataSourcePanel
Show clickable chips: `{{$page}}`, `{{$totalPages}}`, `{{$printDate}}` — clicking inserts into the content field of selected text element.

### B) Add info icon with tooltip in text/label PropertiesPanel content field
Show available system variables in a tooltip.

**Recommended: B** for minimal change, **A** for better discoverability.

## Files

- `src/components/sidebar/DataSourcePanel.tsx` or `src/components/sidebar/BindingPanel.tsx`
- `src/elements/text/PropertiesPanel.tsx`

## Acceptance Criteria

- [ ] System variables are listed in at least one UI location
- [ ] User can see `{{$page}}`, `{{$totalPages}}`, `{{$printDate}}` without reading source code
