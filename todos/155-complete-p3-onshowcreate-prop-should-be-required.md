---
status: complete
priority: p3
issue_id: "155"
tags: [code-review, types, react, scalardb]
dependencies: []
---

# GroupBindingSection.onShowCreate is typed as optional but used as required

## Problem Statement

`onShowCreate?: () => void` in `GroupBindingSectionProps` is optional, but the button renders `onClick={onShowCreate}`. If omitted, the button has no handler — React silently ignores it. Given `DbConnectionTab` always passes it, mark it required or add a conditional render guard.

## Findings

**File:** `src/components/modals/dbConnection/GroupBindingSection.tsx:24`

```ts
onShowCreate?: () => void
```

Button at line ~208:
```tsx
<button type="button" onClick={onShowCreate}>このスキーマからテーブルを作成</button>
```

Confirmed by: Kieran-TS (L3).

## Proposed Solutions

**Option A:** Mark required — `onShowCreate: () => void`  
**Option B:** Guard — `{onShowCreate && <button ... onClick={onShowCreate}>}`

Option B is more defensive given the render-slot pattern might be reused without the create feature.

## Acceptance Criteria

- [ ] Either `onShowCreate` marked required OR button conditionally rendered when `onShowCreate` is defined

## Work Log

- 2026-04-11: Flagged by Kieran-TS (L3).
