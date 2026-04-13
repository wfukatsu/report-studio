---
status: pending
priority: p1
issue_id: "272"
tags: [code-review, bug, keyboard, activity-api]
dependencies: []
---

# デザインタブのキーボードショートカットが他タブでも発火する

## Problem Statement

`App.tsx` の `window.addEventListener('keydown', handler)` は `<Activity mode="hidden">` でラップされていても**停止しない**。React の `<Activity>` API は React のスケジューリング（レンダリング優先度）を制御するが、`setInterval` や `window.addEventListener` のような副作用は停止しない。

その結果、ユーザーがデータ管理タブや テンプレート管理タブにいる間でも、`Ctrl+Z`（undo）、`Delete`（要素削除）、矢印キー（要素移動）などのショートカットが発火し、キャンバスの状態を破壊する可能性がある。

## Findings

- **Agents**: kieran-typescript-reviewer (CRITICAL-2), performance-oracle (LOW)
- **Location**: `src/App.tsx` lines 185–273 (keyboard shortcut useEffect)
- **Specific example**: DataManagementTab の SchemaPanel の入力フィールドにフォーカスがない状態で `Ctrl+Z` を押すと、デザインキャンバスの undo が実行される
- **React Activity behavior**: `<Activity mode="hidden">` は Effects の cleanup/setup を自動実行するが、**既にマウント済みで実行中の Effect のクリーンアップは行わない**

## Proposed Solutions

### Option A: store.getState() で activeTab をガード（推奨）
```ts
// App.tsx — keyboard shortcut useEffect 内の先頭に追加
const handler = (e: KeyboardEvent) => {
  if (useReportStore.getState().activeTab !== 'design') return
  // ...以降の既存ロジック
}
```
- **Pros**: 最小変更（1行）、subscription なし、コスト低
- **Cons**: なし
- **Effort**: Small
- **Risk**: 低

### Option B: useEffect 依存配列に activeTab を追加
```ts
const activeTab = useReportStore((s) => s.activeTab)
useEffect(() => {
  if (activeTab !== 'design') return
  const handler = (e: KeyboardEvent) => { /* ... */ }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [/* existing deps */, activeTab])
```
- **Pros**: 非アクティブ時はリスナー自体を登録しない（クリーン）
- **Cons**: 依存配列が長くなる
- **Effort**: Small
- **Risk**: 低

## Acceptance Criteria

- [ ] データ管理タブで `Ctrl+Z` を押してもデザインキャンバスの undo が実行されない
- [ ] データ管理タブの入力フィールドで `Delete` / `Backspace` を押しても要素削除が実行されない
- [ ] デザインタブに戻ったときはショートカットが通常通り動作する

## Work Log

- 2026-04-13: kieran-typescript-reviewer (CRITICAL-2) と performance-oracle で発見
