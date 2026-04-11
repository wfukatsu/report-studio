---
status: complete
priority: p3
issue_id: "151"
tags: [code-review, types, scalardb, frontend]
dependencies: []
---

# CreateScalarDbTableRequest.columns[].type duplicates ScalarDbColumnType union

## Problem Statement

`CreateScalarDbTableRequest` defines `columns[].type` as a raw string union `'BOOLEAN' | 'INT' | 'BIGINT' | 'FLOAT' | 'DOUBLE' | 'TEXT' | 'BLOB'` which is identical to `ScalarDbColumnType`. If a new type is added to the Zod schema, the request type silently drifts.

## Findings

**File:** `src/api/reportApi.ts:505`

```ts
columns: Array<{
  name: string
  type: 'BOOLEAN' | 'INT' | 'BIGINT' | 'FLOAT' | 'DOUBLE' | 'TEXT' | 'BLOB'
}>
```

Should be:

```ts
import type { ScalarDbColumnType } from '@/types/scalardb'
columns: Array<{ name: string; type: ScalarDbColumnType }>
```

Confirmed by: Kieran-TS (H2).

## Acceptance Criteria

- [ ] `columns[].type` in `CreateScalarDbTableRequest` uses `ScalarDbColumnType` import
- [ ] No raw string union duplication

## Work Log

- 2026-04-11: Flagged by Kieran-TS (H2). One-line change.
