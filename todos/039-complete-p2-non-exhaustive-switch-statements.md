---
status: complete
priority: p2
issue_id: "039"
tags: [code-review, typescript]
dependencies: []
---

## Problem Statement

`LayersPanel` and `ElementRenderer` have non-exhaustive switch statements on `element.type`. When new element types are added, neither file produces a TypeScript compile error — the default branch silently handles them. This is a maintenance trap.

## Findings

- `src/components/sidebar/LayersPanel.tsx:12-51`: `elementIcon` and `defaultName` handle 11 of 14 types; `repeatingBand` and `repeatingList` fall to default
- `src/components/canvas/ElementRenderer.tsx:57`: `default: return null` silently swallows unknown element types
- The `ElementType` discriminated union has 14 members; adding a 15th would not cause any compile error in these files

## Proposed Solutions

**A) Add `assertNever` function and use it in default branches (Recommended)**
```ts
function assertNever(x: never): never {
  throw new Error(`Unhandled element type: ${String(x)}`)
}

// In switch default:
default: return assertNever(el.type)
```
TypeScript will error at compile time if a new element type is not handled.

**B) Add explicit cases for all 14 types without assertNever**
Ensures all types are handled but does not prevent future regressions.

**C) Use a type lookup object instead of switch**
```ts
const ELEMENT_ICONS: Record<ElementType, React.ReactNode> = { text: <Type />, ... }
```
Compile-time exhaustiveness check guaranteed by `Record<ElementType, ...>`.

## Recommended Action

Apply solution A to both files. Also add the two missing element types (`repeatingBand`, `repeatingList`) to `elementIcon` and `defaultName` in `LayersPanel.tsx`.

## Technical Details

- **Files:** `src/components/sidebar/LayersPanel.tsx:12-51`, `src/components/canvas/ElementRenderer.tsx:57`

## Acceptance Criteria

- [x] `assertNever` or equivalent exhaustiveness check in `elementIcon`, `defaultName`, and `ElementRenderer` switch
- [x] `repeatingBand` and `repeatingList` have explicit icon and name cases in LayersPanel
- [x] TypeScript error occurs when a new `ElementType` is added without updating these files

## Work Log

- 2026-04-06: Identified by TypeScript reviewer agent
