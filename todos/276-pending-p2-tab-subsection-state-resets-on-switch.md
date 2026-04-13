---
status: complete
priority: p2
issue_id: "276"
tags: [code-review, ux, state-management, agent-native]
dependencies: []
---

# タブ切り替えでデータ管理・テンプレート管理のサブセクション選択がリセットされる

## Problem Statement

`DataManagementTab` と `TemplateManagementTab` は `useState<Section>` でアクティブサブセクションを管理している。`AppShell` が条件付きレンダリング（`{activeTab === 'data' && ...}`）を使用するため、タブ切り替えでコンポーネントがアンマウントされ、サブセクション選択がリセットされる。

ユーザーが「バリデーション」セクションを開いてデザインタブに戻り、再びデータ管理タブを開くと「データソース」に戻ってしまう。

また agent-native-reviewer の指摘通り、エージェントがサブセクションをプログラマティックに選択する手段がない（P1 レベルの agent-native 問題）。

## Findings

- **Agents**: kieran-typescript-reviewer (HIGH-2), architecture-strategist (P3), agent-native-reviewer (P1), code-simplicity-reviewer
- **Location**: `src/components/tabs/DataManagementTab.tsx` line 26, `src/components/tabs/TemplateManagementTab.tsx` line 14
- **AppShell location**: `src/components/layout/AppShell.tsx` lines 29–50

## Proposed Solutions

### Option A: uiSlice にサブセクション状態を追加（agent-native 対応も兼ねる・推奨）
```ts
// store/types.ts に追加
dataActiveSection: DataSection
setDataActiveSection: (s: DataSection) => void
templateActiveSection: TemplateSection
setTemplateActiveSection: (s: TemplateSection) => void
```
- **Pros**: タブ切り替えで状態保持、エージェントからも操作可能、UX 向上
- **Cons**: store が増える（ただし軽量）
- **Effort**: Medium
- **Risk**: 低

### Option B: DataManagementTab を Activity でラップ
```tsx
<Activity mode={activeTab === 'data' ? 'visible' : 'hidden'}>
  <DataManagementTab />
</Activity>
```
- **Pros**: 実装コスト低
- **Cons**: エージェントからはまだ不透明、Activity の意図が曖昧になる
- **Effort**: Small
- **Risk**: 低（ただし agent-native 問題は解決しない）

### Option C: 現状維持 + コメント追加
- リセットは意図的な設計として文書化
- **Pros**: 変更なし
- **Cons**: UX 問題が残る、エージェント利用不可
- **Effort**: Tiny
- **Risk**: 低

## Acceptance Criteria

- [ ] データ管理タブから別タブに切り替えて戻っても、選択サブセクションが保持される
- [ ] エージェントが `setDataActiveSection('schema')` 等でサブセクションを指定できる（Option A の場合）

## Work Log

- 2026-04-13: 複数エージェントで発見
