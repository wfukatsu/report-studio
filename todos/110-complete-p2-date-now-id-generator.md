---
status: complete
priority: p2
issue_id: "110"
tags: [code-review, typescript, data-integrity]
dependencies: []
---

## Problem Statement

Both `CalculationTab.tsx` and `ValidationTab.tsx` use `Date.now()` as a unique ID generator for new rules. This produces ugly, unstable keys (`calc_1744000000000`) that are persisted into the `ReportDefinition` and used as `{{calc_key}}` template references. Rapid double-clicks or automated tests can produce collisions.

## Findings

**File 1:** `src/components/modals/CalculationTab.tsx:143`
```typescript
const key = `calc_${Date.now()}`
addCalculationRule({
  key,
  label: '新しいルール',
  ...
})
```

**File 2:** `src/components/modals/ValidationTab.tsx:85`
```typescript
addValidationRule({
  id: `rule_${Date.now()}`,
  ...
})
```

**Problems:**
1. **Collision risk**: Two rapid add-clicks in the same millisecond produce the same key/id. Automated tests run synchronously and will collide.
2. **Unstable UX keys**: `calc_1744000000000` is a visible key that users reference in template expressions (`{{calc_1744000000000}}`). It's user-unfriendly and provides no semantic meaning.
3. **`crypto.randomUUID()` already used elsewhere**: `Toolbar.tsx` uses `uuid`/`crypto.randomUUID()` for other IDs — this should be consistent.

## Proposed Solutions

**A) Use `crypto.randomUUID()` (Recommended, trivial)**

```typescript
// CalculationTab.tsx
const key = `calc_${crypto.randomUUID().slice(0, 8)}`

// ValidationTab.tsx
id: `rule_${crypto.randomUUID().slice(0, 8)}`
```

Or use the existing `uuid` package (`import { v4 as uuidv4 } from 'uuid'`) already in the codebase.

**B) User-prompted key entry**
Show a small inline input for the key before adding, defaulting to a UUID-based suggestion. Better UX for calculation rules (the key appears in templates).

## Recommended Action

Option A — one-line fix per file.

## Technical Details

- `uuid` package is already a project dependency (used in `templateUtils.ts`, `layoutSlice.ts`)
- For calculation rule `key`: user-visible in `{{key}}` expressions, so a short UUID prefix is better than a raw timestamp

## Acceptance Criteria

- [ ] New calculation rules get a UUID-based key (no collision risk)
- [ ] New validation rules get a UUID-based id (no collision risk)
- [ ] Rapid "add" clicks (programmatic or manual) never produce duplicate keys

## Work Log

- 2026-04-06: Identified by TypeScript reviewer (HIGH) and Architecture reviewer (MEDIUM)
