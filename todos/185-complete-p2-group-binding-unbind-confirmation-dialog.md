---
status: complete
priority: p2
issue_id: "185"
tags: [code-review, ui-ux, scalardb, data-safety, confirmation]
dependencies: []
---

# DB バインド「解除」ボタンに確認ダイアログがなく誤操作リスクあり

## Problem Statement

`GroupBindingSection` の「解除」ボタンは確認なしに即座にバインドを解除する。解除するとグループの `tableMeta` が削除されると同時に、全フィールドの `dbColumnName` も消去される（`bindGroupToTable(id, undefined)` の実装）。誤クリックでデータが失われる。

## Findings

**File:** `src/components/modals/dbConnection/GroupBindingSection.tsx:137-143`

```tsx
const handleUnbind = useCallback(() => {
  bindGroupToTable(group.id, undefined)  // 即座に実行、確認なし
  setPendingNamespace('')
}, [bindGroupToTable, group.id])
```

ボタン:
```tsx
{group.tableMeta && (
  <button type="button" onClick={handleUnbind}>解除</button>
)}
```

他の削除操作（ページ削除、ヘッダー削除）には `confirm()` が実装済み。一貫性の観点でも問題。

Confirmed by: Data integration UI review (2026-04-11).

## Proposed Solution

`ConfirmDialog` コンポーネントを使用して確認を追加:

```tsx
const [showUnbindConfirm, setShowUnbindConfirm] = useState(false)

const handleUnbindConfirmed = useCallback(() => {
  bindGroupToTable(group.id, undefined)
  setPendingNamespace('')
  setShowUnbindConfirm(false)
}, [bindGroupToTable, group.id])

// ボタン
<button type="button" onClick={() => setShowUnbindConfirm(true)}>解除</button>

// ConfirmDialog
<ConfirmDialog
  open={showUnbindConfirm}
  title="テーブル連携を解除"
  message={`「${group.label}」のテーブル連携（${group.tableMeta?.tableName}）を解除しますか？フィールドのカラムマッピングもすべて失われます。`}
  confirmLabel="解除する"
  cancelLabel="キャンセル"
  variant="danger"
  onConfirm={handleUnbindConfirmed}
  onCancel={() => setShowUnbindConfirm(false)}
/>
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] 「解除」ボタンクリック時に ConfirmDialog が表示される
- [ ] 確認後のみバインド解除が実行される
- [ ] キャンセルでは何も変更されない
- [ ] ダイアログメッセージにテーブル名・影響範囲が表示される

## Work Log

- 2026-04-11: Data integration UI/UX レビューで発見。既存の削除確認パターンと統一。
