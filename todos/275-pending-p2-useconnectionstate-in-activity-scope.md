---
status: complete
priority: p2
issue_id: "275"
tags: [code-review, performance, activity-api, architecture]
dependencies: []
---

# useConnectionState が Activity ラップ内の App.tsx にある（AppShell に移動すべき）

## Problem Statement

`useConnectionState()` は `App.tsx` の line 59 で呼び出されているが、`App` は `<Activity mode="hidden">` でラップされている。`<Activity>` は React スケジューリングを制御するが `setInterval` を停止しない。その結果、ユーザーがデータ管理・テンプレート管理タブにいる間も 30 秒ごとにバックエンドをポーリングし、`setBackendConnected` を呼び出して全 Zustand サブスクライバーに通知が届く。

また、`backendConnected` は全タブ共通の状態なので、アプリシェルレベルで管理するのが意味的に正しい。

## Findings

- **Agent**: performance-oracle (CRITICAL)
- **Location**: `src/App.tsx` line 59, `src/hooks/useConnectionState.ts` line 35
- **Impact**: タブ切り替え後も 30 秒ごとに Zustand の全サブスクライバーが評価される

## Proposed Solutions

### Option A: AppShell に移動（推奨）
```tsx
// AppShell.tsx
export function AppShell() {
  useConnectionState()  // アプリシェルレベルで1回だけ呼び出す
  const activeTab = ...
}

// App.tsx — line 59 を削除
// useConnectionState()  ← 削除
```
- **Pros**: 意味的に正しい、Activity スコープから外れる
- **Effort**: Small
- **Risk**: 低

## Acceptance Criteria

- [ ] `useConnectionState` が `AppShell.tsx` で呼び出されている
- [ ] `App.tsx` から `useConnectionState` の呼び出しが削除されている
- [ ] バックエンドオフライン時の動作が変わらない

## Work Log

- 2026-04-13: performance-oracle で発見
