---
status: complete
priority: p1
issue_id: "106"
tags: [code-review, architecture, ux]
dependencies: []
---

## Problem Statement

Both `App.tsx` and `Toolbar.tsx` independently render their own `TemplateSelectionModal` instances with separate boolean state. This means two modal instances are in the DOM simultaneously, with different `onSelect` callbacks — one with an unsaved-changes guard (Toolbar) and one without (App). This pattern will compound as more triggers are added.

## Findings

**File 1:** `src/App.tsx:36, 299–305`
```typescript
const [showTemplateModal, setShowTemplateModal] = useState(false)
// ...
<TemplateSelectionModal
  open={showTemplateModal}
  onClose={() => setShowTemplateModal(false)}
  onSelect={handleTemplateChange}  // no unsaved-changes guard
  title="テンプレートを変更"
  confirmLabel="変更"
/>
```

**File 2:** `src/components/toolbar/Toolbar.tsx:107, 654–662`
```typescript
const [showTemplateModal, setShowTemplateModal] = useState(false)
// ...
<TemplateSelectionModal
  open={showTemplateModal}
  onClose={() => setShowTemplateModal(false)}
  onSelect={(definition) => {
    if (hasUnsavedChanges && !confirm('...')) return  // guard only here
    loadReport(definition)
  }}
/>
```

**Problems:**

1. **Inconsistent behavior**: Toolbar's modal guards unsaved changes; App.tsx's modal does not. Same modal, different behavior.

2. **Two DOM instances**: Both modals are always rendered (with `if (!open) return null` inside the component). Two instances of the same component share no state.

3. **Fragile pattern**: A third trigger (e.g., "変更" in a top menu) would create a third instance. Each would have its own behavior.

## Proposed Solutions

**A) Lift modal state to App.tsx with a single onOpenTemplateModal callback (Recommended, Medium effort)**

Move all template modal state to `App.tsx`. Pass `onRequestTemplateModal` as a prop or context down to `Toolbar`. Render the single `TemplateSelectionModal` instance in `App.tsx` with the shared `onSelect` handler (that includes the unsaved-changes guard).

```typescript
// App.tsx — single modal, single onSelect with guard
const handleTemplateSelect = (definition: ReportDefinition) => {
  if (historyIndex > 0 && !confirm('未保存の変更があります。...')) return
  loadReport(definition)
  setShowTemplateModal(false)
}

// Toolbar.tsx — no modal state, just trigger
<ToolbarButton onClick={onRequestTemplateModal}>新規作成</ToolbarButton>
```

**B) Context / minimal store slice for modal visibility (Scalable)**
Add modal open state to a lightweight UI context (not full Zustand). Toolbar reads from context to trigger open; App renders all modals. More setup but better for future modals.

**C) Keep dual instances, add unsaved-changes guard to App.tsx's onSelect (Quick patch)**
Low-effort fix that addresses the inconsistency without refactoring. Does not fix the two-instance problem but resolves the behavioral divergence.

## Recommended Action

Option C as immediate fix (add guard to App.tsx `handleTemplateChange`), then Option A as follow-up refactor when time permits.

## Technical Details

- **Affected files**: `src/App.tsx`, `src/components/toolbar/Toolbar.tsx`
- The `handleTemplateChange` in App.tsx currently calls `loadReport(definition)` with no unsaved-changes check (line 62–65)

## Acceptance Criteria

- [ ] Both trigger points (toolbar 新規作成 and page-settings テンプレート変更) show the unsaved-changes confirmation when `historyIndex > 0`
- [ ] Ideally only one `TemplateSelectionModal` instance is in the DOM at any time
- [ ] Behavior is identical regardless of which trigger opens the modal

## Work Log

- 2026-04-06: Identified by Architecture reviewer (HIGH)
