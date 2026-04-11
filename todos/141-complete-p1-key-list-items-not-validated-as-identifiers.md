---
status: complete
priority: p1
issue_id: "141"
tags: [code-review, security, validation, scalardb, backend]
dependencies: []
---

# partitionKeys / clusteringKeys / secondaryIndexes items not validated as SQL identifiers

## Problem Statement

`V2ScalarDbTableController.parseStringList()` collects raw strings from `partitionKeys`, `clusteringKeys`, and `secondaryIndexes` without applying the `IDENTIFIER` regex (`^[a-zA-Z_][a-zA-Z0-9_]*$`). The column-name cross-reference check confirms each key name exists in the column set, but this only catches the case where the key string doesn't match a valid column — it does not guarantee the string is a valid identifier before it reaches `builder.addPartitionKey()`. A future refactor removing the cross-reference check would pass unvalidated strings directly to ScalarDB DDL.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:162–164`

`parseStringList` at line 354:

```java
private static List<String> parseStringList(JsonNode node) {
    if (!node.isArray()) return null;
    List<String> list = new ArrayList<>(node.size());
    for (JsonNode item : node) {
        list.add(item.asText());  // ← no IDENTIFIER validation
    }
    return list;
}
```

The strings flow into `builder.addPartitionKey(pk)` etc. at lines 262–270 without any structural validation beyond "is it a column name?".

Confirmed by: Security (H-1).

## Proposed Solutions

### Option A: Add identifier validation loop for each key list (Recommended)

After the array-size cap checks and before the column-existence checks, add:

```java
for (String pk : partitionKeys) {
    if (!IDENTIFIER.matcher(pk).matches()) {
        ctx.status(400).json(Map.of("error", "Invalid identifier: '" + pk + "'"));
        return;
    }
}
for (String ck : clusteringKeys) {
    if (!IDENTIFIER.matcher(ck).matches()) {
        ctx.status(400).json(Map.of("error", "Invalid identifier: '" + ck + "'"));
        return;
    }
}
for (String idx2 : secondaryIndexes) {
    if (!IDENTIFIER.matcher(idx2).matches()) {
        ctx.status(400).json(Map.of("error", "Invalid identifier: '" + idx2 + "'"));
        return;
    }
}
```

**Pros:** Mirrors the existing column-name validation pattern exactly. Makes the validation order clear: regex → cross-reference.
**Cons:** ~12 lines of boilerplate (can be extracted, see Simplicity todo #147).
**Effort:** Small | **Risk:** Low

### Option B: Validate inside parseStringList with a flag

Add an optional `validate: boolean` param to `parseStringList` to apply the regex there.

**Pros:** Centralised.
**Cons:** Adds a method parameter that changes semantics — confusing for callers.
**Effort:** Small | **Risk:** Low

## Recommended Action

Option A. Consistent with the existing column-validation pattern in the same method. After this todo is complete, follow up with Simplicity todo #147 to extract a `validateKeysExist` helper that handles both the regex and the cross-reference in one pass.

## Technical Details

- **File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:162–164`, `217–234`
- **Test:** `V2ScalarDbTableControllerTest` — add test cases: `partitionKeys: ["9invalid"]` → 400, `clusteringKeys: ["has-hyphen"]` → 400

## Acceptance Criteria

- [ ] `partitionKeys`, `clusteringKeys`, `secondaryIndexes` entries each validated against `IDENTIFIER` regex before use
- [ ] Error message follows the established `"Invalid identifier: '<value>'"` pattern
- [ ] Backend tests added for malformed key-list identifiers

## Work Log

- 2026-04-11: Flagged by Security (H-1). Straightforward extension of existing validation pattern.
