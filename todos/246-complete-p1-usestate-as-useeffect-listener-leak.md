---
status: pending
priority: p1
issue_id: "246"
tags: [code-review, react, memory-leak, ui-ux]
dependencies: []
---

# useState を useEffect の代わりに使用 — リスナーリーク

## Problem Statement

`sharedUI.tsx` の `ColorInput` コンポーネントで `useState` の初期化関数の中でグローバルイベントリスナーを登録し、返り値をクリーンアップ関数として使っている。しかし `useState` の初期化関数の戻り値はクリーンアップとして呼ばれず、単に初期ステート値として扱われるため **`removeEventListener` が永遠に呼ばれない**。100+ 要素があるキャンバスでは大量のリスナーが蓄積する。

## Findings

**Location:** `src/elements/_base/sharedUI.tsx:93-100`

```tsx
// ❌ WRONG — useStateの戻り値はクリーンアップ関数ではない
useState(() => {
  const listener = (e: Event) => { ... }
  window.addEventListener('color-input-open', listener)
  return () => window.removeEventListener('color-input-open', listener)  // 呼ばれない
})
```

- `useState` の initializer は初期値を計算するだけで、返り値はクリーンアップではなく state の初期値になる
- マウントごとにリスナーが1つずつ追加され、アンマウント時にも削除されない
- プロパティパネルで要素を切り替えるたびにリスナーが増加する

## Proposed Solutions

### Solution A: useEffect に変更（推奨）

```tsx
useEffect(() => {
  const listener = (e: Event) => {
    const evt = e as CustomEvent<number>
    if (evt.detail !== idRef.current) setOpen(false)
  }
  window.addEventListener('color-input-open', listener)
  return () => window.removeEventListener('color-input-open', listener)
}, [])
```

- Pros: 最小変更で修正完了、クリーンアップが確実に動作
- Cons: なし
- Effort: Small
- Risk: Low

### Solution B: Zustand atom で "開いているカラーピッカーのID" を管理

グローバルイベントバスをやめ、Zustand の uiSlice に `openColorPickerId` を追加する。

- Pros: 型安全、テスト可能、グローバルイベントバスの廃止
- Cons: ストア変更が必要、より大きなリファクタリング
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] `window.addEventListener('color-input-open', ...)` の登録が `useEffect` 内で行われる
- [ ] コンポーネントアンマウント時にリスナーが確実に削除される
- [ ] 複数の `ColorInput` が同時にマウントされてもリスナーが蓄積しない（単体テストで確認）

## Work Log

- 2026-04-13: code-review で発見
