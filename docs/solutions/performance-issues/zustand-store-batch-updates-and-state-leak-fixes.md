---
title: "LayersPanel Group Layers: 11-Issue Code Review Fixes"
category: "performance-issues"
subcategory: "state-management-and-ui-correctness"
tags:
  - react
  - typescript
  - zustand
  - immer
  - drag-select
  - layers-panel
  - group-layers
  - performance
  - validation
  - dead-code
  - input-sanitization
  - schema-validation
module: "LayersPanel / layoutSlice / ReportCanvas / useDragSelect"
symptom: "Group layer feature had orphaned group references after cut, N re-renders on drag-select, O(n²) grouping ops, overly wide patch types, missing cross-section validation, unbounded rename inputs, a noop context menu item, dead refs, YAGNI useMemo, per-frame getBoundingClientRect calls, and unvalidated groups on JSON import."
root_cause: "Feature implemented without enforcing group membership cleanup on element removal; no atomic selection action; Array.includes() inside immer Proxy causing O(n²); permissive patch type; no cross-section guard; no maxLength on inputs; stub menu handler; leftover dead code; passthrough Zod schema that skipped groups validation."
solution_summary: "Fixed cutElements/removeElements to reconcile page.groups; added setSelectionIds for atomic selection; converted to Set before immer; narrowed updateLayerGroup patch type; added cross-section guard; added maxLength={200} to rename inputs; removed noop menu item and dead code; cached getBoundingClientRect in containerRectRef; added LayerGroupSchema to PageDefSchema."
difficulty: hard
time_to_fix: "2-4 hours"
affects_versions: "current"
related_files:
  - src/store/layoutSlice.ts
  - src/store/types.ts
  - src/components/canvas/ReportCanvas.tsx
  - src/components/sidebar/LayersPanel.tsx
  - src/components/sidebar/LayerRow.tsx
  - src/components/sidebar/LayerGroupRow.tsx
  - src/hooks/useDragSelect.ts
  - src/lib/schemas/reportDefinition.ts
related_solutions: []
date_solved: "2026-04-06"
---

# LayersPanel Group Layer Support — Code Review Fixes (#117–#127)

11 issues found by multi-agent code review of the group layer feature. All resolved in one session.

---

## Root Cause Analysis

The feature was implemented with several recurring anti-patterns:

1. **Group membership not treated as a relational invariant** — removal paths didn't reconcile all structures holding element IDs.
2. **N store dispatches for bulk operations** — drag-select fired N `selectElement()` calls, causing N re-renders.
3. **Array lookups inside immer Proxy** — `Array.includes()` inside `set()` blocks caused O(n²) with Proxy overhead.
4. **Permissive patch type** — `Partial<Omit<LayerGroup, 'id'>>` allowed `elementIds` mutations via `updateLayerGroup`.
5. **No precondition validation** — `groupSelectedElements` accepted cross-section selections that produce invalid state.
6. **UI constraints not mirroring schema constraints** — rename inputs had no `maxLength`.
7. **Dead / YAGNI code** — noop menu item, unread ref, computed-then-voided useMemo.
8. **Layout thrashing** — `getBoundingClientRect()` called on every `onPointerMove` frame.
9. **Missing Zod coverage** — `PageDefSchema.groups` completely unvalidated on JSON import.

---

## Solution

### Fix #117 — cutElements group membership leak

`cutElements` removed elements from sections but left their IDs inside `page.groups[].elementIds`.

```typescript
// layoutSlice.ts
cutElements: (pageId, elementIds) => {
  const removedSet = new Set(elementIds)  // O(1) lookup
  set((s) => {
    for (const section of pg.sections ?? []) {
      section.elements = section.elements.filter((e) => !removedSet.has(e.id))
    }
    // Group cleanup — was missing before
    if (pg.groups) {
      pg.groups = pg.groups
        .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !removedSet.has(id)) }))
        .filter((g) => g.elementIds.length > 0)
    }
    s.selection.selectedElementIds = []
  })
}
```

**Rule:** Every removal path must reconcile *all* structures that reference elements by ID. `removeElements` already had this logic; `cutElements` did not.

