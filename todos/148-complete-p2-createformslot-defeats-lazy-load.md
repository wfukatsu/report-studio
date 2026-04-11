---
status: complete
priority: p2
issue_id: "148"
tags: [code-review, performance, react, scalardb]
dependencies: []
---

# createFormSlot JSX instantiated for all groups on every render, defeating React.lazy

## Problem Statement

`DbConnectionTab.tsx` builds a `<Suspense><CreateTableForm/></Suspense>` JSX tree for **every** group in `groups.map()` on every render, regardless of which (if any) group has the form open. This allocates N Suspense boundary objects per render, and causes the `CreateTableForm` JS chunk to be fetched immediately when any group exists — not lazily when the user first clicks the create button.

## Findings

**File:** `src/components/modals/DbConnectionTab.tsx:148–160`

```tsx
createFormSlot={
  <Suspense fallback={...}>
    <CreateTableForm
      group={group}
      namespaces={catalog.namespaces.map((n) => n.name)}  // ← also allocates new array per group per render
      onSuccess={() => { setCreateFormGroupId(null); handleRefetch() }}
      onCancel={() => setCreateFormGroupId(null)}
    />
  </Suspense>
}
```

This runs for every group even when `showCreateForm` is `false`. The `GroupBindingSection` renders the slot only when `showCreateForm === true`, but the JSX object + prop evaluations already happened in the parent.

Confirmed by: Performance (MEDIUM-1).

## Proposed Solutions

### Option A: Gate createFormSlot behind the active group check (Recommended)

```tsx
{groups.map((group, idx) => {
  const isActive = createFormGroupId === group.id
  return (
    <GroupBindingSection
      key={group.id}
      group={group}
      catalog={catalog}
      autoFocusRef={idx === 0 ? firstSelectRef : undefined}
      onShowCreate={() => setCreateFormGroupId(group.id)}
      showCreateForm={isActive}
      createFormSlot={
        isActive ? (
          <Suspense fallback={<p className="text-[11px] text-muted-foreground">読み込み中...</p>}>
            <CreateTableForm
              group={group}
              namespaces={namespaceNames}  // use memoized value
              onSuccess={handleCreateSuccess}
              onCancel={handleCreateCancel}
            />
          </Suspense>
        ) : null
      }
    />
  )
})}
```

Also memoize `namespaceNames` and stabilize callbacks:

```ts
const namespaceNames = useMemo(
  () => catalog?.namespaces.map((n) => n.name) ?? [],
  [catalog]
)
const handleCreateSuccess = useCallback(() => {
  setCreateFormGroupId(null)
  handleRefetch()
}, [handleRefetch])
const handleCreateCancel = useCallback(() => setCreateFormGroupId(null), [])
```

**Pros:** Restores lazy-load. Eliminates per-group JSX allocation for inactive groups.
**Effort:** Small | **Risk:** Low

## Recommended Action

Option A. Also addresses Performance MEDIUM-2 (namespaceNames allocation) and MEDIUM-3 (inline arrow callbacks breaking GroupBindingSection memo).

## Technical Details

- **File:** `src/components/modals/DbConnectionTab.tsx:148–160`

## Acceptance Criteria

- [ ] `createFormSlot` only constructed when `createFormGroupId === group.id`
- [ ] `namespaceNames` memoized with `useMemo`
- [ ] `onSuccess` and `onCancel` callbacks for the form stabilized with `useCallback`
- [ ] CreateTableForm JS chunk is NOT fetched until user first clicks "このスキーマからテーブルを作成"

## Work Log

- 2026-04-11: Flagged by Performance (MEDIUM-1, MEDIUM-2). Addresses lazy-load contract violation.
