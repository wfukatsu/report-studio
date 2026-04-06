---
status: complete
priority: p2
issue_id: "081"
tags: [code-review, accessibility, error-handling, export]
dependencies: []
---

# 081 — Export errors not announced to user

## Problem Statement

When PNG/PDF export fails (e.g., html2canvas or jsPDF throws), the error is caught and logged to console but **not shown to the user**. The user sees nothing — they may not realize the export failed, especially on large reports.

**Why it matters:** Silent failures are a poor UX. Users expect feedback when an action doesn't complete.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx`

The export functions call `exportToPNG` / `exportToPDF` from `src/lib/exportUtils.ts`. If these throw, there's no user-visible error state.

No toast, modal, or inline error message is rendered on export failure.

## Proposed Solutions

### Option A: Add error toast state (Recommended)
Add `exportError` state to Toolbar, set it on catch, display dismissible toast for 5 seconds.

```tsx
const [exportError, setExportError] = useState<string | null>(null)

try {
  await exportToPNG(canvasRefs)
} catch (e) {
  setExportError('エクスポートに失敗しました。もう一度お試しください。')
  setTimeout(() => setExportError(null), 5000)
}
```

Add `role="alert" aria-live="assertive"` to the error toast.

**Pros:** Immediate feedback, accessible  
**Cons:** Minor state addition  
**Effort:** Small  
**Risk:** Low

### Option B: Re-throw and handle in AppErrorBoundary
Let export errors propagate to AppErrorBoundary.

**Pros:** Centralized error handling  
**Cons:** Full-screen error for an export failure is too disruptive  
**Effort:** Small  
**Risk:** Medium (UX regression)

## Recommended Action

Option A — local error toast with ARIA live region.

## Technical Details

**Files affected:**
- `src/components/toolbar/Toolbar.tsx` — add exportError state + error toast

**Acceptance Criteria:**
- [ ] Export failure shows user-visible error message
- [ ] Error message auto-dismisses after 5 seconds
- [ ] Error is announced to screen readers via `role="alert"`
- [ ] Success path unchanged

## Work Log

- 2026-04-06: Filed from second-round UX review
