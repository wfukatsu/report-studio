---
title: ScalarDB column ordering — positional binding produces silently wrong field→column mappings
category: integration-issues
tags: [scalardb, column-ordering, silent-corruption, field-binding, api-contract]
components: [CreateTableForm, bindGroupToTableWithColumns, V2ScalarDbTableController]
problem_type: correctness
severity: critical
pr_number: 11
date: 2026-04-11
related_plans:
  - docs/plans/2026-04-10-feat-scalardb-table-creation-phase1-5-plan.md
related_solutions:
  - docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md
  - docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md
---

# ScalarDB column ordering — positional binding produces silently wrong field→column mappings

## Problem Symptom

After a user successfully created a new ScalarDB table from the designer UI
(`CreateTableForm`), report fields were bound to the wrong database columns.
For example, the `name` field would receive the column binding for `id` and vice
versa. The failure was completely silent — no error was thrown, no warning surfaced.
The report appeared to save correctly but would query incorrect columns at runtime.

## Root Cause

The original implementation used **positional index alignment** to map server-returned
columns back to the locally-defined fields:

```ts
// WRONG — positional alignment (original code before fix)
result.columns.map((col, idx) => ({
  fieldId: columns[idx]?.fieldId ?? '',
  dbColumnName: col.name,
})).filter((fc) => fc.fieldId !== '')
```

This assumed that `result.columns` (from the server re-reading the just-created table
via `admin.getTableMetadata()`) would always be in the same order as `columns` (the
local `ColumnRow[]` state). **That assumption is false.**

ScalarDB's `TableMetadata.getColumnNames()` is backed internally by a `LinkedHashSet` /
`LinkedHashMap`. Iteration order is **not contractually guaranteed** across ScalarDB
versions, storage backends, or JVM runs. When the server returned columns in a different
order than submitted, `columns[idx]` and `result.columns[idx]` referred to different
fields, producing systematically wrong `fieldId → dbColumnName` bindings with no
observable error.

**Why it was silent:**
- The `?? ''` + `.filter` pattern masked mismatches (empty fieldIds were silently dropped)
- The Zustand store accepted any valid `fieldId` string — it had no way to know the
  mapping was semantically wrong
- Tests only verified that `bindGroupToTableWithColumns` was called, not that the
  column→field assignments were correct

## Investigation Steps

1. Noticed the `result.columns.map((col, idx) => ...)` pattern during code review (Phase 1 review, Round 1, Kieran-TS H1)
2. Verified that `admin.getTableMetadata()` in ScalarDB 3.14.4 returns a `LinkedHashSet` — order is an implementation detail, not a contract
3. The Architecture reviewer confirmed the same finding (CRITICAL-1)
4. Attempted to write a test with reversed column order — the old code failed (bound wrong fieldIds)
5. Fixed with name-based `Map` lookup — confirmed the test passes regardless of server column order

## Working Solution

Replace positional index alignment with name-based lookup via a `Map`:

```ts
// File: src/components/modals/dbConnection/CreateTableForm.tsx
// In handleSubmit(), after createScalarDbTable() succeeds:

// CORRECT — name-based matching
// Match by column name (not by index) — ScalarDB does not guarantee that
// getColumnNames() returns columns in insertion order, so positional
// alignment would silently produce wrong field→column bindings.
const localByName = new Map(columns.map((c) => [c.name, c.fieldId]))
bindGroupToTableWithColumns(
  group.id,
  { namespace: effectiveNamespace, tableName },
  result.columns
    .map((col) => ({ fieldId: localByName.get(col.name) ?? '', dbColumnName: col.name }))
    .filter((fc) => fc.fieldId !== ''),
)
```

The `Map` is keyed on `c.name` (the column name string) and valued with `c.fieldId`.
For each column the server returns, `localByName.get(col.name)` retrieves the correct
`fieldId` regardless of what position the server placed that column in.

## Test Added

**File:** `src/components/modals/dbConnection/CreateTableForm.test.tsx`

**Test name:** `"matches field→column by name not by index (server may return columns in different order)"`

