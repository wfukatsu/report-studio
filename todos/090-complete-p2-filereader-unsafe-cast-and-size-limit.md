---
status: complete
priority: p2
issue_id: "090"
tags: [code-review, typescript, security, file-import]
dependencies: []
---

# 090 — FileReader result unsafe cast + no file size limit on import

## Problem Statement

Two related issues in the file open flow:
1. `ev.target?.result as string` — `FileReader.result` can be `null` or `ArrayBuffer`. The unsafe cast means if result is non-string, `importReportJSON` receives invalid input and fails silently or throws an unclear error.
2. No file size check before `readAsText()` — a user could select a 500MB file and the browser will attempt to read the entire contents into memory.

## Findings

**File:** `src/components/toolbar/Toolbar.tsx:120-125`
```tsx
const text = ev.target?.result as string
importReportJSON(text, ...)
```

## Proposed Solutions

### Option A: Type guard + size limit (Recommended)
```tsx
// In handleFileChange before readAsText:
if (file.size > 10 * 1024 * 1024) {
  setImportError('ファイルサイズが大きすぎます（10MB以下）')
  return
}

// In onload handler:
const text = ev.target?.result
if (typeof text !== 'string') return
importReportJSON(text, ...)
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria
- [ ] Files over 10MB are rejected with user-visible error
- [ ] typeof check before calling importReportJSON
- [ ] No unsafe `as string` cast

## Work Log
- 2026-04-06: Filed from third-round UX review
