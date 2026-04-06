---
title: Component Quality — Error Boundaries, Type Safety, ARIA & Code Cleanup
problem_type: logic_error
component: layoutSlice, LayersPanel, Toolbar, CanvasElement, ElementErrorBoundary, DataSourcePanel, TableRenderer
severity: p2
tags:
  - error-boundary
  - type-safety
  - runtime-guard
  - aria
  - dropdown
  - history-timer
  - dead-code
  - react-key
  - performance
date: 2026-04-06
resolved_todos:
  - 012 (unsafe string matrix cast)
  - 016 (element factories not exported)
  - 021 (bring forward dead code — deferred)
  - 025 (array index keys table)
  - 026 (undo scope pages only — documented)
  - 037 (history timer module singleton)
  - 041 (LayersPanel O(n²) includes)
  - 057 (React error boundary missing)
  - 074 (toolbar dropdowns close and ARIA)
  - 079 (delete toast ARIA and invalid aria-selected)
  - 085 (element error boundary no recovery)
  - 098 (FormRows array index key)
  - 100 (extract dropdown dismiss hook)
  - 043 (dead code cleanup)
  - 028 (tokens.ts dead code — pending)
---

## Issue 1: Unsafe Type Cast for Table Data

### Problem
`ElementRenderer` cast `data[element.dataBinding]` directly to `string[][]` with no
runtime validation. If the data source contained a non-array value, the renderer
would crash or produce garbage output silently.

### Fix — `isStringMatrix` type guard
```typescript
// src/elements/table/Renderer.tsx
function isStringMatrix(value: unknown): value is string[][] {
  return (
    Array.isArray(value) &&
    value.every(
      (row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
    )
  )
}

// Usage — safe fallback to static data if guard fails:
const resolvedData: string[][] = isStringMatrix(rawData) ? rawData : el.data
```

**Rule:** Never use `as T` to cast data from external sources (store, JSON, API).
Always write a runtime type guard that validates the shape.

---

## Issue 2: Element Factories Not Exported

### Problem
Default element templates were embedded in `ElementPalette.tsx` as `PALETTE_ITEMS`.
Programmatic callers (tests, agents, import utilities) had to duplicate the defaults
or reach into the component internals.

### Fix — `src/lib/elementFactories.ts`
```typescript
export function createTextElement(overrides?: Partial<ReportElement>): ReportElement {
  return {
    id: uuidv4(),
    type: 'text',
    position: { x: 13, y: 13 },
    width: 60, height: 10,
    content: 'テキスト',
    style: defaultTextStyle(),
    ...overrides,
  } as ReportElement
}

// 15+ factory functions for all element types:
// createImageElement, createTableElement, createBarcodeElement, ...
```

`ElementPalette` was refactored to import from `elementFactories` — single source of truth.

---

## Issue 3: History Timer as Module Singleton

### Problem
`_historyTimer` was declared at module scope in `layoutSlice.ts`. With multiple store
instances (e.g., in tests), all instances shared the same timer, causing race conditions
and flaky test behavior — a pending timer from one test leaked into the next.

### Fix — Timer scoped to slice closure
```typescript
// src/store/layoutSlice.ts
export const createLayoutSlice: StateCreator<...> = (set, get) => {
  let _historyTimer: ReturnType<typeof setTimeout> | null = null  // closure-scoped

  return {
    loadReport: (definition) => {
      if (_historyTimer) { clearTimeout(_historyTimer); _historyTimer = null }
      // ...
    },
    newReport: () => {
      if (_historyTimer) { clearTimeout(_historyTimer); _historyTimer = null }
      // ...
    },
    updateElement: (pageId, elementId, patch) => {
      set((s) => { /* apply patch */ })
      if (_historyTimer) clearTimeout(_historyTimer)
      _historyTimer = setTimeout(() => {
        _historyTimer = null
        get().pushHistory()
      }, 300)
    },
  }
}
```

`loadReport` and `newReport` explicitly clear the timer to prevent a pending debounce
from a previous edit from pushing history after a document load.

---

## Issue 4: LayersPanel O(n²) Selection Lookup

### Problem
LayersPanel called `selectedIds.includes(el.id)` inside the render loop — O(n) per
element, O(n²) total. With 100 elements and multi-select, this ran up to 10,000
comparisons per render.

### Fix — Convert to `Set` with `useMemo`
```tsx
// src/components/sidebar/LayersPanel.tsx
const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

// In render loop:
const isSelected = selectedIdSet.has(el.id)   // O(1) instead of O(n)
```

---

## Issue 5: No React Error Boundaries

### Problem
No `ErrorBoundary` components existed. Any element renderer throwing (bad data,
malformed barcode, chart type error) crashed the entire app to a white screen with
no recovery path.

### Fix — `ElementErrorBoundary` per canvas element
```tsx
// src/components/canvas/ElementErrorBoundary.tsx
class ElementErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-1 text-xs text-destructive p-1 border border-destructive/30 rounded">
          <AlertTriangle className="w-3 h-3" />
          <span>⚠ 表示エラー</span>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            再試行
          </button>
          <button onClick={() => this.props.onDelete(this.props.elementId)}>
            削除
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

Wrapped in `CanvasElement`:
```tsx
<ElementErrorBoundary elementId={element.id} onDelete={handleDelete}>
  <ElementRenderer element={element} data={mergedData} />
