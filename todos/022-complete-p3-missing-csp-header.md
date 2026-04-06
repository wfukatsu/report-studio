---
status: pending
priority: p3
issue_id: "022"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

index.html has no Content-Security-Policy meta tag. vite.config.ts configures no CSP headers. If any XSS vector is exploited, there is no defense-in-depth layer to block script execution or exfiltration. html2canvas already makes external HTTP requests at export time (see 010).

## Findings

Security reviewer: index.html — no `<meta http-equiv="Content-Security-Policy">`. vite.config.ts — no `server.headers` configuration. The `img-src` CSP directive would also limit which URLs html2canvas can fetch, providing browser-enforced URL validation.

## Proposed Solutions

A) Add CSP meta tag to index.html: `default-src 'self'; img-src 'self' https: data:image/*; style-src 'self' 'unsafe-inline'; script-src 'self'` — covers the main attack surface

B) Configure CSP as a server response header in production (more robust — cannot be stripped by injection)

C) Use a CSP nonce with Vite plugin

## Recommended Action

<!-- Leave blank -->

## Technical Details

- A (meta tag) is available in dev and static deployments immediately
- B (response header) requires server/CDN configuration but is the stronger protection
- The `img-src 'self' https: data:image/*` directive would also serve as a secondary mitigation for the html2canvas SSRF risk documented in issue 010
- `style-src 'unsafe-inline'` is required because the app uses inline styles extensively for element positioning and sizing

## Acceptance Criteria

- [ ] CSP policy is defined and applied (meta tag or response header)
- [ ] No legitimate app functionality is broken by the policy
- [ ] The policy covers at minimum: `default-src`, `script-src`, `style-src`, `img-src`
- [ ] CSP violations are surfaced in browser devtools during development

## Work Log

## Resources

- Files: `index.html`, `vite.config.ts`
- Related: issue 010 (html2canvas SSRF / image validation)
