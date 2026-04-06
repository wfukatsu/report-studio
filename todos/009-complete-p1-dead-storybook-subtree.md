---
status: pending
priority: p1
issue_id: "009"
tags: [code-review, quality, simplicity]
dependencies: []
---

## Problem Statement

The entire `src/components/atoms/`, `src/components/molecules/`, `src/components/organisms/`, and `src/components/templates/EditorLayout/` sub-trees (~70 files, ~1,900 LOC) are never imported by the running application. `App.tsx` imports only from `sidebar/`, `toolbar/`, and `canvas/`. This dead code doubles the cognitive load of navigating the codebase and will diverge from the real app indefinitely.

## Findings

- Grep confirms: `organisms/` appears in zero application import paths outside of `EditorLayout.stories.tsx`.
- All 8 atoms, 9 molecules, 13 organisms, and 1 `EditorLayout` template component are Storybook-only.
- `App.tsx` and all transitive application imports exclusively use `sidebar/` components as the canonical running implementation.
- Storybook was built as a parallel design-system prototype — it was never wired into the application as an integration path.
- The dead subtree creates maintenance confusion: developers may fix bugs in `organisms/` components believing they are fixing the running app.

## Proposed Solutions

**A) Keep Storybook components, wire them into `App.tsx` as Phase 1 work** — Migrate `App.tsx` to use organisms instead of sidebar components. Correct approach if Storybook IS the intended migration target (coordinated with issues 005 and 006).

**B) Delete `atoms/`, `molecules/`, `organisms/`, and `templates/EditorLayout/` sub-trees; treat `sidebar/` as canonical** — Removes the confusion immediately. Appropriate if Storybook was purely exploratory and the organism architecture will not be adopted.

**C) Move Storybook-only components to a top-level `storybook/` directory** — Makes the separation explicit but does not remove the duplication or resolve the divergence risk.

**Recommended: A** if Phase 1 explicitly migrates to organisms (see issues 005, 006) — confirm with product owner. If the Storybook components were exploratory only, choose **B**.

## Recommended Action

## Technical Details

- Dead subtree inventory: `src/components/atoms/` (8 components), `src/components/molecules/` (9 components), `src/components/organisms/` (13 components), `src/components/templates/EditorLayout/` (1 layout template).
- Total: ~70 files, ~1,900 LOC unreachable from the running application.
- All story files (`*.stories.tsx`) reference these components — deleting the subtree (option B) requires deleting or relocating the corresponding stories.
- This issue has a direct dependency relationship with issue 005 (duplicate component trees) and issue 006 (type model migration): the right resolution for this issue depends on whether organisms are promoted to canonical status.

## Acceptance Criteria

- One canonical implementation per component accessible from the running application.
- No unreachable component files exist outside of an explicitly designated `storybook/` directory (if keeping Storybook) or no unreachable component files at all (if deleting).
- `App.tsx` imports only from one canonical location per component type.
- Storybook either builds from the canonical components or is explicitly scoped to a separate directory.

## Work Log

## Resources

- src/components/atoms/ (8 components)
- src/components/molecules/ (9 components)
- src/components/organisms/ (13 components)
- src/components/templates/EditorLayout/
- src/App.tsx
