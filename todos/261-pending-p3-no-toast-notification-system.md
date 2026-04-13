---
status: complete
priority: p3
issue_id: "261"
tags: [code-review, ui-ux, user-feedback, consistency]
dependencies: []
---

# フィードバック表示位置が4箇所に分散 — 統一トーストシステムなし

## Problem Statement

操作のフィードバックが4種類の異なる場所に表示されており、ユーザーがどこを見れば結果が分かるか一貫していない。

## Findings

フィードバック表示パターンの分散:
1. **削除トースト** — `App.tsx:452-461` — 画面下中央に固定表示
2. **エクスポートエラー** — `Toolbar.tsx` — エクスポートボタン直下（スクロールすると不可視）
3. **バリデーション警告** — `Toolbar.tsx` — 小さな固定位置
4. **データブラウザエラー** — DataGrid コンポーネント内のインライン表示

さらにエクスポートの成功/失敗 Toast が5秒後に自動消去され、ユーザーが見逃す可能性がある。

## Proposed Solutions

### Solution A: shadcn/ui の Toaster を導入（推奨）

`sonner` または `@radix-ui/react-toast` を使った統一通知システム:

```tsx
// App.tsx
import { Toaster } from '@/components/ui/sonner'

// 使用側
import { toast } from 'sonner'
toast.success('エクスポート完了')
toast.error('エクスポートに失敗しました', { duration: 10000 })
```

- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] 全ての操作フィードバックが統一された1箇所から表示される
- [ ] エラーメッセージが少なくとも8秒間表示される（5秒では短すぎる）
- [ ] 成功/警告/エラーが視覚的に区別できる

## Work Log

- 2026-04-13: architecture-strategist による code-review で発見
