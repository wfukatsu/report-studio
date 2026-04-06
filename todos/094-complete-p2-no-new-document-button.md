---
status: complete
priority: p2
issue_id: "094"
tags: [code-review, ux, toolbar]
dependencies: []
---

# 094 — No "新規作成" (new document) button in toolbar

## Problem Statement

The toolbar has "開く" (open) and "保存" (save) but no "新規作成" (new) button. To start a fresh document, users must either load the blank template (not obvious) or reload the page (loses current work). Standard document editing apps (Word, Figma, etc.) always have a New button.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx` — no new/reset action

**Store:** `loadReport` action exists (used by TemplateGallery) — calling it with the blank template would create a new document.

## Proposed Solutions

### Option A: Add "新規作成" button that calls loadReport with blank template
```tsx
const handleNew = () => {
  if (historyIndex > 0 && !confirm('未保存の変更があります。新規ドキュメントを作成しますか？')) return
  loadReport(blankTemplate.definition)
}
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] "新規作成" button in toolbar (with file-plus icon)
- [ ] Warns before discarding unsaved changes
- [ ] Creates a fresh blank canvas

## Work Log
- 2026-04-06: Filed from third-round UX review
