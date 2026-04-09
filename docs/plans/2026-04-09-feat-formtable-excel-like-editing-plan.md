---
title: "feat: FormTable Excel風インタラクティブ編集"
type: feat
status: completed
date: 2026-04-09
origin: docs/brainstorms/2026-04-09-formtable-excel-like-editing-brainstorm.md
---

# feat: FormTable Excel風インタラクティブ編集

## Overview

formTable要素にExcelライクなインタラクティブ編集機能を追加する。キャンバス上でセル直接編集、行列操作、セル結合、リサイズ、キーボードナビゲーション、コピー&ペーストを実現し、既存PropertiesPanelと併存させる。

## Problem Statement / Motivation

現在のformTableはすべての編集がPropertiesPanelで行われ、セル1つの修正でもサイドバーの深いツリーを探す必要がある。特にセル数が多い帳票テンプレートでは生産性が著しく低い。Excelユーザーが直感的に操作できるキャンバス上のインタラクティブ編集が必要。

## Proposed Solution

既存の `FormTableRenderer` を拡張し、インタラクティブ編集レイヤーを追加する（see brainstorm: `docs/brainstorms/2026-04-09-formtable-excel-like-editing-brainstorm.md`）。

**重要な設計変更**: ブレインストームではHTML table の colspan/rowspan をそのまま活用と記載したが、調査の結果、現行Rendererは `div` + flexbox で構築されている。セル結合（colspan/rowspan）を実現するために **CSS Grid への移行**が必要。

## Technical Approach

### Architecture

```
CanvasElement
  ├─ [通常モード] FormTableRenderer (既存 — CSS Grid 化)
  │    └─ デザインプレビュー / ライブレンダラー（読み取り専用描画）
  │
  └─ [編集モード] onDoubleClick → FormTableEditor (新規、Renderer を置換)
       ├─ FormTableRenderer を内部で再利用（CSS Grid 描画部分を共有）
       ├─ セル選択オーバーレイ + 範囲選択ハイライト
       ├─ リサイズハンドル（列幅・行高）
       ├─ CellPopover (セル編集ポップオーバー)
       ├─ TableToolbar (フローティングツールバー)
       ├─ TableContextMenu (右クリックメニュー)
       ├─ useTableSelection (選択状態管理)
       ├─ useTableKeyboard (キーボードナビゲーション)
       ├─ useTableClipboard (コピー&ペースト)
       ├─ useTableResize (列幅・行高ドラッグ)
       └─ useTableUndoStack (テーブル専用undo)
```

**Renderer と Editor の関係**: `FormTableRenderer`（既存）を CSS Grid に移行し、描画ロジックを共有する。`FormTableEditor`（新規）は Renderer の描画の上にインタラクティブオーバーレイ（選択・リサイズ・メニュー等）を追加するラッパー。テーブル編集モード中は `CanvasElement` が `FormTableRenderer` の代わりに `FormTableEditor` をマウントする。新規の `FormTableGrid.tsx` は不要 — Renderer.tsx 自体を CSS Grid 化する。

**テーブル編集状態の格納場所**: `FormTableEditor` 内のローカル React state（`useState` / `useReducer`）で管理する。理由:
- テーブル編集状態（選択セル、編集モード）はテーブル固有であり、グローバルstoreに持つ必要がない
- PropertiesPanel との同期はストア経由の `element` データで担保される（編集状態ではなく要素データが同期の対象）
- テーブル編集モード離脱時にクリーンアップが自動的（コンポーネントアンマウント）

### データモデル変更 (`src/types/index.ts`)

```ts
// FormTableCell に追加
export interface FormTableCell {
  // ... existing fields
  colspan?: number     // デフォルト 1
  rowspan?: number     // デフォルト 1
  mergedInto?: string  // 結合先セルのid（非表示セル）
}
```

### Implementation Phases

#### Phase 1: CSS Grid移行 + テーブル編集モード基盤

**目的**: Rendererをflexbox→CSS Gridに移行し、テーブル編集モードの枠組みを構築。

**タスク:**

