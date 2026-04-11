---
status: complete
priority: p3
issue_id: "160"
tags: [code-review, correctness, autosave]
dependencies: []
---

# useAutoSave: sendBeacon sends text/plain instead of application/json

## Problem Statement

`navigator.sendBeacon(url, JSON.stringify(snap))` sends the body with `Content-Type: text/plain;charset=UTF-8` (the default for a `string` argument). If the Javalin backend's content-type negotiation rejects non-`application/json` bodies on `PUT /api/v2/templates/{id}`, the beacon silently fails with no retry mechanism. This was pre-existing, but since `schema` binding data now flows through the beacon path (added in this PR), correctness matters more.

## Findings

**File:** `src/hooks/useAutoSave.ts:68`

```ts
navigator.sendBeacon(`/api/v2/templates/${id}`, JSON.stringify(snap))
```

Should be:
```ts
navigator.sendBeacon(
  `/api/v2/templates/${id}`,
  new Blob([JSON.stringify(snap)], { type: 'application/json' }),
)
```

Confirmed by: Kieran-TS second pass LOW.

## Proposed Solutions

Replace the `string` argument with a `Blob` that explicitly sets `Content-Type: application/json`.

**Effort:** Tiny | **Risk:** None

## Acceptance Criteria

- [ ] `sendBeacon` call uses `new Blob([JSON.stringify(snap)], { type: 'application/json' })`
- [ ] Verified the Javalin endpoint accepts the beacon payload (manual smoke test on tab close)

## Work Log

- 2026-04-11: Pre-existing gap, now more impactful with schema data flowing through autosave.
