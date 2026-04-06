---
status: complete
priority: p1
issue_id: "069"
tags: [ux-review, ux, data-safety]
dependencies: []
---

## Problem

The "開く" button opens a file dialog directly with no check for unsaved changes. If historyIndex > 0, clicking "開く" and selecting a file silently destroys all current work. The template gallery has a confirmation dialog (todo 048, now implemented) but the file open flow does not, creating an inconsistency.

## Findings

- `src/components/toolbar/Toolbar.tsx:101` — `handleOpen` calls `fileInputRef.current?.click()` immediately
- `src/components/toolbar/Toolbar.tsx:103-120` — `handleFileChange` calls `importReportJSON` with no guard
- `src/App.tsx:53-62` — `beforeunload` only fires on tab close, not on in-app navigation

## Solutions

### A) Check historyIndex before opening
Insert `if (historyIndex > 0 && !confirm('未保存の変更があります。破棄してファイルを開きますか？')) return` in `handleOpen` before `fileInputRef.current?.click()`.

### B) Use the same modal component used in TemplateGallery (Recommended)
Same guard as A but using the shared confirmation modal component already built for the template gallery — consistent UX across the app.

**Recommended: B** — consistent with template gallery confirmation.

## Files

- `src/components/toolbar/Toolbar.tsx:101`

## Acceptance Criteria

- [ ] Opening a file when historyIndex > 0 shows a confirmation dialog
- [ ] User can cancel and keep current work
