---
status: complete
priority: p2
issue_id: "093"
tags: [code-review, ux, i18n, templates]
dependencies: []
---

# 093 — Built-in template names and content are in English in a Japanese-first product

## Problem Statement

Both built-in templates ("Blank" and "Simple Report") have English names and English placeholder content ("Report Title", "Executive Summary", "Add your report summary here..."). The rest of the UI is Japanese. This is inconsistent and looks unpolished.

**Why it matters:** The target user is a Japanese business user creating Japanese business forms. English placeholder text in templates creates a jarring experience.

## Findings

**File:** `src/templates/builtinTemplates.ts`
- Template name: `"Blank"` → should be `"白紙"`
- Template name: `"Simple Report"` → should be `"シンプルレポート"` or `"基本レポート"`
- Text element content: `"Report Title"` → `"レポートタイトル"`
- Text element content: `"Executive Summary"` → `"概要"`
- Text element placeholder: `"Add your report summary here..."` → `"ここにレポートの概要を入力してください"`

## Proposed Solutions

### Option A: Translate all template names and placeholder content
Replace English strings in builtinTemplates.ts with Japanese equivalents.

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] All template names are in Japanese
- [ ] All placeholder text in template elements is in Japanese
- [ ] Template descriptions (added in todo 084) are also in Japanese

## Work Log
- 2026-04-06: Filed from third-round UX review
