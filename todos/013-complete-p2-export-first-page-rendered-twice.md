---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

exportReportToPdf renders pageEls[0] twice via html2canvas — once at line 21 to derive PDF dimensions, then again at line 33 inside the loop. This doubles export time for the first page and can cause visual inconsistency if the DOM changes between renders.

## Findings

TypeScript reviewer and performance reviewer both flagged this. exportUtils.ts:21 — `const firstCanvas = await html2canvas(pageEls[0], ...)` then loop at line 33 calls `html2canvas(pageEls[i], ...)` where i starts at 0. The first canvas is discarded.

## Proposed Solutions

A) Parallelize all pages via Promise.all and cache first canvas: `const canvases = await Promise.all(pageEls.map(el => html2canvas(el, {useCORS:true, scale:2})))` — eliminates double-render AND parallelizes multi-page export

B) Cache firstCanvas and skip re-render in loop (i===0 check) — simpler but still sequential

C) Derive dimensions from page settings (paperSize * scale) instead of from canvas — avoids the initial render entirely

## Recommended Action

## Technical Details

- Option A converts O(n) sequential export to O(1) parallel (all pages render concurrently)
- canvases[0] provides both dimensions and pixel data, eliminating the separate firstCanvas call
- For very large reports (many pages), Promise.all may cause memory pressure — consider Promise.allSettled with a concurrency limit if needed

## Acceptance Criteria

- [ ] pageEls[0] is rendered exactly once during PDF export
- [ ] Multi-page export is parallelized (all pages rendered concurrently)
- [ ] PDF output is identical to the previous sequential output
- [ ] Performance benchmark shows improvement for reports with 3+ pages

## Work Log

## Resources

- src/lib/exportUtils.ts:21-35
