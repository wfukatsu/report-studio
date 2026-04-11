---
title: "feat: テンプレート管理機能（追加・削除・変更）"
type: feat
status: completed
date: 2026-04-10
origin: docs/brainstorms/2026-04-10-template-management-brainstorm.md
---

# feat: テンプレート管理機能（追加・削除・変更）

## Overview

テンプレートの削除・名前変更・カテゴリ/タグ編集をUIから行える機能を追加する。テンプレート選択モーダルにホバーボタンを追加（簡易操作）し、詳細管理用のテンプレート管理モーダルを新規作成する。MVPではバックエンドテンプレートの操作に集中し、ビルトインの表示制御は後続フェーズとする。

(see brainstorm: docs/brainstorms/2026-04-10-template-management-brainstorm.md)

## Proposed Solution

2層UI構成:
1. **テンプレート選択モーダル拡張**: 既存のホバーボタン（エクスポート・複製）に削除・名前変更を追加
2. **テンプレート管理モーダル新規**: 一覧表示・削除・名前変更・カテゴリ/タグ編集の専用画面

## Implementation Phases

### Phase 1: 削除確認ダイアログ

**Goal:** 共通の確認ダイアログコンポーネントを作成

#### 1-1. `src/components/common/ConfirmDialog.tsx` (新規)

```tsx
interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string     // デフォルト: "削除"
  confirmVariant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}
```

- 赤色の確認ボタン（`confirmVariant='danger'`）
- テンプレート名を明示（`message`に含める）
- Escape / backdrop click でキャンセル

(see brainstorm: セクション5)

### Phase 2: テンプレート選択モーダル拡張

**Goal:** バックエンドテンプレートの削除・名前変更ボタンを追加

#### 2-1. `src/components/modals/TemplateSelectionModal.tsx`

既存のホバーボタン群（エクスポート・複製）に以下を追加:

- **削除ボタン** (Trash2 icon): `deleteReport(id)` → 確認ダイアログ → 一覧再取得
- **名前変更ボタン** (Pencil icon): クリックでテンプレート名がinput要素に切り替わり、Enter/blur で確定

ビルトインテンプレートには削除・名前変更ボタンを表示しない。

**削除フロー:**
1. ゴミ箱ボタンクリック → ConfirmDialog表示
2. 確認 → `deleteReport(id)` 呼出
3. 成功 → `handleFetchBackend()` で一覧再取得
4. 失敗 → エラーメッセージ表示

**名前変更フロー:**
1. ペンシルボタンクリック → `renamingId` state にIDをセット
2. テンプレート名がinput要素に変わる
3. Enter/blur → `getReport(id)` で定義全体を取得（TemplateListItemには名前しかないため） → `saveReport(id, {...def, metadata: {...metadata, documentName: newName}})` で保存
4. 成功 → 一覧再取得、`renamingId` をクリア
5. 注: 名前変更だけでも定義全体の取得・保存が必要（API制約）

#### 2-2. 「テンプレートを管理」リンク

モーダルヘッダーまたはフッターに管理モーダルへのリンクを追加。

### Phase 3: テンプレート管理モーダル

**Goal:** テンプレートの一覧管理画面を新規作成

#### 3-1. `src/components/modals/TemplateManagerModal.tsx` (新規)

```
┌──────────────────────────────────────────────┐
│ テンプレート管理                          ✕  │
│──────────────────────────────────────────────│
│ ビルトインテンプレート                        │
│ ┌────────────────────────────────────────┐   │
│ │ 扶養控除等申告書   税務    [A4]   [...] │   │
│ │ 見積書            請求・見積 [A4] [...] │   │
│ │ 見積書（割引）    請求・見積 [A4] [...] │   │
│ │ Quotation         請求・見積 [A4,英語]  │   │
│ └────────────────────────────────────────┘   │
│                                              │
│ バックエンドテンプレート        [一覧を取得]  │
│ ┌────────────────────────────────────────┐   │
│ │ テンプレA  税務 [A4] [✏️][🗑️]          │   │
│ │ テンプレB  —    —    [✏️][🗑️]          │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

各テンプレート行:
- テンプレート名（クリックでインライン編集、バックエンドのみ）
- カテゴリ（CategoryCombobox、バックエンドのみ編集可）
- タグ（チップ表示、バックエンドのみ編集可）
- アクションボタン: 名前変更、削除（バックエンドのみ）

#### 3-2. 管理モーダルの開き方

- テンプレート選択モーダルのヘッダーに「管理」ボタン追加
- ツールバーのテンプレート関連メニューからも開ける

#### 3-3. カテゴリ/タグのインライン編集

管理モーダル内で:
- カテゴリ: CategoryCombobox（Phase 3で作成済み）を行ごとに表示
- タグ: TagInput（Phase 3で作成済み）を行ごとに表示
- 変更時に `getReport(id)` → metadata更新 → `saveReport(id, definition)` で保存

### Phase 4: ツールバー統合

**Goal:** ツールバーから管理モーダルに直接アクセス

#### 4-1. `src/components/toolbar/Toolbar.tsx`

既存のテンプレート関連ボタン（新規作成・開く等）の近くに「テンプレート管理」ボタンを追加。

## Acceptance Criteria

- [ ] バックエンドテンプレートを選択モーダルから削除できる（確認ダイアログ付き）
- [ ] バックエンドテンプレートの名前をインライン編集で変更できる
- [ ] テンプレート管理モーダルが開ける（選択モーダルから＋ツールバーから）
- [ ] 管理モーダルでビルトイン＋バックエンドのテンプレート一覧が表示される
- [ ] 管理モーダルでバックエンドテンプレートのカテゴリ・タグを編集して保存できる
- [ ] 管理モーダルでバックエンドテンプレートを削除できる
- [ ] ビルトインテンプレートには削除・名前変更ボタンが表示されない
- [ ] 削除後に一覧が自動更新される

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-10-template-management-brainstorm.md](../brainstorms/2026-04-10-template-management-brainstorm.md) — Key decisions: 2層UI構成、バックエンドテンプレートのCRUD、ビルトイン表示制御はPhase 2

### Internal References

- TemplateSelectionModal: `src/components/modals/TemplateSelectionModal.tsx`
- SaveTemplateDialog: `src/components/modals/SaveTemplateDialog.tsx`
- API関数: `src/api/reportApi.ts:76-98` (listReports, getReport, createReport, saveReport, deleteReport, duplicateReport)
- CategoryCombobox: `src/components/common/CategoryCombobox.tsx`
- TagInput: `src/components/common/TagInput.tsx`
- Toolbar: `src/components/toolbar/Toolbar.tsx`
