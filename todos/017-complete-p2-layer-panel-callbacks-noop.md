---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, agent-native, quality]
dependencies: []
---

## Problem Statement

LayerPanel.tsx onToggleVisible and onToggleLock callbacks are hardcoded to () => {}. Toggling visibility or lock via the layer panel does nothing. Both the user UI and any programmatic caller cannot control visibility/lock via the layer view.

## Findings

Agent-native reviewer: LayerPanel.tsx:45-46 — `onToggleVisible: () => {}` and `onToggleLock: () => {}`. The store's updateElement action already supports {visible: boolean} and {locked: boolean} patches. The wiring is simply missing.

## Proposed Solutions

A) Wire callbacks to updateElement(pageId, elementId, { visible: !el.visible }) and updateElement(pageId, elementId, { locked: !el.locked }) in the parent that uses LayerPanel

B) Have LayerPanel subscribe to the store directly via useReportStore

C) Pass the store's updateElement as a callback prop

## Recommended Action

## Technical Details

- Option A preserves LayerPanel as a pure presentational component (easier to test in isolation)
- The parent component (likely App.tsx or a sidebar container) needs the active page id and access to the store's updateElement
- After wiring, verify that toggling visibility also triggers a re-render of ReportCanvas (elements with visible:false should be hidden or shown with reduced opacity in edit mode)

## Acceptance Criteria

- [ ] Clicking the eye icon in LayerPanel toggles element.visible via the store
- [ ] Clicking the lock icon in LayerPanel toggles element.locked via the store
- [ ] Canvas re-renders correctly after each toggle
- [ ] LayerPanel itself remains a pure presentational component (no direct store imports)
- [ ] Unit tests verify that the correct updateElement calls are made on toggle

## Work Log

## Resources

- src/components/organisms/LayerPanel/LayerPanel.tsx:45-46
- src/App.tsx
