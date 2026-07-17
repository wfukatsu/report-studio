---
title: "fix: UI/UX 評価で抽出した P0 4 件のバンドル修正"
type: fix
status: active
date: 2026-05-02
---

# fix: UI/UX 評価で抽出した P0 4 件のバンドル修正

## Summary

2026-05-02 の UI/UX 評価で「学習・誤操作リスクに直結」と判定した P0 4 件を 1 計画にまとめ、独立して PR 化できる単位に分割して順次着地させる。対象は (1) パレット ホバーツールチップの残留バグ、(2) `localStorage` autosave キー破棄漏れ、(3) API エラー文言の統一、(4) 上部タブの視覚的グルーピングの 4 つ。各単位は依存が薄く、U1→U2→U3→U4 の順に小さい diff から独立して merge 可能。

---

## Problem Frame

UI/UX 評価で観測した即時是正レベルの問題が 4 件残っている。

- **U1（ツールチップ残留）**：パレット項目を Hover → クリック / Drag すると、Tooltip が表示されたまま画面に焼き付き、キャンバスに重なる。スクリーンショット `13_tooltip.png` / `14_page_settings.png` で再現済み。`onMouseLeave` のみで `hide()` を呼んでおり、`onClick` / `onDragStart` で消さないため、ホバー後の操作で残留する。
- **U2（autosave キー破棄漏れ）**：`src/App.tsx:295` で復元プロンプトの「破棄」ボタンが `localStorage.removeItem('rds-autosave')` というハードコードキーを叩いている。実際の保存キーは `rds-autosave:${userId}` 形式（同ファイル 97/117/124/284 行）のため、破棄しても次回ログイン時に同じプロンプトが再表示される。データ整合性のバグ。
- **U3（エラー文言の生表示）**：`バインド > DB 接続` パネルや `データブラウザ` 等で `HTTP 500: Internal Server Error` のような生メッセージがそのままユーザーに見える（`src/components/bindingEditor/panels/DbPanel.tsx:55,131-141` ほか）。`回答` タブはユーザー向け文言「バックエンドに接続されていません」だが、他の場所と非統一。文言とリトライ動線がコンポーネントごとにバラバラで、初見ユーザーは判断不能。
- **U4（上部タブの視覚的グルーピング）**：トップタブが `デザイン / バインド / テンプレート管理 / 回答 / データブラウザ / 管理` の 6 個フラットで、編集面とリソース管理面が混在。2026-04-13 の 3 タブ統合計画から各機能追加で 6 タブに膨張済み。**全面再構築は副作用が大きい**ため本計画では「視覚的セパレータ＋並び替え」だけに絞り、機能の場所は移動しない。

---

## Requirements

- R1. パレット要素のツールチップは、ホバー後にクリック・ドラッグ・スクロールが起きた時点で確実に閉じる。
- R2. 復元プロンプトの「破棄」操作は、現在ログイン中のユーザーに紐づく autosave エントリを削除し、次回起動時に同じプロンプトが再表示されない。
- R3. API 通信エラー時にエンドユーザーに表示される文言は、HTTP ステータスコードや英語スタックを含まず、「何が起きたか／何をすればよいか／再試行できるか」を日本語で示す。表示形式は `バインド > DB 接続` / `回答` / `データブラウザ` / `Toolbar 保存系トースト` の 4 経路で統一する。
- R4. 上部タブは「編集系」と「管理系」がレイアウト上で識別できる。**6 タブを 3 タブにする破壊的統合は本計画の対象外**（後続作業に Defer）。

---

## Scope Boundaries

- 6 タブ → 3 タブ（あるいは編集／データ／管理の 2-3 階層化）の構造変更は対象外。
- ツールバーアイコンのラベル化・整列メニュー化（評価 P1 #5）は対象外。
- 要素追加時のフィードバック（評価 P1 #6）は対象外。
- 国際化（i18n）は対象外。
- バックエンド側のエラーレスポンス JSON スキーマ変更は対象外。フロント側のエラー解釈・表示のみで完結させる。

### Deferred to Follow-Up Work