---

### Fix #118 — N store dispatches on drag-select

`handleDragSelectIds` called `clearSelection()` + N×`selectElement(id, true)` = N+1 Zustand `set()` calls = N+1 re-renders.

```typescript
// types.ts — add to StoreState
setSelectionIds: (ids: string[]) => void

// layoutSlice.ts — after selectAll
setSelectionIds: (ids) => set((s) => {
  s.selection.selectedElementIds = ids
}),

// ReportCanvas.tsx — before
const handleDragSelectIds = useCallback((ids: string[]) => {
  clearSelection()
  ids.forEach((id) => selectElement(id, true))
}, [clearSelection, selectElement])

// After — 1 atomic update
const setSelectionIds = useReportStore((s) => s.setSelectionIds)
const handleDragSelectIds = useCallback((ids: string[]) => {
  setSelectionIds(ids)
}, [setSelectionIds])
```

---

### Fix #119 — O(n²) Array.includes inside immer Proxy

`groupSelectedElements` used `selectedIds.includes()` inside the `set()` block. Immer wraps state in a Proxy, adding overhead to every property access.

```typescript
// Before — selectedIds.includes() is O(n) per group element, inside Proxy
page.groups = page.groups
  .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !selectedIds.includes(id)) }))

// After — Set built outside immer, O(1) lookup inside
const selectedSet = new Set(selectedIds)  // before set()
// inside set():
page.groups = page.groups
  .map((g) => ({ ...g, elementIds: g.elementIds.filter((id) => !selectedSet.has(id)) }))
```

**Rule:** Build `Set`/`Map` lookups from input arrays *before* entering `set()`. Never do O(n) membership tests inside immer.

Same fix applied to `removeElements`.

---

### Fix #120 — updateLayerGroup patch type too wide

`Partial<Omit<LayerGroup, 'id'>>` admitted `elementIds` in the patch, bypassing dedicated membership actions.

```typescript
// Before
updateLayerGroup: (pageId: string, groupId: string, patch: Partial<Omit<LayerGroup, 'id'>>) => void

// After — explicit whitelist
updateLayerGroup: (
  pageId: string,
  groupId: string,
  patch: Partial<Pick<LayerGroup, 'name' | 'collapsed' | 'visible' | 'locked'>>
) => void
```

**Rule:** Use `Pick` (whitelist) over `Omit` (blacklist) for patch types. `Omit` admits all future fields by default.

---

### Fix #121 — cross-section group validation

`groupSelectedElements` could create a group spanning multiple sections, producing invalid render/order state.

```typescript
// Added before group creation in groupSelectedElements
const selectedSet = new Set(selectedIds)
let ownerSectionId: string | null = null

for (const section of page.sections ?? []) {
  for (const el of section.elements) {
    if (selectedSet.has(el.id)) {
      if (ownerSectionId === null) ownerSectionId = section.id
      else if (ownerSectionId !== section.id) return // cross-section: abort
    }
  }
}
```

---

### Fix #122 — maxLength on rename inputs

Rename inputs in `LayerRow.tsx` and `LayerGroupRow.tsx` had no character limit.

```tsx
<input maxLength={200} ... />
```

