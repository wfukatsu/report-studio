---
status: complete
priority: p1
issue_id: "217"
tags: [code-review, typescript, ux, export, toolbar]
dependencies: []
---

# `handleFullPreviewPdf` の外側 `catch {}` がサーバーエラーを無音で破棄 — ユーザーに何も通知されない

## Problem Statement

`Toolbar.tsx` の `handleFullPreviewPdf` はサーバーPDF生成失敗をキャッチするが、
外側の `catch {}` はエラーを飲み込んだまま次の `try` ブロック（クライアントPDF生成）に移行する。
クライアントPDF生成も失敗した場合のみエラーが表示される。

サーバー側で静かに失敗している場合、ユーザーはクライアント側レンダリング（品質低下）で生成されたPDFを受け取るが、
それが劣化したものとは気づかない。

## Findings

**File:** `src/components/toolbar/Toolbar.tsx` — `handleFullPreviewPdf` 関数

```typescript
try {
  // サーバー PDF 生成
  const blob = await generateStatelessPdf(defJson, dataJson)
  // ...
} catch {
  // ← サーバーエラーが無音で捨てられる
  try {
    // クライアント PDF 生成（品質低下）
    const blob = await exportReportToPdfBlob(els)
    // ...
  } catch (_err) {
    setExportError('PDFプレビューの生成に失敗しました')
  }
}
```

**比較**: `doExportPdf` は `setExportError('ローカル生成（品質低下）でエクスポートしました')` でフォールバックを通知している。

## Proposed Solutions

### Option A: フォールバック通知を追加（推奨）

```typescript
} catch (serverErr) {
  console.warn('Server PDF preview failed, falling back to client-side:', serverErr)
  // フォールバック通知
  try {
    // ... client fallback ...
    // 成功した場合にフォールバックを通知
    setExportError('クライアントレンダリングでプレビューを生成しました（品質が低下している場合があります）')
    setTimeout(() => setExportError(null), 5000)
  } catch (_err) {
    setExportError('PDFプレビューの生成に失敗しました')
  }
}
```

**Pros:** ユーザーが品質低下を認識できる、デバッグ可能
**Cons:** 若干多くのユーザーインタラクションが必要
**Effort:** Small | **Risk:** Low

### Option B: フォールバック処理を `doExportPdf` と共通化

```typescript
// 共通フォールバックユーティリティを extractd
async function tryServerThenClientPdf(defJson, dataJson, canvasEls, options): Promise<Blob>
```

**Pros:** コードの重複を解消
**Cons:** リファクタリングスコープが大きくなる
**Effort:** Medium | **Risk:** Medium

## Recommended Action

**Option A** を即座に実施（一行追加）。Option B は将来のクリーンアップで。

## Technical Details

**Affected file:** `src/components/toolbar/Toolbar.tsx` — `handleFullPreviewPdf` catch ブロック

## Acceptance Criteria

- [ ] サーバーPDF生成失敗時、クライアントフォールバックにロールバックした旨がUI上に表示される
- [ ] エラーは5秒後に自動的に消える
- [ ] `doExportPdf` と同様のフォールバック通知パターンを踏襲している

## Work Log

- 2026-04-12: Discovered by TypeScript reviewer (P1) and Architecture reviewer (P2)