```ts
it('matches field→column by name not by index (server may return columns in different order)', async () => {
  // Group with fields in [id, name] order
  const group = makeMasterGroup({
    id: groupId,
    fields: [
      { id: 'f1', key: 'id', label: 'ID', type: 'number' },
      { id: 'f2', key: 'name', label: '名前', type: 'string' },
    ],
  })

  // Server returns columns in REVERSED order: [name, id]
  const fakeTable = {
    name: 'users',
    columns: [
      { name: 'name', type: 'TEXT' as const },   // was submitted second
      { name: 'id',   type: 'BIGINT' as const, keyType: 'partition' as const },
    ],
  }
  vi.spyOn(reportApi, 'createScalarDbTable').mockResolvedValue(fakeTable)
  const bindSpy = vi.spyOn(useReportStore.getState(), 'bindGroupToTableWithColumns')

  // ... fill form and submit ...

  await waitFor(() => { expect(onSuccess).toHaveBeenCalled() })

  // fieldColumns must be matched by name: f2→name, f1→id
  const fieldColumns = bindSpy.mock.calls[0][2]
  const nameEntry = fieldColumns.find((fc) => fc.dbColumnName === 'name')
  const idEntry   = fieldColumns.find((fc) => fc.dbColumnName === 'id')
  expect(nameEntry?.fieldId).toBe('f2')  // field 'name' → f2 ✓
  expect(idEntry?.fieldId).toBe('f1')    // field 'id'   → f1 ✓
})
```

## Prevention Strategies

### 1. Named entities cross API boundaries as maps, not arrays

Positional (index-based) mapping is only safe when the source **guarantees stable order
by contract** (e.g., SQL `ORDER BY`, a sorted array with documented sort key). It is
**unsafe** when:
- The source is a `Set`, `HashMap`, or any JVM collection with non-deterministic order
- The data crosses a network boundary
- The data is persisted and later deserialized
- The producer and consumer are in different runtimes

**Wrong:**
```java
// Set → List with no sort — order undefined
List<String> cols = new ArrayList<>(metadata.getColumnNames());
return cols; // client must not index into this
```

**Correct:** Return name-keyed structures, or sort explicitly:
```java
Map<String, ColumnMetadata> columns = metadata.getColumnNames().stream()
    .collect(toMap(identity(), name -> buildColumnMetadata(metadata, name)));
```

On the client, consume by name:
```typescript
// Wrong: positional
const firstColumn = columns[0];

// Correct: by name
const idColumn = columnsByName['id'];
```

### 2. Code review red flags

| Pattern | Risk |
|---|---|
| `array.map((item, i) => { x[i] ... y[i] })` where x and y come from different sources | Positional alignment across boundary |
| `new ArrayList<>(set)` without a sort | Non-deterministic ordering |
| `const [a, b] = response.list` destructuring by position | Order assumption |
| Persisting `index` as binding key (not `name`) | Index drift on schema change |

**Checklist item for PRs involving API-response binding:**
> - [ ] Is the response collection guaranteed ordered by a documented contract?
> - [ ] Does the consumer bind by name (not position)?
> - [ ] Is there a permutation test that shuffles the collection and asserts identical semantic results?

### 3. Permutation tests (highest-value prevention)

For any feature that consumes a collection of named entities from an API, add a test
that sends them in multiple orders and asserts identical semantic results:

```typescript
it("binding is invariant to server column order", () => {
  const inOrder    = buildBindings(columns,                    fields);
  const reversed   = buildBindings([...columns].reverse(),    fields);
  const shuffled   = buildBindings([...columns].sort(() => 0.5 - Math.random()), fields);

  // All must produce the same name→fieldId mapping
  const normalize = (bs: Binding[]) => Object.fromEntries(bs.map(b => [b.columnName, b.fieldId]));
  expect(normalize(inOrder)).toEqual(normalize(reversed));
  expect(normalize(inOrder)).toEqual(normalize(shuffled));
});
```

### 4. Annotate non-deterministic sources

At every call site where a Set or unordered collection is consumed, add a comment:

```java
// NOTE: getColumnNames() returns Set<String> — iteration order NOT guaranteed.
// Do NOT collect to a List and return as an ordered array. Callers must bind
// by name. See: docs/solutions/integration-issues/scalardb-column-ordering-*.md
Set<String> columnNames = metadata.getColumnNames();
```

## Related Issues

| Issue | Connection |
|---|---|
| `logic-errors/runtime-errors-aggregation-store-type-safety.md` Issue 3 | Discriminated union patch safety — wrong field name silently passed |
| `performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md` Fix #117-120 | Atomic batch actions, orphaned ID membership, patch type width |
| ScalarDB Phase 1 plan § "Technical Review Revisions" | Atomic `bindGroupToTableWithColumns` action design rationale |

## Key Lesson

**The contract of `getColumnNames()` is "give me all column names" — not "give me all
column names in insertion order."** Any code that needs a specific ordering must
either sort explicitly or — better — use name-based access and drop the ordering
requirement entirely. This applies to any Set-backed collection from any JVM API:
`Map.keySet()`, `HashMap.values()`, `LinkedHashSet` when the insertion order is not
guaranteed by the caller.

The silent nature of this bug (wrong data stored, no exception) means it falls into the
category of **invariant violations that escape the type system**. The mitigation is not
just a one-line fix but a testing discipline: any feature that maps between two named
domains (field → column, element → layer, template → binding) needs a permutation test.
