---
status: complete
priority: p3
issue_id: "102"
tags: [code-review, security, csp]
dependencies: []
---

# 102 — CSP has unsafe-inline in script-src + no file import size limit

## Problem Statement

Two security hardening issues:
1. `index.html` CSP meta tag includes `script-src 'self' 'unsafe-inline'`. While no current XSS vector exists, unsafe-inline undermines CSP as a defense-in-depth measure.
2. No file size check before `FileReader.readAsText()` — a 500MB file would be loaded entirely into memory.

Note: The file size check overlaps with todo 090 which covers the type safety aspect. This todo focuses on the security/hardening aspect.

## Findings

**File:** `index.html:7-8` — `script-src 'self' 'unsafe-inline'`

**File:** `src/components/toolbar/Toolbar.tsx:115` — `handleFileChange` with no size check

## Proposed Solutions

### Option A: Remove unsafe-inline (requires Vite nonce plugin)
Replace `'unsafe-inline'` with nonce-based CSP. Use `vite-plugin-csp` or similar.

**Effort:** Medium | **Risk:** Medium (may break Vite HMR in dev)

### Option B: Add file size check (10MB limit)
Simple `if (file.size > 10 * 1024 * 1024) return` before readAsText.

**Effort:** Small | **Risk:** Low

## Recommended Action

Option B immediately. Option A as a follow-up.

## Acceptance Criteria
- [ ] Files > 10MB rejected with user-visible message
- [ ] CSP unsafe-inline documented with a TODO for nonce migration

## Work Log
- 2026-04-06: Filed from third-round UX review
