---
status: pending
priority: p1
issue_id: "047"
tags: [ux-review, ux, i18n, consistency]
dependencies: []
---

## Problem Statement

The app targets Japanese users but contains numerous English labels throughout the UI. This creates a jarring language inconsistency that signals an unfinished product and confuses non-English-speaking users.

## Findings

English strings found in production UI:
- `src/components/sidebar/DataSourcePanel.tsx:31` — "Data Source" heading
- `src/components/sidebar/DataSourcePanel.tsx:50` — "Paste JSON data:"
- `src/components/sidebar/DataSourcePanel.tsx:63` — "Apply Data" button
- `src/components/sidebar/DataSourcePanel.tsx:43` — "Clear" button
- `src/components/templates/TemplateGallery.tsx:33` — "Templates" heading
- `src/components/templates/TemplateGallery.tsx:43` — "1 page · A4" format string
- `src/components/toolbar/Toolbar.tsx:229` — "Fit Page" zoom preset
- `src/components/toolbar/Toolbar.tsx:103-283` — All tooltip `title` attributes in English: "Undo (⌘Z)", "Redo (⌘⇧Z)", "Copy (⌘C)", "Cut (⌘X)", "Paste (⌘V)", "Bring to Front", "Bring Forward", "Send Backward", "Send to Back", "Align Left" ... "Export current page as PNG" etc.
- `src/components/toolbar/Toolbar.tsx:275` — "Export current page as PNG" tooltip
- `src/components/toolbar/Toolbar.tsx:280` — "Export all pages as PDF" tooltip

## Proposed Solutions

**A) Direct string replacement (Recommended)**
Replace all English strings with Japanese equivalents:
- "Data Source" → "データソース"
- "Paste JSON data:" → "JSONデータを貼り付け:"
- "Apply Data" → "データを適用"
- "Clear" → "クリア"
- "Templates" → "テンプレート"
- "1 page · A4" → "1ページ · A4"
- "Fit Page" → "ページに合わせる"
- All toolbar tooltip titles → Japanese with shortcut hints

**B) i18n library (overkill for current scope)**
Add `react-i18next` or similar. Not recommended until multi-language support is required.

## Recommended Action

Apply solution A — direct string replacement across all affected files.

## Technical Details

- **Files:** `src/components/sidebar/DataSourcePanel.tsx`, `src/components/templates/TemplateGallery.tsx`, `src/components/toolbar/Toolbar.tsx`

## Acceptance Criteria

- [ ] Zero English user-facing strings in DataSourcePanel
- [ ] Zero English user-facing strings in TemplateGallery
- [ ] All toolbar `title` attributes are in Japanese
- [ ] "Fit Page" → "ページに合わせる"

## Work Log

- 2026-04-06: Identified by UX designer, ビジネスユーザー, 帳票作成者 agents in UI/UX review
