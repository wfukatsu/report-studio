---
status: pending
priority: p2
issue_id: "021"
tags: [code-review, simplicity, quality]
dependencies: []
---

## Problem Statement

bringForward and sendBackward actions are implemented in the store (reportStore.ts:260-278) but no UI component or test calls them. They add ~22 lines of dead store logic and two interface entries that will never be discovered by users or agents navigating the running app.

## Findings

Simplicity reviewer + agent-native reviewer: bringForward and sendBackward implemented at lines 260-278. No Toolbar buttons, no PropertiesPanel z-order controls, no keyboard shortcuts invoke them. Agent-native reviewer noted they exist but are not discoverable. grep confirms zero call sites outside the store definition.

## Proposed Solutions

A) Delete bringForward and sendBackward from the store interface and implementation — YAGNI

B) Keep them and add z-order controls to the PropertiesPanel or Toolbar — correct if z-order editing is in Phase 1 scope

C) Keep them as documented but unexposed actions for agent use

## Recommended Action

## Technical Details

- If Option A: remove lines 73-74 from the store interface and lines 260-278 from the implementation; delete any related tests
- If Option B: add z-order buttons (bring forward / send backward / bring to front / send to back) to PropertiesPanel or a context menu; the existing implementation can be used as-is
- Option C is the worst of both worlds — dead UI code that an agent cannot reliably discover without reading source

## Acceptance Criteria

- [ ] (Option A) bringForward and sendBackward are removed from store interface and implementation
- [ ] (Option A) No TypeScript errors after removal
- [ ] (Option A) Any tests for these actions are also removed
- [ ] (Option B) z-order controls are visible and functional in the UI
- [ ] Decision is documented in this ticket before implementation begins

## Work Log

## Resources

- src/store/reportStore.ts:73-74,260-278