- [x] `src/elements/formTable/Renderer.tsx` — flexbox→CSS Grid移行
  - `grid-template-columns` で列幅を定義（`repeat()` ではなく各列幅を個別指定）
  - `grid-template-rows` で行高を定義
  - 既存の描画を壊さない（デザインプレビュー・ライブ両方）
  - **ライブレンダラー注意**: body行がレコード数分繰り返される場合、`grid-template-rows` は動的に計算。マージセルの `grid-row: span N` がレコード繰り返しでずれないよう、各レコードブロックを独立したgridコンテナにする
- [x] `src/types/index.ts` — `FormTableCell` に `colspan`, `rowspan`, `mergedInto` フィールド追加
- [x] `src/elements/formTable/tableEditState.ts` — テーブル編集状態の型定義
  ```ts
  interface TableEditState {
    mode: 'none' | 'selecting' | 'editing'
    selectedCells: Set<string>  // cell IDs
    activeCell: string | null   // 現在フォーカス中のセル
    selectionAnchor: { row: number; col: number } | null
    selectionEnd: { row: number; col: number } | null
  }
  ```
- [x] `src/components/canvas/CanvasElement.tsx` — ダブルクリックハンドラー追加
  - `onDoubleClick` で `formTable` 要素の場合テーブル編集モードに遷移
  - テーブル編集モード中は `useDraggable` の `disabled` を `true` に設定
- [x] `src/elements/formTable/FormTableEditor.tsx` — 編集モードのラッパーコンポーネント
  - テーブル編集モード中のみ表示
  - セルクリックでセル選択
  - テーブル外クリック・Escでモード解除
- [x] テスト: CSS Grid移行後の描画一致確認、ダブルクリックでのモード遷移

**成功基準:** 既存の描画が壊れず、ダブルクリックでテーブル編集モードに入り、Esc/外クリックで抜けられる。

#### Phase 2: セル選択 + キーボードナビゲーション + インライン編集

**目的**: セル単位の選択、範囲選択、キーボード操作、ポップオーバー編集を実装。

**タスク:**

- [x] `src/elements/formTable/hooks/useTableSelection.ts` — セル選択ロジック
  - クリックでセル選択（`selectedCells` を `Set` で管理、O(1)ルックアップ）
  - Shift+クリックで範囲選択（アンカー〜クリック先の矩形）
  - ドラッグで範囲選択
  - セル選択ハイライトのCSS
- [x] `src/elements/formTable/hooks/useTableKeyboard.ts` — キーボードナビゲーション
  - 矢印キーでセル間移動（グリッド座標ベース、マージセルをスキップ）
  - Tab で次のセル（行末→次行先頭）
  - Enter でセル編集開始（ポップオーバー表示）
  - Escape で編集キャンセル → セル選択 → モード解除（段階的）
  - `e.stopPropagation()` でキャンバスレベルのキーハンドラーと競合回避
- [x] `src/elements/formTable/CellPopover.tsx` — セル編集ポップオーバー
  - セルタイプ切替（label / input / dataField）
  - タイプに応じた入力フィールド（テキスト / フィールドキー / プレースホルダー）
  - フォーマット設定（dataFieldの場合）
  - スタイル編集（フォント、配置、色）
  - PropertiesPanelの `CellEditor` のUI要素を再利用
- [x] テスト: セル選択、範囲選択、キーボード移動、ポップオーバー表示/非表示

**成功基準:** キーボードとマウスでセルを選択・移動でき、ポップオーバーでセル内容を編集できる。

#### Phase 3: 行列操作 + コンテキストメニュー

**目的**: 右クリックメニューによる行列の追加/削除/並べ替え。

**タスク:**

- [x] `src/elements/formTable/tableOperations.ts` — 行列操作のピュア関数を PropertiesPanel から抽出
  - `addColumn`, `removeColumn`, `addRow`, `removeRow`, `updateColumn`, `updateRow`, `updateCell` を移動
  - 新規: `insertColumnAt(el, colIdx, position: 'before' | 'after')`
  - 新規: `insertRowAt(el, rowIdx, position: 'before' | 'after')`
  - 新規: `moveRow(el, fromIdx, toIdx)`
  - 新規: `moveColumn(el, fromIdx, toIdx)`
  - 新規: `selectRow(el, rowIdx)` → セルID配列を返す
  - 新規: `selectColumn(el, colIdx)` → セルID配列を返す
