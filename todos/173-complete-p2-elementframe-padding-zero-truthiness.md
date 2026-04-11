---
status: complete
priority: p2
issue_id: "173"
tags: [code-review, correctness, react, elementframe]
dependencies: ["171"]
---

# ElementFrame padding/border truthy check drops explicit zero values

## Problem Statement

`ElementFrame.tsx` uses truthiness checks (`padding.top ?`) to apply CSS values. A `padding` of `0` (explicitly set to remove padding) is falsy and treated as `undefined` — CSS `paddingTop` is never applied. Same issue for `border.width = 0`.

## Findings

**File:** `src/elements/_blocks/renderers/ElementFrame.tsx:44-48`

```ts
paddingTop: padding.top ? `${padding.top}mm` : undefined,
```

`padding.top = 0` → `undefined` (wrong). Should be:

```ts
paddingTop: padding.top != null ? `${padding.top}mm` : undefined,
```

Confirmed by: Kieran-TS (MEDIUM #4).

**Note:** This is blocked on #171 (ElementFrame may be deleted). If ElementFrame is deleted, this is automatically resolved.

## Acceptance Criteria

- [ ] All four padding sides and border.width use `!= null` check
- [ ] `padding={top: 0}` renders with `paddingTop: '0mm'` applied

## Work Log

- 2026-04-11: Flagged by Kieran-TS (MEDIUM #4). Blocked on ElementFrame deletion decision.