- **6 タブ → 3 タブ統合（編集／データ管理／テンプレート管理 + 管理）**：別計画。2026-04-13 の `top-navigation-tab-consolidation` 計画を継承して再着手する。
- **エラー文言の i18n 化**：英語ロケール対応時に `src/lib/userFacingError.ts`（U3 で新設）に英訳キー追加で対応。
- **autosave に関する追加改善**（複数タブ間の競合検知、保存頻度、サイズ上限など）：別計画。

---

## Context & Research

### Relevant Code and Patterns

- `src/components/common/Tooltip.tsx`：`onMouseLeave` / `onBlur` のみで `hide()`。`onClick` / `onDragStart` / scroll に未対応。直近の memory 観測 `23025` でも「scroll event cleanup handler 不足」が指摘されている。
- `src/App.tsx:97,117,124,284,295`：autosave キー操作 5 箇所のうち 295 行のみキー誤り。残り 4 箇所は `rds-autosave:${userId}` で正しい。
- `src/api/client.ts:15-66`：`ApiError` / `NetworkError` 型と `isApiError` / `isNetworkError` ガード、`parseApiErrorBody` がすでに整備済み。フロント全体で活用可能。
- `src/components/modals/dbConnection/classifyCreateTableError.ts`：**この計画のロールモデル**。`ApiError.status` を `'invalid_request' | 'conflict' | 'unauth' | 'forbidden' | 'unreachable' | 'server_error' | 'network'` の構造化コードに正規化する純関数。コードと文言を分離した i18n-ready な設計で、U3 の汎用版はこれを一般化する。
- `src/components/sidebar/ResponsesPanel.tsx:176-194`：「バックエンドに接続されていません + 起動コマンド」の **理想モデル**。U3 ではこの文言を再利用する（ただし「`npm run dev:full`」のような開発者向け CLI 行は管理画面以外では非表示にする）。
- `src/store/types.ts:67`：`AppTab = 'design' | 'binding' | 'templates' | 'responses' | 'databrowser' | 'admin'`。U4 は `AppTab` 型変更なしで配列順とセパレータ表現のみ調整。
- `src/components/layout/TopNavigation.tsx`：tabs プロップを受け取り、矢印キーナビ・`role=tablist` 完備。U4 は呼び出し側のタブ配列定義のみ変更。

### Institutional Learnings

- `docs/solutions/runtime-errors/app-shell-auth-guard-blank-tab.md` (2026-04-14)：データ管理・テンプレート管理タブが認証ガードで空白になっていたバグ。**学び**：タブのコンテンツ可視性は `currentUser` 条件で隠さない（バックエンド未接続でも UI は描画する）。U3 / U4 とも、未接続状態でも UI を描画する原則は維持する。
- `docs/solutions/ui-bugs/sidebar-panel-ux-master-hf-localization.md`：サイドバー文言の日本語化指針。U3 のメッセージカタログもこの指針に従う。
- `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md`：ARIA tablist のキーボード対応指針。U4 は既存 `TopNavigation` の対応を壊さない。

### External References

- 不要。すべて社内コードと institutional learnings で完結。

---

## Key Technical Decisions

- **U1 の修正方針：イベントを増やすのではなく `hide()` を確実に呼ぶ追加トリガを足す**。具体的には `onClick` / `onDragStart` / `onPointerCancel` でも `hide()` を呼び、加えてグローバル `scroll` リスナで visible な間だけ自動 hide。`onMouseLeave` 単独に依存しない。Radix の `Tooltip` への置換は対象外（ふわっとしたデザイン差分が出るため、本計画では既存軽量実装の延長で解く）。
- **U2 の修正方針：`removeItem` 1 行のキーを正しい userId 付きキーに揃える**。autosave 機構自体や格納形式は変更しない。最小 diff。
- **U3 の修正方針：`src/lib/userFacingError.ts` を新設**して `ApiError | NetworkError | unknown → { code, title, hint, retryable }` の純関数を提供。`classifyCreateTableError.ts` を一般化したものとし、ユーザー向け文言カタログは `src/lib/userFacingErrorMessages.ts` に分離（i18n-ready）。`バインド > DB 接続` / `データブラウザ DataSourceTree` / 既存 `回答` 文言 をこの 1 経路に揃える。`回答` の `npm run dev:full` のような開発者ヒント行は **開発モード (`import.meta.env.DEV`) のみ** で表示。
- **U4 の修正方針：`AppTab` 型・タブ ID・遷移ロジック不変のまま、`TopNavigation` に渡す配列定義を変更**。並び順を `デザイン / バインド | テンプレート管理 / 回答 / データブラウザ | 管理` のように 3 グループに整理し、グループ間に `separator` 表現（`role="separator"` の薄い縦線）を入れる。これで **ARIA / キーボードナビ / Activity 維持を一切壊さない**。