- [x] `src/elements/formTable/TableContextMenu.tsx` — テーブル専用コンテキストメニュー
  - 既存 `ContextMenu` の `items` prop（ジェネリックモード）を活用
  - セル選択時: 行操作（上/下に挿入、削除、移動）+ 列操作（左/右に挿入、削除、移動）
  - 行/列ヘッダー選択時: 対応する操作のみ表示
  - 最後の行/列の削除は無効化
- [x] `src/elements/formTable/PropertiesPanel.tsx` — 操作関数を `tableOperations.ts` からインポートに変更
- [x] テスト: コンテキストメニュー表示、各操作の正常動作、エッジケース（最後の行/列削除不可）

**成功基準:** 右クリックで行列操作メニューが表示され、操作が正しく反映される。

#### Phase 4: セル結合・分割

**目的**: 範囲選択したセルの結合と分割。

**タスク:**

- [x] `src/elements/formTable/tableMerge.ts` — セル結合・分割のピュア関数
  - `mergeCells(el, selectedCellIds)` → colspan/rowspan を設定し、被覆セルに `mergedInto` を付与
  - `splitCell(el, cellId)` → colspan/rowspan をリセットし、`mergedInto` をクリア
  - `canMerge(el, selectedCellIds)` → 結合可能か判定（矩形か、同一ロール内か）
  - **制約**: header/bodyをまたぐ結合は禁止（データバインドモードで意味的に不正）
  - **制約**: 同一role内でのみ結合を許可
- [x] `src/elements/formTable/Renderer.tsx` — CSS Grid でのマージセル描画を追加
  - `mergedInto` が設定されたセルは `display: none`
  - colspan → `grid-column: span N`
  - rowspan → `grid-row: span N`
- [x] `src/elements/formTable/TableToolbar.tsx` — フローティングツールバー
  - テーブル編集モード中にテーブル上部に表示
  - 結合ボタン（範囲選択時のみ有効）
  - 分割ボタン（マージセル選択時のみ有効）
  - 行追加/列追加のクイックアクション
- [x] エッジケース実装:
  - マージセルを含む行/列削除時 → 自動で結合解除してから削除
  - マージ範囲の中間に行/列挿入 → 挿入後にマージを拡張（colspan/rowspan +1）
- [x] テスト: 結合/分割、エッジケース（ロールまたぎ拒否、削除時の自動解除、挿入時の拡張）

**成功基準:** セルの結合・分割が正しく動作し、CSS Gridで表示される。エッジケースでデータ不整合が発生しない。

#### Phase 5: 列幅・行高リサイズ

**目的**: ドラッグによる列幅・行高のリサイズ。

**タスク:**

- [x] `src/elements/formTable/hooks/useTableResize.ts` — リサイズロジック
  - 列境界線上にカーソル変更（`col-resize` / `row-resize`）
  - ドラッグでpx計算 → mm変換（`pxToMm` 既存ユーティリティ）
  - 最小3mm制約
  - ドラッグ中のガイドライン（半透明の線）表示
  - リサイズ確定時にstore更新
- [x] `src/elements/formTable/FormTableGrid.tsx` — リサイズハンドル描画
  - 列境界に透明なハンドル要素（幅4px程度、ホバーで可視化）
  - 行境界も同様
- [x] リサイズ中のポインターイベント管理（learnings参照: `resizeCleanupRef` パターン）
- [x] マージセルのリサイズ: マージセルの幅は構成列幅の合計（CSS Grid の `span` で自動対応）
- [x] テスト: リサイズ動作、最小値制約、マージセルとの整合性

**成功基準:** ドラッグでスムーズにリサイズでき、最小値を下回らない。

#### Phase 6: コピー&ペースト + undo stack

**目的**: セルのコピー&ペースト（内部+Excel）とテーブル専用undo/redo。

**タスク:**

- [x] `src/elements/formTable/hooks/useTableClipboard.ts` — クリップボードロジック
  - **内部コピー**: 選択セルを内部フォーマットでクリップボードに保存
  - **内部ペースト**: 選択位置にセルデータを展開
  - **Excel貼り付け**: `clipboard.readText()` でTSVテキストを読み取り、セルに展開
    - タブ区切り → 列、改行 → 行
    - テーブルサイズを超える場合は切り捨て（自動拡張しない）
    - 空セルは `label` タイプ、テキストとして設定
  - `Ctrl/⌘+C`, `Ctrl/⌘+V`, `Ctrl/⌘+X` をテーブル編集モード内でインターセプト
