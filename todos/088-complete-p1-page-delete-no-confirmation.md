---
status: complete
priority: p1
issue_id: "088"
tags: [code-review, ux, data-safety, page-panel]
dependencies: []
---

# 088 — Page delete has no confirmation and no undo

## Problem Statement

The trash button in PagePanel deletes a page instantly with no confirmation dialog and no undo toast. Unlike element deletion (which shows a 3-second undo toast), page deletion is permanent and silent. A page can contain dozens of carefully placed elements — losing all of it with a single trash-button misclick is a serious usability problem.

**Why it matters:** Page deletion is far more destructive than element deletion, yet it has less protection (no undo toast, no confirm).

## Findings

**File:** `src/components/sidebar/PagePanel.tsx:52-58`

```tsx
<button
  onClick={() => removePage(page.id)}
  title="ページを削除"
  ...
>
  <Trash2 className="w-3 h-3" />
</button>
```

No guard, no confirm, no undo.

**Also note:** The trash button is only shown for non-last pages (`pages.length > 1`), but there is no minimum page protection beyond that.

## Proposed Solutions

### Option A: Add confirm() dialog (Recommended Fast Fix)
```tsx
onClick={() => {
  if (confirm(`「${page.name}」を削除しますか？この操作は元に戻せません。`)) {
    removePage(page.id)
  }
}}
```

### Option B: Add undo toast (consistent with element deletion)
Show a toast after deletion with "元に戻す" button that calls undo().

**Pros:** Consistent pattern, no blocking dialog  
**Effort:** Medium  
**Risk:** Low

## Recommended Action

Option A now, Option B later for consistency.

## Technical Details

**Files affected:**
- `src/components/sidebar/PagePanel.tsx` — add confirmation guard

**Acceptance Criteria:**
- [ ] Page deletion requires confirmation
- [ ] User can cancel and keep the page
- [ ] Confirmation message includes the page name

## Work Log

- 2026-04-06: Filed from third-round UX review