---

## Open Questions

### Resolved During Planning

- 6 タブ統合は本計画でやるか？ → やらない。Deferred to Follow-Up Work。
- Tooltip を Radix に置き換えるか？ → 置き換えない。スコープ拡大とデザイン差分のリスク回避。
- エラー文言の i18n 化を含めるか？ → 含めない。日本語固定だがメッセージカタログを分離して i18n-ready にしておく。

### Deferred to Implementation

- `userFacingError.ts` での `ZodError`（API レスポンス検証失敗）の扱い：実装時に `client.ts` の throw パスを確認して決定（候補：`server_error` 扱い、または `validation_error` 新設）。
- グループセパレータの最終表現（`<li role="separator">` の縦線か、`gap-* + 背景色` の余白か）：U4 着手時に DOM レベルで決定。

---

## Implementation Units

- U1. **パレット ホバーツールチップの残留バグ修正**

**Goal:** Hover 後の Click / Drag / Scroll で Tooltip が確実に閉じるようにする。

**Requirements:** R1

**Dependencies:** なし

**Files:**
- Modify: `src/components/common/Tooltip.tsx`
- Test: `src/components/common/Tooltip.test.tsx`（既存ファイルを拡張）

**Approach:**
- ラッパー `<span>` に `onClick` / `onDragStart` / `onPointerCancel` ハンドラを追加し、いずれも `hide()` を呼ぶ。
- `useEffect` で `visible === true` の間だけ `window` に `scroll` リスナ（`{ capture: true, passive: true }`）と `keydown` (`Escape`) リスナを登録し、cleanup で外す。
- 既存の `mouseenter` / `mouseleave` / `focus` / `blur` の挙動と `delay` セマンティクスは変更しない。

**Patterns to follow:**
- 既存 `Tooltip` の `useEffect` クリーンアップ規約（`hide()` 内で `clearTimeout`）。
- React Portal 経由の表示は維持。

**Test scenarios:**
- Happy path: Hover → 400ms 経過で表示。`mouseleave` で消える（既存）。
- Edge case: Hover → 400ms 内に `click` → タイマがキャンセルされ、表示前に `visible=false` のまま。
- Edge case: Hover → 表示後に `click` → 即座に消える。
- Edge case: Hover → 表示後に `dragstart` → 即座に消える（HTML5 ドラッグで `mouseleave` が発火しないブラウザ挙動を回避できる）。
- Edge case: Hover → 表示後に親コンテナで `scroll` → 即座に消える。
- Edge case: Hover → 表示後に `Escape` → 消える。

**Verification:**
- パレットの「テキスト」「繰り返しバンド」「帳票テーブル」「QR コード」を順次クリックしてもキャンバスに残留ツールチップが出ない。
- 既存テスト全てパス。

---

- U2. **autosave 破棄ボタンのキー誤り修正**

**Goal:** 復元プロンプトの「破棄」が、現在ログイン中ユーザーの `rds-autosave:${userId}` エントリを正しく削除する。

**Requirements:** R2

