---
status: pending
priority: p1
issue_id: "006"
tags: [code-review, architecture, type-safety]
dependencies: []
---

## Problem Statement

`src/types/index.ts` is entirely the old flat `Report → Page → ReportElement[]` model. The planned `ReportDefinition` hierarchy (`Metadata`, `Section`, `DataSourceDefinition`, `OutputVariant`, `ValidationRule`, `CalculationRule`) does not exist. `builtinTemplates.ts` uses the old model with hardcoded px values. When Phase 1 type migration begins, every file importing from `@/types` will fail to compile simultaneously.

## Findings

- The store, templates, and all canvas components use the old flat type model.
- New organism components use `Record<string,unknown>` as a placeholder, confirming they were designed for the new model but cannot be properly typed yet.
- `BasicPropsPanel` in organisms expects `{ position: { x, y }, size: { width, height } }` (nested) but the current model uses flat `{ x, y, width, height }` — these are structurally incompatible without an adapter layer.
- The brainstorm document at `docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md` contains the full target `ReportDefinition` model.
- An atomic migration of all consumers in one PR is technically feasible and eliminates the ambiguity of a parallel-model period.

## Proposed Solutions

**A) Define `ReportDefinition` types in a new `src/types/reportDefinition.ts`, keep old types in `index.ts` during migration** — Allows gradual migration of consumers but creates a period of ambiguity where two models coexist and diverge.

**B) Replace `src/types/index.ts` atomically with the `ReportDefinition` model, migrate all consumers in one PR** — Higher upfront cost but eliminates ambiguity. The brainstorm document explicitly chose this approach to pay off tech debt in Phase 1.

**C) Create a type adapter layer that converts between old and new** — Introduces ongoing technical debt and two runtime representations of the same data.

**Recommended: B** — the brainstorm doc explicitly decided Phase 1 should perform full type migration to avoid prolonged parallel models.

## Recommended Action

## Technical Details

- Target type hierarchy from brainstorm: `ReportDefinition` (root), `Metadata`, `Section[]`, `DataSourceDefinition`, `OutputVariant[]`, `ValidationRule[]`, `CalculationRule[]`.
- All consumers of old types: `src/store/reportStore.ts`, `src/templates/builtinTemplates.ts`, all files under `src/components/canvas/`, all files under `src/components/sidebar/`.
- The position/size shape change (`{ x, y }` → `{ position: { x, y }, size: { width, height } }`) will require updating canvas drag/resize logic in `CanvasElement.tsx` and `ReportCanvas.tsx`.
- This migration should be coordinated with issue 005 (duplicate component trees) since both involve replacing sidebar components with organisms.

## Acceptance Criteria

- `src/types/index.ts` exports `ReportDefinition`, `Section`, and the new `Element` hierarchy matching the brainstorm document.
- No file in the codebase uses the old `Report`, `Page`, or `ReportElement` types.
- All TypeScript compilation errors introduced by the migration are resolved.
- The application builds and passes all tests after migration.
- `builtinTemplates.ts` uses the new type model with no hardcoded px values outside of layout constants.

## Work Log

## Resources

- src/types/index.ts
- src/store/reportStore.ts
- src/templates/builtinTemplates.ts
- src/components/canvas/
- src/components/sidebar/
- docs/brainstorms/2026-04-05-report-definition-studio-architecture-brainstorm.md
