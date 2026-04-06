---
status: pending
priority: p3
issue_id: "028"
tags: [code-review, simplicity, quality]
dependencies: []
---

## Problem Statement

`src/lib/tokens.ts` exports a `tokens` constant (8 CSS variable mappings) but is imported by no application file. Zero consumers exist outside the file itself.

## Findings

Simplicity reviewer confirmed by grep: `tokens.ts` is never imported by any application or test file. The file exists but is completely unused. 11 lines of dead code.

## Proposed Solutions

A) Delete `src/lib/tokens.ts` — no consumers, safe to remove

B) Import it in the new organism components if/when they are wired into App.tsx

## Recommended Action

<!-- Leave blank -->

## Technical Details

- Dead code increases cognitive load for new contributors who may try to understand how/why it is used
- The `tokens` constant maps design token names to CSS variable references (e.g. `primary: 'var(--color-primary)'`)
- If design tokens are needed in the future, the file can be trivially recreated or retrieved from git history
- YAGNI applies: no planned feature currently depends on this file

## Acceptance Criteria

- [ ] `src/lib/tokens.ts` is deleted
- [ ] No import of `tokens.ts` exists anywhere in the codebase
- [ ] Build and all tests pass after deletion

## Work Log

## Resources

- Files: `src/lib/tokens.ts`
