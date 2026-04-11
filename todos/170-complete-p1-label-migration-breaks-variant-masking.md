---
status: complete
priority: p1
issue_id: "170"
tags: [code-review, correctness, migration, variants, architecture]
dependencies: []
---

# label → text migration creates silent masking failure in PDF export

## Problem Statement

The `label` → `text` inline migration in `ElementRenderer.tsx` converts `LabelElement` at render time. However `variantApplicator.ts` still writes masked values to the `content` field (which `TextElement` uses), while `LabelElement` stores its text in the `text` field. When a `label` element is targeted by an OutputVariant masking rule, the mask writes to `content` but the renderer reads `element.text` — the mask is silently dropped for PDF export.

## Findings

**Files:**
- `src/components/canvas/ElementRenderer.tsx:66` — inline migration reads `element.text`
- `src/lib/variantApplicator.ts:35` — `fullReplace` masking writes `content` field
- `src/lib/variantApplicator.ts:42` — `partial` masking skips `label` type entirely

Confirmed by: Architecture reviewer (HIGH #1).

## Proposed Solutions

### Option A: Migrate at document load time (Recommended)

Add to `src/lib/migration.ts`: convert `{type: 'label', text: X}` → `{type: 'text', content: X}` and remove `LabelElement` from the `ReportElement` union. Store always serves `TextElement`.

**Pros:** Eliminates the dual-path problem permanently. `variantApplicator` no longer needs to know about `label`.
**Effort:** Medium | **Risk:** Low (migration is backward-compatible)

### Option B: Add `content` alias to LabelElement

Add `content?: string` to `LabelElement` so masking writes to the right field.

**Pros:** Minimal change.
**Cons:** `LabelElement` and `TextElement` continue to diverge.
**Effort:** Small | **Risk:** Low

## Recommended Action

Option A. Add to `migrateReport()` in `src/lib/migration.ts`.

## Acceptance Criteria

- [ ] A `label` element targeted by an OutputVariant `fullReplace` masking rule correctly shows the masked value in PDF export
- [ ] `LabelElement` removed from `ReportElement` union OR `content` field added to `LabelElement`
- [ ] Existing template load tests still pass

## Work Log

- 2026-04-11: Flagged by Architecture (HIGH #1). Silent PDF export corruption.
