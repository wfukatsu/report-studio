---
status: complete
priority: p2
issue_id: "167"
tags: [code-review, ux, react, toolbar, template]
dependencies: []
---

# handleUpdateFromBuiltin reuses exportError — refresh failure message may disappear unexpectedly

## Problem Statement

`handleUpdateFromBuiltin` calls `setExportError('ビルトインテンプレートが見つかりませんでした')` for the template-not-found error. `exportError` is a shared state slot used by PDF export operations, which clear it at the start of their own flow. If the user clicks export after a refresh failure, the "built-in template not found" message silently disappears. The two error paths are semantically unrelated and should use separate state.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:315–317`

Also flagged: when `sourceTemplateId` resolves to `null` (because the built-in template ID was removed in a new version), the error displays in the export status area which may not be visible to users who haven't attempted an export.

Confirmed by: Kieran-TS (H1), Architecture reviewer (LOW).

## Proposed Solutions

### Option A: Add dedicated `refreshError` state (Recommended)

```ts
const [refreshError, setRefreshError] = useState<string | null>(null)
```

Show `refreshError` near the refresh button. Clear it when the user opens or closes the confirm dialog.

**Effort:** Small | **Risk:** None

## Acceptance Criteria

- [ ] Refresh failure no longer uses `exportError`
- [ ] Dedicated `refreshError` state shown near the refresh button
- [ ] Export operations do not clear the refresh error

## Work Log

- 2026-04-11: Flagged by Kieran-TS (H1) and Architecture (LOW).
