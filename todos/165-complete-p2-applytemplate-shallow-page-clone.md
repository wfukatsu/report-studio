---
status: complete
priority: p2
issue_id: "165"
tags: [code-review, correctness, state-management, template]
dependencies: []
---

# applyTemplate shallow-clones pages — sections/elements share mutable references with BUILTIN_TEMPLATES

## Problem Statement

`applyTemplate()` creates a `legacyReport` with `pages: template.pages.map((p) => ({ ...p, id: uuidv4() }))`. The spread only replaces the top-level `id`. Each page's `sections` array and all elements within them share reference identity with the original static `BUILTIN_TEMPLATES` object. If the store's immer actions mutate these objects, the second time a user loads the same built-in template they may see mutation artifacts from the first load.

## Findings

**File:** `src/lib/templateUtils.ts:14–15`

```ts
pages: template.pages.map((p) => ({ ...p, id: uuidv4() })),
```

The CLAUDE.md notes: `JSON.parse(JSON.stringify(...))` is used for deep cloning inside immer drafts. This boundary should apply at applyTemplate time.

Confirmed by: Kieran-TS (M1).

## Proposed Solutions

### Option A: Deep clone pages at the boundary (Recommended)

```ts
pages: (JSON.parse(JSON.stringify(template.pages)) as typeof template.pages)
  .map((p) => ({ ...p, id: uuidv4() })),
```

**Effort:** Small | **Risk:** Low

### Option B: Use structuredClone (Node 17+ / modern browsers)

```ts
pages: structuredClone(template.pages).map((p) => ({ ...p, id: uuidv4() })),
```

**Effort:** Tiny | **Risk:** Low (check browser/node compat)

## Recommended Action

Option A (matches existing project clone pattern from CLAUDE.md).

## Acceptance Criteria

- [ ] `applyTemplate` deep-clones the pages tree before assigning new IDs
- [ ] Loading the same built-in template twice produces independent, non-shared page/section/element objects
- [ ] All existing template tests still pass

## Work Log

- 2026-04-11: Flagged by Kieran-TS (M1).