**Dependencies:** なし

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`（存在しなければ新規。**`localStorage` モック + `currentUser` モック**で破棄経路を検証）

**Approach:**
- `src/App.tsx:295` の `localStorage.removeItem('rds-autosave')` を、上の 117/124/284 行と同じく `currentUser ? `rds-autosave:${currentUser.userId}` : null` で構築したキーで削除するように変更。
- 既存の autosave キー組み立てロジックを 1 つのヘルパー（インライン or `App` 内 `useMemo`）に集約し、5 箇所の重複を 1 箇所にまとめてキー誤りの再発を防ぐ。

**Patterns to follow:**
- `currentUser` ガード付きの localStorage アクセス（`autoSaveKey` の既存パターン）。

**Test scenarios:**
- Happy path: `currentUser = { userId: 'u1' }` 状態で `localStorage` に `rds-autosave:u1` が入っている → 「破棄」クリック → `localStorage.getItem('rds-autosave:u1')` が `null`。
- Edge case: `currentUser = null` 状態で「破棄」クリック → `localStorage` を変更しない（早期 return か no-op）。
- Edge case: 別ユーザー (`u2`) のキーが残っている時、`u1` の破棄で `u2` のキーは消えない。
- Integration: 破棄後にリロードシミュレーションで `showRestorePrompt` が `false` のまま。

**Verification:**
- 手動：autosave 発火 → リロード → 破棄 → 再リロード → プロンプトが二度と出ない。
- `localStorage` に古い `rds-autosave`（キー無印）が残っていても破棄ボタンが投げない（後方互換削除を 1 度だけ追加で行うかは実装時に判断）。

---

- U3. **API エラー表示の統一ユーティリティと既存表示の置換**

**Goal:** ユーザーに見える API エラー表示を `code/title/hint/retryable` モデルで統一し、生 HTTP ステータス文字列を排除する。

**Requirements:** R3

**Dependencies:** なし（U1/U2 と独立）

**Files:**
- Create: `src/lib/userFacingError.ts`
- Create: `src/lib/userFacingErrorMessages.ts`（日本語文言カタログ）
- Create: `src/lib/userFacingError.test.ts`
- Create: `src/lib/userFacingErrorMessages.test.ts`
- Modify: `src/components/bindingEditor/panels/DbPanel.tsx`（55 行・131-141 行）
- Modify: `src/components/dataBrowser/DataSourceTree.tsx`（42 行付近）
- Modify: `src/components/sidebar/ResponsesPanel.tsx`（179-185 行：既存文言は維持しつつ、開発者ヒント行を `import.meta.env.DEV` で条件化）
- Test: `src/components/bindingEditor/panels/DbPanel.test.tsx`（既存または新規）
- Test: `src/components/dataBrowser/DataSourceTree.test.tsx`（既存または新規）

**Approach:**
- `userFacingError.ts` は `classifyCreateTableError.ts` を一般化した純関数 `classifyError(err: unknown): UserFacingError` を提供。`code` は `'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'invalid_request' | 'rate_limited' | 'unreachable' | 'server_error' | 'network' | 'unknown'`。
- `userFacingErrorMessages.ts` は `code → { title, hint, retryable }` の純データ。**コードと文言の分離**は `classifyCreateTableError.ts` の設計を踏襲。
- 表示は既存の表現を尊重：`DbPanel` は赤い帯のまま、`DataSourceTree` は黄色枠のまま、`ResponsesPanel` は黄色 amber 枠のまま。**文言だけ揃え、レイアウトは不変**。
- 開発者向けの diagnostic（HTTP ステータス、相関 ID）は `import.meta.env.DEV` のとき下に小さく `<details>` 折り畳みで表示し、本番ビルドでは出さない。

**Technical design:** *(directional guidance — 実装時は具体名を再検討してよい)*

```ts
// userFacingError.ts
export type UserFacingErrorCode =
  | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict'
  | 'invalid_request' | 'rate_limited' | 'unreachable'
  | 'server_error' | 'network' | 'unknown'

export interface UserFacingError {
  code: UserFacingErrorCode
  retryable: boolean
  /** Optional server correlation id, dev-only display */
  correlationId?: string
}

export function classifyError(err: unknown): UserFacingError { /* ... */ }
```

```ts
// userFacingErrorMessages.ts
export const ERROR_MESSAGES: Record<UserFacingErrorCode, { title: string; hint: string }> = {
  unreachable: { title: 'バックエンドに接続できません',  hint: 'しばらく待ってから再試行してください' },
  server_error: { title: '一時的なエラーが発生しました', hint: '時間をおいて再試行してください' },
  // ...
}
```

**Patterns to follow:**
- `src/components/modals/dbConnection/classifyCreateTableError.ts`（コード分類の純関数化）。
- `src/components/sidebar/ResponsesPanel.tsx`（黄色枠 + アイコン + ヒント文 のレイアウト）。

