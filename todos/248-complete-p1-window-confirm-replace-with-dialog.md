---
status: pending
priority: p1
issue_id: "248"
tags: [code-review, ui-ux, accessibility, confirm-dialog]
dependencies: []
---

# 12箇所の window.confirm() を ConfirmDialog コンポーネントに置き換え

## Problem Statement

`window.confirm()` がコードベース全体で12箇所以上使用されている。`ConfirmDialog` コンポーネントが既に存在するにもかかわらず、一部のフローでのみ使用されており、一貫性がない。`window.confirm()` は JSスレッドをブロックし、スタイリング不可能で、テスト不能であり、コンテキスト情報を表示できない。

## Findings

確認された使用箇所:

| ファイル | 行 | 用途 |
|---------|---|------|
| `src/App.tsx` | 85 | テンプレート変更時の未保存警告 |
| `src/components/toolbar/Toolbar.tsx` | 186 | バリデーション警告でのエクスポート続行確認 |
| `src/components/toolbar/Toolbar.tsx` | 423, 428 | 新規作成/開く時の未保存警告 |
| `src/components/toolbar/Toolbar.tsx` | 468, 479 | ヘッダー/フッター削除確認 |
| `src/components/sidebar/PagePanel.tsx` | 54 | ページ削除確認 |
| `src/components/sidebar/VersionHistoryPanel.tsx` | 76 | バージョン復元確認 |
| `src/components/sidebar/ResponsesPanel.tsx` | 133 | 回答削除確認 |
| `src/components/modals/AdminServerTab.tsx` | 74 | サーバー設定リセット確認 |
| `src/components/modals/ProductMasterTab.tsx` | 73 | 製品削除確認 |
| `src/components/modals/AdminUsersTab.tsx` | 58 | ユーザー削除確認 |

`ConfirmDialog` は `src/components/common/ConfirmDialog.tsx` に存在し、`Toolbar.tsx` のビルトインテンプレート更新フローでのみ正しく使用されている。

**問題点:**
1. JSスレッドブロック（アニメーション・非同期処理が停止）
2. ブラウザのスタイルで表示され、UIブランドと不一致
3. ユニットテストで `window.confirm` をモックしなければならない
4. 削除される内容などのコンテキスト情報を表示できない
5. 一部のブラウザ/拡張機能で無効化される可能性がある

## Proposed Solutions

### Solution A: 各コンポーネントに ConfirmDialog ステートを追加（推奨）

各 `window.confirm()` 呼び出しを以下のパターンに変換:

```tsx
// ステート追加
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

// 破壊的操作前に確認ダイアログを表示
const handleDeletePage = () => setShowDeleteConfirm(true)

// JSX内でダイアログをレンダリング
<ConfirmDialog
  open={showDeleteConfirm}
  title="ページを削除"
  description={`「${page.name}」を削除しますか？この操作は元に戻せません。`}
  confirmLabel="削除"
  variant="destructive"
  onConfirm={() => { deletePage(page.id); setShowDeleteConfirm(false) }}
  onCancel={() => setShowDeleteConfirm(false)}
/>
```

- Pros: 既存コンポーネントを活用、スタイル統一、テスト可能
- Cons: 各コンポーネントにステートを追加する必要がある
- Effort: Medium（12箇所）
- Risk: Low

### Solution B: useConfirmDialog カスタムフック

```tsx
const { confirm, ConfirmDialogComponent } = useConfirmDialog()

// 使用
await confirm({ title: '削除', description: '...' })

// JSX
{ConfirmDialogComponent}
```

- Pros: 各コンポーネントへの変更量が少ない、Promise ベースで非同期フローに組み込みやすい
- Cons: カスタムフックの実装が必要
- Effort: Medium
- Risk: Low

## Acceptance Criteria

- [ ] コードベース内に `window.confirm(` が0件
- [ ] 全ての破壊的操作が `ConfirmDialog` を使用
- [ ] 確認ダイアログに操作対象の具体的な情報が表示される（例: 削除するページ名）
- [ ] `destructive` バリアントで削除操作が赤いボタンで表示される
- [ ] 各ダイアログのユニットテストが追加される

## Work Log

- 2026-04-13: TypeScript review + Architecture review で発見（CRITICAL）
