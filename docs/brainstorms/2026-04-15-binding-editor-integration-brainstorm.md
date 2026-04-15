# Brainstorm: バインドエディタのデータ管理タブ統合

**Date:** 2026-04-15
**Status:** Approved
**Author:** Claude Code + Fukatsu

---

## What We're Building

v1 `BindingEditorPage` の全機能を v2 のデータ管理タブに統合する。現在のデータ管理タブ（6セクションナビ構成）をバインドエディタ中心のレイアウトに全面置き換えする。

### 統合する v1 機能一覧

| 機能 | v1 実装 | v2 現状 | 統合方針 |
|------|---------|---------|----------|
| 3パネルレイアウト | `DataBinderLayout` | なし（モーダル内のみ） | 新規構築 |
| テンプレート要素パネル (左) | `ElementGroupBlock` | `BindingMapperTab` の右半分 | v1のUX・グループ構造を踏襲し、Tailwindで新規実装 |
| スキーマフィールドパネル (中央) | `SchemaGroupBlock` | `SchemaPanel` + `BindingMapperTab` の左半分 | v1のUX踏襲 + v2 `schemaSlice` のアクションを直接利用 |
| DBパネル (右) | `DBPanel` (アコーディオン) | `DbConnectionTab` | v1のアコーディオンUI踏襲、v2のカタログ取得APIを活用 |
| SVG接続線 | `ConnectionLines` + `useConnectionLines` | `ConnectionOverlay` (簡易版) | v1の座標計算ロジックを移植、SVGコンポーネントはTailwindで再実装 |
| 一括要素生成 | `BulkGenerateBar` | なし | v1のロジック移植 + Tailwind UI |
| 計算フィールドダイアログ | `ComputedFieldDialog` (lazy) | `CalculationTab` (フラット表示) | v1のダイアログ方式を採用、shadcn/ui Dialog で再実装 |
| グループ並べ替え (DnD) | `useReorderHandlers` | なし | v1のロジック移植、`@dnd-kit/core` で再実装 |
| グループ間移動 | `handleElCrossGroup` / `handleSchCrossGroup` | なし | v1のロジック移植、`@dnd-kit/core` で再実装 |
| dirty検出 | `useBindingDirty` | なし | v1のロジック移植（Zustand store の snapshot 比較に適応） |
| アンドゥ警告 | `useBeforeUnload` | なし | v1のロジック移植 |
| サマリーバー | `BindingMapper` (N/M解決済) | なし (ステータスバーのみ) | v1のUX踏襲、Tailwind UI で再実装 |
| エラートースト | `ErrorToast` | `AlertBanner` | v2既存を活用 |
| 確認ダイアログ | `ConfirmDialog` | なし | 新規構築 (shadcn/ui AlertDialog) |

### 非統合機能の配置先

現在のデータ管理タブにある以下の機能は、バインドエディタには含めず別タブとして分離する:

| 機能 | 現在の配置 | 移動先 |
|------|-----------|--------|
| データソース | DataManagementTab > datasource | デザインタブのサイドバー |
| 回答フィールド | DataManagementTab > responses | AppShell に「回答」タブ追加 |
| データブラウザ | DataManagementTab > databrowser | AppShell に「データブラウザ」タブ追加 |
| バリデーション | DataManagementTab > validation | バインドエディタのスキーマパネル内サブ機能 or 別タブ |

---

## Why This Approach

### 1. ワークフローの統合

v1 では「スキーマ定義 → フィールド↔要素バインド → DB接続」が1画面で完結していた。v2 ではこれが `SchemaPanel`、`BindingMapperTab`（モーダル内）、`DbConnectionTab`（モーダル内）に分散しており、ユーザーは複数の画面を行き来する必要がある。

### 2. SVG接続線による直感的な操作

v1 の最大の強みは、テンプレート要素とスキーマフィールドの接続関係をSVG線で視覚化し、ドラッグ操作で直感的にバインドできる点。v2 のモーダル内では画面が狭く、この体験を十分に提供できていない。

### 3. v2 のデザインシステムとの整合

v1 の CSS Modules + 独自デザインを v2 の Tailwind CSS + shadcn/ui で再構築することで、UIの一貫性を保つ。

---

## Key Decisions

1. **データ管理タブを全面置き換え**: 6セクションナビ構成を廃止し、バインドエディタ(3パネル)に置き換える。タブ名は「データ管理」→「バインド」に変更
2. **v1 完全再現スコープ**: 一括生成、計算式エディタ、DnD並べ替え、グループ間移動、dirty検出、アンドゥ警告を含む全機能を移植
3. **非統合機能は別タブへ分離**: データソースはデザインタブのサイドバー、回答フィールド・データブラウザはそれぞれ AppShell の独立タブ。結果、AppShell のタブ構成は: デザイン / バインド / テンプレート / 回答 / データブラウザ / 管理 の6タブになる
4. **Tailwind + shadcn/ui で再構築**: v1 の CSS Modules は移植せず、v2 のデザインシステムで一から構築
5. **一括実装**: フェーズ分割せず一括で実装する
6. **既存の v2 `BindingMapperTab` と `DbConnectionTab` は廃止**: 新しいバインドエディタに機能を統合し、旧コンポーネントは削除。`DataBindingModal` 自体はテナント情報・商品マスター・Webhook 等の残存タブのために維持するが、「バインドマッパー」「データ連携」タブは除去する

