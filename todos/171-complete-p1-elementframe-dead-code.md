---
status: complete
priority: p1
issue_id: "171"
tags: [code-review, simplicity, dead-code, architecture]
dependencies: []
---

# ElementFrame is dead code — zero call sites in the PR

## Problem Statement

`src/elements/_blocks/renderers/ElementFrame.tsx` is a 55-line component with its own `BorderConfig` and `PaddingConfig` types, but it has **zero call sites** as a JSX component in this PR. The only reference to `ElementFrame` is a type-only import in `BorderSection.tsx`. The actual renderers inline border/background/padding styles directly.

This is a YAGNI violation that adds ~55 LOC of dead abstraction to the codebase with no current value.

## Findings

**File:** `src/elements/_blocks/renderers/ElementFrame.tsx`

Zero JSX usages found via grep. The `BorderConfig` and `PaddingConfig` types are used only as type imports.

Confirmed by: Simplicity reviewer (P1 YAGNI).

## Proposed Solutions

### Option A: Delete ElementFrame.tsx (Recommended)

Move `BorderConfig` and `PaddingConfig` types to `_blocks/types.ts` or directly into `BorderSection.tsx`. Remove the file.

**Effort:** Small | **Risk:** None

### Option B: Use it in at least one renderer

If `ElementFrame` represents a real intent, wire it into one or more renderers that currently inline the equivalent logic.

**Effort:** Medium | **Risk:** Low

## Recommended Action

Option A unless there is a specific planned usage. Dead code in a refactor PR misleads future contributors.

## Acceptance Criteria

- [ ] `ElementFrame.tsx` either deleted OR used in at least one renderer
- [ ] `BorderConfig` / `PaddingConfig` types either moved or co-located with their consumer
- [ ] No import errors after deletion

## Work Log

- 2026-04-11: Flagged by Simplicity (P1 YAGNI). Remove dead abstraction.
