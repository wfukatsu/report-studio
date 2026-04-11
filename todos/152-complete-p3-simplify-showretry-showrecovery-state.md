---
status: complete
priority: p3
issue_id: "152"
tags: [code-review, simplicity, react, scalardb]
dependencies: []
---

# Collapse showRetry/showRecovery into unified errorInfo state in CreateTableForm

## Problem Statement

`CreateTableForm.tsx` has three separate state slots for error display (`errorMessage`, `showRetry`, `showRecovery` + `correlationId`) that are always set/cleared together from a single `classifyCreateTableError()` call. They can be collapsed into one `errorInfo: CreateTableErrorInfo | null` + `errorMessage: string | null`.

## Findings

**File:** `src/components/modals/dbConnection/CreateTableForm.tsx:88–96`

The `showRetry` and `showRecovery` flags are always set from `info.showRetry` / `info.showRecovery`. Storing the full `info` object eliminates redundancy and makes the catch block read linearly.

Confirmed by: Simplicity (#1).

## Proposed Solutions

Collapse to:

```ts
const [errorInfo, setErrorInfo] = useState<{ info: CreateTableErrorInfo; message: string } | null>(null)
```

Clear: `setErrorInfo(null)` (one call instead of four).
Set: `setErrorInfo({ info, message: errorCodeToMessage(info.code) })`.
Derive in JSX: `errorInfo?.info.showRetry`, `errorInfo?.info.showRecovery`, `errorInfo?.info.correlationId`.

## Acceptance Criteria

- [ ] `showRetry`, `showRecovery` state slots removed
- [ ] Single `errorInfo` object holds all error display state
- [ ] Same behavior in JSX — retry button shows when `showRetry` was true, recovery button shows when `showRecovery` was true

## Work Log

- 2026-04-11: Flagged by Simplicity reviewer (#1). ~8 lines saved, more readable catch block.
