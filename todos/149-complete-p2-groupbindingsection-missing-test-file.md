---
status: complete
priority: p2
issue_id: "149"
tags: [code-review, testing, scalardb, react]
dependencies: []
---

# GroupBindingSection has no dedicated unit test file

## Problem Statement

`GroupBindingSection.tsx` owns the non-destructive namespace browsing logic, stale-namespace/stale-table detection, `effectiveTableValue` derivation, and `解除` button visibility. These are tested indirectly through `DbConnectionTab.test.tsx`, but indirect tests are brittle — if `GroupBindingSection` is extracted or renamed the coverage disappears with no signal.

## Findings

No `GroupBindingSection.test.tsx` exists in `src/components/modals/dbConnection/`.

The component contains non-trivial logic:
- `pendingNamespace` tracks UI state independently of the store's `boundNamespace`
- `effectiveTableValue` resets to `''` when browsing a different namespace than the bound one
- `staleNamespace` / `staleTableName` synthetic disabled `<option>` rendering
- `onShowCreate` toggle visible only when `group.tableMeta === undefined`

Confirmed by: Kieran-TS (H3).

## Proposed Solutions

### Option A: Create GroupBindingSection.test.tsx with focused unit tests

Key test cases:
1. Stale namespace option renders when `boundNamespace` absent from catalog
2. Stale table option renders when `boundTableName` absent from current namespace
3. `effectiveTableValue` is `''` when `pendingNamespace !== boundNamespace`
4. `解除` button only visible when `group.tableMeta` is defined
5. Namespace change via dropdown updates `pendingNamespace` but does NOT dispatch `bindGroupToTable`
6. Table change does dispatch `bindGroupToTable` with the correct meta

**Effort:** Medium | **Risk:** Low

## Recommended Action

Option A. This is test debt that should be addressed in the same sprint as the feature.

## Technical Details

- **New file:** `src/components/modals/dbConnection/GroupBindingSection.test.tsx`
- **Mock pattern:** Follow `DbConnectionTab.test.tsx` for store + fetch mocking

## Acceptance Criteria

- [ ] `GroupBindingSection.test.tsx` created with ≥ 6 test cases
- [ ] Stale namespace and stale table rendering covered
- [ ] Namespace browse (no-store-write) vs table selection (store-write) differentiated
- [ ] `解除` button visibility conditional on `tableMeta` presence

## Work Log

- 2026-04-11: Flagged by Kieran-TS (H3). Test gap for extracted component.
