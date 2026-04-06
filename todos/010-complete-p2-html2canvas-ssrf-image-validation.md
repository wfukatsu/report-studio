---
status: pending
priority: p2
issue_id: "010"
tags: [code-review, security, performance]
dependencies: []
---

## Problem Statement

exportUtils.ts calls html2canvas with `useCORS: true` and no URL allowlist. Any image src URL in the canvas will be fetched during export, allowing SSRF-class attacks (probing internal network addresses) and cookie leakage to image servers.

## Findings

Security reviewer: useCORS: true causes html2canvas to issue cross-origin GET requests from the user's browser to any image URL at export time. Internal network addresses (192.168.x.x) can be probed. Same-site cookies are sent. No URL validation exists before export. Also: exportUtils.ts:21,33 renders pageEls[0] twice — once to derive dimensions, once in the loop. This doubles export time for the first page.

## Proposed Solutions

A) Validate all image src values before export using isSafeImageSrc() (only allow https://, http://, data:image/*) — resolves both SSRF risk and data:text/ XSS

B) Remove useCORS: true — images from different origins won't load but security risk is eliminated

C) Add an allowlist of trusted image origins configurable in settings

## Recommended Action

## Technical Details

- isSafeImageSrc() should reject data:text/, file://, and bare IP addresses in the private range
- The double-render bug (exportUtils.ts:21,33) can be fixed in the same pass by caching the first canvas result instead of re-rendering
- See issue 013 for the dedicated performance fix for the double-render

## Acceptance Criteria

- [ ] All image src values are validated before export begins
- [ ] Private IP addresses (10.x, 172.16-31.x, 192.168.x, 127.x) are rejected with a clear error
- [ ] data:text/ and file:// URLs are rejected
- [ ] isSafeImageSrc() has unit tests covering all rejection cases
- [ ] Export with a valid https:// image still works correctly

## Work Log

## Resources

- src/lib/exportUtils.ts:8,21,33
