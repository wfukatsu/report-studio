---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, agent-native, quality]
dependencies: []
---

## Problem Statement

`updateSettings` in reportStore.ts updates report.settings (paperSize, orientation, margins) but never recalculates page.width or page.height. Calling updateSettings({paperSize: 'A3', orientation: 'landscape'}) has no visible effect on the canvas. The getPageDimensions utility exists but is never called.

## Findings

Agent-native reviewer + simplicity reviewer: reportStore.ts:110-117 — Object.assign(s.report.settings, settings) updates settings but no code recalculates page dimensions. getPageDimensions in paperSizes.ts is never called from the store. updateSettings is also not called from any UI component — it's a dead action.

## Proposed Solutions

A) Inside updateSettings, call getPageDimensions(newPaperSize, newOrientation) and apply result to all pages (page.width, page.height) — makes settings live

B) Add a derived selector `pageWidthPx = getPageDimensions(settings.paperSize, settings.orientation).width` and use it in canvas render — lazy computation at render time

C) Remove updateSettings entirely until settings UI is built (YAGNI)

## Recommended Action

## Technical Details

- Option A: after merging settings, iterate report.pages and set page.width = dims.width, page.height = dims.height
- New orientation must be read from the merged settings (not the old state) to compute correct dimensions
- This also fixes the dead-code problem — once updateSettings has an observable effect, it can be wired to a settings UI panel
- Option B is also valid and avoids updating all pages in the store, but requires canvas components to call the derived selector rather than reading page.width directly

## Acceptance Criteria

- [ ] Calling updateSettings({paperSize: 'A3'}) changes page.width and page.height on all pages
- [ ] Calling updateSettings({orientation: 'landscape'}) swaps width and height on all pages
- [ ] ReportCanvas reflects the new dimensions immediately after updateSettings is called
- [ ] Unit tests cover A4 portrait, A4 landscape, A3 portrait, letter portrait

## Work Log

## Resources

- src/store/reportStore.ts:110-117
- src/lib/paperSizes.ts
