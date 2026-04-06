---
title: Sidebar UI Reorganization — DataBinding Modal & Template Selection
problem_type: feature_implementation
component: Sidebar, DataBindingModal, TemplateSelectionModal, PageSettingsPanel, Toolbar
severity: p1
tags:
  - ui-reorganization
  - feature-implementation
  - databinding-modal
  - template-selection
  - sidebar-cleanup
  - accessibility
  - ux-improvement
  - zustand
  - jexl
date: 2026-04-06
related_plans:
  - docs/plans/2026-04-06-feat-sidebar-databinding-template-modal-plan.md
  - docs/plans/2026-04-06-feat-p1-expression-evaluation-plan.md
  - docs/plans/2026-04-06-feat-p2-validation-display-plan.md
related_brainstorms:
  - docs/brainstorms/2026-04-06-sidebar-cleanup-databinding-templates-brainstorm.md
resolved_todos:
  - 049 (sidebar tabs ARIA roles)
  - 056 (data-binding discoverability)
  - 061 (merge data-binding tabs)
  - 092 (default tab should be templates)
  - 104 (template modal backend integration)
  - 106 (dual template modal instances)
  - 115 (databinding modal ARIA roles)
---

## Background

The original V2 left sidebar contained both object-level editors (Elements, Layers) and
report-level configuration (Template, Data), conflating two different interaction patterns.
V1 had integrated data configuration, but V2 had fragmented `DataSourcePanel` and
`BindingPanel` without centralized access. Templates were only selectable at project
initialization with no way to change them mid-project.

## Before / After

| Aspect | Before | After |
|--------|--------|-------|
| **Data Config** | DataSourcePanel + BindingPanel (scattered in left sidebar) | DataBindingModal — 3-tab modal (DataSource / 式・計算 / Validation) |
| **Data Access** | Left sidebar tab (always visible) | Toolbar "Database" button (on-demand) |
| **Template Selection** | One-time at creation | Modal at creation + right sidebar "ページ設定" → "Change Template" |
| **Template Access** | Left sidebar tab (no change after creation) | Right sidebar "ページ設定" tab |
| **Validation UI** | None in V2 | ValidationTab with rule editor + pre-flight export checks |
| **Calculation UI** | None in V2 | CalculationTab with JEXL expression editor + test button |
| **Left Sidebar Tabs** | Elements, Layers, Pages, Template, Data | Elements, Layers, Pages |
| **Right Sidebar Tabs** | Properties, Versions | Properties, Versions, **ページ設定** |
| **Export Flow** | Direct | Pre-flight validation → confirm/block based on severity |

## Solution

### 1. DataBinding Modal (`src/components/modals/DataBindingModal.tsx`)

Fixed-center modal (75 vw × 80 vh) opened via toolbar "Database" button. Three tabs:

- **データソース**: Combines `DataSourcePanel` (JSON / form data definition) + `BindingPanel` (test-data preview)
- **式・計算**: Manages `CalculationRules` — JEXL expressions, type, error-handling mode
- **バリデーション**: Template-level validation rules with `error` / `warning` severity

```tsx
const TABS: { id: TabId; label: string }[] = [
  { id: 'datasource',   label: 'データソース' },
  { id: 'calculation',  label: '式・計算'      },
  { id: 'validation',   label: 'バリデーション' },
]
```

ARIA: `role="tablist"` on the tab bar, `role="tab"` + `aria-selected` on each tab,
`role="tabpanel"` on content — arrow-key navigation implemented.

### 2. TemplateSelectionModal (`src/components/modals/TemplateSelectionModal.tsx`)

Reusable modal for template selection at two entry points:

- **New report creation** — App-level "New" toolbar button
- **Mid-project change** — "Change Template…" button inside `PageSettingsPanel`

```tsx
// Entry point 1: toolbar New button
const handleNew = () => onRequestTemplateModal?.()

// Entry point 2: page settings
<PageSettingsPanel onTemplateChange={() => setShowTemplateModal(true)} />

// Selection applies the definition
onSelect={(definition: ReportDefinition) => handleTemplateChange(definition)}
```

Confirmation dialog is shown when `historyIndex > 0` (unsaved changes).
Backend templates are fetched lazily (not on mount) to avoid blocking modal open.

### 3. Right Sidebar "ページ設定" Tab (`src/components/sidebar/PageSettingsPanel.tsx`)

Extracted from `PropertiesPanel`. Controls:

- Paper size (A4, A3, Letter, …)
- Orientation (Portrait / Landscape)
- Margins (mm, all sides)
- Background color
- **"Change Template…"** → reopens `TemplateSelectionModal`

```tsx
const RIGHT_TABS = [
  { id: 'properties', label: 'プロパティ' },
  { id: 'versions',   label: 'バージョン'  },
  { id: 'page',       label: 'ページ設定'  }, // NEW
]
```

### 4. JEXL Expression Engine (`src/lib/jexlEngine.ts`)

Sandboxed expression evaluator with 500 ms timeout and V1-compatible helpers
(`sum()`, `count()`, `round()`). Expressions run in an isolated JEXL context with
no access to the JS runtime, mirroring the V1 security model.

