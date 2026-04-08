---
date: 2026-04-08
topic: template-save-to-backend
---

# テンプレートをバックエンドに保存 + ギャラリー登録

## What We're Building

ツールバーの「保存」ボタンを強化し、現在編集中のデザインをバックエンド API に
新規テンプレートとして保存する機能を追加する。保存したテンプレートは
テンプレートギャラリーに自動で表示され、他のプロジェクトで再利用可能になる。

**ユーザーフロー:**
1. ユーザーが帳票デザインを編集する
2. 「保存」ボタンをクリック
3. `currentTemplateId` が未設定（新規）の場合:
   a. 名前入力ダイアログを表示（テンプレート名の1フィールド）
   b. `createReport(name)` で空テンプレートを新規作成 → `{ id }` を取得
   c. `saveReport(id, definition)` で現在のデザインを保存
   d. ストアの `currentTemplateId` をセット → 以降 `useAutoSave` が自動保存
4. `currentTemplateId` がセット済み（既存）の場合:
   → `saveReport(id, definition)` で即座に上書き保存
5. 保存後、ギャラリーに自動反映（`TemplateSelectionModal` が `listReports()` で取得済み）

## Why This Approach

### 既存基盤の活用

バックエンドには既にテンプレート CRUD API が完備している:
- `POST /api/v2/templates` — 新規作成
- `PUT /api/v2/templates/{id}` — 更新
- `GET /api/v2/templates` — 一覧取得
- `DELETE /api/v2/templates/{id}` — 削除

フロントエンドには `useAutoSave` フックが `currentTemplateId` セット時に
自動保存を行う仕組みが既にある。足りないのは:
1. **初回保存フロー** — `currentTemplateId` が null のときの「名前入力 → POST」
2. **ツールバーの手動保存ボタン** — 自動保存に加えて明示的保存のトリガー

### 代替案: localStorage のみ
- メリット: バックエンド不要
- デメリット: デバイス間共有不可、ブラウザクリアで消失
- → 却下: 既にバックエンド API が存在するため活用すべき

## Key Decisions

- **保存先**: バックエンド API（`/api/v2/templates`）。既存 CRUD を活用。
- **UIフロー**: ツールバー「保存」ボタンの強化。初回は名前入力ダイアログ、2回目以降は上書き。
- **ギャラリー表示**: `TemplateSelectionModal` の `listReports()` が既にバックエンドテンプレートを取得している → 追加実装不要。
- **自動保存との統合**: `currentTemplateId` がセットされたら `useAutoSave` が引き続き自動保存を担当。手動保存は即時トリガーのみ。
- **名前入力**: シンプルなモーダルダイアログ（テンプレート名の1フィールド）。`createReport(name)` が名前のみ受け取るため。
- **エラーハンドリング**: バックエンド接続失敗時は `saveState: 'error'` をセットし、SaveStatusIndicator が「保存失敗」を表示（既存パターンに従う）。

## Scope

**変更ファイル:**
- `src/components/toolbar/Toolbar.tsx` — 保存ボタンのクリックハンドラ強化
- `src/store/reportStore.ts` — `currentTemplateId` のセッター（既存 `setCurrentTemplateId` があるか確認）
- `src/components/modals/SaveTemplateDialog.tsx` — 新規: 名前入力ダイアログ

**新規ファイル:**
- `src/components/modals/SaveTemplateDialog.tsx`
- `src/components/modals/SaveTemplateDialog.test.tsx`

**既存活用（変更不要）:**
- `src/lib/reportApi.ts` — `createReport()`, `saveReport()` 既存
- `src/hooks/useAutoSave.ts` — `currentTemplateId` セット後の自動保存
- `src/components/modals/TemplateSelectionModal.tsx` — `listReports()` でバックエンド一覧表示

## Resolved Questions

- 保存先 → バックエンド API ✅
- UIフロー → ツールバー「保存」ボタン強化 ✅
- ギャラリー表示 → 既存の listReports() で自動反映 ✅

## Open Questions

なし。方針確定。

## Next Steps

→ `/workflows:plan` で実装計画を作成する。
