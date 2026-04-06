---
status: complete
priority: p2
issue_id: "080"
tags: [code-review, ux, data-panel, onboarding]
dependencies: []
---

# 080 — DataSource vs preview data distinction unclear in UI

## Problem Statement

The "データ" tab contains two sections: "データソース" (DataSourcePanel) and "プレビューデータ" (BindingPanel). First-time users don't understand the difference — both appear to be data entry, but they serve different purposes:

- **DataSource**: Defines the schema and sample values used for template design
- **BindingPanel (preview data)**: Provides a second set of values used specifically in live preview mode

This separation is confusing. Most users don't need two separate datasets.

**Why it matters:** Confusing UI causes users to enter data in the wrong panel and wonder why preview doesn't show what they entered.

## Findings

**File:** `src/App.tsx:188-199`

```tsx
{leftTab === 'data' && (
  <div className="flex-1 overflow-y-auto">
    <DataSourcePanel />
    <div className="border-t mx-3 my-2" />
    <div className="px-3 pb-1">
      <p className="text-xs ...">プレビューデータ</p>
    </div>
    <BindingPanel />
  </div>
)}
```

No explanatory text distinguishes the two panels. The divider and heading are minimal.

## Proposed Solutions

### Option A: Add explanatory subtitles (Recommended)
Add a brief one-line description under each section heading explaining what it does and when to use it.

**DataSource:** "テンプレート設計用のサンプルデータ。{{fieldKey}} の参照に使用します。"  
**Preview:** "プレビューモードで表示する実データ（省略時はデータソースを使用）"

**Pros:** Minimal change, educational  
**Cons:** Adds text clutter for experienced users  
**Effort:** Small  
**Risk:** Low

### Option B: Merge panels — use DataSource for both
Remove BindingPanel and have live preview use the DataSource fields directly.

**Pros:** Eliminates confusion, fewer concepts  
**Cons:** Users lose ability to test with different data sets  
**Effort:** Medium  
**Risk:** Medium (requires store changes)

### Option C: Add a tooltip/info icon on section headers
Keep layout as-is, add an info (ℹ) icon with tooltip explaining each section.

**Pros:** Clean layout preserved  
**Cons:** Users must hover to learn  
**Effort:** Small  
**Risk:** Low

## Recommended Action

Option A initially (fast win), then evaluate Option B as a follow-up simplification.

## Technical Details

**Files affected:**
- `src/App.tsx` — add description text under section headings

**Acceptance Criteria:**
- [ ] Each panel has a one-line description explaining its purpose
- [ ] New users understand which panel to use for what
- [ ] No visual regressions

## Work Log

- 2026-04-06: Filed from second-round UX review