---

## Technical Architecture

### コンポーネント構成 (予定)

```
src/components/bindingEditor/
├── BindingEditor.tsx              # メインレイアウト (3パネル)
├── hooks/
│   ├── useBindingState.ts         # 状態管理 (v1 useBindingState ベース)
│   ├── useConnectionLines.ts      # SVG線の座標計算
│   ├── useReorderHandlers.ts      # DnD並べ替え
│   └── useBindingDirty.ts         # dirty検出
├── panels/
│   ├── ElementPanel.tsx           # 左パネル: テンプレート要素
│   ├── SchemaPanel.tsx            # 中央パネル: スキーマフィールド
│   └── DbPanel.tsx                # 右パネル: DB接続
├── internals/
│   ├── ElementGroupBlock.tsx      # 要素グループ (折りたたみ可)
│   ├── SchemaGroupBlock.tsx       # スキーマグループ (折りたたみ可)
│   ├── ConnectionLines.tsx        # SVGオーバーレイ
│   ├── BulkGenerateBar.tsx        # 一括生成バー
│   ├── ComputedFieldDialog.tsx    # 計算式エディタダイアログ
│   ├── NoSchemaPanel.tsx          # スキーマ未設定時の空状態
│   └── SummaryBar.tsx             # サマリーバー (N/M解決済)
└── types.ts                       # バインドエディタ固有の型
```

### データフロー

```
Zustand Store (reportStore)
  ├── schema.groups[]           ← スキーマフィールドパネル (schemaSlice)
  ├── pages[].sections[].elements[] ← テンプレート要素パネル (layoutSlice)
  ├── element.schemaBinding     ← 接続線 (layoutSlice.setElementSchemaBinding)
  └── group.tableMeta           ← DBパネル (schemaSlice)
           ↓
  useBindingState (派生状態の算出 + UIローカル状態)
           ↓
  3パネル + SVG接続線 + サマリーバー
```

**v1 → v2 の状態管理方針:**
- v1 の `useBindingState` は props-in / callbacks-out のローカル状態管理だった
- v2 では Zustand store (`schemaSlice`, `layoutSlice`) が既にスキーマ・要素・バインドの CRUD を持つ
- 新しい `useBindingState` は **既存の Zustand アクションをラップ**し、バインドエディタ固有の派生状態（接続数、未バインド要素リスト、依存グラフ等）とUIローカル状態（選択中フィールド、ドラッグ状態、展開/折りたたみ等）のみを管理する
- ストアへの書き込みは既存アクション (`addSchemaField`, `setElementSchemaBinding`, `updateGroupMeta` 等) を直接呼び出す

### v1 → v2 マッピング

| v1 コンポーネント | v2 対応 |
|-------------------|---------|
| `DataBinderLayout` | `BindingEditor.tsx` (Tailwind flex layout) |
| `Badge` | shadcn/ui `Badge` |
| `Icon` | `lucide-react` icons |
| `ErrorToast` | 既存 `AlertBanner` |
| `ConfirmDialog` | shadcn/ui `AlertDialog` |
| CSS Modules | Tailwind CSS classes |
| 独自 DnD | `@dnd-kit/core` (v2 既存依存) |

---

## Resolved Questions

- **Q: バリデーション機能はどこに配置する？** → バインドエディタのスキーマパネル内のサブ機能として統合するか、別タブとするかは実装時に判断。優先度は低い。
- **Q: 既存の DataBindingModal の他のタブ（テナント情報、商品マスター、Webhook）は？** → これらはバインドエディタとは独立した機能であり、既存のモーダル or 別タブとして残す。
- **Q: データソースパネルの配置先は？** → デザインタブのサイドバーに配置（現在の BindingPanel と同様の位置）
- **Q: 回答フィールドとデータブラウザのタブ構成は？** → それぞれ独立タブとして AppShell に「回答」タブと「データブラウザ」タブを追加

---

## Open Questions

(なし — すべて解決済み)

---

## References

- v1 実装: `/Users/PC-0079-Fukatsu/work/report-design-studio/app/src/components/pages/BindingEditorPage/`
- v2 現行バインド: `src/components/modals/BindingMapperTab.tsx`, `src/components/modals/DbConnectionTab.tsx`
- v2 現行データ管理: `src/components/tabs/DataManagementTab.tsx`
- v1 Storybook: `http://localhost:6006/?path=/story/pages-bindingeditorpage--default`
- 関連ブレインストーム: `docs/brainstorms/2026-04-10-schema-database-binding-brainstorm.md`
- 関連計画: `docs/plans/2026-04-10-feat-scalardb-schema-binding-phase1-plan.md`
