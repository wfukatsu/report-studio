---
status: pending
priority: p2
issue_id: "243"
tags: [code-review, react, data-browser, ux]
dependencies: []
---

# DataBrowserPage: authLoading 中に画面フラッシュ

## Problem Statement

`DataBrowserPage.tsx` が `authLoading && !currentUser` の間（認証状態が未確定のとき）に `<Navigate to="/" replace />` ではなく `null` を返すべきだが、`authLoading` が `true` の短時間にページコンテンツが一瞬レンダリングされた後にリダイレクトする可能性がある。

## Findings

```tsx
// DataBrowserPage.tsx:19-23
if (!authLoading && !currentUser) {
  return <Navigate to="/" replace />
}
// ↑ authLoading=true かつ currentUser=null の場合、ここに来ない → ページがレンダリングされる

return (
  <div className="flex flex-col h-screen">
    ...  // ← 認証確認前にレンダリング
  </div>
)
```

- `checkAuth()` が非同期で完了するまでの間、`currentUser=null, authLoading=true` の状態でページが描画される
- 未ログインユーザーが直接 `/data-browser` にアクセスすると、一瞬ページが見えてからリダイレクト

## Proposed Solutions

### Option A: `authLoading` 中は null を返す（推奨）

```tsx
if (authLoading) return null  // 認証確認中はレンダリングしない

if (!currentUser) {
  return <Navigate to="/" replace />
}
```

- Pros: フラッシュなし、1行追加のみ
- Cons: 認証が遅いとブランク画面（許容範囲）
- Effort: Small (1行)
- Risk: Low

### Option B: ローディングスケルトンを表示

```tsx
if (authLoading) return <div className="flex items-center justify-center h-screen">...</div>
```

- Pros: ローディング感の改善
- Cons: 追加コンポーネント
- Effort: Small

## Acceptance Criteria

- [ ] `authLoading` が `true` のとき `DataBrowserPage` は `null` を返す
- [ ] 未ログイン状態での `/data-browser` アクセスで画面フラッシュが発生しない

## Work Log

- 2026-04-12: code-review (PR #45) にて architecture-strategist が発見
