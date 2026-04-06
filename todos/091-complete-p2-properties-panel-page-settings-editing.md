---
status: complete
priority: p2
issue_id: "091"
tags: [code-review, ux, properties-panel, 帳票]
dependencies: []
---

# 091 — PropertiesPanel page settings are read-only (paper size, orientation, margins)

## Problem Statement

When no element is selected, PropertiesPanel shows page properties — but paper size is displayed as read-only text. There is no UI to change paper size (A4→A3), orientation (portrait/landscape), or margins. The store has `updateSettings()` action but it's never called from the UI.

This is a critical workflow blocker for form creators who need precise page setup (e.g., custom margins for letterhead, A3 landscape for wide tables).

## Findings

**File:** `src/components/sidebar/PropertiesPanel.tsx:107-139`

Paper size rendered as `<p>` tag (read-only). No margin inputs. No orientation toggle.

**Store action:** `updateSettings` exists in layoutSlice but has no UI.

## Proposed Solutions

### Option A: Add paper size dropdown + margin inputs to PropertiesPanel

Replace read-only paper size `<p>` with:
- Paper size `<select>` with A4/A3/B4/B5/Letter options
- Orientation toggle buttons (縦/横)
- Four margin inputs (top/right/bottom/left in mm)

**Effort:** Medium | **Risk:** Low

## Acceptance Criteria
- [ ] User can change paper size from PropertiesPanel
- [ ] User can toggle portrait/landscape
- [ ] User can set custom margins (top/right/bottom/left in mm)
- [ ] Changes apply immediately to the canvas

## Work Log
- 2026-04-06: Filed from third-round UX review