</ElementErrorBoundary>
```

Recovery options: **再試行** resets the error boundary (retries render);
**削除** removes the broken element from the store.

---

## Issue 6: Toolbar Dropdowns Didn't Close After Selection + Missing ARIA

### Problem
Three dropdowns (zoom, align, z-order) had two issues:
1. Selecting a menu item left the dropdown open
2. Trigger buttons lacked `aria-expanded`/`aria-haspopup`; menus lacked `role="menu"`

### Fix — Extracted `useDropdownDismiss` hook
```typescript
// src/components/toolbar/Toolbar.tsx
function useDropdownDismiss(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        onClose()
        return
      }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [isOpen, onClose, ref])
}

// Usage (replaces 3 × ~16 lines of duplicated useEffect):
useDropdownDismiss(zoomMenuRef,   showZoomMenu,   closeZoomMenu)
useDropdownDismiss(alignMenuRef,  showAlignMenu,  closeAlignMenu)
useDropdownDismiss(zOrderMenuRef, showZOrderMenu, closeZOrderMenu)
```

ARIA on trigger buttons:
```tsx
<button
  aria-expanded={showAlignMenu}
  aria-haspopup="menu"
  // ...
>
```

ARIA on menus:
```tsx
<div role="menu">
  <button role="menuitem" onClick={() => { alignLeft(); closeAlignMenu() }}>
    左揃え
  </button>
</div>
```

Menu items now call `closeMenu()` inline so the dropdown closes on selection.

---

## Issue 7: Delete Toast Had No ARIA; CanvasElement Used Wrong ARIA Role

### Problem
1. The delete confirmation toast had no ARIA live region — screen readers couldn't announce deletions
2. `CanvasElement` used `aria-selected` on `role="button"` — `aria-selected` is only
   valid on `role="option"`, `"row"`, `"tab"`, etc.

### Fix
```tsx
// src/App.tsx — delete toast
<div role="status" aria-live="polite" aria-atomic="true">
  {deleteToast && (
    <div className="...">
      <span>{deleteToast.count}件の要素を削除しました</span>
      <button onClick={handleUndoDelete}>元に戻す</button>
    </div>
  )}
</div>
```

```tsx
// src/components/canvas/CanvasElement.tsx
<div
  role="button"
  aria-pressed={isSelected}    // correct for role="button" toggle state
  // aria-selected removed
>
```

---

## Issue 8: FormRows Used Array Index Keys

### Problem
`DataSourcePanel` form rows used `key={i}` (array index). When a middle row was
deleted, React reused the DOM nodes for the remaining rows, causing inputs to
temporarily show stale values until reconciliation completed.

### Fix — Stable `id` field on each row
```typescript
type FieldRow = { id: string; key: string; value: string }

// Creation:
const newRow = (): FieldRow => ({ id: uuidv4(), key: '', value: '' })
setFormRows([newRow()])

// Render:
{formRows.map((row) => (
  <div key={row.id} ...>    // stable identity survives deletions
    <input value={row.key} ... />
    <input value={row.value} ... />
  </div>
))}
```

---

## Issue 9: Dead Code Cleanup

### Items removed
- `src/elements/repeatingBand/PropertiesPanel.tsx` — `pageBreak` no-op input (renderer
  ignored the value; the control created false expectations)

### Items confirmed clean (no change needed)
- `src/store/layoutSlice.ts` — `produce` import: actively used by immer middleware
- `src/lib/sectionUtils.ts` — actively used by `setMasterHeader`/`setMasterFooter`
- `src/utils/printUtils.ts` — actively used by print workflow

### Deferred
- `src/lib/tokens.ts` — exports `tokens` constant with zero import sites. Safe to
  delete; awaiting confirmation that no external consumer exists.
- `bringForward` / `sendBackward` store actions — implemented but no UI surface.
  Decision pending: add toolbar buttons or remove.

---

## Issue 10: Undo Scope Documented

### Context
`HistoryEntry` in `historySlice.ts` stores only `pages: PageDef[]`. Changes to
`dataSources`, `calculationRules`, `validationRules`, and settings are **not** undoable.

This is an intentional design decision (not a bug), but was undocumented, creating
confusion during store slice work.

### Fix — Code comment added
```typescript
// src/store/historySlice.ts
// HistoryEntry intentionally stores only `pages`.
// dataSources, calculationRules, validationRules, and pageSettings are NOT part
// of undo history — they are treated as configuration, not editable content.
// If this scope changes in a future phase, update HistoryEntry and snapshotPages().
export interface HistoryEntry {
  pages: PageDef[]
}
```

---

## Prevention Checklist

- [ ] Data from store/API/JSON: use type guard function (`isXxx`) — never `as T`
- [ ] Element defaults: import from `src/lib/elementFactories.ts` — never duplicate
- [ ] Timer state in Zustand slices: closure-scoped, not module-scoped
- [ ] List selection lookups: `Set.has()` — not `Array.includes()` in render loops
- [ ] All element renderers wrapped in `ElementErrorBoundary` with retry + delete
- [ ] Dropdowns: use `useDropdownDismiss` hook; menu items call close after selection
- [ ] `role="menu"` on containers; `role="menuitem"` on items; `aria-expanded` on trigger
- [ ] `role="button"` toggle state: `aria-pressed` — not `aria-selected`
- [ ] Status/toast messages: `role="status"` + `aria-live="polite"` (or `"assertive"` for errors)
- [ ] Dynamic list keys: stable ID (uuid) — not array index
