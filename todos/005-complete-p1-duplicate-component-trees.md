---
status: pending
priority: p1
issue_id: "005"
tags: [code-review, architecture, quality]
dependencies: []
---

## Problem Statement

Two separate implementations of the same components coexist: `src/components/sidebar/` (wired to the store, used by App.tsx) and `src/components/organisms/` (Storybook only, not imported by the running application). `PropertiesPanel`, `ElementPalette`, `DataSourcePanel`, and `Toolbar`/`EditorToolbar` each have two versions. Bugs fixed in one silently do not apply to the other.

## Findings

- `App.tsx` imports exclusively from `sidebar/`, `toolbar/`, and `canvas/`. `organisms/` is never imported by App.tsx or any transitive application file.
- Grep confirms no organism is reachable from the app's runtime import graph.
- The old `PropertiesPanel` in `sidebar/` is a 279-line god component; the organism correctly delegates to sub-panels — it represents a better architecture.
- Having two components with the same name in different directories causes confusion about which is canonical and which should receive bug fixes.

## Proposed Solutions

**A) Designate `organisms/` as the Phase 1 migration target** — Wire organism components into `App.tsx` by connecting them to the Zustand store, then delete the `sidebar/` equivalents. This is the correct long-term approach that preserves the better architecture.

**B) Delete `organisms/` and treat `sidebar/` as the canonical implementation** — Faster short-term but discards the improved architecture (tab-based PropertiesPanel, separated sub-panels per concern).

**C) Add `@storybook-only` comments or a lint rule to mark non-integrated organisms** — No-op: does not resolve the duplication, does not eliminate divergence risk.

**Recommended: A** — the organism layer represents the correct architecture. Wire organisms into `App.tsx` in Phase 1 as part of the type model migration (see issue 006).

## Recommended Action

## Technical Details

- Duplicate component pairs: `PropertiesPanel` (sidebar vs organisms), `ElementPalette` (sidebar vs organisms), `DataSourcePanel` (sidebar vs organisms), `EditorToolbar`/`Toolbar` (toolbar vs organisms).
- Migration requires connecting organism components to the Zustand store — they currently use `Record<string,unknown>` placeholders.
- Should be coordinated with issue 006 (type model migration) since organisms use the planned new type model.

## Acceptance Criteria

- No two files with the same component name exist in different directories.
- `App.tsx` imports only from one canonical location per component type.
- The running application is functionally equivalent before and after the migration.
- Storybook stories are updated to import from the canonical location.

## Work Log

## Resources

- src/components/sidebar/
- src/components/organisms/
- src/App.tsx
