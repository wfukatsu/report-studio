---
status: complete
priority: p3
issue_id: "111"
tags: [code-review, typescript, yagni]
dependencies: []
---

## Problem Statement

`rulesSlice.ts` exports `addTemplateVariable`, `updateTemplateVariable`, and `removeTemplateVariable` actions. No component in the codebase calls any of them. They were scaffolded speculatively during the DataBinding implementation but no UI was built that consumes them. Dead code adds cognitive overhead when reading the store.

## Findings

**File:** `src/store/rulesSlice.ts`

The three actions and their type declarations exist in the `RulesSlice` interface and implementation but have zero callers:

```typescript
addTemplateVariable: (v: TemplateVariable) => void
updateTemplateVariable: (id: string, patch: Partial<TemplateVariable>) => void
removeTemplateVariable: (id: string) => void
```

Grepping the source for `addTemplateVariable`, `updateTemplateVariable`, `removeTemplateVariable` returns only the definition file and no call sites.

`TemplateVariable` itself is defined in `src/types/index.ts` and used in `ReportDefinition.templateVariables`, which is the correct home for the type. The type should stay. Only the store actions are dead.

## Proposed Solutions

**A) Remove the three dead actions (Recommended, Trivial)**

Delete the three methods from `RulesSlice` interface and implementation. The `TemplateVariable` type stays in `src/types/index.ts`. If a UI for template variables is later added, the actions can be re-introduced at that time.

**B) Keep them as scaffolding**

Accept the dead code as forward-looking scaffolding. Not recommended — YAGNI applies here.

## Recommended Action

Option A — delete the three dead actions. The types remain. No UI functionality changes.

## Technical Details

- **File**: `src/store/rulesSlice.ts`
- The `TemplateVariable` type and `definition.templateVariables` array should NOT be removed — they are part of `ReportDefinition` schema and used in serialization
- Only the three Zustand action methods are dead

## Acceptance Criteria

- [ ] `rulesSlice.ts` no longer exports `addTemplateVariable`, `updateTemplateVariable`, or `removeTemplateVariable`
- [ ] `TemplateVariable` type remains in `src/types/index.ts`
- [ ] `definition.templateVariables` array field remains in the store
- [ ] All tests pass

## Work Log

- 2026-04-06: Identified by Simplicity reviewer and Architecture reviewer
