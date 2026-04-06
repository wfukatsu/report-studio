---
status: complete
priority: p2
issue_id: "092"
tags: [code-review, ux, onboarding]
dependencies: []
---

# 092 — Default left tab is 'elements' — new users see primitives instead of templates

## Problem Statement

When the app loads, the default left tab is `'elements'` (要素), showing a palette of design primitives. A first-time user sees rectangles, circles, and text boxes but no guidance on how to start. The template tab (`'テンプレ'`) is the 4th tab and not obvious. 

A better first experience: open the templates tab by default, so new users immediately see "start from a template" as the natural entry point.

## Findings

**File:** `src/App.tsx:28`
```tsx
const [leftTab, setLeftTab] = useState<LeftTab>('elements')
```

**File:** `src/App.tsx:24`
Tab label is `'テンプレ'` (informal abbreviation of テンプレート).

## Proposed Solutions

### Option A: Change default tab to 'templates'
```tsx
const [leftTab, setLeftTab] = useState<LeftTab>('templates')
```

Also rename the tab label from `'テンプレ'` to `'テンプレート'` (full word).

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] App opens with templates tab active
- [ ] Tab label shows full word 'テンプレート' (not truncated)
- [ ] No other behavior changes

## Work Log
- 2026-04-06: Filed from third-round UX review
