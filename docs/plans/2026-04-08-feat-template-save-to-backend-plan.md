---
title: "feat: テンプレートをバックエンドに保存 + ギャラリー登録"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-template-save-to-backend-brainstorm.md
---

# feat: テンプレートをバックエンドに保存 + ギャラリー登録

## Overview

ツールバーの「保存」ボタンを強化し、現在のデザインをバックエンド API に保存する。
初回保存時は名前入力ダイアログを表示し、新規テンプレートとして作成。
以降は自動保存（既存 `useAutoSave`）が引き継ぐ。
保存済みテンプレートはテンプレートギャラリーに自動表示される。

(see brainstorm: docs/brainstorms/2026-04-08-template-save-to-backend-brainstorm.md)

## Problem Statement / Motivation

現在の「保存」ボタン（`Toolbar.tsx:334-348`）はローカル JSON ファイルダウンロードのみ。
バックエンド API（CRUD 完備）への保存フローが未実装のため、
テンプレートの永続化やギャラリーでの再利用ができない。

## Proposed Solution

### ユーザーフロー

1. ユーザーが「保存」ボタンをクリック
2. **`currentTemplateId` が null（新規）の場合:**
   a. `SaveTemplateDialog` モーダルを表示（テンプレート名入力）
   b. `createReport(name)` で空テンプレートを新規作成 → `{ id }` 取得
   c. `saveReport(id, definition)` で現在のデザインを保存
   d. `setCurrentTemplateId(id)` → 以降 `useAutoSave` が自動保存
3. **`currentTemplateId` がセット済み（既存）の場合:**
   → `saveReport(id, definition)` で即座に上書き保存
4. 保存状態は `SaveStatusIndicator`（「保存中...」→「保存済み」）で表示

## Technical Details

### Step 1: SaveTemplateDialog コンポーネント（TDD）

**新規ファイル:** `src/components/modals/SaveTemplateDialog.tsx`

```tsx
interface SaveTemplateDialogProps {
  open: boolean
  onSave: (name: string) => void
  onCancel: () => void
  saving?: boolean
}
```

- テンプレート名の入力フィールド1つ（デフォルト値: Toolbar の `reportName`）
- 「保存」「キャンセル」ボタン
- 空文字の場合は「保存」ボタンを disabled
- `saving=true` 時はローディング表示
- Enter キーで保存、Escape キーでキャンセル

**テスト:** `src/components/modals/SaveTemplateDialog.test.tsx`
- 名前入力 → onSave が name 付きで呼ばれる
- 空文字 → 保存ボタンが disabled
- キャンセル → onCancel が呼ばれる

### Step 2: Toolbar.tsx の handleSave 改修

**変更ファイル:** `src/components/toolbar/Toolbar.tsx`

現在の `handleSave`（JSON ファイルダウンロード）を変更:

```typescript
// Before (JSON download):
const handleSave = () => { /* ... download JSON blob ... */ }

// After (backend save):
const handleSave = async () => {
  const { currentTemplateId, definition } = useReportStore.getState()
  if (currentTemplateId) {
    // 既存テンプレート → 即座に上書き
    setSaveState('saving')
    await saveReport(currentTemplateId, definition)
    setSaveState('saved')
  } else {
    // 新規 → 名前入力ダイアログを表示
    setShowSaveDialog(true)
  }
}
```

ダイアログの `onSave` コールバック:
```typescript
const handleSaveNew = async (name: string) => {
  setSaveState('saving')
  const created = await createReport(name)
  await saveReport(created.id, definition)
  setCurrentTemplateId(created.id)
  setShowSaveDialog(false)
  setSaveState('saved')
}
```

### Step 3: JSON ダウンロードの移動

既存の JSON ダウンロード機能は「名前を付けてダウンロード」として残す。
ツールバーに既に存在する「開く」（ファイル読み込み）との対称性を維持。

**方針:** 「保存」ボタンをバックエンド保存に変更し、
JSON ダウンロードは別の UI（例: エクスポートメニュー）に移動するか、
Shift+クリックで JSON ダウンロードとする。

→ シンプルに: `handleSave` をバックエンド保存に完全置換。
JSON ダウンロードは PNG/PDF エクスポートと同列の「JSON エクスポート」として残す。

### Step 4: エラーハンドリング

- `createReport` / `saveReport` の失敗 → `setSaveState('error')` + エラーメッセージ表示
- 既存の `SaveStatusIndicator` パターンに従う（`saveState: 'saving' | 'saved' | 'error'`）
- バックエンド未接続時（`backendConnected === false`）→ フォールバックとして JSON ダウンロード

## Acceptance Criteria

- [ ] 「保存」ボタンクリックで、`currentTemplateId` が null なら名前入力ダイアログが表示される
- [ ] ダイアログで名前入力 →「保存」→ バックエンドに新規テンプレートが作成される
- [ ] 保存後、`currentTemplateId` がセットされ、以降は自動保存が有効になる
- [ ] `currentTemplateId` がセット済みの場合、「保存」クリックで即座に上書き保存される
- [ ] 保存状態が SaveStatusIndicator に反映される（保存中 → 保存済み / エラー）
- [ ] テンプレートギャラリーに保存済みテンプレートが表示される（既存 `listReports()` で自動）
- [ ] バックエンド未接続時は JSON ダウンロードにフォールバック
- [ ] SaveTemplateDialog のテスト3ケース以上
- [ ] 全テスト通過 + ビルドエラーなし

## Implementation Checklist

- [ ] `SaveTemplateDialog.test.tsx` 作成（RED）
- [ ] `SaveTemplateDialog.tsx` 実装（GREEN）
- [ ] `Toolbar.tsx` の `handleSave` をバックエンド保存に変更
- [ ] `Toolbar.tsx` に `SaveTemplateDialog` の state + レンダリング追加
- [ ] エラーハンドリング（try/catch + saveState）
- [ ] バックエンド未接続時のフォールバック
- [ ] 全テスト通過確認

## Dependencies & Risks

| リスク | 対策 |
|--------|------|
| `createReport` → `saveReport` の2段階で中間失敗 | `createReport` 成功 → `saveReport` 失敗時もテンプレートIDは有効。次回保存で再試行可能 |
| バックエンド未接続 | `backendConnected` フラグで検出、JSON ダウンロードにフォールバック |
| 既存の JSON ダウンロード機能が消える | JSON エクスポートとして別 UI に残す |

## File Structure

```
新規ファイル:
  src/components/modals/SaveTemplateDialog.tsx      — 名前入力ダイアログ
  src/components/modals/SaveTemplateDialog.test.tsx  — テスト

変更ファイル:
  src/components/toolbar/Toolbar.tsx  — handleSave 改修 + ダイアログ表示
```

## Sources & References

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-template-save-to-backend-brainstorm.md](../brainstorms/2026-04-08-template-save-to-backend-brainstorm.md)
  — Key decisions: バックエンド API 活用、ツールバー保存ボタン強化、名前入力ダイアログ
- **既存 API:** `src/api/reportApi.ts:82-92` — `createReport(name)`, `saveReport(id, definition)`
- **自動保存:** `src/hooks/useAutoSave.ts` — `currentTemplateId` セット後に自動保存
- **ストア:** `src/store/uiSlice.ts:101` — `setCurrentTemplateId(id)`
- **ツールバー:** `src/components/toolbar/Toolbar.tsx:334-348` — 現在の handleSave（JSON ダウンロード）
- **保存状態表示:** `src/components/common/SaveStatusIndicator.tsx`
- **テンプレートギャラリー:** `src/components/modals/TemplateSelectionModal.tsx:49` — `listReports()`
