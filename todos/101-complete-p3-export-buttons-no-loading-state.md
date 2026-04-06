---
status: complete
priority: p3
issue_id: "101"
tags: [code-review, ux, toolbar, export]
dependencies: []
---

# 101 — Export buttons have no loading/disabled state during html2canvas

## Problem Statement

PNG and PDF export can take 2-10 seconds (html2canvas rendering + jsPDF assembly). During this time, the export buttons show no loading indicator and are not disabled. Users may click multiple times, triggering concurrent exports that compete for memory and may produce corrupted output.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:72-94` — handleExportPng / handleExportPdf

No loading state set before/after the async export call.

## Proposed Solutions

### Option A: Add isExporting state
```tsx
const [isExporting, setIsExporting] = useState(false)

const handleExportPng = async () => {
  if (isExporting) return
  setIsExporting(true)
  try { await exportToPNG(canvasRefs) }
  catch (e) { setExportError('...') }
  finally { setIsExporting(false) }
}
```

Disable both export buttons when `isExporting` and show a spinner or "エクスポート中..." label.

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] Export buttons are disabled during export
- [ ] Visual loading indicator shown (spinner or text change)
- [ ] Concurrent exports prevented

## Work Log
- 2026-04-06: Filed from third-round UX review