**Rule:** UI constraints must mirror schema constraints. The Zod schema (Fix #127) limits names to 200 chars — the input must enforce the same.

---

### Fix #123 — noop rename menu item

`buildGroupMenuItems` contained a visible, clickable "グループ名変更" item with `onClick: () => {}`.

```typescript
// Removed entirely — renamed groups are triggered via LayerGroupRow double-click
{ kind: 'action', icon: <Pencil />, label: 'グループ名変更', onClick: () => {} }
```

**Rule:** A visible, clickable menu item must produce an observable effect. If the feature isn't ready, use `disabled` state with a tooltip — never a noop.

---

### Fix #124 — pendingDeleteGroupId dead code

```typescript
// Removed from LayersPanel.tsx:
const pendingDeleteGroupId = useRef<string | null>(null)
// and the single write site:
pendingDeleteGroupId.current = group.id
// and useRef from imports
```

---

### Fix #125 — sectionGroups YAGNI

`sectionGroups` was computed in a `useMemo`, passed to `renderGroupedElements` as a parameter, then immediately `void sectionGroups`-ed inside the function.

Removed:
- The `useMemo` and its `sectionElementIds` dependency
- The parameter from `renderGroupedElements` signature
- The argument at the call site
- The `void sectionGroups` statement

---

### Fix #126 — getBoundingClientRect cache in useDragSelect

`getBoundingClientRect()` was called on every `onPointerMove` event, forcing synchronous browser layout on every frame.

```typescript
// useDragSelect.ts
const containerRectRef = useRef<DOMRect | null>(null)

const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  // Measure once at gesture start
  containerRectRef.current = e.currentTarget.getBoundingClientRect()
  const containerRect = containerRectRef.current
  startRef.current = { x: (e.clientX - containerRect.left) / zoom, ... }
}, [readonly, zoom])

const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
  if (!startRef.current || !containerRectRef.current) return
  const containerRect = containerRectRef.current  // read from cache — no reflow
  const x = (e.clientX - containerRect.left) / zoom
  ...
}, [zoom])
```

**Rule:** `getBoundingClientRect()`, `offsetWidth`, `scrollTop` — all cause synchronous layout. Never call them in `onPointerMove`/`onScroll`. Measure once at gesture start and cache.

---

### Fix #127 — LayerGroupSchema missing

`PageDefSchema` used `.passthrough()` so `groups` was completely unvalidated on JSON import.

```typescript
// src/lib/schemas/reportDefinition.ts
const LayerGroupSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  elementIds: z.array(z.string().min(1).max(100)).max(300),
  collapsed: z.boolean(),
  visible: z.boolean(),
  locked: z.boolean(),
})

const PageDefSchema = z.object({
  // ... existing fields ...
  groups: z.array(LayerGroupSchema).max(100).optional(),
}).passthrough()
```

**Rule:** Add schema definitions at the same time as TypeScript types. Never defer Zod coverage for data that crosses import/export boundaries.

---

## Prevention Strategies

### Checklist for New Features That Manage Collections

- [ ] Audit every data structure that references elements by ID (sections, groups, selection, clipboard).
- [ ] Extract a `cleanGroupMembership(page, removedIds)` helper and call it from every removal path.
- [ ] Add a store invariant test: after any removal, no group `elementIds` contains a removed ID.
- [ ] Treat ID references as foreign keys — cascade-delete on primary row deletion.

### Zustand + Immer Patterns

- Create `Set`/`Map` lookups *before* entering `set()` — never do O(n) searches inside immer.
- `set()` is for writes only. All reads, lookups, and computations go outside it.
- Batch bulk mutations into one `set()` call. Never call `set()` in a loop.
- Use `Set` for membership tracking; `Array` for ordered sequences.

### Patch Type Safety

- Prefer `Pick` (whitelist) over `Omit` (blacklist) for update payloads.
- Define a named patch type per action with an explicit field list.

### Input Validation Checklist

- [ ] Set `maxLength` matching the Zod schema constraint on every text input.
- [ ] Every field crossing import/export boundaries must have a Zod schema.
- [ ] Validate cross-entity preconditions (e.g., same-section check) before store mutation.

### DOM Performance in Pointer Events

- Cache `getBoundingClientRect()` in a ref at `onPointerDown` — never inside `onPointerMove`.
- Update React state at most once per animation frame, not per raw pointer event.
- Batch selection results into a single store action.

### Dead Code Detection

- [ ] Every `useRef` must have at least one read site — otherwise it's dead.
- [ ] Every function parameter must be read inside the function — otherwise it's YAGNI.
- [ ] Every context menu item `onClick` must call a real handler — never `() => {}`.
- Enforce with `@typescript-eslint/no-unused-vars` and `tsc --noEmit` in CI.

### Context Menu Item Testing

- Every item must produce an observable store mutation or navigation when clicked.
- If a feature isn't ready: `disabled` + tooltip. Never a visible noop.
- Write one test per menu item: render → click → assert store action called.
