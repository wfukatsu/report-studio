---
status: complete
priority: p3
issue_id: "280"
tags: [code-review, testing, accessibility]
dependencies: []
---

# useTopTabNavigation / AppShell / TopNavigation にテストがない

## Problem Statement

プロジェクトは各サイドバーパネル・モーダルコンポーネントほぼすべてにテストが存在するが、今回追加された 3 ファイル（`useTopTabNavigation.ts`、`AppShell.tsx`、`TopNavigation.tsx`）にはテストが一切ない。

特に `useTopTabNavigation` はキーボードナビゲーション（IME ガード・roving tabindex・マニュアルアクティベーション）という非自明なロジックを持ち、`renderHook` で充分テスト可能。

## Findings

- **Agent**: kieran-typescript-reviewer (LOW-1)
- **Coverage threshold**: プロジェクトは 80% カバレッジを要求している

## Proposed Solutions

### Option A: renderHook でユニットテスト追加
```ts
// src/hooks/useTopTabNavigation.test.ts
import { renderHook, act } from '@testing-library/react'
import { useTopTabNavigation } from './useTopTabNavigation'

it('ArrowRight でフォーカスが次のタブに移動する', () => { ... })
it('IME 変換中はキーボードナビゲーションが無効', () => { ... })
it('aria-selected が正しく設定される', () => { ... })
```

- **Effort**: Medium
- **Risk**: 低

## Acceptance Criteria

- [ ] `useTopTabNavigation` の ARIA 契約（roving tabindex、aria-selected、aria-controls）をカバーするテスト
- [ ] IME ガード（`isComposing`）のテスト

## Work Log

- 2026-04-13: kieran-typescript-reviewer で発見
