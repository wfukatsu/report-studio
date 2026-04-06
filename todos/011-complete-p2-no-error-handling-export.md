---
status: pending
priority: p2
issue_id: "011"
tags: [code-review, quality, ux]
dependencies: []
---

## Problem Statement

exportPageToPng and exportReportToPdf are async functions with no try/catch. html2canvas can throw on cross-origin resource failures. The calling Toolbar.tsx presumably awaits without a catch guard. Export failures silently disappear.

## Findings

TypeScript reviewer: exportUtils.ts:4-39 — both export functions have no error handling. html2canvas throws when useCORS resources fail. Users see no feedback when export fails. This is a user-facing workflow with no error path.

## Proposed Solutions

A) Wrap html2canvas calls in try/catch in exportUtils, return a Result type {ok: boolean, error?: string} — clean API for callers

B) Accept an onError callback parameter in each export function

C) Let errors propagate and add try/catch in Toolbar.tsx caller

## Recommended Action

## Technical Details

- Option A (Result type) keeps exportUtils as the single owner of its error contract
- Callers (Toolbar.tsx) can pattern-match on {ok, error} to show toast/alert feedback
- The Result type should be defined in src/types/index.ts to be reusable

## Acceptance Criteria

- [ ] Both exportPageToPng and exportReportToPdf return a Result type instead of void
- [ ] html2canvas errors are caught and surfaced in the Result
- [ ] Toolbar.tsx (or whichever caller invokes export) displays a user-visible error message on failure
- [ ] Unit tests cover the error path (mock html2canvas to throw)

## Work Log

## Resources

- src/lib/exportUtils.ts:4-39
- src/components/toolbar/Toolbar.tsx
