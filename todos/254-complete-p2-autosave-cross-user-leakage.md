---
status: pending
priority: p2
issue_id: "254"
tags: [code-review, security, pii, localstorage, auth]
dependencies: []
---

# オートセーブが異なるユーザー間でlocalStorageに残存 — PII漏洩リスク

## Problem Statement

テンプレート定義全体（データスキーマバインディング、テナント情報を含む）が毎秒 `rds-autosave` キーで localStorage に保存される。別ユーザーがログインしても、前ユーザーのオートセーブデータが削除されず、復元プロンプトに表示される可能性がある。共有ワークステーションや複数ユーザーがブラウザプロファイルを共有する環境でPIIが漏洩するリスクがある。

## Findings

**Location:** `src/App.tsx:93-105, 133, 267`

```ts
// 毎秒保存（ユーザーIDタグなし）
localStorage.setItem('rds-autosave', JSON.stringify(reportState))

// ログイン切り替え時: localStorage.removeItem('rds-autosave') が呼ばれない
// 次のユーザーが新規ログイン後、前ユーザーのデータを復元できてしまう
```

## Proposed Solutions

### Solution A: ユーザーIDでオートセーブキーを分離し、ログアウト時に削除（推奨）

```ts
const saveKey = `rds-autosave:${userId}`
localStorage.setItem(saveKey, JSON.stringify(reportState))

// ログアウト時
localStorage.removeItem(`rds-autosave:${prevUserId}`)

// 復元時: 現ユーザーのキーのみチェック
const saved = localStorage.getItem(`rds-autosave:${currentUserId}`)
```

- Effort: Small
- Risk: Low

### Solution B: ログアウト時に全 rds-* キーをクリア

```ts
// ログアウトハンドラ
Object.keys(localStorage)
  .filter(k => k.startsWith('rds-'))
  .forEach(k => localStorage.removeItem(k))
```

- Effort: Small
- Risk: Low（より強力なクリア）

## Acceptance Criteria

- [ ] ユーザーAがログアウト後にユーザーBがログインしても、ユーザーAのオートセーブが復元プロンプトに表示されない
- [ ] ログアウト時に `rds-autosave` データが削除される
- [ ] 同一ユーザーの再ログインではオートセーブが正しく復元される

## Work Log

- 2026-04-13: security-sentinel による code-review で発見