**Test scenarios:**
- Happy path: `classifyError(new ApiError(503, {}, 'HTTP 503'))` → `{ code: 'unreachable', retryable: true }`。
- Happy path: `classifyError(new ApiError(500, { correlationId: 'abc' }, 'HTTP 500'))` → `{ code: 'server_error', retryable: false, correlationId: 'abc' }`。
- Happy path: `classifyError(new NetworkError('fail'))` → `{ code: 'network', retryable: true }`。
- Edge case: 401 → `unauthorized`、403 → `forbidden`、409 → `conflict`、400 → `invalid_request`、429 → `rate_limited`、404 → `not_found`、それ以外の 5xx → `server_error`。
- Edge case: `classifyError(undefined)` / `classifyError('plain string')` → `{ code: 'unknown', retryable: false }`。
- Integration: `DbPanel` で `setFetchError` の代わりに `setFetchError(classifyError(err))` を使い、レンダリング後に `screen.getByText('バックエンドに接続できません')` が出る／HTTP 文言が出ない。
- Integration: `DataSourceTree` の `setCatalog({ status:'error', message: 'ScalarDB に接続できません' })` を `classifyError` 経由のメッセージで置換しても既存ツリー表示が壊れない。
- Integration: 本番ビルド条件下で `correlationId` 表示が DOM に出ない（`import.meta.env.DEV = false` モック）。

**Verification:**
- バックエンド停止状態でアプリを起動 → `バインド` / `データブラウザ` / `回答` の 3 経路すべてで HTTP ステータスや英語スタックが出ず、共通文言＋再試行リンクが見える。
- 開発モードで `<details>` を開くと相関 ID が確認できる。

---

- U4. **上部タブの視覚的グルーピング（破壊的変更なし）**

**Goal:** 6 タブのままで「編集系 / リソース管理系 / システム管理系」の 3 ブロックに視覚的グルーピングを与える。

**Requirements:** R4

**Dependencies:** なし

**Files:**
- Modify: `src/components/layout/AppShell.tsx`（タブ配列定義）または `src/components/layout/TopNavigation.tsx`（プロップ拡張）
- Modify: `src/components/layout/TopNavigation.tsx`（`tabs` の要素に `groupBoundary?: 'before' | 'after'` または直接 `separator` アイテムを許容するよう型を拡張）
- Test: `src/components/layout/TopNavigation.test.tsx`（既存ファイルにケース追加）

**Approach:**
- タブ配列を以下の順序に整理：`デザイン → バインド → ┃ → テンプレート管理 → 回答 → データブラウザ → ┃ → 管理`。
- `TopNavigation` の `tabs` 配列に `{ kind: 'separator' }` 要素を許容する Discriminated Union に拡張、または既存型を保ちつつ `groupBoundary` フィールドで区切り位置を指示する（後者の方が後方互換性が高い）。
- セパレータは `role="separator" aria-orientation="vertical"` の薄い `<span>` で、矢印キーナビの遷移対象から除外する（既存 `tabRefs` Map に登録しない）。
- `AppTab` 型・`activeTab` ロジック・`React.Activity` 維持・URL なし設計などは一切触らない。

**Patterns to follow:**
- `src/components/layout/TopNavigation.tsx` の `tabRefs.current.set(t.id, …)` 既存パターンを維持。
- `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md` のキーボードナビ規約。

**Test scenarios:**
- Happy path: タブ配列にセパレータを 2 個含めても、矢印キー右で `デザイン → バインド → テンプレート管理 → 回答 → データブラウザ → 管理` の順に移動（セパレータをスキップ）。
- Happy path: 矢印キー左で逆方向にも同様にスキップ。
- Edge case: `Home` で先頭タブ、`End` で末尾タブにフォーカスが行く。
- Edge case: セパレータ要素が `role="separator"` で AT に通知される（`screen.getByRole('separator')` が 2 個取れる）。
- Edge case: クリックでセパレータをアクティブ化できない（`onTabChange` が呼ばれない）。
- Integration: `App.tsx` の既存ショートカット（`activeTab !== 'design'` 判定など）が壊れない。

