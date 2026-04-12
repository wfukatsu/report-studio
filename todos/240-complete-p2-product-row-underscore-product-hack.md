---
status: pending
priority: p2
issue_id: "240"
tags: [code-review, typescript, data-browser, architecture]
dependencies: []
---

# `_product` フィールドが型なしで `Record<string, unknown>` に混入

## Problem Statement

`DataGrid.tsx` がproduct masterの行データとして `_product: p` (完全な `Product` オブジェクト) を `Record<string, unknown>[]` に混入している。型システムには見えない暗黙の契約で、`DataDetailPanel` が `isProductMaster` フラグをもとにこのフィールドにアクセスしている。CSVエクスポートでも `_product` が `[object Object]` としてシリアライズされる可能性がある。

## Findings

```tsx
// DataGrid.tsx:77
setProductRows(products.map((p) => ({
  id: p.id, code: p.code, ...,
  _product: p,  // ← 型なし Product が Record<string, unknown> に混入
})))
```

```tsx
// DataDetailPanel.tsx:23
const priceHistory = isProductMaster
  ? (row as unknown as Product).priceHistory ?? []  // ← 強制キャスト
  : []
```

- `isProductMaster` プロップによる型分岐が型システムの外で行われている
- `columns` リストに `_product` が含まれていないのでグリッドには表示されないが、`detailRow` として Zustand ストアに保存される（`Record<string, unknown>`）
- CSVエクスポートは `columns` を使うので `_product` は除外されるが、偶発的に `columns` に含まれると壊れる

## Proposed Solutions

### Option A: DataDetailPanel に `product?: Product` プロップを追加（推奨）

```tsx
// DataDetailPanel.tsx
interface Props {
  row: Record<string, unknown>
  columns: string[]
  product?: Product  // product master の場合のみ
  onClose: () => void
}

// DataGrid.tsx — 別状態として管理
const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
const selectedProduct = useMemo(
  () => products.find(p => p.id === selectedProductId) ?? null,
  [products, selectedProductId]
)

// 行クリック時
onClick={() => {
  setDetailRow(row)
  if (source.kind === 'product-master') setSelectedProductId(row.id as string)
}}

// DataDetailPanel に渡す
<DataDetailPanel
  row={detailRow}
  columns={columns}
  product={source.kind === 'product-master' ? selectedProduct : undefined}
  onClose={...}
/>
```

`_product` を productRows から削除。

- Pros: 型安全、`isProductMaster` プロップ不要
- Cons: DataGrid が products 配列の参照を保持する必要がある
- Effort: Small
- Risk: Low

## Acceptance Criteria

- [ ] `_product` フィールドが productRows の `Record<string, unknown>` から削除される
- [ ] `DataDetailPanel` が `product?: Product` プロップ経由で価格履歴を受け取る
- [ ] `isProductMaster` プロップが `DataDetailPanel` から削除される
- [ ] フロントエンドビルド通過

## Work Log

- 2026-04-12: code-review (PR #45) にて kieran-typescript-reviewer + architecture-strategist が発見
