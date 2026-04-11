---
status: pending
priority: p2
issue_id: "183"
tags: [code-review, accessibility, wcag, aria-live, error-messages]
dependencies: []
---

# 動的エラーメッセージへの aria-live / role="alert" が複数箇所で未実装

## Problem Statement

動的に表示されるエラーメッセージが `role="alert"` または `aria-live="assertive"` を持っていないため、スクリーンリーダーユーザーがエラーの発生を認識できない。

## Findings

以下の 4 箇所で問題を確認:

### 1. DbConnectionTab — catalog 取得エラー
**File:** `src/components/modals/DbConnectionTab.tsx:136-143`
```jsx
// 現状: role/aria-live なし
<div className="border border-destructive/40 ...">
  <p className="text-destructive font-medium">{fetchError}</p>
```

### 2. CreateTableForm — テーブル作成エラー
**File:** `src/components/modals/dbConnection/CreateTableForm.tsx:337-357`
```jsx
// 現状: role/aria-live なし
{errorMessage && (
  <div className="border border-destructive/40 ...">
    <p className="text-destructive">{errorMessage}</p>
```

### 3. Toolbar — エクスポートエラー
**File:** `src/components/toolbar/Toolbar.tsx`（exportError 表示箇所）

### 4. SaveStatusIndicator — 保存状態（既に role="status" 実装済み → 問題なし）

Confirmed by: Accessibility deep-dive review (2026-04-11).

## Proposed Solution

すべてのエラー表示コンテナに `role="alert"` を追加:

```jsx
// 修正パターン
<div
  className="border border-destructive/40 ..."
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
>
```

**注意:** `role="alert"` は `aria-live="assertive"` の暗黙的な設定を含むが、明示的に書くことで意図を伝える。

**Effort:** Small（各ファイルに属性追加のみ）| **Risk:** None

## Acceptance Criteria

- [ ] DbConnectionTab.tsx のエラー表示に `role="alert"` 追加
- [ ] CreateTableForm.tsx のエラー表示に `role="alert"` 追加
- [ ] Toolbar.tsx の exportError / refreshError 表示に `role="alert"` 追加
- [ ] スクリーンリーダー（VoiceOver 等）でエラー発生時に自動読み上げされる

## Work Log

- 2026-04-11: Accessibility UI/UX レビューで発見。3 ファイルで共通の問題。
