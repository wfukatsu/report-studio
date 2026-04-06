---
status: pending
priority: p2
issue_id: "012"
tags: [code-review, typescript, type-safety]
dependencies: []
---

## Problem Statement

ElementRenderer.tsx:120 casts `data[element.dataBinding] as string[][] | undefined` with no runtime validation. If the data source provides a non-array value, this silently renders garbage or throws at runtime.

## Findings

TypeScript reviewer: line 120 — `const rows = (data[element.dataBinding] as string[][] | undefined) ?? element.data`. DataSource.fields is Record<string,unknown> so any value is possible. No type guard before cast. Should use a runtime isStringMatrix() predicate.

## Proposed Solutions

A) Add isStringMatrix(value: unknown): value is string[][] type guard, call before cast — zero API change, eliminates runtime crash

B) Type DataSource.fields more precisely to ensure table-bound fields are always string[][] — more complex schema change

C) Catch the render error with an ErrorBoundary around the table element

## Recommended Action

## Technical Details

- isStringMatrix should check: Array.isArray(value) && value.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'))
- If the guard fails, fall back to element.data (the static default) and optionally log a warning
- The guard can live in src/lib/typeGuards.ts alongside any other runtime predicates

## Acceptance Criteria

- [ ] isStringMatrix(value: unknown): value is string[][] type guard is implemented
- [ ] ElementRenderer.tsx:120 uses the guard before the cast
- [ ] Non-array values fall back to element.data without throwing
- [ ] Unit tests for isStringMatrix cover: valid matrix, jagged array, array of non-strings, scalar, null, undefined

## Work Log

## Resources

- src/components/canvas/ElementRenderer.tsx:118-124
