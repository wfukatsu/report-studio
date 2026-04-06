---
status: complete
priority: p2
issue_id: "075"
tags: [ux-review, ux, data-entry]
dependencies: []
---

## Problem

DataSourcePanel form mode has no way to delete individual field rows. Users who add extra rows by mistake must clear all data and start over.

## Findings

- `src/components/sidebar/DataSourcePanel.tsx:117-138` — rows rendered without delete button
- Only "クリア" button exists to remove all data

## Solutions

Add a small X button at the end of each row (hide when only 1 row remains):

```tsx
{formRows.length > 1 && (
  <button onClick={() => setFormRows(rows => rows.filter((_, j) => j !== i))}
    className="shrink-0 text-muted-foreground hover:text-destructive px-1" aria-label="行を削除">
    ✕
  </button>
)}
```

## Files

- `src/components/sidebar/DataSourcePanel.tsx:117-138`

## Acceptance Criteria

- [ ] Each row has a delete button (hidden when only 1 row)
- [ ] Deleting a row updates the form state
