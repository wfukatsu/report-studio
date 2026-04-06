---
status: pending
priority: p3
issue_id: "068"
tags: [ux-review, responsive, ux, layout]
dependencies: []
---

# Responsive Collapsible Sidebars

## Problem

Left (208px) and right (224px) sidebars have fixed widths totaling 432px. On viewports under ~800px, the canvas area becomes unusably small. No breakpoints, no collapsible behavior.

## Findings

`src/App.tsx:108,141` — `w-52` left, `w-56` right, both `shrink-0`; canvas `<main>` has no `min-w-0`; no responsive breakpoints; Live Preview pane adds a 4th panel which makes it worse.

## Solutions

### A) Add collapse toggle buttons to each sidebar

Clicking collapses to icon-only strip or hides entirely.

### B) Use CSS breakpoints

Auto-collapse right sidebar below 1024px, left sidebar below 768px.

### C) Make canvas `<main>` have `min-w-[400px]`

Allow sidebars to shrink.

## Recommended

Options A + C together.

## Files

- `src/App.tsx:106-153`
