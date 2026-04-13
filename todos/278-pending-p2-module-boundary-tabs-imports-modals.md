---
status: pending
priority: p2
issue_id: "278"
tags: [code-review, architecture, module-structure]
dependencies: []
---

# tabs/ ディレクトリが modals/ からコンテンツコンポーネントをインポートしている（逆方向の依存）

## Problem Statement

`DataManagementTab.tsx` が `@/components/modals/CalculationTab` と `@/components/modals/ValidationTab` からインポートしている。`TemplateManagementTab.tsx` が `@/components/modals/TemplateManagerModal` と `@/components/modals/VariantsModal` からインポートしている。

`modals/` ディレクトリのコンテンツコンポーネント（`TemplateManagerContent`、`VariantList`、`CalculationTab`、`ValidationTab`）は実際にはモーダルクロームを持たず、純粋なコンテンツコンポーネントである。それらが `modals/` に置かれることで `tabs/ → modals/` という逆依存が生まれ、`modals/` がコンテンツの寄せ集めになる。

## Findings

- **Agent**: architecture-strategist (P2, Finding 6)
- **Location**: `src/components/tabs/DataManagementTab.tsx` lines 6–7, `src/components/tabs/TemplateManagementTab.tsx` lines 3–4

## Proposed Solutions

### Option A: コンテンツコンポーネントを features/ ディレクトリに移動（長期）
```
src/components/features/
  calculation/CalculationTab.tsx
  validation/ValidationTab.tsx
  templates/TemplateManagerContent.tsx
  variants/VariantList.tsx
```
モーダルファイルは features/ から re-export する形に変更。

- **Pros**: 依存方向が明確、`modals/` がモーダルコンテナのみになる
- **Cons**: ファイル移動によるインポートパスの更新が多い
- **Effort**: Medium
- **Risk**: 中（移動のみ、ロジック変更なし）

### Option B: 現状維持 + コメントで意図を文書化（短期）
```ts
// DataManagementTab.tsx
// CalculationTab/ValidationTab はモーダルクロームを持たないコンテンツコンポーネント。
// 将来的に src/components/features/ に移動予定。
```
- **Effort**: Tiny
- **Risk**: 低

## Acceptance Criteria

- [ ] `tabs/` から `modals/` への依存が解消されている、またはコメントで文書化されている

## Work Log

- 2026-04-13: architecture-strategist で発見
