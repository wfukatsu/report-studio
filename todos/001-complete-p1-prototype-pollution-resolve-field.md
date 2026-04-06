---
status: pending
priority: p1
issue_id: "001"
tags: [code-review, security]
dependencies: []
---

## Problem Statement

`resolveField` in src/lib/dataBinding.ts:8 splits fieldKey on `.` and walks the data object without filtering. A key containing `__proto__`, `constructor`, or `prototype` will traverse JavaScript's prototype chain, allowing prototype pollution.

## Findings

- `resolveField(data, '__proto__.polluted')` sets Object.prototype.polluted on the global prototype chain.
- fieldKey is user-editable in PropertiesPanel and sourced from JSON data.
- `interpolate` passes keys directly to resolveField with only whitespace trimming — no sanitization occurs before resolution.

## Proposed Solutions

**A) Add forbidden-key guard in resolveField** — Define `const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])` and check each dot-notation part in the loop, returning `''` if any forbidden key is found. Minimal change, zero API impact.

**B) Use hasOwnProperty check instead of direct property access** — More permissive but prevents prototype-chain traversal by restricting access to own properties only.

**C) Validate fieldKey at store boundary in updateElement** — Catches bad keys at write time but does not protect runtime resolution of keys already in the store or sourced from external JSON.

**Recommended: A** — one-line guard per iteration, highest impact with smallest surface change.

## Recommended Action

## Technical Details

- `resolveField` iterates over parts split from fieldKey and does direct bracket access (`obj = obj[part]`).
- JavaScript's prototype chain is traversed when part is `__proto__`, `constructor`, or `prototype` because these are own properties of Object.
- Affected call sites: `interpolate` in dataBinding.ts, any direct callers in ElementRenderer.

## Acceptance Criteria

- `resolveField('__proto__.x', {})` returns `''` without mutating Object.prototype.
- `resolveField('constructor.name', {})` returns `''`.
- `resolveField('prototype.toString', {})` returns `''`.
- All existing dataBinding tests still pass.
- No regression in valid dot-notation field resolution (e.g. `customer.name`).

## Work Log

## Resources

- src/lib/dataBinding.ts:5-13
- src/components/sidebar/PropertiesPanel.tsx
