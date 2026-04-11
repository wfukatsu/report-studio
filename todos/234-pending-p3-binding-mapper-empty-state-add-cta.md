---
status: pending
priority: p3
issue_id: "234"
tags: [ui-ux, binding-mapper, empty-state, qa-review]
dependencies: []
---

# バインドマッパー空状態に「スキーマタブを開く」CTA ボタンがない

## Problem Statement

バインドマッパータブの空状態メッセージ「スキーマが未定義です。スキーマタブでグループと
フィールドを追加してください。」からスキーマタブへの直接リンクがなく、
ユーザーが手動でモーダルを閉じてサイドバーのタブを切り替える必要がある。

## Findings

`src/components/modals/BindingMapperTab.tsx` の空状態 return 部分。

## Proposed Solution

```tsx
// BindingMapperTab.tsx の空状態
return (
  <div className="flex flex-col items-center justify-center h-full gap-4 text-xs text-muted-foreground p-8 text-center">
    <p>スキーマが未定義です。</p>
    <p>スキーマタブでグループとフィールドを追加してください。</p>
    <button
      className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
      onClick={() => {
        // DataBindingModal 内で スキーマ設定 タブに切り替えるか、
        // モーダルを閉じてサイドバーのスキーマタブを開く
        onClose?.()
        // サイドバーのスキーマタブへ遷移
      }}
    >
      スキーマを設定する →
    </button>
  </div>
)
```

**Effort:** Small | **Risk:** Low

## Acceptance Criteria

- [ ] 空状態に「スキーマを設定する →」ボタンが表示される
- [ ] ボタンクリックでスキーマ設定画面に遷移する

## Work Log

- 2026-04-12: QA review でCTA不足を確認
