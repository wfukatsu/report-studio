---
status: complete
priority: p2
issue_id: "109"
tags: [code-review, typescript, type-safety]
dependencies: []
---

## Problem Statement

Four `as unknown as` double-casts exist in the codebase where Zod schema output types are used alongside the app's `ReportDefinition` type from `@/types`. These casts indicate the two type systems have drifted apart — the Zod `.passthrough()` schema produces types with `[x: string]: unknown` index signatures that TypeScript cannot directly assign to `ReportDefinition`. Each cast is a future runtime bug waiting to surface.

## Findings

**Cast locations:**
1. `src/api/reportApi.ts:71` — `getReport` return cast
2. `src/api/reportApi.ts:83` — `saveReport` return cast
3. `src/api/reportApi.ts:~220` — `loadFromBackend` store commit cast
4. `src/hooks/useEvaluator.ts:51` — inline dynamic import cast: `definition as unknown as import('@/lib/schemas/reportDefinition').ReportDefinitionInput`

**Root cause:** `ReportDefinitionSchema` uses `.passthrough()` at every level, making `z.output<typeof ReportDefinitionSchema>` a deeply nested type where every object has `[x: string]: unknown`. This index signature makes it incompatible with the plain `ReportDefinition` from `@/types`, even though at runtime the objects are structurally identical.

**Secondary issue:** `useEvaluator.ts:51` uses an inline dynamic import (`import(...)`) in a type position — fragile and unusual. The type should be imported at the top of the file.

## Proposed Solutions

**A) Add `ReportDefinitionOutput` from the Zod schema and align the return types (Recommended, Medium effort)**

```typescript
// src/lib/schemas/reportDefinition.ts — add:
export type ReportDefinitionOutput = z.output<typeof ReportDefinitionSchema>

// src/api/reportApi.ts — apiFetch functions return ReportDefinitionOutput
// src/store/layoutSlice.ts — loadReport accepts ReportDefinitionOutput | ReportDefinition
// The cast moves from call-site to a single explicit boundary in the store
```

**B) Add `satisfies` narrowing at the API boundary**
At each API call site, use `satisfies ReportDefinition` to let TypeScript verify structural compatibility without a cast. May require aligning the `pages[].sections[].elements` types.

**C) Remove `.passthrough()` from inner schemas (Risk: breaking change)**
Without `.passthrough()` on element schemas, unknown future fields are stripped on validation. This is the schema's forward-compat intent — removing it is risky.

**D) Accept casts but move the inline import (Quickest)**
Keep the existing casts but fix `useEvaluator.ts:51` to import `ReportDefinitionInput` at the top of the file rather than inline. Addresses the immediate code quality issue without the larger type alignment work.

## Recommended Action

Option D immediately (low risk), then Option A as a medium-term cleanup task.

## Technical Details

- **Primary files**: `src/api/reportApi.ts`, `src/hooks/useEvaluator.ts`
- **Schema file**: `src/lib/schemas/reportDefinition.ts`
- The `ReportDefinitionInput = z.input<typeof ReportDefinitionSchema>` export already exists but is not the right type for output (input ≠ output with `.passthrough()`)

## Acceptance Criteria

- [ ] `useEvaluator.ts` imports `ReportDefinitionInput` at the top level, not inline
- [ ] (Long-term) Zero `as unknown as` casts in `reportApi.ts`
- [ ] All existing tests continue to pass

## Work Log

- 2026-04-06: Identified as CRITICAL by TypeScript reviewer
