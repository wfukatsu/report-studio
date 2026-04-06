---
status: complete
priority: p3
issue_id: "114"
tags: [code-review, architecture, agent-parity]
dependencies: []
---

## Problem Statement

`templateUtils.ts` exposes `applyTemplate(template)` which accepts a full `Template` object. An agent or programmatic caller that wants to load a built-in template by ID must first find the template object (by importing `builtinTemplates` and filtering), then call `applyTemplate`. There is no convenience function `loadBuiltinTemplate(id: string)` that does this in one step, creating a friction gap between UI (which uses `TemplateSelectionModal`) and agent/API usage.

## Findings

**File:** `src/lib/templateUtils.ts`

Current exports:
- `applyTemplate(template: Template): ReportDefinition`
- `createBlankDefinition(): ReportDefinition`

An agent wishing to start from a specific template must:
1. Import `builtinTemplates` from `src/templates/builtinTemplates.ts`
2. Find the template by `id`
3. Call `applyTemplate(found)`
4. Handle the "not found" case

This is three steps that could be one. The agent-native reviewer flagged that every UI action a user can take should be expressible as a single function call for agents.

## Proposed Solutions

**A) Add `loadBuiltinTemplate(id: string): ReportDefinition | null` to `templateUtils.ts` (Recommended, Trivial)**

```typescript
import { builtinTemplates } from '@/templates/builtinTemplates'

export function loadBuiltinTemplate(id: string): ReportDefinition | null {
  const template = builtinTemplates.find((t) => t.id === id)
  return template ? applyTemplate(template) : null
}
```

Simple, discoverable, testable. Agents can call `loadBuiltinTemplate('invoice')` in one line.

**B) Add `templateId` parameter to `applyTemplate`**

Overload `applyTemplate` to accept either a `Template` or a `string` id. More complex API; not worth the complexity over Option A.

## Recommended Action

Option A — trivial addition with no behavioral changes to existing code.

## Technical Details

- **File**: `src/lib/templateUtils.ts`
- The function should return `null` rather than throwing for unknown IDs, allowing callers to handle gracefully

## Acceptance Criteria

- [ ] `loadBuiltinTemplate(id)` exported from `templateUtils.ts`
- [ ] Returns a `ReportDefinition` for a valid built-in template ID
- [ ] Returns `null` for an unknown ID
- [ ] Unit test added for both cases

## Work Log

- 2026-04-06: Identified by Agent-Native reviewer
