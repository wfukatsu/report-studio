---
status: pending
priority: p1
issue_id: "003"
tags: [code-review, react, quality]
dependencies: []
---

## Problem Statement

`App.tsx:32-34` calls `setActivePage(pages[0].id)` conditionally during the render body. This causes a synchronous re-render (infinite loop risk under React Strict Mode) and violates React's requirement that render functions be pure and free of side effects.

## Findings

- The pattern `if (!activePageId && pages.length > 0) { setActivePage(pages[0].id) }` executes in the function body of App — not in an effect.
- React StrictMode double-invokes render functions, causing two store mutations per mount in development.
- The guard exists only because the initial Zustand store state has `activePageId: null` before `newReport()` or `loadReport()` are called.
- Both `newReport()` and `loadReport()` already set `activePageId` to `pages[0].id`, meaning the root cause is that the store's initial state does not pre-initialize `activePageId`.

## Proposed Solutions

**A) Move to `useEffect` with `[pages, activePageId]` dependencies** — Safe, minimal change. Defers the store mutation to after render, preventing the pure-render violation.

**B) Initialize `activePageId` in the Zustand store's initial state by invoking `newReport()` logic during store construction** — Eliminates the guard entirely; the store is always in a valid state from the first render. Recommended as it removes the root cause rather than the symptom.

**C) Call `newReport()` from App's `useEffect` on first mount if no pages exist** — Similar to A but also handles the empty-pages edge case explicitly.

**Recommended: B** — removes the root cause. The store should never be in a state where `activePageId` is null while `pages` is non-empty.

## Recommended Action

## Technical Details

- Offending code location: `src/App.tsx:28-34`.
- Store initial state defined in `src/store/reportStore.ts` — the `activePageId: null` initial value is the root cause.
- `newReport()` action already creates a default page and sets `activePageId`; its logic can be run at store initialization time.
- React's rules of render: state updates during render are only allowed in the same render cycle (via `useState` setter with conditional return pattern), not via external store setters.

## Acceptance Criteria

- No store action (`setActivePage` or equivalent) is called during the render body of any component.
- React Strict Mode does not cause double-setting of `activePageId` on mount.
- App renders correctly on first load with `activePageId` already set to a valid page ID.
- Existing tests for App rendering pass without modification.

## Work Log

## Resources

- src/App.tsx:28-34
- src/store/reportStore.ts (initial state definition)
