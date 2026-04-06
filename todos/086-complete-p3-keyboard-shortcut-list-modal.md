---
status: complete
priority: p3
issue_id: "086"
tags: [code-review, ux, keyboard, discoverability]
dependencies: []
---

# 086 — Keyboard shortcuts are not discoverable (no help modal)

## Problem Statement

The app has ~15 keyboard shortcuts (Ctrl+Z, Ctrl+C, arrows, Delete, etc.) but they are not documented anywhere in the UI. New users cannot discover them. A simple help modal (triggered by `?` or `Ctrl+/` or a toolbar button) would significantly improve power-user adoption.

## Findings

**File:** `src/App.tsx:65-133` — keyboard handler defines all shortcuts

Shortcuts available but undocumented:
- Ctrl+Z / Ctrl+Shift+Z: Undo/Redo
- Ctrl+C/X/V: Copy/Cut/Paste
- Ctrl+D: Duplicate
- Ctrl+A: Select all
- Delete/Backspace: Delete selection
- Ctrl+=/−/0: Zoom
- Arrow keys (+ Shift): Nudge 1mm / 5mm

## Proposed Solutions

### Option A: Add keyboard shortcut modal (Recommended)
- `?` key or a `⌨` toolbar button opens a modal listing all shortcuts
- Simple table: Shortcut | Action
- Modal closes on Escape or clicking outside

**Pros:** Standard pattern (Figma, VS Code), high discoverability  
**Effort:** Small-Medium  
**Risk:** Low

### Option B: Add tooltip hints on toolbar buttons
Show keyboard shortcut in button tooltip (e.g., "元に戻す (Ctrl+Z)").

**Pros:** Contextual, no extra UI  
**Cons:** Doesn't cover non-button shortcuts (arrows, Delete)  
**Effort:** Small  
**Risk:** Low

## Recommended Action

Option B first (low effort, covers toolbar), Option A later for full discoverability.

## Technical Details

**Files affected:**
- `src/components/toolbar/Toolbar.tsx` — add shortcut hints to button titles
- `src/App.tsx` (optional) — add `?` key handler for modal
- New: `src/components/KeyboardShortcutsModal.tsx` (optional)

**Acceptance Criteria:**
- [ ] Toolbar buttons show shortcut in tooltip (e.g., "Ctrl+Z")
- [ ] OR: `?` key opens shortcuts reference modal
- [ ] Modal/tooltips cover all major shortcuts

## Work Log

- 2026-04-06: Filed from second-round UX review
