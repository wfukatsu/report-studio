---
status: complete
priority: p3
issue_id: "042"
tags: [code-review, architecture]
dependencies: []
---

## Problem Statement

`SCHEMA_VERSION = 'report-definition/v1'` is defined independently in both `exportUtils.ts` and `migration.ts`. A version bump requires updating both files — one will inevitably be missed.

## Findings

- `src/lib/exportUtils.ts:14`: `const SCHEMA_VERSION = 'report-definition/v1' as const`
- `src/lib/migration.ts:153`: `const SCHEMA_VERSION = 'report-definition/v1'`
- Both are module-private constants

## Proposed Solutions

**A) Export from exportUtils, import in migration (Recommended)**
```ts
// exportUtils.ts — add export
export const SCHEMA_VERSION = 'report-definition/v1' as const

// migration.ts — remove local def, import
import { SCHEMA_VERSION } from './exportUtils'
```

**B) Create src/lib/schemaVersion.ts**
Neutral module with no other dependencies. Cleaner if more files need it later.

## Recommended Action

Apply solution A — minimal change.

## Technical Details

- **Files:** `src/lib/exportUtils.ts:14`, `src/lib/migration.ts:153`

## Acceptance Criteria

- [ ] Single definition of `SCHEMA_VERSION` in the codebase
- [ ] `migration.ts` imports it rather than redefining

## Work Log

- 2026-04-06: Identified by architecture-strategist and code-simplicity-reviewer agents
