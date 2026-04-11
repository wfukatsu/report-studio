---
status: complete
priority: p3
issue_id: "225"
tags: [code-review, performance, memory, export]
dependencies: []
---

# Blob URL の revoke タイムアウトが 30 秒 — 複数回クリックで ~150MB がメモリに滞留

## Problem Statement

`handleFullPreviewPdf` が `setTimeout(() => URL.revokeObjectURL(url), 30_000)` を使用。
30秒以内に3回クリックすると3つのBlobが同時にメモリに存在し、
20ページPDFだと ~150MB が不要に滞留する。

ブラウザは blob URL を `window.open()` 呼び出し後すぐに内部でキャプチャするため、
即時または1秒後の revoke で十分。

## Findings

**File:** `src/components/toolbar/Toolbar.tsx` — `handleFullPreviewPdf`

```typescript
const url = URL.createObjectURL(blob)
window.open(url, '_blank')
setTimeout(() => URL.revokeObjectURL(url), 30_000)  // ← 30秒は過剰
```

**`window.open` の戻り値も未チェック** — ポップアップブロック時に URL が revoke されない。

## Proposed Solution

```typescript
const newTab = window.open(url, '_blank')
if (!newTab) {
  URL.revokeObjectURL(url)  // すぐに revoke
  setExportError('ポップアップがブロックされました。ブラウザの設定を確認してください。')
  setTimeout(() => setExportError(null), 5000)
  return
}
// モダンブラウザは blob URL を同期的に取得するため、タスクキュー後の revoke で十分
setTimeout(() => URL.revokeObjectURL(url), 1_000)  // 30秒 → 1秒
```

**Effort:** Trivial | **Risk:** Low

## Acceptance Criteria

- [ ] `window.open` の戻り値がチェックされる（null = ポップアップブロック）
- [ ] ポップアップブロック時にユーザーへのエラーメッセージが表示される
- [ ] revoke タイムアウトが 1000ms 以下

## Work Log

- 2026-04-12: Discovered by Security reviewer (P3) and Performance reviewer (P3)
