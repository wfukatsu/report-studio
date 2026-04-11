---
title: "feat: テンプレート分類機能（カテゴリ＋タグ）"
type: feat
status: completed
date: 2026-04-10
origin: docs/brainstorms/2026-04-10-template-classification-brainstorm.md
---

# feat: テンプレート分類機能（カテゴリ＋タグ）

## Overview

帳票テンプレートにカテゴリ（単一の大分類）とタグ（複数の自由ラベル）を付与し、テンプレート選択モーダルでフィルタチップ＋検索バーによる絞り込みを可能にする。ビルトイン・バックエンド両方のテンプレートに適用する。

(see brainstorm: docs/brainstorms/2026-04-10-template-classification-brainstorm.md)

## Proposed Solution

`Template` 型と `ReportDefinition.metadata` に `category?: string` と `tags?: string[]` を追加。カテゴリ一覧はテンプレートデータから動的集約（マスタテーブル不要）。付与UIはページ設定パネルと保存ダイアログ。フィルタUIはテンプレート選択モーダルに検索バー＋カテゴリチップ＋タグチップを追加。

## Implementation Phases

### Phase 1: 型定義とデータモデル

**Goal:** category/tags フィールドを型・スキーマ・ストアに追加

#### 1-1. `src/types/index.ts`

```ts
// Template 型 (L830)
export interface Template {
  // 既存...
  category?: string
  tags?: string[]
}

// Metadata 型 (L734)
export interface Metadata {
  // 既存...
  category?: string
  tags?: string[]
}
```

#### 1-2. `src/lib/schemas/reportDefinition.ts`

```ts
// MetadataSchema (L175) に追加
const MetadataSchema = z.object({
  // 既存...
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
}).passthrough()
```

#### 1-3. `src/api/reportApi.ts`

```ts
// TemplateListItemSchema (L36) に追加
const TemplateListItemSchema = z.object({
  // 既存...
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
}).passthrough()
```

#### 1-4. `src/store/layoutSlice.ts`

```ts
// metadata 初期値 (L67) に追加
metadata: {
  // 既存...
  category: undefined,
  tags: [],
},

// ストアアクション追加
updateMetadata: (patch) => set((s) => {
  Object.assign(s.definition.metadata, patch)
}),
```

### Phase 2: ビルトインテンプレートにカテゴリ/タグをプリセット

**Goal:** 既存4テンプレートに分類情報を付与

#### 2-1. `src/templates/builtinTemplates.ts` 及び各テンプレートファイル

| テンプレート | ファイル | category | tags |
|-------------|---------|----------|------|
| 扶養控除等申告書 | `fuyouKojoTemplate.ts` | `税務` | `['A4']` |
| 見積書 | `quotationTemplate.ts` | `請求・見積` | `['A4']` |
| 見積書（割引） | `quotationDiscountTemplate.ts` | `請求・見積` | `['A4']` |
| 見積書（英語） | `quotationEnglishTemplate.ts` | `請求・見積` | `['A4', '英語']` |
| 白紙 | `builtinTemplates.ts` (inline) | — | — |

(see brainstorm: セクション7)

### Phase 3: カテゴリ/タグ付与UI

**Goal:** テンプレートにカテゴリとタグを設定するUIを追加

#### 3-1. ページ設定パネル `src/components/sidebar/PageSettingsPanel.tsx`

metadata セクションの末尾に追加:

- **カテゴリ**: コンボボックス（既存カテゴリから選択 or テキスト入力で新規作成）
- **タグ**: タグ入力コンポーネント（チップ表示、テキスト入力でEnter追加、×で削除）

カテゴリ候補のソース:
- ビルトインテンプレートのカテゴリ（常に利用可能）
- テキスト入力による新規カテゴリ追加

注: エディタ画面ではバックエンドテンプレート一覧を取得しないため、バックエンドのカテゴリ一覧はここでは参照しない。テンプレート選択モーダル（Phase 4）では両方を集約する。

(see brainstorm: セクション3, 4)

#### 3-2. 保存ダイアログ `src/components/modals/SaveTemplateDialog.tsx`

テンプレート名入力欄の下に:

- **カテゴリ**: 同上のコンボボックス（現在のmetadata.categoryをデフォルト値に）
- **タグ**: 同上のタグ入力（現在のmetadata.tagsをデフォルト値に）

`onSave` コールバックを `(name: string, category?: string, tags?: string[])` に拡張。

