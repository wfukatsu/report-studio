---
status: complete
priority: p1
issue_id: "032"
tags: [code-review, security, architecture, typescript]
dependencies: []
---

## Problem Statement

`importFromJSON` in `src/lib/migration.ts` validates only 3 fields (`id`, `pages`, `Array.isArray`) then performs `obj as unknown as ReportDefinition`. This allows malformed, corrupt, or adversarial JSON to enter the store and cause silent runtime failures (undefined dereferences on `metadata.documentName`, `pageSettings.paperSize`, etc.) or arbitrary object injection.

## Findings

- `src/lib/migration.ts:180-185`: validates only `id`, `pages`, array check, then blind-casts
- `metadata`, `pageSettings`, `dataSources`, `pages[].sections`, element `type` values are all unchecked
- A document with a missing `metadata` will crash `Toolbar.tsx` which reads `s.definition.metadata.documentName`
- An element with an unknown `type` will fall through `ElementRenderer`'s switch silently to `return null`
- Security: `dataSources[].fields` could contain `__proto__` or `constructor` keys that bypass the FORBIDDEN_KEYS guard (which is one level deeper)
- Both the `report-definition/v1` path (line 180) and the legacy `Report` path (`migrateReport`) share this problem

## Proposed Solutions

**A) Add minimum structural guards (Recommended for Phase 1)**
```ts
function isReportDefinition(obj: Record<string, unknown>): obj is ReportDefinition {
  return (
    typeof obj['id'] === 'string' &&
    Array.isArray(obj['pages']) &&
    typeof obj['metadata'] === 'object' && obj['metadata'] !== null &&
    typeof obj['pageSettings'] === 'object' && obj['pageSettings'] !== null &&
    Array.isArray(obj['templateVariables']) &&
    Array.isArray(obj['calculationRules']) &&
    Array.isArray(obj['dataSources'])
  )
}
```
Use this guard before returning `{ ok: true }`.

**B) Full Zod validation (Phase 2)**
Install `zod` and define `reportDefinitionSchema`. Provides exhaustive validation including element types. Deferred per plan.

**C) Apply `loadReport` section-migration defensively**
`loadReport` already handles missing `sections` on pages. Apply that same defensive migration inside `importFromJSON` before returning `ok: true`. Doesn't catch all issues but prevents the most common corruption.

## Recommended Action

Apply solution A immediately (defensive type guard). Apply solution C as belt-and-suspenders. Note in code that solution B is the Phase 2 target.

## Technical Details

- **File:** `src/lib/migration.ts:180-197`
- Related: `src/store/layoutSlice.ts:235-238` (the loadReport defensive migration)

## Acceptance Criteria

- [ ] `importFromJSON` validates `metadata`, `pageSettings`, `templateVariables`, `calculationRules`, `dataSources` before returning `ok: true`
- [ ] Missing `metadata` returns `{ ok: false, error: 'metadata フィールドが不正です' }`
- [ ] Missing `pageSettings` returns `{ ok: false, error: 'pageSettings フィールドが不正です' }`
- [ ] Test: importing `{}` returns `ok: false`
- [ ] Test: importing JSON with valid minimal ReportDefinition returns `ok: true`

## Work Log

- 2026-04-06: Identified by TypeScript reviewer, security-sentinel, and architecture-strategist agents