**Verification:**
- 視覚的に編集系（`デザイン / バインド`）と管理系（`テンプレート管理 / 回答 / データブラウザ`）と最右の `管理` が明確に分離されて見える。
- キーボードナビが従来通り壊れない。
- 既存 `TopNavigation.test.tsx` 全てパス。

---

## System-Wide Impact

- **Interaction graph:**
  - U1: `Tooltip` は `ElementPalette` ／ `Toolbar` ／ `SchemaFieldsSection` ／ `bindingEditor` 各所で使われており、追加トリガで他コンポーネントの挙動を変えないか要確認。
  - U3: `ApiError` のキャッチ箇所（少なくとも 10+ ファイル）に共通モジュールを供給。**今回は 3 経路だけ置換**し、残りは段階的に取り込む。
  - U4: `TopNavigation` は `AppShell` のみが利用。ブラスト半径は局所。
- **Error propagation:** U3 では `client.ts` の throw 経路を変えない。`classifyError` はキャッチ側で正規化するだけ。
- **State lifecycle risks:**
  - U2 の `localStorage` 削除は破壊的。テストで複数 userId のキーが共存するシナリオを必ず通す。
  - U1 のグローバル `scroll` リスナは `visible` のときのみ登録 → cleanup 漏れがあると過剰再描画。
- **API surface parity:** `userFacingError` は `classifyCreateTableError.ts` と同じ思想なので、後続作業で `classifyCreateTableError` を `classifyError` ベースに置換できる（今回はやらない）。
- **Integration coverage:** バックエンド停止状態でアプリ起動 → 3 経路（バインド DB / データブラウザ / 回答）でメッセージが揃うことを手動回帰でも確認。
- **Unchanged invariants:** `AppTab` 型 / `activeTab` ストア / `Tooltip` の Portal 構造 / autosave のキー命名 (`rds-autosave:${userId}`) は変更しない。

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| U1 で追加した `onClick` ハンドラが Tooltip 内側のフォーカス可能要素のクリック伝播を壊す | ラッパー `<span>` に付けるのみとし `stopPropagation` は呼ばない。子のクリック動作はそのまま通す。テストで btn 子要素の click イベントが受け取れることを確認 |
| U2 の `removeItem` 修正で旧キー `rds-autosave`（無印）が残ったまま再表示される | 復元判定 `App.tsx:124` 側でも旧キーを 1 度だけ読み込み・削除する後方互換クリーンアップを **任意で**追加（実装時判断） |
| U3 の文言変更で既存 e2e / snapshot テストが壊れる | 現行リポジトリには e2e テストが少ない（`vitest` 中心）。スナップショット検索を実装時に行い、影響箇所を更新 |
| U4 のセパレータが矢印キーナビでスキップされず操作不能箇所ができる | `TopNavigation.tsx` の `tabRefs` Map / `focusTab` ループを確認し、セパレータを除外するテストを追加 |
| グローバル scroll リスナがキャンバス操作の負荷を増やす | `passive: true` + `visible === true` のときだけ登録 + cleanup を厳格化。Tooltip の `visible` は同時に最大 1 個 |

---

## Documentation / Operational Notes

- README / docs/user-manual.md（旧 docs/manual.md — 2026-07 に統合）：表示文言が変わる箇所のスクリーンショットがあれば差し替え（U3 の DB 接続エラー画像）。
- `docs/solutions/ui-bugs/`：U1（Tooltip 修正）と U2（autosave キー誤り）は完了後に solution doc を追加（institutional memory）。
- リリースノート：UX 修正としてユーザー向けに 1 行ずつ。

---

## Sources & References

- 評価レポート（本セッション会話・スクリーンショット `/tmp/rds-shots/01_initial.png` ほか）
- Related plan: `docs/plans/2026-04-13-feat-top-navigation-tab-consolidation-plan.md`
- Related plan: `docs/plans/2026-04-11-refactor-ui-ux-comprehensive-review-plan.md`
- Related solution: `docs/solutions/runtime-errors/app-shell-auth-guard-blank-tab.md`
- Related solution: `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md`
- Related solution: `docs/solutions/ui-bugs/sidebar-panel-ux-master-hf-localization.md`
- Reference implementation: `src/components/modals/dbConnection/classifyCreateTableError.ts`
