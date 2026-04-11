---
status: complete
priority: p2
issue_id: "147"
tags: [code-review, validation, scalardb, backend, frontend]
dependencies: ["141"]
---

# No maximum length guard on ScalarDB identifiers (namespace, table, column names)

## Problem Statement

`SCALARDB_IDENTIFIER_REGEX` and the Java `IDENTIFIER` pattern validate character set and first character but not length. ScalarDB storage backends impose limits (Cassandra: 48 chars; DynamoDB: 255 chars; most JDBC backends: 63–128 chars). A 500-character identifier passes all current client and server validation but produces an opaque `ExecutionException` from ScalarDB with a confusing error path.

## Findings

**Frontend:** `src/lib/scalardbIdentifier.ts` — no length check in `validateScalarDbIdentifier`
**Backend:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:68` — `IDENTIFIER` regex uncapped

Confirmed by: Security (M-4), Kieran-TS (M5).

## Proposed Solutions

### Option A: Add MAX_IDENTIFIER_LENGTH to shared limits and validate (Recommended)

**Frontend (`src/lib/scalardbLimits.ts`):**
```ts
export const MAX_IDENTIFIER_LENGTH = 64
```

**`src/lib/scalardbIdentifier.ts`:**
```ts
import { MAX_IDENTIFIER_LENGTH } from './scalardbLimits'

export function validateScalarDbIdentifier(value: string) {
  if (value === '') return { valid: false, error: '識別子が空です' }
  if (value.length > MAX_IDENTIFIER_LENGTH)
    return { valid: false, error: `識別子が長すぎます (最大 ${MAX_IDENTIFIER_LENGTH} 文字)` }
  if (!SCALARDB_IDENTIFIER_REGEX.test(value))
    return { valid: false, error: `識別子が不正です: "${value}"` }
  return { valid: true }
}
```

**Backend (`ScalarDbLimits.java`):**
```java
public static final int MAX_IDENTIFIER_LENGTH = 64;
```

Apply in `V2ScalarDbTableController` alongside the regex check.

**Effort:** Small | **Risk:** Low

## Recommended Action

Option A. 64 chars is a safe conservative cap that works across all common backends (Cassandra: 48 is stricter, but changing to 48 could break identifiers users already have in production schemas). Use 64 and document the Cassandra exception.

## Technical Details

- **Frontend:** `src/lib/scalardbLimits.ts`, `src/lib/scalardbIdentifier.ts`
- **Backend:** `server/src/main/java/com/report/server/ScalarDbLimits.java`, `V2ScalarDbTableController.java`
- **Test updates:** `scalardbIdentifier.test.ts` (add 65-char identifier test), `V2ScalarDbTableControllerTest` (add over-length identifier test)

## Acceptance Criteria

- [ ] `MAX_IDENTIFIER_LENGTH = 64` added to both `scalardbLimits.ts` and `ScalarDbLimits.java`
- [ ] `validateScalarDbIdentifier` returns `valid: false` for identifiers > 64 chars
- [ ] Backend `V2ScalarDbTableController` rejects namespace/tableName/columnName > 64 chars with 400
- [ ] Test cases: 64-char identifier passes, 65-char fails

## Work Log

- 2026-04-11: Flagged by Security (M-4) and Kieran-TS (M5). Conservative 64-char cap.
