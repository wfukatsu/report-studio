---
status: complete
priority: p1
issue_id: "046"
tags: [ux-review, ux, workflow]
dependencies: []
---

## Problem Statement

There is no way to save the current report design or load a previously saved one. The entire state is in-memory only. Closing or refreshing the browser tab destroys all work. Export to PNG/PDF outputs the rendered result but does not preserve the editable template.

## Findings

- `src/components/toolbar/Toolbar.tsx:58-76`: only PDF/PNG export exists — no JSON save/load
- No `beforeunload` warning when leaving with unsaved changes
- `src/components/templates/TemplateGallery.tsx:10-26`: `handleSelect` immediately calls `loadReport()` with no prior save prompt
- `src/store/reportStore.ts`: `importFromJSON`/`exportToJSON` utilities exist in `exportUtils.ts` but are not wired to any toolbar action
- Multiple reviewers (帳票作成者, ビジネスユーザー) flagged this as the single biggest blocker

## Proposed Solutions

**A) File-based save/load (Recommended)**
- Add "保存" button → calls `exportToJSON()` → triggers browser download as `.rds.json`
- Add "開く" button → triggers file picker → reads file → calls `importFromJSON()` → `loadReport()`
- Add `window.beforeunload` warning when `historyIndex > 0` (dirty state)

**B) localStorage auto-save**
- Auto-save to `localStorage` on every store mutation (debounced 1s)
- Show "自動保存済み HH:MM" indicator near the document name
- On app load, offer to restore from localStorage if a save exists

**C) Both A and B together**
- File-based for explicit save/share, localStorage for crash recovery

## Recommended Action

Apply both A and B. File-based export/import is the primary save mechanism; localStorage is a safety net.

## Technical Details

- **Files:** `src/components/toolbar/Toolbar.tsx`, `src/lib/exportUtils.ts` (exportToJSON already exists), `src/lib/migration.ts` (importFromJSON already exists)
- Add import/export buttons to toolbar between undo/redo and copy/paste groups
- Wire the beforeunload warning to `historyIndex > 0`

## Acceptance Criteria

- [ ] "保存" button exports `ReportDefinition` as `.rds.json` file
- [ ] "開く" button opens file picker and loads `.rds.json`
- [ ] `beforeunload` warning fires when there are unsaved changes
- [ ] Auto-save to localStorage (debounced) with visible "自動保存済み" indicator

## Work Log

- 2026-04-06: Identified by 帳票作成者, ビジネスユーザー, UX designer agents in UI/UX review