- [x] `src/elements/formTable/hooks/useTableUndoStack.ts` — テーブル専用undo
  - テーブル編集モード進入時に初期スナップショットを保存
  - 各操作（セル編集、行列追加/削除、結合、リサイズ）で新しいエントリをpush
  - `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z` をインターセプト
  - テーブル編集モード離脱時:
    1. テーブル専用stackをクリア
    2. 変更があった場合のみ store の `pushHistory()` を1回呼ぶ（全変更が1エントリに）
- [x] テスト: 内部コピペ、TSV貼り付け、undo/redo動作、モード離脱時のstore統合

**成功基準:** コピペが正しく動作し、テーブル内undoが機能し、モード離脱時にstoreレベルでは1エントリにまとまる。

#### Phase 7: 統合 + 仕上げ

**目的**: 全機能の統合テスト、PropertiesPanel同期確認、エッジケース修正。

**タスク:**

- [x] PropertiesPanel ↔ インライン編集の同期確認
  - 両方が同じstore経由で更新するため自動同期のはず
  - PropertiesPanel側で `tableOperations.ts` の共有関数を使用していることを確認
- [x] グローバルキーボードショートカットとの競合回避
  - テーブル編集モード中は `ReportCanvas` の `handleKeyDown` に到達しないように `stopPropagation`
  - Delete/Backspaceがテーブル編集モード中に要素削除しないことを確認
- [x] CLAUDE.md 更新
  - FormTableElement の新フィールド（colspan, rowspan, mergedInto）を記載
  - テーブル編集モードのアーキテクチャを記載
- [x] 統合テスト
  - 全機能の連携動作
  - パフォーマンス確認（100セル以上のテーブルでの操作応答性）

**成功基準:** 全機能が連携して動作し、既存機能が壊れていない。

## Alternative Approaches Considered

(see brainstorm: `docs/brainstorms/2026-04-09-formtable-excel-like-editing-brainstorm.md`)

- **仮想グリッドエンジン**: 2Dグリッドで完全再構築 → 大規模改修+マイグレーション必要で却下
- **外部ライブラリ (AG Grid等)**: 帳票特有要件（mm単位、印刷最適化）との統合困難で却下

## System-Wide Impact

### Interaction Graph

1. CanvasElement `onDoubleClick` → FormTableEditor mount → `useDraggable` disabled
2. FormTableEditor セル編集 → store `updateElement` → PropertiesPanel re-render
3. FormTableEditor `onContextMenu` → TableContextMenu render → 操作選択 → store update
4. テーブル編集モード離脱 → `useDraggable` re-enable → store `pushHistory` (1回)

### Error & Failure Propagation

- セル結合のデータ不整合 → `canMerge` バリデーションで事前防止
- リサイズ中のコンポーネントアンマウント → `resizeCleanupRef` パターンでリーク防止
- 不正なTSVペースト → パース失敗時は操作をキャンセル（no-op）

### State Lifecycle Risks

- テーブル編集モード中にページ切替 → モード強制解除 + 変更があればpushHistory
- テーブル編集モード中に他要素をクリック → モード解除（テーブル外クリック扱い）
- テーブル専用undo stack とstore history の不整合 → モード離脱時に確実に統合

### API Surface Parity

- `FormTablePropertiesPanel` — 既存。`tableOperations.ts` からインポートに変更
- `FormTableRenderer` — 既存。CSS Grid化が必要
- `FormTableEditor` — 新規。テーブル編集モード専用

### Integration Test Scenarios

1. PropertiesPanelでセル追加 → テーブル編集モードで正しく選択可能か
2. テーブル編集モードで結合 → PropertiesPanelに反映されるか
3. テーブル編集モード中にページ切替 → 変更がundoに記録されるか
4. 100セルテーブルでの範囲選択 → パフォーマンス劣化がないか
5. Excelからの貼り付け → 正しいセルに展開されるか

## Acceptance Criteria

### Functional Requirements

