---
status: complete
priority: p2
issue_id: "144"
tags: [code-review, ux, accessibility, react, scalardb]
dependencies: []
---

# Enter key from a <select> inside CreateTableForm fires the submit handler

## Problem Statement

`CreateTableForm.tsx` attaches `onKeyDown` to the wrapper `<div>` and calls `handleSubmit()` on Enter. This means pressing Enter to open a native `<select>` dropdown (namespace, column type, key role) immediately fires the form submit instead. This is a real UX bug on browsers where Enter opens a `<select>`.

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx:219`

```tsx
<div className="flex flex-col gap-3 ..." onKeyDown={handleKeyDown}>
```

```ts
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()  // ← fires from any focused child including <select>
    if (e.key === 'Escape') onCancel()
  },
  [handleSubmit, onCancel],
)
```

With multiple `<select>` elements in the column grid (type + key-role per column), any Enter keypress in the form fires the submit.

Confirmed by: Kieran-TS (M1).

## Proposed Solutions

### Option A: Wrap in `<form>` with onSubmit + Escape-only keydown (Recommended)

```tsx
<form
  onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
  onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
>
```

- Remove the `onKeyDown` wrapper div
- Enter in a text input (`tableName`, new namespace) submits — expected behavior
- Enter in a `<select>` opens the dropdown — not swallowed
- Escape closes the form

**Pros:** Semantically correct. Fixes the UX bug. Makes submit/cancel keyboard-accessible.
**Effort:** Small | **Risk:** Low

### Option B: Filter keydown to only fire from text inputs

```ts
if (e.key === 'Enter' && e.target instanceof HTMLInputElement) handleSubmit()
```

**Pros:** Quick.
**Cons:** Fragile — misses the case where user presses Enter in the submit button itself, and breaks if additional input types are added.
**Effort:** Tiny | **Risk:** Low

## Recommended Action

Option A. Using a real `<form>` is the semantic fix.

## Technical Details

- **File:** `src/components/modals/dbConnection/CreateTableForm.tsx:219`, `~210–218`

## Acceptance Criteria

- [ ] `<div onKeyDown={...}>` replaced with `<form onSubmit={...} onKeyDown={...}>`
- [ ] Enter in `<select>` opens dropdown, does NOT submit form
- [ ] Enter in the table-name `<input>` submits the form
- [ ] Escape calls `onCancel` from anywhere in the form
- [ ] `handleKeyDown` callback simplified or removed

## Work Log

- 2026-04-11: Flagged by Kieran-TS (M1) as real UX bug. Simple structural fix.
