---
status: complete
priority: p2
issue_id: "232"
tags: [ui-ux, sidebar, accessibility, qa-review]
dependencies: []
---

# 左サイドバーのタブラベルが小さすぎて判読困難

## Problem Statement

「要素 スキーマ レイヤー ページ 回答 データ」の6タブが狭いサイドバー幅に
詰め込まれており、フォントサイズが約9px 相当。特に右端の「回答」「データ」が
認識しにくい。アクセシビリティ上も問題（WCAG: テキストは最低 14px）。

## Findings

`src/App.tsx` の `LEFT_TABS` 配列と左サイドバーのタブバー部分。
現在は 6 タブすべてのラベルを一行に表示している。

## Proposed Solution

### Option A: アイコン + 短縮ラベル（推奨）

非アクティブタブはアイコンのみ表示、アクティブタブのみラベルも表示:

```tsx
// 各タブにアイコンを割り当て
const LEFT_TABS = [
  { id: 'elements', label: '要素',    icon: <LayoutTemplate className="w-4 h-4" /> },
  { id: 'schema',   label: 'スキーマ', icon: <Database className="w-4 h-4" /> },
  { id: 'layers',   label: 'レイヤー', icon: <Layers className="w-4 h-4" /> },
  { id: 'pages',    label: 'ページ',   icon: <BookOpen className="w-4 h-4" /> },
  { id: 'responses',label: '回答',    icon: <MessageSquare className="w-4 h-4" /> },
  { id: 'data',     label: 'データ',   icon: <Link2 className="w-4 h-4" /> },
]

// 非アクティブ: アイコンのみ + tooltip
// アクティブ: アイコン + ラベル
```

**Pros:** サイドバー幅を維持しつつ認識性向上
**Cons:** アイコン選定が必要
**Effort:** Small | **Risk:** Low

### Option B: 縦並びタブ（VSCode スタイル）

タブを縦に並べ、アイコン + ラベルを一行ずつ表示。

**Effort:** Medium | **Risk:** Medium

## Recommended Action

**Option A** — アイコン追加が最も効果的でリスクが低い。

## Acceptance Criteria

- [ ] すべてのタブにアイコンが追加されている
- [ ] 非アクティブタブがアイコンのみ表示でもホバー時に tooltip が出る
- [ ] アクティブタブのラベルが 12px 以上のフォントサイズ

## Work Log

- 2026-04-12: QA review でタブ判読困難を確認