The engine wraps `jexl.evaluate()` (the sandboxed JEXL API — not the JS `eval` builtin)
in a `withTimeout()` helper to prevent hanging on infinite loops.

### 5. Validation Runner (`src/lib/validationRunner.ts`)

Pre-flight validation before export. Runs up to 16 rules concurrently:

```ts
export interface ValidationResult {
  violations: ValidationViolation[]
  hasErrors: boolean
  hasWarnings: boolean
  evaluationErrors: Array<{ ruleId: string; error: string }>
}
```

`error` violations block export; `warning` violations allow export with a user confirmation.

### 6. Template Utilities (`src/lib/templateUtils.ts`)

```ts
applyTemplate(template: Template): ReportDefinition
createBlankDefinition(): ReportDefinition
loadBuiltinTemplate(id: string): ReportDefinition | null
```

## Key Files

| File | Role |
|------|------|
| `src/components/modals/DataBindingModal.tsx` | 3-tab data config modal |
| `src/components/modals/TemplateSelectionModal.tsx` | Template picker (reusable) |
| `src/components/modals/CalculationTab.tsx` | JEXL calculation rule editor |
| `src/components/modals/ValidationTab.tsx` | Validation rule editor |
| `src/components/sidebar/PageSettingsPanel.tsx` | Page settings + template change |
| `src/components/toolbar/Toolbar.tsx` | Data button + export pre-flight |
| `src/lib/jexlEngine.ts` | JEXL evaluation with timeout |
| `src/lib/validationRunner.ts` | Concurrent pre-flight runner |
| `src/lib/templateUtils.ts` | Template application helpers |
| `src/App.tsx` | Modal management, sidebar tab structure |

## Common Pitfalls

### Uncontrolled local state in moved components
`DataSourcePanel` carries its own `jsonText` / `formRows` / `error` state.
When moved into a modal (which unmounts on close), that state resets on every open.
**Fix:** persist in Zustand or localStorage if continuity matters.

### Store slice coupling
The store has 5 slices (`layout`, `history`, `ui`, `rules`, `computed`).
History snapshots only capture `pages` — not `dataSources` or `calculationRules`.
Moving UI that touches multiple slices can expose this implicitly.

### Modal state separate from element selection
`DataBindingModal` operates on `definition.dataSources` globally.
If no element context is passed, which element is being bound becomes ambiguous.
Consider storing `dataBindingElementId` in the `ui` slice alongside modal open state.

### Async operations without cleanup
`TemplateSelectionModal` async handlers (`handleFetchBackend`) update local state.
Without an `AbortController` / mounted-ref check, setState is called on unmounted
components after modal close.

## Prevention Strategies

### Move modal visibility + context to the store

```ts
// uiSlice.ts
openDataBindingModal: (elementId: string) => set((s) => {
  s.dataBindingModalOpen = true
  s.dataBindingElementId = elementId
}),
closeDataBindingModal: () => set((s) => {
  s.dataBindingModalOpen = false
  s.dataBindingElementId = null
}),
setActiveDataBindingTab: (tab: TabId) => set((s) => {
  s.activeDataBindingTab = tab
}),
```

Benefits: tab position persists across close/reopen; state survives remount; testable.

### Async cleanup pattern

```ts
export function useAsyncModal() {
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const withAbort = async <T,>(
    fn: (signal: AbortSignal) => Promise<T>,
    onSuccess?: (result: T) => void,
  ) => {
    const controller = new AbortController()
    try {
      const result = await fn(controller.signal)
      if (mountedRef.current) onSuccess?.(result)
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) console.error(e)
    }
  }
  return { withAbort }
}
```

### Shallow selectors for modal state

```ts
const { dataBindingModalOpen, dataBindingElementId } = useReportStore(
  useShallow((s) => ({
    dataBindingModalOpen: s.dataBindingModalOpen,
    dataBindingElementId: s.dataBindingElementId,
  }))
)
```

## Recommended Test Cases

```ts
// State persistence across open/close
it('preserves active tab when modal closes and reopens', async () => {
  store.openDataBindingModal('elem-1')
  store.setActiveDataBindingTab('calculation')
  store.closeDataBindingModal()
  store.openDataBindingModal('elem-1')
  expect(store.activeDataBindingTab).toBe('calculation')
})

// Element context integrity
it('clears modal state when bound element is deleted', () => {
  store.openDataBindingModal(elemId)
  store.removeElement(pageId, elemId)
  expect(store.dataBindingModalOpen).toBe(false)
})

// Async safety
it('does not setState after modal unmount', async () => {
  const { unmount } = render(<TemplateSelectionModal open {...props} />)
  userEvent.click(screen.getByLabelText('一覧を取得'))
  unmount()
  await waitFor(() => {}) // Must not throw React setState warning
})
```

## PR Checklist for Future Component Moves

- [ ] Modal visibility and element context stored in Zustand (not `useState`)
- [ ] Tab positions persist across modal close/reopen (store or localStorage)
- [ ] Async operations use `AbortController` + mounted ref
- [ ] Tests cover component in old location AND new location
- [ ] No state duplicated between parent and child
- [ ] `useShallow` applied on multi-field store selectors
- [ ] ARIA roles: `tablist`, `tab` + `aria-selected`, `tabpanel` with arrow-key navigation