- [x] ダブルクリックでテーブル編集モードに入り、Esc/外クリックで抜けられる
- [x] セルクリックで選択、Shift+クリック/ドラッグで範囲選択できる
- [x] ダブルクリックまたはEnterでポップオーバー編集が開始される
- [x] 右クリックメニューで行列の追加/削除/移動ができる
- [x] 範囲選択→結合ボタンでセルが結合され、結合セル選択→分割ボタンで解除される
- [x] 列境界/行境界をドラッグでリサイズできる（最小3mm）
- [x] Tab/矢印キーでセル間移動、Enterで編集開始
- [x] Ctrl+C/V/X でセルのコピー&ペースト
- [x] Excelからのタブ区切りテキスト貼り付けが動作する
- [x] テーブル編集モード内でCtrl+Zで細かい単位でundo
- [x] テーブル編集モード離脱後のCtrl+Zでテーブル操作全体がundoされる
- [x] PropertiesPanelとインライン編集が同期する

### Non-Functional Requirements

- [x] 100セルテーブルでのセル選択が16ms以内
- [x] 既存テンプレートの描画が壊れない（CSS Grid移行後）
- [x] 印刷/PDF出力に影響しない

### Quality Gates

- [x] テストカバレッジ 80% 以上
- [x] 既存formTableテスト全パス
- [x] アクセシビリティ: コンテキストメニューにARIAロール、キーボード操作可能

## Dependencies & Prerequisites

- 既存の `ContextMenu` コンポーネント（ジェネリック items モード）
- 既存の `pxToMm` / `mmToPx` ユーティリティ
- 既存の `resizeCleanupRef` パターン（CanvasElement.tsx で実証済み）

## Risk Analysis & Mitigation

| リスク | 影響度 | 対策 |
|--------|--------|------|
| CSS Grid移行で既存描画が壊れる | 高 | Phase 1でまず移行のみ行い、既存テストで回帰確認 |
| テーブル編集モード中のイベント競合 | 中 | `stopPropagation` + `useDraggable` disabled で分離 |
| マージセルのデータ不整合 | 中 | `canMerge` バリデーション + 行列操作時の自動解除 |
| パフォーマンス（大量セル） | 低 | `Set` でO(1)選択チェック、`useMemo` でセルスタイル計算 |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-09-formtable-excel-like-editing-brainstorm.md](docs/brainstorms/2026-04-09-formtable-excel-like-editing-brainstorm.md)
  - Key decisions: 3段階モード遷移、Renderer拡張アプローチ、mergedIntoデータモデル、テーブル専用undo stack

### Internal References

- FormTable Renderer: `src/elements/formTable/Renderer.tsx`
- FormTable PropertiesPanel: `src/elements/formTable/PropertiesPanel.tsx`
- FormTable types: `src/types/index.ts:501-574`
- CanvasElement (dnd-kit): `src/components/canvas/CanvasElement.tsx`
- ContextMenu (generic): `src/components/canvas/ContextMenu.tsx`
- History slice: `src/store/historySlice.ts`
- Layout slice (clipboard): `src/store/layoutSlice.ts:465-520`
- Pointer cleanup pattern: `docs/solutions/ui-bugs/canvas-editor-snap-zoom-pointer-fixes.md`
- Selection performance: `docs/solutions/logic-errors/component-quality-code-cleanup.md`
- Context menu ARIA: `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md`
- Atomic state updates: `docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md`

### New Files to Create

- `src/elements/formTable/FormTableEditor.tsx` — テーブル編集モードラッパー（Renderer を内部で再利用 + インタラクティブオーバーレイ）
- `src/elements/formTable/CellPopover.tsx` — セル編集ポップオーバー
- `src/elements/formTable/TableToolbar.tsx` — フローティングツールバー
- `src/elements/formTable/TableContextMenu.tsx` — テーブル専用コンテキストメニュー
- `src/elements/formTable/tableEditState.ts` — 編集状態の型定義
- `src/elements/formTable/tableOperations.ts` — 行列操作ピュア関数（PropertiesPanelから抽出）
- `src/elements/formTable/tableMerge.ts` — セル結合・分割ロジック
- `src/elements/formTable/hooks/useTableSelection.ts` — セル選択
- `src/elements/formTable/hooks/useTableKeyboard.ts` — キーボードナビゲーション
- `src/elements/formTable/hooks/useTableClipboard.ts` — コピー&ペースト
- `src/elements/formTable/hooks/useTableResize.ts` — リサイズ
- `src/elements/formTable/hooks/useTableUndoStack.ts` — テーブル専用undo
