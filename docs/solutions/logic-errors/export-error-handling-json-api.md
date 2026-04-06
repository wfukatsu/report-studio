---
title: Export Error Handling — JSON API, Loading State & File Validation
problem_type: logic_error
component: exportUtils, Toolbar, migration, layoutSlice
severity: p2
tags:
  - export
  - error-handling
  - json-api
  - loading-state
  - filereader
  - type-safety
date: 2026-04-06
resolved_todos:
  - 011 (no error handling on export)
  - 013 (export first page rendered twice)
  - 019 (no export report JSON action)
  - 081 (export error not announced to user)
  - 090 (FileReader unsafe cast and size limit)
  - 101 (export buttons no loading state)
---

## Issue 1: Export Functions Had No Error Handling

### Problem
`exportPageToPng()` and `exportReportToPdf()` had no try/catch. When html2canvas threw
(e.g., cross-origin resource failure), the export silently failed with no user feedback.

### Fix
```typescript
// src/lib/exportUtils.ts
export async function exportPageToPng(canvasEl: HTMLElement, fileName = 'report.png') {
  try {
    const canvas = await html2canvas(canvasEl, { useCORS: true, scale: EXPORT_SCALE })
    const link = document.createElement('a')
    link.download = fileName
    link.href = canvas.toDataURL('image/png')
    link.click()
  } catch (err) {
    throw new Error(`PNG export failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
```

Same pattern applied to `exportReportToPdf()`.

---

## Issue 2: First Page Rendered Twice in PDF Export

### Problem
`exportReportToPdf()` called html2canvas on `pageEls[0]` twice: once to derive PDF
dimensions, then again in the main loop. This doubled the rendering cost for page 1 and
wasted the first canvas result.

### Fix — Parallel rendering with `Promise.all`
```typescript
// src/lib/exportUtils.ts
export async function exportReportToPdf(pageEls: HTMLElement[], fileName = 'report.pdf') {
  if (pageEls.length === 0) return
  try {
    // Render all pages in parallel — avoids double-rendering page 0
    const canvases = await Promise.all(
      pageEls.map((el) => html2canvas(el, { useCORS: true, scale: EXPORT_SCALE })),
    )
    const pdfWidth  = canvases[0].width  / EXPORT_SCALE
    const pdfHeight = canvases[0].height / EXPORT_SCALE
    // ...assemble PDF from canvases...
  } catch (err) {
    throw new Error(`PDF export failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
```

---

## Issue 3: No JSON Export/Import API in Store

### Problem
No `exportReportJSON()` / `importReportJSON()` actions existed. Callers had to read
`store.definition` directly and handle serialization themselves, with no validation contract.

### Fix — Structured API with Result type
```typescript
// src/store/types.ts
exportReportJSON: () => string
importReportJSON: (json: string) => { ok: boolean; error?: string }
```

```typescript
// src/store/layoutSlice.ts
exportReportJSON: () => exportToJSON(get().definition),

importReportJSON: (json) => {
  const result = importFromJSON(json)
  if (!result.ok) return { ok: false, error: result.error }
  get().loadReport(result.definition)
  return { ok: true }
},
```

`importFromJSON()` (`src/lib/migration.ts`) performs:
1. `JSON.parse` with error handling
2. Schema version detection (`$schema` field)
3. Zod validation against `ReportDefinitionSchema`
4. Legacy format auto-migration
5. Descriptive error messages for all failure modes

---

## Issue 4: Export Errors Not Shown to User

### Problem
Errors were caught in Toolbar but only logged to console — never displayed in the UI.

### Fix — Error toast with auto-dismiss and ARIA live region
```tsx
// src/components/toolbar/Toolbar.tsx
const [exportError, setExportError] = useState<string | null>(null)

const handleExportPdf = async () => {
  if (isExporting) return
  setIsExporting(true)
  setExportError(null)
  try {
    const els = canvasRefs.map((r) => r.current).filter((el): el is HTMLDivElement => el !== null)
    await exportReportToPdf(els, `${reportName}.pdf`)
  } catch (_err) {
    const msg = 'エクスポートに失敗しました。もう一度お試しください。'
    setExportError(msg)
    setTimeout(() => setExportError((prev) => (prev === msg ? null : prev)), 5000)
  } finally {
    setIsExporting(false)
  }
}

// Rendered toast:
<div role="alert" aria-live="assertive" aria-atomic="true">
  {exportError && (
    <div className="flex items-center gap-1 text-xs text-destructive">
      <AlertCircle className="w-3 h-3" />
      <span>{exportError}</span>
      <button onClick={() => setExportError(null)}>×</button>
    </div>
  )}
</div>
```

---

## Issue 5: FileReader Unsafe Cast and No Size Limit

### Problem
`ev.target?.result as string` — `FileReader.result` can be `null` or `ArrayBuffer`.
The unsafe cast bypasses TypeScript's type system. Additionally, no file size check
meant users could select 500 MB files, blocking the main thread.

### Fix
```typescript
// src/components/toolbar/Toolbar.tsx
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > MAX_FILE_SIZE) {
    setExportError('ファイルサイズが大きすぎます（10MB以下にしてください）')
    e.target.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = (ev) => {
    const text = ev.target?.result
    if (typeof text !== 'string') return    // runtime type guard — not a cast
    const result = importReportJSON(text)
    if (!result.ok) setExportError(result.error ?? '読み込みに失敗しました')
  }
  reader.readAsText(file)
  e.target.value = ''
}
```

---

## Issue 6: Export Buttons No Loading State

### Problem
PNG/PDF export takes 2–10 seconds. Buttons remained enabled during export — rapid
clicks launched concurrent exports competing for memory and producing corrupted output.

### Fix — Shared `isExporting` flag
```tsx
// src/components/toolbar/Toolbar.tsx
const [isExporting, setIsExporting] = useState(false)

<ToolbarButton onClick={handleExportPng} disabled={isExporting} title="現在のページをPNGでエクスポート">
  <FileImage className="w-4 h-4" />
  <span className="text-xs ml-1">{isExporting ? '...' : 'PNG'}</span>
</ToolbarButton>

<ToolbarButton onClick={handleExportPdf} disabled={isExporting} title="PDFでエクスポート">
  <FileText className="w-4 h-4" />
  <span className="text-xs ml-1">{isExporting ? '...' : 'PDF'}</span>
</ToolbarButton>
```

Both buttons share `isExporting` — only one export can run at a time.

---

## Prevention Checklist

- [ ] All async export functions wrapped in try/catch — throw `Error` with user-readable message
- [ ] Export buttons use shared `isExporting` flag — disabled during operation
- [ ] Export errors shown via `role="alert"` toast, not console-only
- [ ] JSON import goes through `importReportJSON()` — never direct `JSON.parse` + cast
- [ ] FileReader handlers use `typeof result !== 'string'` guard — never `as string`
- [ ] File size checked before `readAsText()` — reject over 10 MB
