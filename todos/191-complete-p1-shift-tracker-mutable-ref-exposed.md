---
status: pending
priority: p1
issue_id: "191"
tags: [code-review, typescript, shift-key, hooks]
dependencies: []
---

# useShiftKeyTracker の戻り値型が MutableRefObject で外部から書き換え可能

## Problem Statement

`useShiftKeyTracker` は `React.MutableRefObject<boolean>` を返しており、呼び出し元が `shiftRef.current = true` と任意に書き換えられる。フックの公開 API 上は読み取り専用にすべきで、`React.RefObject<boolean>` (readonly) を返すべき。

## Findings

**File:** `src/hooks/useShiftKeyTracker.ts:8`

```ts
// 現状 — 書き換え可能な型を露出
export function useShiftKeyTracker(): React.MutableRefObject<boolean>
```

`React.MutableRefObject<boolean>.current` は外部から書き換え可能であり、誤った書き換えによりシフト状態が不整合になる危険がある。

## Proposed Solutions

### Option A: 戻り値型を RefObject に変更 (推奨)

```ts
export function useShiftKeyTracker(): React.RefObject<boolean> {
  const shiftRef = useRef(false)
  // ... (実装変更なし)
  return shiftRef
}
```

- **Pros:** 型レベルで外部書き換えを防止。実装の変更ゼロ
- **Cons:** なし
- **Effort:** Small
- **Risk:** None

### Option B: readonly プロパティを持つオブジェクトを返す

```ts
return { get current() { return shiftRef.current } }
```

- **Pros:** より厳格な read-only
- **Cons:** React の RefObject インターフェースと互換しない。過剰
- **Effort:** Small
- **Risk:** Low

## Recommended Action

Option A を適用する。

## Technical Details

- **Affected files:** `src/hooks/useShiftKeyTracker.ts`
- **Related:** `React.RefObject` は `{ readonly current: T | null }` の型定義

## Acceptance Criteria

- [ ] 戻り値型が `React.RefObject<boolean>` に変更されている
- [ ] `ReportCanvas.tsx` の `shiftRef.current` 読み取りが TypeScript エラーなしでコンパイルされる
- [ ] テストが引き続き PASS する

## Work Log

- 2026-04-11: kieran-typescript-reviewer により検出 (PR #30 レビュー)
