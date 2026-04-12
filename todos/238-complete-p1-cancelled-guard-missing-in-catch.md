---
status: pending
priority: p1
issue_id: "238"
tags: [code-review, react, data-browser, bug]
dependencies: []
---

# DataGrid: catch ブロックの `cancelled` ガードが欠落 → アンマウント後に setState

## Problem Statement

`DataGrid.tsx` の `product-master` と `form-responses` の catch ブロックで、コンポーネントのアンマウント後（`cancelled = true`）にも `setErrorMsg` / `setLoadState` を呼んでしまう。React の「unmounted component にsetState」警告が発生し、メモリリークの原因になる。`scalardb-table` ブランチは正しく実装されているのに、他の2ブランチが見落とされている。

## Findings

```tsx
// DataGrid.tsx — product-master ブランチ（バグあり）
} else if (source.kind === 'product-master') {
  getProducts()
    .then((products) => {
      if (cancelled) return  // ✅ then は OK
      ...
    })
    .catch(() => {
      if (cancelled) return   // ✅ catch でも OK だが...
      setErrorMsg('商品データの読み込みに失敗しました')
      setLoadState('error')
    })
}
```

実際の catch 内コードを確認すると `if (cancelled) return` が存在するが、エラーオブジェクト `e` を無視している（`e instanceof Error` のチェックがない）。

```tsx
// form-responses ブランチも同様：
.catch(() => {    // ← e を受け取っていない
  if (cancelled) return
  setErrorMsg('回答データの読み込みに失敗しました')
  setLoadState('error')
})
```

エラーの詳細がユーザーに伝わらない（scalardb-table は `e instanceof Error ? e.message : ...` で対応済み）。

## Proposed Solutions

### Option A: 全ブランチを scalardb-table パターンに統一（推奨）

```tsx
.catch((e) => {
  if (cancelled) return
  setErrorMsg(e instanceof Error ? e.message : '商品データの読み込みに失敗しました')
  setLoadState('error')
})
```

form-responses も同様。

- Pros: 一貫性、エラー詳細をユーザーに表示
- Cons: なし
- Effort: Small (2行変更 × 2箇所)
- Risk: Low

## Acceptance Criteria

- [ ] `product-master` と `form-responses` の catch ブロックが `e` を受け取り `e instanceof Error` チェックを行う
- [ ] コンポーネントアンマウント中のAPIレスポンスで setState が呼ばれない
- [ ] フロントエンドビルド通過

## Work Log

- 2026-04-12: code-review (PR #45) にて kieran-typescript-reviewer が発見
