---
status: complete
priority: p1
issue_id: "142"
tags: [code-review, correctness, autosave, scalardb, agent-native]
dependencies: []
---

# useAutoSave does not watch `schema` — binding-only changes may not persist

## Problem Statement

`useAutoSave` watches `[pages, rules, meta, id]` but NOT `schema`. A user who binds a group to a table (Phase 1/1.5) and immediately closes the tab without making any page/rule/meta change will rely solely on the `pagehide` sendBeacon for persistence. The debounced save does not fire for schema-only mutations. This is also a gap for agent-native callers: agents performing bind-then-read workflows must observe a full PUT cycle completing, which doesn't happen reliably without a page/rule/meta touch.

## Findings

**File:** `src/hooks/useAutoSave.ts` — dependency array

The auto-save hook's `useEffect` includes `pages`, `rules`, `meta`, and `id` but not `schema`. The `schema` field (which carries `groups[].tableMeta` and `groups[].fields[].dbColumnName`) was added in Phase 1 but the auto-save dep array was not updated.

Confirmed by: Agent-Native reviewer (#3).

## Proposed Solutions

### Option A: Add `schema` to the useAutoSave dependency array (Recommended)

```ts
// in useAutoSave.ts
const schema = useReportStore((s) => s.definition.schema)

useEffect(() => {
  // ... existing save logic ...
}, [pages, rules, meta, id, schema])  // ← add schema
```

**Pros:** Minimal change. Makes binding changes save promptly on their own. Consistent with how pages/rules behave.
**Cons:** `schema` changes trigger an additional debounced save. Since schema mutations are user-driven and infrequent, the overhead is negligible.
**Effort:** Small | **Risk:** Low

### Option B: Include schema in the existing snapshot (no dep change)

The `pendingRef.current = definition` snapshot already captures schema (it's the full definition). Keep current behaviour and document the gap.

**Pros:** Zero code change.
**Cons:** Does not fix the missing-debounce case. A binding-only session with immediate tab close can lose data.
**Effort:** None | **Risk:** None (deferred risk)

## Recommended Action

Option A. One line addition to the dep array.

## Technical Details

- **File:** `src/hooks/useAutoSave.ts`
- **Selector needed:** `const schema = useReportStore((s) => s.definition.schema)` (stable immer reference — safe as dep)

## Acceptance Criteria

- [ ] `schema` added to `useAutoSave` dependency array
- [ ] A binding-only change (no page edit) triggers the debounced save within the configured debounce window
- [ ] Existing `useAutoSave` tests still pass

## Work Log

- 2026-04-11: Flagged by Agent-Native reviewer (#3). Binding-only session + quick tab close = data loss risk.
