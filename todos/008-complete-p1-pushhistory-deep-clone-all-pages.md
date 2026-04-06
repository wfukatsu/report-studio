---
status: pending
priority: p1
issue_id: "008"
tags: [code-review, performance]
dependencies: []
---

## Problem Statement

`pushHistory` calls `snapshot(s.report.pages) = JSON.parse(JSON.stringify(pages))` on every `updateElement` call, including during color picker `onChange` (continuous at ~60fps). At 100 elements × ~1KB each, this is 100KB of serialization per event. History retaining 50 deep-cloned copies represents ~5MB of baseline RAM growth.

## Findings

- `reportStore.ts:198-207` — `updateElement` calls `pushHistory` unconditionally after every element property change.
- `reportStore.ts:89` — snapshot implementation uses `JSON.parse(JSON.stringify(...))` for deep cloning.
- `moveElement` and `resizeElement` correctly skip `pushHistory` (too noisy during drag). `updateElement` does not follow this pattern.
- Style edits such as color picker `onChange` fire `updateElement` at frame rate, causing repeated 100KB+ serializations per second.
- History array is capped at 50 entries, each containing a full deep clone of all pages — at 100 elements the memory footprint is significant and grows with canvas complexity.

## Proposed Solutions

**A) Throttle `pushHistory` in `updateElement`** — Only commit to history on blur/commit events (e.g. `onBlur`, `onPointerUp`, explicit confirm), not on `onChange`. Standard UX pattern for text inputs and color pickers that keeps undo granularity reasonable without excessive snapshots.

**B) Add a `deferredPushHistory` that batches rapid changes into a single history entry using debounce** — Automatically coalesces rapid `updateElement` calls into one snapshot after a quiet period (e.g. 500ms). Keeps the call site unchanged but requires a debounce timer in the store.

**C) Replace `JSON.parse`/`JSON.stringify` with `structuredClone` for performance gain** — `structuredClone` is ~2-3x faster than JSON round-trip for typical objects. Marginal improvement alone — does not fix the frequency problem but reduces per-snapshot cost.

**Recommended: A + C** — Throttle `pushHistory` calls at the input component level (call only on commit, not on change) AND replace `JSON.parse/JSON.stringify` with `structuredClone` for lower per-snapshot cost.

## Recommended Action

## Technical Details

- Color picker and text input components should call `updateElement` with `pushHistory: false` on `onChange` and `pushHistory: true` on `onBlur`/`onCommit`. This requires a `skipHistory` flag on `updateElement` or separate `updateElementTransient` / `commitElement` actions.
- `structuredClone` is available in all modern browsers and Node 17+. It handles circular references and typed arrays more correctly than JSON round-trip.
- immer proxy objects cannot be `structuredClone`d — this is already noted in the codebase. The snapshot must be taken on the plain JS object after immer finalizes the draft, which is the current timing.

## Acceptance Criteria

- Rapid `onChange` events from a color picker do not add entries to the undo history.
- A single undo after a color change reverts to the color before editing began, not to an intermediate value.
- `structuredClone` is used consistently in the snapshot function instead of `JSON.parse(JSON.stringify(...))`.
- Memory profile shows no growth during continuous color picker drag at 100 elements.

## Work Log

## Resources

- src/store/reportStore.ts:89,194,198-207
