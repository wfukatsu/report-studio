---
status: complete
priority: p3
issue_id: "084"
tags: [code-review, ux, templates, onboarding]
dependencies: []
---

# 084 — Templates have no description text in gallery

## Problem Statement

The TemplateGallery shows template names but no description. Users can't tell what each template is for without loading it. A brief description (1-2 lines) would help users choose the right starting point.

## Findings

**File:** `src/templates/builtinTemplates.ts`

Template objects have `name` and `definition` fields. No `description` field exists.

**File:** `src/components/templates/TemplateGallery.tsx`

Renders only the template name in the gallery card.

## Proposed Solutions

### Option A: Add description field to Template type
Add `description?: string` to the `Template` interface, populate for each builtin template, display in gallery card.

**Example descriptions:**
- 見積書: "顧客向け見積書テンプレート。金額自動計算・印鑑欄付き"
- 請求書: "請求書テンプレート。消費税・合計金額の自動計算対応"
- 白紙: "空のキャンバス。自由にレイアウトを作成"

**Pros:** Useful for new users  
**Effort:** Small  
**Risk:** Low

## Technical Details

**Files affected:**
- `src/templates/builtinTemplates.ts` — add description to each template
- `src/types/index.ts` — add description field to Template type
- `src/components/templates/TemplateGallery.tsx` — render description in card

**Acceptance Criteria:**
- [ ] Each template has a Japanese description (1-2 sentences)
- [ ] Description shown in template gallery card
- [ ] Existing functionality unchanged

## Work Log

- 2026-04-06: Filed from second-round UX review
