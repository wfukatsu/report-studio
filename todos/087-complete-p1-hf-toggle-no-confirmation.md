---
status: complete
priority: p1
issue_id: "087"
tags: [code-review, ux, data-safety, toolbar]
dependencies: []
---

# 087 — H/F toggle buttons delete content with no confirmation

## Problem Statement

The master header (H) and footer (F) toggle buttons in the Toolbar immediately destroy the master band and all its elements when clicked to turn them off. There is no confirmation dialog. A user who spent time designing a company letterhead header can lose all that work with a single misclick. The template gallery correctly shows a confirmation when historyIndex > 0 — this toggle needs the same treatment.

**Why it matters:** Irreversible data loss with a single click. The H/F toggle is placed near other frequently used buttons, making accidental activation likely.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:193-209`

`handleToggleMasterHeader` and `handleToggleMasterFooter` call `setMasterHeader(null)` / `setMasterFooter(null)` directly when toggling off. No confirm dialog. No undo toast (unlike element deletion which shows an undo toast via App.tsx).

## Proposed Solutions

### Option A: Add confirm() dialog before removal (Recommended)
```tsx
const handleToggleMasterHeader = () => {
  if (masterHeader) {
    if (!confirm('ヘッダーとその内容を削除しますか？この操作は元に戻せません。')) return
    setMasterHeader(null)
  } else {
    // ... create header
  }
}
```

**Pros:** Minimal change, consistent with file open warning  
**Cons:** Browser confirm() is not visually styled  
**Effort:** Small  
**Risk:** Low

### Option B: Push history before removal + add undo support
Use historySlice to push a snapshot before deletion, then show an undo toast (same pattern as element deletion in App.tsx).

**Pros:** Better UX — no blocking confirm, reversible  
**Cons:** Slightly more complex  
**Effort:** Medium  
**Risk:** Low

## Recommended Action

Option A for immediate fix. Option B as a follow-up.

## Technical Details

**Files affected:**
- `src/components/toolbar/Toolbar.tsx` — add confirm in handleToggleMasterHeader and handleToggleMasterFooter

**Acceptance Criteria:**
- [ ] Clicking H or F toggle when already active shows confirmation before deleting
- [ ] User can cancel and keep the header/footer
- [ ] Creating a header/footer (first click) requires no confirmation

## Work Log

- 2026-04-06: Filed from third-round UX review
