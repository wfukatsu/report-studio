---
status: complete
priority: p3
issue_id: "224"
tags: [code-review, simplicity, typescript, data-binding]
dependencies: []
---

# `useBindingAnalysis` の `checkbox`/`eraSelect` switch ケースが同一内容 — fall-through で統合可能

## Problem Statement

`useBindingAnalysis.ts` の `checkbox` と `eraSelect` の switch ケースが完全に同一のコード。
この重複はメンテナンスリスク（一方を変更し忘れる可能性）。

## Findings

**File:** `src/hooks/useBindingAnalysis.ts:103-120`

```typescript
case 'checkbox': {
  const ds = el.dataSource?.trim() ?? ''
  if (!ds) { unboundElements.push(base) } else { registerBound(base, ds) }
  break
}
case 'eraSelect': {
  const ds = el.dataSource?.trim() ?? ''  // ← 全く同じ
  if (!ds) { unboundElements.push(base) } else { registerBound(base, ds) }
  break
}
```

## Proposed Solution

```typescript
case 'checkbox':
case 'eraSelect': {
  const ds = el.dataSource?.trim() ?? ''
  if (!ds) { unboundElements.push(base) } else { registerBound(base, ds) }
  break
}
```

**Effort:** Trivial | **Risk:** Low

## Acceptance Criteria

- [ ] `checkbox` と `eraSelect` が1つの case ブロックにまとめられている
- [ ] 動作は変わらない

## Work Log

- 2026-04-12: Discovered by Simplicity reviewer
