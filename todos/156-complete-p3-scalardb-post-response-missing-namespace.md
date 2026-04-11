---
status: complete
priority: p3
issue_id: "156"
tags: [code-review, agent-native, api-design, backend, scalardb]
dependencies: []
---

# POST /api/v2/scalardb/tables 201 response missing namespace field

## Problem Statement

The 201 response body is `{ "name": "tableName", "columns": [...] }` with no `namespace` field. An agent (or programmatic caller) parsing only the response cannot confirm which namespace the table was placed in — it must infer from its own request input. This breaks the "response is self-contained" principle for agent-native APIs.

## Findings

**File:** `server/src/main/java/com/report/server/V2ScalarDbTableController.java:272–273`

```java
Map<String, Object> response = buildTableResponse(tableName, created);
```

`buildTableResponse` returns `{ "name": tableName, "columns": [...] }` — no namespace.

Confirmed by: Agent-Native reviewer (#4).

## Proposed Solutions

Add `namespace` to the response map:

```java
Map<String, Object> tableData = buildTableResponse(tableName, created);
Map<String, Object> response = new LinkedHashMap<>();
response.put("namespace", namespace);
response.putAll(tableData);
```

Also update `ScalarDbTableEntrySchema` in `reportApi.ts` to include an optional `namespace` field if callers need it.

## Acceptance Criteria

- [ ] 201 response body includes `"namespace"` field
- [ ] `buildTableResponse` or its wrapper includes namespace in the response map
- [ ] Backend test verifies `namespace` in response body

## Work Log

- 2026-04-11: Flagged by Agent-Native reviewer (#4). Small change with agent-native value.
