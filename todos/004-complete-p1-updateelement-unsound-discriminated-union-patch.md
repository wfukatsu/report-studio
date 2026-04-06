---
status: pending
priority: p1
issue_id: "004"
tags: [code-review, typescript, type-safety]
dependencies: []
---

## Problem Statement

`updateElement` accepts `Partial<ReportElement>` but `ReportElement` is a discriminated union. `Object.assign` can silently apply a `TextElement` patch (e.g. `{content: "..."}`) to an `ImageElement` with no TypeScript error and no runtime check. `PropertiesPanel.tsx` uses `patch as Partial<TextElement>` to suppress the error, hiding the type hole.

## Findings

- `reportStore.ts:201-205` — `Object.assign(el, patch)` with `patch: Partial<ReportElement>`.
- TypeScript's `Partial<union>` distributes across all members, meaning any field from any union member can be applied to any element type without a compile-time error.
- `PropertiesPanel.tsx:83` uses a cast (`patch as Partial<TextElement>`) to suppress a TypeScript error rather than fixing the underlying type unsoundness.
- As more element types are added this pattern will silently corrupt element data — e.g. applying `{content}` to an `ImageElement` adds a field that `ElementRenderer` does not expect.

## Proposed Solutions

**A) Replace with type-specific update actions** (`updateTextElement`, `updateImageElement`, etc.) — Maximum type safety, each action accepts only valid fields for that element type. More boilerplate but eliminates the issue at compile time.

**B) Narrow patch at runtime using `ALLOWED_KEYS_BY_TYPE[el.type]` set** — Build an allowlist of valid keys per element type; filter the patch before applying it. Runtime guard with minimal API change — one `updateElement` action retained.

**C) Use type predicates to narrow `el` before `Object.assign`** — Compile-time safety via function overloads, but requires multiple overload signatures and is more complex to implement correctly.

**Recommended: B** — pragmatic balance. Retains the single `updateElement` action (minimal call-site changes), filters invalid keys at runtime, and prevents silent data corruption as new types are added.

## Recommended Action

## Technical Details

- `ALLOWED_KEYS_BY_TYPE` should be derived from or co-located with the type definitions in `src/types/index.ts` so it stays in sync as new element types are added.
- `Object.assign` should be replaced with a filtered assign that only copies keys present in `ALLOWED_KEYS_BY_TYPE[el.type]`.
- The cast in `PropertiesPanel.tsx:83` should be removed once the runtime guard is in place.

## Acceptance Criteria

- Applying `{ content: 'x' }` via `updateElement` to an `ImageElement` does not add a `content` property to that element.
- Applying `{ src: 'https://...' }` to a `TextElement` does not add a `src` property.
- TypeScript does not require a cast in `PropertiesPanel` to call `updateElement`.
- All existing element update tests pass.

## Work Log

## Resources

- src/store/reportStore.ts:198-207
- src/components/sidebar/PropertiesPanel.tsx:83
- src/types/index.ts
