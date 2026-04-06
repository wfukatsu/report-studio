---
status: complete
priority: p1
issue_id: "104"
tags: [code-review, architecture, data-integrity]
dependencies: []
---

## Problem Statement

`TemplateSelectionModal.handleLoadBackend` completely bypasses the modal's `onSelect` contract and silently swallows errors. Backend template loading takes a different code path than builtin template selection, meaning the unsaved-changes confirmation guard in Toolbar.tsx is skipped entirely for backend templates.

## Findings

**File:** `src/components/modals/TemplateSelectionModal.tsx:51–59`

```typescript
const handleLoadBackend = async (id: string) => {
  if (loadingId) return
  setLoadingId(id)
  try {
    await loadFromBackend(id)  // directly mutates store — bypasses onSelect
    onClose()                   // closes modal without calling onSelect
  } finally {
    setLoadingId(null)
  }
}
```

**Three problems:**

1. **Contract bypass**: The `onSelect: (definition: ReportDefinition) => void` prop is the modal's declared output contract. For builtin templates, this is called correctly. For backend templates, it is completely skipped — the modal directly calls `loadFromBackend()` which mutates the store as a side effect, then calls `onClose()` without invoking `onSelect`.

2. **Unsaved-changes guard skipped**: `Toolbar.tsx` wires `onSelect` with an `if (hasUnsavedChanges && !confirm(...)) return` guard. This guard is entirely bypassed for backend templates — a user who picks a backend template can overwrite unsaved work with no confirmation.

3. **Silent error swallow**: No `catch` block. If `loadFromBackend` throws (network failure, 404, Zod parse error), the error is lost and the user sees nothing — just a spinner that stops.

## Proposed Solutions

**A) Fetch-then-delegate (Recommended, Small effort)**
Refactor `loadFromBackend` in `reportApi.ts` to return the parsed `ReportDefinition` instead of committing it to the store directly. Then `handleLoadBackend` calls `onSelect(definition)` consistently with the builtin path.

```typescript
// reportApi.ts — split loadFromBackend into fetch + store commit
export async function fetchBackendReport(id: string): Promise<ReportDefinition> {
  // fetch, parse, validate — return def without touching store
}

// TemplateSelectionModal.tsx
const handleLoadBackend = async (id: string) => {
  if (loadingId) return
  setLoadingId(id)
  setBackendLoadError(null)
  try {
    const definition = await fetchBackendReport(id)
    onSelect(definition)  // consistent with builtin path
    onClose()
  } catch (err) {
    setBackendLoadState('error')
    setBackendLoadError('テンプレートの読み込みに失敗しました')
  } finally {
    setLoadingId(null)
  }
}
```

**B) Wrap loadFromBackend with guard (Quick patch, Medium risk)**
Keep `loadFromBackend` as-is but add the unsaved-changes guard directly in `handleLoadBackend`. Less clean but avoids the `reportApi.ts` refactor.

**C) Add a catch only (Minimal fix, doesn't fix contract)**
Add a catch block to show an error message. Does not fix the `onSelect` bypass or the unsaved-changes guard.

## Recommended Action

Option A — split `loadFromBackend` into fetch-and-return so `onSelect` is always the commit path.

## Technical Details

- **Affected files**: `src/components/modals/TemplateSelectionModal.tsx`, `src/api/reportApi.ts`
- `loadFromBackend` in `reportApi.ts` currently calls `useReportStore.getState().loadReport(raw)` directly (line ~220) — this is the coupling to break

## Acceptance Criteria

- [ ] Selecting a backend template invokes `onSelect(definition)` consistently with builtin templates
- [ ] The unsaved-changes confirmation in `Toolbar.tsx` fires for backend templates
- [ ] A network failure loading a backend template shows an error message to the user
- [ ] `App.tsx`'s `handleTemplateChange` is called for all template sources

## Work Log

- 2026-04-06: Identified by TypeScript reviewer (CRITICAL) and Architecture reviewer (HIGH)
