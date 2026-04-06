---
status: pending
priority: p2
issue_id: "016"
tags: [code-review, agent-native, quality]
dependencies: []
---

## Problem Statement

Element default templates (initial property values for each element type) are embedded in src/components/sidebar/ElementPalette.tsx as the PALETTE_ITEMS constant. An agent or programmatic caller constructing elements must duplicate these defaults manually. There is no `createDefaultTextElement()` etc.

## Findings

Agent-native reviewer: PALETTE_ITEMS in sidebar/ElementPalette.tsx:12-113 has well-tested defaults for all 6 element types. Not exported from any lib/ module. Callers must reconstruct defaults manually. This also makes the palette the authority on element defaults, mixing UI and domain concerns.

## Proposed Solutions

A) Extract to src/lib/elementFactories.ts with createDefaultElement(type: ElementType): ReportElement — ElementPalette imports from there, agents can call directly

B) Add element factories as store actions (createAndAddElement(type)) — agents use store API, no need for factories

C) Keep in PALETTE_ITEMS but re-export from index

## Recommended Action

## Technical Details

- Option A produces a clean domain/UI separation: elementFactories.ts owns defaults, ElementPalette.tsx owns presentation
- The factory function signature: createDefaultElement(type: ElementType, overrides?: Partial<ReportElement>): ReportElement
- ID generation (currently uses uuid or nanoid) stays in the factory
- ElementPalette.tsx then maps PALETTE_ITEMS to { label, icon, element: createDefaultElement(type) }

## Acceptance Criteria

- [ ] src/lib/elementFactories.ts exports createDefaultElement(type, overrides?)
- [ ] All 6 element types (text, image, table, shape, dataField, barcode or equivalent) are covered
- [ ] ElementPalette.tsx no longer owns element default values — imports from elementFactories.ts
- [ ] Unit tests for elementFactories cover all types and override merging
- [ ] No behavior change in ElementPalette drag-to-canvas flow

## Work Log

## Resources

- src/components/sidebar/ElementPalette.tsx:12-113
- src/lib/ (new elementFactories.ts)
