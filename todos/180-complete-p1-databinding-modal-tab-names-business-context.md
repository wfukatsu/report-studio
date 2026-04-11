---
status: complete
priority: p1
issue_id: "180"
tags: [code-review, ui-ux, modal, japanese-ux, discoverability]
dependencies: []
---

# DataBindingModal のタブ名が技術的で業務ユーザーに不明確

## Problem Statement

DataBindingModal の 4 つのタブ名（「データソース」「式・計算」「バリデーション」「DB接続」）が技術者向け用語であり、帳票担当の業務ユーザーが「どのタブでどの設定をするのか」が直感的に分からない。特に「式・計算」は「何を計算するのか」が不明で、「DB接続」は業務用語ではなくシステム用語。

## Findings

**File:** `src/components/modals/DataBindingModal.tsx:11-16`

```ts
const TABS: { id: TabId; label: string }[] = [
  { id: 'datasource', label: 'データソース' },    // 何を指すデータソースか不明確
  { id: 'calculation', label: '式・計算' },       // 業務文脈不明
  { id: 'validation', label: 'バリデーション' },  // 英語由来、「検証」の方が自然
  { id: 'dbconnection', label: 'DB接続' },        // システム用語
]
```

Confirmed by: Data integration UI review (2026-04-11).

## Proposed Solutions

### Option A: 業務文脈に寄せたリネーム（Recommended）

```ts
{ id: 'datasource', label: 'サンプルデータ' },      // プレビュー用データの意味を明示
{ id: 'calculation', label: '計算フィールド' },      // 何を計算するかを明示
{ id: 'validation', label: '入力検証' },             // 業務的・日本語的
{ id: 'dbconnection', label: 'データ連携' },         // 技術的→業務的
```

### Option B: 説明文付きタブ（より丁寧）

タブ名に短い説明テキストを追加:
- 「サンプルデータ（プレビュー用）」
- 「計算フィールド（{{変数}}）」

**Effort:** Small（文字列変更のみ）| **Risk:** Low（ID は変えないので機能に影響なし）

## Acceptance Criteria

- [x] タブ名が業務担当者に意味が伝わる日本語になっている
- [x] `TabId` の内部値は変更せず、表示ラベルのみ変更する
- [x] 既存テストの `getByRole('tab', { name: ... })` 参照を更新する

## Work Log

- 2026-04-11: Data integration UI/UX レビューで発見。
