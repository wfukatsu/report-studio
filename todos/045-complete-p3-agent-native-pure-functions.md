---
status: complete
priority: p3
issue_id: "045"
tags: [code-review, agent-native]
dependencies: []
---

## Problem Statement

JSON validation logic in `BindingPanel` and `DataSourcePanel` is embedded in component click handlers with no pure-function equivalent. Programmatic callers using `updateTestData` or `setDataSource` bypass all validation. `toggleLivePreview` has no direct setter.

## Findings

- `src/components/sidebar/BindingPanel.tsx:23-32`: `JSON.parse` + error state inside `ArrayFieldRow.handleChange`
- `src/components/sidebar/DataSourcePanel.tsx:11-22`: `JSON.parse` + `typeof/Array.isArray` guards inside `handleApply`
- Both patterns exist only in component code — no pure utility function
- `src/store/uiSlice.ts:53`: `toggleLivePreview` is toggle-only; no `setLivePreviewEnabled(bool)`
- `src/store/uiSlice.ts:50`: `toggleHeaderEditMode` is toggle-only; no `setHeaderEditMode(bool)`
- `src/hooks/usePreviewData.ts`: merge logic embedded in hook; not accessible outside React

## Proposed Solutions

**A) Extract pure utility functions**
```ts
// src/lib/dataSourceUtils.ts
export function parseFieldValue(raw: string): { ok: true; value: unknown } | { ok: false; error: string }
export function parseDataSourceJSON(json: string): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string }
export function mergePreviewData(dataSources: DataSourceDefinition[]): Record<string, unknown>
```

**B) Add direct setters to uiSlice**
```ts
setLivePreviewEnabled: (enabled: boolean) => set(draft => { draft.livePreviewEnabled = enabled })
setHeaderEditMode: (enabled: boolean) => set(draft => { draft.headerEditMode = enabled })
```

## Recommended Action

Apply both A and B. The component implementations become thin wrappers over the pure functions.

## Technical Details

- **Files:** `src/components/sidebar/BindingPanel.tsx:23-32`, `src/components/sidebar/DataSourcePanel.tsx:11-22`, `src/store/uiSlice.ts:50-53`, `src/hooks/usePreviewData.ts`

## Acceptance Criteria

- [x] `parseFieldValue` and `parseDataSourceJSON` exported from `src/lib/dataSourceUtils.ts`
- [x] `mergePreviewData` exported and used by `usePreviewData` hook
- [x] `setLivePreviewEnabled(bool)` and `setHeaderEditMode(bool)` added to uiSlice
- [x] Components use the pure functions internally

## Work Log

- 2026-04-06: Identified by agent-native-reviewer agent
- 2026-04-06: Completed — added `mergePreviewData` to dataSourceUtils.ts, updated usePreviewData.ts to use it. `parseFieldValue`/`parseDataSourceJSON` and `setHeaderEditMode`/`setLivePreviewEnabled` were already implemented.
