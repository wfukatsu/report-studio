---
status: complete
priority: p2
issue_id: "096"
tags: [code-review, ux, toolbar, alignment]
dependencies: []
---

# 096 — Alignment dropdown opens even when < 2 elements are selected (all items disabled)

## Problem Statement

The "整列・配置" dropdown trigger button is always enabled. When clicked with 0 or 1 elements selected, the dropdown opens but all items are disabled (greyed out). The user opens a menu just to find it's entirely unusable. 

Better UX: disable the trigger button itself when fewer than 2 elements are selected.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:303-328`

The dropdown trigger button has no `disabled` prop. Inside, `handleAlign` has a `if (selectedIds.length < 2) return` guard, and items show as disabled, but the trigger button opens anyway.

## Proposed Solutions

### Option A: Disable trigger button when selection < 2
```tsx
<ToolbarButton
  onClick={() => setShowAlignMenu(v => !v)}
  disabled={selectedIds.length < 2}
  title="整列・配置 (2つ以上選択時)"
  ...
>
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] Align dropdown trigger is disabled when 0 or 1 elements selected
- [ ] Trigger has updated tooltip explaining why it's disabled
- [ ] When 2+ elements selected, dropdown works as before

## Work Log
- 2026-04-06: Filed from third-round UX review
