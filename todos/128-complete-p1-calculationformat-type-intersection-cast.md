---
status: complete
priority: p1
issue_id: "128"
tags: [code-review, typescript, calculationtab]
dependencies: []
---

## Problem Statement

`FormatEditor` in `src/components/modals/CalculationTab.tsx` casts format type values to `NumberFormatType & DateFormatType` — an intersection that is semantically wrong. The only value satisfying both unions is `'custom'`. Casting `'integer'` or `'yyyy/MM/dd'` to this intersection is an active lie to the type system and will allow mismatched format types to silently pass type-checking.

## Findings

- **Line 79**: `onUpdate({ type: defaultType as NumberFormatType & DateFormatType })`
- **Line 84**: `type: value as NumberFormatType & DateFormatType`
- `CalculationFormat.type` is typed as `NumberFormatType | DateFormatType` (union), not an intersection. The correct cast is `as NumberFormatType | DateFormatType`.
- The real fix is to type `defaultType` correctly upfront so no cast is needed: `const defaultType: NumberFormatType | DateFormatType = isNumber ? 'integer' : 'yyyy/MM/dd'`

## Proposed Solutions

**A) Type `defaultType` correctly — eliminate casts** (Recommended)
```typescript
const defaultType: NumberFormatType | DateFormatType = isNumber ? 'integer' : 'yyyy/MM/dd'
// handleTypeChange becomes:
onUpdate({ ...(format ?? { type: defaultType }), type: value as NumberFormatType | DateFormatType })
```
Effort: Small. Risk: None.

**B) Change cast from `&` to `|` — minimal fix**
Replace both `as NumberFormatType & DateFormatType` with `as NumberFormatType | DateFormatType`. Stops the lie, still requires a cast from `string`.
Effort: Tiny. Risk: None.

## Acceptance Criteria
- [ ] No `NumberFormatType & DateFormatType` intersection cast exists in the codebase
- [ ] `defaultType` is typed as `NumberFormatType | DateFormatType` or inferred correctly
- [ ] TypeScript strict mode passes without `@ts-ignore`

## Work Log
- 2026-04-08: Identified by kieran-typescript-reviewer
