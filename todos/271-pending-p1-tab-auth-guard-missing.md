---
status: complete
priority: p1
issue_id: "271"
tags: [code-review, security, authentication]
dependencies: []
---

# DataManagementTab / TemplateManagementTab に認証ガードがない

## Problem Statement

`AppShell.tsx` が `DataManagementTab` と `TemplateManagementTab` をレンダリングする際、認証チェックが行われていない。バックエンドがオフライン時（開発環境・ネットワーク障害）は `backendConnected === false` となり `LoginModal` が表示されないため、未認証ユーザーがデータ管理・テンプレート管理タブに自由にアクセスできる。

バックエンドはサーバーサイドで `401 Unauthorized` を返すため実際のデータ変更は不可能だが、フロントエンドのスキーマ定義・計算ルール・バリデーションルールの UI が表示されてしまう（Defense-in-depth の欠如）。

## Findings

- **Agent**: security-sentinel
- **Location**: `src/components/layout/AppShell.tsx` lines 29–50
- **Root cause**: `LoginModal` は `App.tsx`（デザインタブ内）のみに存在し、`AppShell` には認証チェックなし
- **Comparison**: `DataBrowserPage.tsx` は `checkAuth()` + リダイレクトで正しくガードしている

## Proposed Solutions

### Option A: AppShell で currentUser チェック（推奨）
```tsx
// AppShell.tsx
const currentUser = useReportStore((s) => s.currentUser)

{activeTab === 'data' && currentUser && <DataManagementTab />}
{activeTab === 'templates' && currentUser && <TemplateManagementTab />}
```
- **Pros**: 最小変更、既存の認証パターンと一致
- **Cons**: なし
- **Effort**: Small
- **Risk**: 低

### Option B: 未認証時にデザインタブへリダイレクト
```tsx
useEffect(() => {
  if (!currentUser && !authLoading && (activeTab === 'data' || activeTab === 'templates')) {
    setActiveTab('design')
  }
}, [currentUser, authLoading, activeTab])
```
- **Pros**: 自動リダイレクトでユーザーを迷わせない
- **Cons**: ページリロード後に意図しないタブ遷移が起きる可能性
- **Effort**: Small
- **Risk**: 低

## Acceptance Criteria

- [ ] バックエンドオフライン時、データ管理・テンプレート管理タブをクリックしてもコンテンツが表示されない
- [ ] 認証済み状態では両タブが正常に動作する
- [ ] `DataBrowserPage.tsx` の既存パターンと一貫している

## Work Log

- 2026-04-13: security-sentinel によるコードレビューで発見
