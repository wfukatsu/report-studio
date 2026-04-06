---
status: pending
priority: p1
issue_id: "048"
tags: [ux-review, ux, data-safety]
dependencies: []
---

## Problem Statement

Clicking any template in the TemplateGallery immediately replaces the entire current report with no warning. Combined with the absence of save functionality (see todo 046), a single accidental click destroys all current work irreversibly.

## Findings

- `src/components/templates/TemplateGallery.tsx:10-26`: `handleSelect` calls `loadReport(template)` directly with no confirmation
- No dirty-state check before replacement
- Undo does not work across `loadReport` calls (it resets history)
- Both ビジネスユーザー and 帳票作成者 reviewers flagged this as a critical data loss risk

## Proposed Solutions

**A) Confirmation dialog (Recommended)**
```ts
const handleSelect = (template: Template) => {
  if (historyIndex > 0) {
    if (!confirm('現在の編集内容は失われます。テンプレートを読み込みますか？')) return
  }
  loadReport(template)
  onClose?.()
}
```
Use a proper modal (shadcn/ui `AlertDialog`) rather than `window.confirm`.

**B) "New from template" copies to new document**
Instead of replacing in place, open template in a new browser tab. Requires file-based save flow (todo 046).

## Recommended Action

Apply solution A — add AlertDialog confirmation when `historyIndex > 0` (dirty state).

## Technical Details

- **File:** `src/components/templates/TemplateGallery.tsx:10-26`
- Use shadcn/ui `AlertDialog` component for the confirmation UI
- Only show confirmation if there are unsaved changes (`historyIndex > 0`)

## Acceptance Criteria

- [ ] Clicking a template when `historyIndex > 0` shows a confirmation dialog
- [ ] User can cancel and keep current work
- [ ] Confirmation dialog uses Japanese text
- [ ] No confirmation shown for a blank/untouched canvas (`historyIndex === 0`)

## Work Log

- 2026-04-06: Identified by ビジネスユーザー and 帳票作成者 agents in UI/UX review
