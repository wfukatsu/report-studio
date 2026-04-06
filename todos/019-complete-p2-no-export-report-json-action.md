---
status: pending
priority: p2
issue_id: "019"
tags: [code-review, agent-native, quality]
dependencies: []
---

## Problem Statement

There is no exportReportJSON() action or selector in the store. The only way to serialize a report is to read store.report directly. There is also no importReportJSON(json: string) action with validation. This means file-based save/load has no safe programmatic API.

## Findings

Agent-native reviewer: loadReport(report) takes a parsed object — no validation. No exportReportJSON() exists. An agent receiving a JSON string must parse and validate manually before calling loadReport. The planned JSON export/import (Phase 1 scope per brainstorm) has no implementation.

## Proposed Solutions

A) Add exportReportJSON(): string = () => JSON.stringify(useReportStore.getState().report) as a selector, and importReportJSON(json: string) action that parses, validates, and calls loadReport on success

B) Add only exportReportJSON (export first, import later)

C) Add a Zod schema for Report type and use it in both import validation and type definitions

## Recommended Action

## Technical Details

- exportReportJSON can be a plain function (not a store action) since it only reads state: `export const exportReportJSON = () => JSON.stringify(useReportStore.getState().report)`
- importReportJSON(json: string): Result<void, string> should: JSON.parse, validate against Report schema (Zod or manual), call loadReport on success, return error string on failure
- A Zod schema (Option C) provides the most robust validation and doubles as runtime type documentation — consider doing C as part of A

## Acceptance Criteria

- [ ] exportReportJSON() returns a valid JSON string of the current report
- [ ] importReportJSON(json) parses and validates before calling loadReport
- [ ] importReportJSON returns a Result type with a descriptive error on malformed input
- [ ] Round-trip test: exportReportJSON → importReportJSON produces identical store state
- [ ] Unit tests cover: valid JSON, invalid JSON string, valid JSON but wrong schema shape

## Work Log

## Resources

- src/store/reportStore.ts
- src/types/index.ts
