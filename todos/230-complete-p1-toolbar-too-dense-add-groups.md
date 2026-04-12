---
status: complete
priority: p1
issue_id: "230"
tags: [ui-ux, toolbar, qa-review]
dependencies: []
---

# ツールバーが密すぎる — グループ化とセパレーターを追加

## Problem Statement

30以上のボタンが1行に並んでおり、1280px 幅でも小さなアイコンの羅列になっている。
新規ユーザーが「保存はどこ？」「プレビューはどこ？」と迷う最大の摩擦ポイント。

## Findings

`src/components/toolbar/Toolbar.tsx` のボタンが機能グループに関係なく並列に配置されている。
視覚的なグルーピングがない。

## Proposed Solution

### Option A: セパレーターを追加してグループ化（推奨）

```tsx
// ファイル操作 | 編集（undo/redo/copy/cut/paste）| 表示（grid/snap/trim）| 出力（preview/pdf/png）
// 各グループの間に <div className="w-px h-4 bg-border mx-1" /> を挿入
```

**Pros:** 最小変更で視認性向上、既存レイアウトを維持
**Cons:** ボタン数自体は変わらない
**Effort:** Small | **Risk:** Low

### Option B: 重要度の低いボタンを「...」メニューに格納

バリデート、BEで生成 など頻度の低いボタンをオーバーフローメニューへ。

**Effort:** Medium | **Risk:** Low

## Recommended Action

Option A でまず視認性を改善し、ユーザーフィードバック次第で Option B を検討。

グループ案:
1. ファイル操作: 新規作成 / 開く / テンプレート管理 / 保存
2. 編集: Undo / Redo / Copy / Cut / Paste / Align / Z-order
3. 表示: Grid / Snap / Trim / Margin / Header編集 / Zoom
4. 出力: Preview / PNG / PDF / Validate

## Acceptance Criteria

- [ ] ツールバーに 3〜4 箇所のセパレーターが追加されている
- [ ] 各グループが機能的に関連するボタンで構成されている
- [ ] 1280px 幅でボタンラベルが判読可能

## Work Log

- 2026-04-12: QA review で発見（スコア影響: Visual -25, UX -15）
