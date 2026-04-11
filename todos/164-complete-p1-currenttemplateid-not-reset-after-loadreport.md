---
status: complete
priority: p1
issue_id: "164"
tags: [code-review, correctness, state-management, toolbar, template]
dependencies: []
---

# handleUpdateFromBuiltin: currentTemplateId not reset — silent server overwrite on next save

## Problem Statement

`handleUpdateFromBuiltin` calls `loadReport(definition)` which replaces `s.definition` in the store but does NOT reset `currentTemplateId`. If the user then presses Save, `handleSave` reads the stale `currentTemplateId` and overwrites the server template record with the freshly-generated built-in definition — stripping all user customisations from the server without warning. The user gets no indication that their server copy was replaced.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:312–321` — `handleUpdateFromBuiltin`

`loadReport` in `src/store/layoutSlice.ts` only writes `s.definition`, `s.selection`, `s.history`, `s.historyIndex`, and `s.testData`. It never resets `currentTemplateId`.

Confirmed by: Architecture reviewer (HIGH).

## Proposed Solutions

### Option A: Reset currentTemplateId after loadReport (Recommended)

```ts
const handleUpdateFromBuiltin = () => {
  if (!sourceTemplateId) return
  const definition = loadBuiltinTemplate(sourceTemplateId)
  if (!definition) {
    setExportError('ビルトインテンプレートが見つかりませんでした')
    return
  }
  loadReport(definition)
  setCurrentTemplateId(null)          // ← force "save as new" flow
  setShowUpdateFromBuiltinConfirm(false)
}
```

The user will be prompted to save as a new template rather than silently overwriting their existing one.

**Effort:** Small | **Risk:** Low

### Option B: Add a warning to the confirm dialog

Warn that the current server record will be overwritten. Does not fix the underlying issue.

**Effort:** Small | **Risk:** Medium (user may not understand the implication)

## Recommended Action

Option A. Reset `currentTemplateId` so the next save triggers the new-template flow, not a silent overwrite.

## Technical Details

- **Files:** `src/components/toolbar/Toolbar.tsx:312–321`, `src/store/uiSlice.ts` (setCurrentTemplateId)

## Acceptance Criteria

- [ ] `setCurrentTemplateId(null)` called after `loadReport(definition)` in `handleUpdateFromBuiltin`
- [ ] After refreshing from built-in, Save button creates a new template rather than overwriting the original
- [ ] Test: refresh → save → verify server call uses `createReport` not `saveReport`

## Work Log

- 2026-04-11: Flagged by Architecture reviewer (HIGH). Silent data corruption risk.
