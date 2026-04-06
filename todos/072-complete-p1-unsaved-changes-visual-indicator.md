---
status: complete
priority: p1
issue_id: "072"
tags: [ux-review, ux, data-safety]
dependencies: []
---

## Problem

The app has `beforeunload` warnings but no visible "unsaved changes" indicator. The Save button looks identical whether work is saved or not. Business users have no way to know if their work needs saving — they may close the browser without saving.

## Findings

- `src/components/toolbar/Toolbar.tsx:239` — Save button has no dirty state indicator
- `src/App.tsx:53-62` — historyIndex > 0 = unsaved, but this state is not surfaced in the UI
- Standard apps (Word, VS Code, Figma) show a dot or modified indicator in the title bar

## Solutions

### A) Add a dot indicator near the document title
```tsx
// In Toolbar.tsx, near the document name input:
{historyIndex > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-1 shrink-0" title="未保存の変更があります" />}
```

### B) Append dot to document name
`{historyIndex > 0 ? '● ' : ''}{reportName}`

### C) Change Save button appearance
Add `active={historyIndex > 0}` prop to Save ToolbarButton.

**Recommended: A + C together** — subtle dot for global awareness, button highlight for action affordance.

## Files

- `src/components/toolbar/Toolbar.tsx`

## Acceptance Criteria

- [ ] Visual indicator visible when historyIndex > 0
- [ ] Indicator disappears after saving
- [ ] Indicator is accessible (not color-only)
