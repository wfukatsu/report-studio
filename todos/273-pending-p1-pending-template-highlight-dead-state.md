---
status: pending
priority: p1
issue_id: "273"
tags: [code-review, dead-code, store, agent-native]
dependencies: []
---

# pendingTemplateHighlight がストアに追加されたが消費者がない

## Problem Statement

`pendingTemplateHighlight: string | null` と `setPendingTemplateHighlight` が `StoreState` と `uiSlice` に追加されたが、`src/` 全体を grep しても**この値を読む消費者が存在しない**。セッターは呼び出せるが、テンプレート管理タブでのハイライト表示は実装されていない。

グローバルストアに未使用の状態を追加すると：
1. TypeScript の型サーフェスが増加し、他コンポーネントが混乱する
2. 将来の開発者が消費者を探すために時間を浪費する
3. エージェントがこの API を呼び出しても何も起きない（agent-native parity 違反）

## Findings

- **Agents**: kieran-typescript-reviewer (HIGH-1), agent-native-reviewer (P1), architecture-strategist (P2)
- **Location**: `src/store/types.ts` lines 119–120, `src/store/uiSlice.ts` lines 13–14, 63–64
- **Grep result**: `pendingTemplateHighlight` の read は 0 箇所、write は uiSlice 定義のみ

## Proposed Solutions

### Option A: この PR から削除し、消費者実装時に再追加（推奨・YAGNI）
- `StoreState` から `pendingTemplateHighlight` と `setPendingTemplateHighlight` を削除
- `UISlice` Pick から削除
- `createUISlice` の初期値と実装を削除
- 消費者（TemplateManagementTab のハイライトアニメーション）と同時に再実装
- **Pros**: コードを増やさない、型サーフェスをクリーンに保つ
- **Effort**: Small
- **Risk**: 低

### Option B: 消費者（ハイライト表示）をこの PR で一緒に実装
- `TemplateManagementTab.tsx` に `useEffect` を追加：
  ```tsx
  const highlight = useReportStore((s) => s.pendingTemplateHighlight)
  const setPendingTemplateHighlight = useReportStore((s) => s.setPendingTemplateHighlight)
  useEffect(() => {
    if (!highlight) return
    const el = document.getElementById(`template-card-${highlight}`)
    el?.scrollIntoView({ behavior: 'smooth' })
    const timer = setTimeout(() => setPendingTemplateHighlight(null), 5000)
    return () => clearTimeout(timer)
  }, [highlight])
  ```
- **Pros**: 機能を完成させる
- **Cons**: TemplateManagementTab にカードの id 命名規則が必要
- **Effort**: Medium
- **Risk**: 中

## Acceptance Criteria

- [ ] `pendingTemplateHighlight` に消費者が存在する、または PR から削除されている
- [ ] どちらの場合もストアに未使用の状態が残らない

## Work Log

- 2026-04-13: kieran-typescript-reviewer、agent-native-reviewer、architecture-strategist で発見
