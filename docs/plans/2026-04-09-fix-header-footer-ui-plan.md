---
title: "fix: ヘッダー/フッター UI の課題 8件修正"
type: fix
status: completed
date: 2026-04-09
---

# fix: ヘッダー/フッター UI の課題 8件修正

## Overview

ヘッダー/フッター機能の UI レビューで発見した 8件の課題を修正する。P1 ロジックバグ 2件を最優先で修正し、P1 UX 改善 2件と P2 改善 3件を段階的に実装する。

## Problem Statement

レビューで発見した課題:

**P1（ロジックバグ）**:
- **HF-03**: `setMasterHeader` が既存ページにヘッダーセクションがない場合に追加しない（`addPage` では `unshift` するが `setMasterHeader` では欠落）
- **HF-04**: マスターヘッダー/フッター削除時に既存ページのセクションが削除されない

**P1（UX）**:
- **HF-01**: ヘッダー/フッターセクションの存在が視覚的にわかりにくい（ラベル 8px、背景色が薄すぎる）
- **HF-02**: ヘッダーにコンテンツを追加する方法がわかりにくい

**P2**:
- **HF-05**: H/F 編集ボタンがヘッダー/フッター作成時に突然出現する
- **HF-06**: セクション高さの数値入力がない（ドラッグ操作のみ）
- **HF-08**: 「H」「F」の 1文字ラベルが不親切

**P2（大規模・将来対応）**:
- **HF-07**: マスター連動の欠如（ページ固有編集がマスターに反映されない）→ 設計変更が大きいため本プランではスコープ外

## Technical Approach

### Phase 1: P1 ロジックバグ修正（HF-03, HF-04）

**ファイル**: `src/store/layoutSlice.ts`

#### HF-03: setMasterHeader のヘッダー追加漏れ

```typescript
// 現在（L437-444）: idx === -1 の場合何もしない
// 修正: idx === -1 なら unshift で追加（addPage と同じロジック）
setMasterHeader: (section: Section | null) => {
  set((s) => {
    s.definition.masterHeader = section ?? undefined
    if (section) {
      s.definition.pages.forEach((page) => {
        const idx = page.sections.findIndex((sec) => sec.sectionType === 'header')
        if (idx !== -1) {
          page.sections[idx] = cloneSectionForPage(section)
        } else {
          page.sections.unshift(cloneSectionForPage(section))  // ← 追加
        }
      })
    }
  })
}
```

- [ ] `setMasterHeader`: `idx === -1` の場合に `page.sections.unshift()` でヘッダーを追加
- [ ] `setMasterFooter`: 同様に `idx === -1` の場合に `page.sections.push()` でフッターを追加

#### HF-04: 削除時にセクションを除去

```typescript
// 現在: section === null の場合、masterHeader を undefined にするだけ
// 修正: 全ページから該当セクションも削除
setMasterHeader: (section: Section | null) => {
  set((s) => {
    s.definition.masterHeader = section ?? undefined
    if (section) {
      // ... 既存の更新ロジック + HF-03 修正
    } else {
      // 全ページからヘッダーセクションを削除
      s.definition.pages.forEach((page) => {
        page.sections = page.sections.filter((sec) => sec.sectionType !== 'header')
      })
    }
  })
}
```

- [ ] `setMasterHeader(null)`: 全ページの `sectionType === 'header'` セクションを `filter` で削除
- [ ] `setMasterFooter(null)`: 全ページの `sectionType === 'footer'` セクションを `filter` で削除
- [ ] テスト: 2ページ構成でヘッダー作成 → 両ページにヘッダーあり → 削除 → 両ページからヘッダー消失

### Phase 2: P1 UX 改善（HF-01, HF-02）

#### HF-01: セクションの視認性向上

**ファイル**: `src/components/canvas/SectionContainer.tsx`

- [ ] `SECTION_COLORS.header` を `rgba(59,130,246,0.04)` → `rgba(59,130,246,0.08)` に濃くする
- [ ] `SECTION_COLORS.footer` を `rgba(107,114,128,0.04)` → `rgba(107,114,128,0.08)` に濃くする
- [ ] セクションラベルの `fontSize` を `8px` → `10px` に拡大
- [ ] ラベルの色を `#9ca3af` → `#6b7280` に濃くする

#### HF-02: 空セクションにガイドテキスト表示

**ファイル**: `src/components/canvas/SectionContainer.tsx`

- [ ] セクションが空（`elements.length === 0`）かつ `!readonly` の場合、中央にガイドテキストを表示:
  - ヘッダー: 「要素をドロップしてヘッダーを作成」
  - フッター: 「要素をドロップしてフッターを作成」
- [ ] ガイドテキストは `pointerEvents: 'none'`、`color: #9ca3af`、`fontSize: 11px`

### Phase 3: P2 改善（HF-05, HF-06, HF-08）

#### HF-05: H/F 編集ボタンを常時表示

**ファイル**: `src/components/toolbar/Toolbar.tsx`

- [ ] `{(masterHeader || masterFooter) && (` の条件を削除し、常に表示
- [ ] ヘッダーもフッターもない場合は `disabled` にする

#### HF-06: セクション高さの数値入力

**ファイル**: `src/components/sidebar/PageSettingsPanel.tsx`

- [ ] マスターヘッダーが存在する場合、「ヘッダー高さ (mm)」の数値入力を表示（最小 10mm）
- [ ] マスターフッターが存在する場合、「フッター高さ (mm)」の数値入力を表示（最小 10mm）
- [ ] 変更時: 現在のマスターセクションをコピーし `height` を新値に変更して `setMasterHeader({ ...masterHeader, height: newHeight })` を呼ぶ（全ページに自動反映される）

#### HF-08: ボタンラベルの改善

**ファイル**: `src/components/toolbar/Toolbar.tsx`

- [ ] 「H」→ 「ヘッダー」、「F」→ 「フッター」にラベルを変更
- [ ] `text-xs ml-1` のスタイルはそのまま

## Acceptance Criteria

- [ ] 2ページ構成でマスターヘッダーを作成 → 両ページにヘッダーが追加される（HF-03）
- [ ] マスターヘッダーを削除 → 全ページからヘッダーセクションが消える（HF-04）
- [ ] ヘッダー/フッターセクションの背景色とラベルが視認しやすい（HF-01）
- [ ] 空のヘッダー/フッターにガイドテキストが表示される（HF-02）
- [ ] H/F 編集ボタンが常に表示され、H/F 未作成時は disabled（HF-05）
- [ ] PageSettingsPanel でヘッダー/フッター高さを数値入力で変更できる（HF-06）
- [ ] ツールバーのボタンラベルが「ヘッダー」「フッター」になる（HF-08）
- [ ] `npm test -- --run` 全パス
- [ ] 既存のヘッダー/フッター機能（addPage 時の自動クローン等）が壊れない

## Sources & References

- ストアロジック: `src/store/layoutSlice.ts:433-463`
- SectionContainer: `src/components/canvas/SectionContainer.tsx`
- ツールバー H/F ボタン: `src/components/toolbar/Toolbar.tsx:611-636`
- ページ設定: `src/components/sidebar/PageSettingsPanel.tsx`
- セクションユーティリティ: `src/lib/sectionUtils.ts`
- 学習: `docs/solutions/ui-bugs/sidebar-panel-ux-master-hf-localization.md`
