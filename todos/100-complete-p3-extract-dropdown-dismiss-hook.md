---
status: complete
priority: p3
issue_id: "100"
tags: [code-review, refactor, toolbar, react]
dependencies: []
---

# 100 — Three triplicated dropdown close useEffect blocks in Toolbar.tsx

## Problem Statement

The click-outside and Escape key handlers for zoom, align, and z-order dropdowns are copy-pasted three times in Toolbar.tsx (lines 135-184). Each is ~16 lines. Only the state setter and ref differ. This is a maintenance hazard — a bug fix or improvement must be applied in all three places.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:135-184`

All three blocks follow the same pattern:
```tsx
useEffect(() => {
  if (!showXMenu) return
  const handler = (e: MouseEvent | KeyboardEvent) => {
    if (e instanceof KeyboardEvent && e.key === 'Escape') setShowXMenu(false)
    else if (e instanceof MouseEvent && xRef.current && !xRef.current.contains(e.target as Node)) setShowXMenu(false)
  }
  document.addEventListener('mousedown', handler)
  document.addEventListener('keydown', handler)
  return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', handler) }
}, [showXMenu])
```

## Proposed Solutions

### Option A: Extract useDropdownDismiss hook
```tsx
function useDropdownDismiss(ref: React.RefObject<HTMLElement>, isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { onClose(); return }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', handler) }
  }, [isOpen, onClose, ref])
}
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] `useDropdownDismiss` hook extracted (in Toolbar.tsx or a hooks file)
- [ ] All three dropdown close patterns use the hook
- [ ] Behavior unchanged

## Work Log
- 2026-04-06: Filed from third-round UX review