#### 3-3. 共通コンポーネント（新規）

```
src/components/common/CategoryCombobox.tsx   — カテゴリ選択/新規入力コンボボックス
src/components/common/TagInput.tsx            — タグチップ入力コンポーネント
```

### Phase 4: テンプレート選択モーダルのフィルタUI

**Goal:** テンプレート選択時にカテゴリ・タグ・テキストで絞り込めるようにする

#### 4-1. `src/components/modals/TemplateSelectionModal.tsx`

現在のフラットなグリッド表示の上に、以下を追加:

```
┌─────────────────────────────────────────┐
│ [🔍 テンプレートを検索...              ] │
│ [すべて] [税務] [請求・見積] [社内] +   │
│─────────────────────────────────────────│
│ タグ: [英語] [A4]                   ×   │
│─────────────────────────────────────────│
│ [テンプレートA] [テンプレートB]          │
│ [テンプレートC] [テンプレートD]          │
└─────────────────────────────────────────┘
```

(see brainstorm: セクション5)

**フィルタロジック:**

1. **テキスト検索**: `name` と `description` を部分一致（大文字小文字無視）
2. **カテゴリフィルタ**: 排他選択。「すべて」で全表示、カテゴリ選択で完全一致
3. **タグフィルタ**: 複数選択、AND条件。選択タグを全て含むテンプレートのみ表示
4. 3つのフィルタはAND結合

**カテゴリ一覧の集約:**

```ts
const allCategories = [
  ...new Set([
    ...BUILTIN_TEMPLATES.map(t => t.category).filter(Boolean),
    ...backendTemplates.map(t => t.category).filter(Boolean),
  ])
]
```

**タグ一覧の集約:**

```ts
const allTags = [
  ...new Set([
    ...BUILTIN_TEMPLATES.flatMap(t => t.tags ?? []),
    ...backendTemplates.flatMap(t => t.tags ?? []),
  ])
]
```

#### 4-2. フィルタ状態管理

`TemplateSelectionModal` 内のローカルstate:

```ts
const [searchQuery, setSearchQuery] = useState('')
const [selectedCategory, setSelectedCategory] = useState<string | null>(null)  // null = すべて
const [selectedTags, setSelectedTags] = useState<string[]>([])
```

#### 4-3. フィルタ関数（新規）

```
src/lib/templateFilter.ts — filterTemplates(templates, { query, category, tags })
```

ビルトインとバックエンド両方に適用可能な純粋関数。テスト容易。

## Acceptance Criteria

- [ ] `Template` 型に `category?: string` と `tags?: string[]` が追加されている
- [ ] `Metadata` 型に同フィールドが追加されている
- [ ] `MetadataSchema` に Zod バリデーション追加済み
- [ ] ビルトインテンプレート4種にカテゴリ・タグがプリセット済み
- [ ] ページ設定パネルでカテゴリ選択・タグ入力ができる
- [ ] 保存ダイアログでカテゴリ・タグを入力して保存できる
- [ ] テンプレート選択モーダルにテキスト検索バーが表示される
- [ ] テンプレート選択モーダルにカテゴリチップが表示され、クリックでフィルタされる
- [ ] テンプレート選択モーダルにタグチップが表示され、複数選択でANDフィルタされる
- [ ] JSON export/import でカテゴリ・タグが保持される
- [ ] `templateFilter.ts` のユニットテスト: 検索、カテゴリ、タグ、組合せ

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-10-template-classification-brainstorm.md](../brainstorms/2026-04-10-template-classification-brainstorm.md) — Key decisions: カテゴリ＋タグ併用、Template型直接追加、動的集約、フィルタチップUI

### Internal References

- Template型: `src/types/index.ts:830-837`
- Metadata型: `src/types/index.ts:734-742`
- MetadataSchema: `src/lib/schemas/reportDefinition.ts:175-183`
- TemplateListItemSchema: `src/api/reportApi.ts:36-41`
- TemplateSelectionModal: `src/components/modals/TemplateSelectionModal.tsx`
- SaveTemplateDialog: `src/components/modals/SaveTemplateDialog.tsx`
- PageSettingsPanel: `src/components/sidebar/PageSettingsPanel.tsx`
- ストアmetadata更新: `src/store/layoutSlice.ts:169-171`
- ビルトインテンプレート: `src/templates/builtinTemplates.ts`
