---
status: complete
priority: p3
issue_id: "082"
tags: [code-review, ux, copy, empty-state]
dependencies: []
---

# 082 — BindingPanel empty state message is unclear

## Problem Statement

When no data source is loaded, BindingPanel shows an empty state message that may be confusing or in English. The message should guide users on next steps in Japanese.

## Findings

**File:** `src/components/sidebar/BindingPanel.tsx:96`

Review the current empty state message and verify it:
1. Is in Japanese
2. Explains what to do ("データソースを設定してください")
3. Optionally links/points to the DataSource section above

## Proposed Solutions

### Option A: Update empty state copy
Replace current message with: "データソースが設定されていません。上の「データソース」セクションでデータを追加してください。"

**Pros:** Clear, actionable  
**Effort:** Small  
**Risk:** Low

## Technical Details

**Files affected:**
- `src/components/sidebar/BindingPanel.tsx`

**Acceptance Criteria:**
- [ ] Empty state message is in Japanese
- [ ] Message tells user what to do next
- [ ] No visual regressions

## Work Log

- 2026-04-06: Filed from second-round UX review
