---
title: "feat: データブラウザ専用ページ"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-data-browser-brainstorm.md
---

# feat: データブラウザ専用ページ

## Overview

ScalarDB テーブル・商品マスター・フォーム回答の3種類のデータを横断的に閲覧できるデータブラウザを、専用ルート `/data-browser` として追加する。左サイドバーのツリーでデータソースを選択し、右ペインでデータグリッドを表示する。

(see brainstorm: docs/brainstorms/2026-04-12-data-browser-brainstorm.md)

---

## Problem Statement

現在、各種データ（ScalarDB テーブル・商品マスター・フォーム回答）を閲覧するには帳票テンプレートを経由する必要があり、データ確認の用途には不便。独立したデータブラウザページにより、テンプレートを経由せずにデータを素早く確認・エクスポートできるようになる。

---

## Architecture Decision: React Router の追加

**現状の発見:** コードベースには React Router が存在しない（シングルページ・モーダルパターン）。ブレインストームで「専用ページ（ルートレベル）」+ React Router を選択したため、これを新規追加する。

**実装方針:**
1. `react-router-dom` をインストール（v7 系 — React 19 対応）
2. `src/main.tsx` を `<BrowserRouter>` でラップ
3. ルート `/` → 既存の `<App />` (報告デザイナー)
4. ルート `/data-browser` → 新規の `<DataBrowserPage />`
5. Toolbar に「データブラウザ」リンクを追加（`<Link>` コンポーネント使用）

---

## Technical Approach

### レイアウト

```
/data-browser
┌──[Header: "データブラウザ" + デザイナーへ戻るリンク]───────────┐
│                                                              │
│ ┌─[左サイドバー 240px]──┐  ┌─[右ペイン: データグリッド]──────┐ │
│ │ ▶ ScalarDB            │  │ [検索バー] [CSV]              │ │
│ │   ├ orders            │  │ ┌─────────────────────────┐   │ │
│ │   └ customers         │  │ │ col1 ↑ | col2 | col3    │   │ │
│ │ ▼ 商品マスター         │  │ │ row1...                 │   │ │
│ │   (active)            │  │ │ row2...                 │   │ │
│ │ ▶ フォーム回答         │  │ └─────────────────────────┘   │ │
│ │   ├ 帳票A             │  │ [< 1/5 >]  50件/ページ        │ │
│ │   └ 帳票B             │  └─────────────────────────────┘ │
│ └───────────────────────┘                                   │
│                                  [詳細パネル: 右スライドイン] │
└─────────────────────────────────────────────────────────────┘
```

### データソース別の実装

| データソース | データ取得API | 列の定義 | ページネーション |
|------------|-------------|---------|---------------|
| ScalarDB テーブル | **新規** `GET /api/v2/scalardb/tables/{ns}/{table}/rows` | `TableMetadata` から動的生成 | サーバーサイド (offset/limit) |
| 商品マスター | `GET /api/v1/products`（既存） | Product 型の固定フィールド | クライアントサイド |
| フォーム回答 | `GET /api/v2/templates/{id}/responses`（既存） | 回答フィールドから動的生成 | サーバーサイド (offset/limit) |

### 検索・ソート

(see brainstorm: docs/brainstorms/2026-04-12-data-browser-brainstorm.md#3-右ペイン-データグリッド)

- **クライアントサイドフィルタ** — 取得済みページ内データを絞り込む
- CSV エクスポートはフィルタ・ソート後の表示データをエクスポート
- クライアントサイド検索は現在ページ（50件）のみ対象（全件検索はスコープ外）

---

## Implementation Phases

### Phase 1: React Router 導入

**タスク:**
- [ ] `react-router-dom` をインストール: `npm install react-router-dom`
- [ ] `src/main.tsx` を `<BrowserRouter>` でラップ
- [ ] `src/App.tsx` を `/` ルートとしてそのまま維持
- [ ] 空の `src/pages/DataBrowserPage.tsx` を作成してルート登録
- [ ] `Toolbar.tsx` に `/data-browser` への `<Link>` ボタンを追加

**成果物:** `src/main.tsx`（更新）、`src/pages/DataBrowserPage.tsx`（新規）

---

### Phase 2: バックエンド — ScalarDB Scan エンドポイント

**新規エンドポイント:** `GET /api/v2/scalardb/tables/{ns}/{table}/rows`

**クエリパラメータ:**
- `offset` (default: 0)
- `limit` (default: 50, max: 50)
- `orderBy` (optional: column name)
- `orderDir` (optional: `asc` | `desc`)

**レスポンス:**
```json
{
  "columns": [{"name": "id", "type": "TEXT", "keyType": "PARTITION"}],
  "rows": [{"id": "abc", "name": "foo"}],
  "total": 1234,
  "truncated": false,
  "offset": 0,
  "limit": 50
}
```

**実装ポイント:**
- `V2ScalarDbScanController.java` を新規作成（参考: `V2ScalarDbCatalogController.java`）
- ScalarDB `Scan` を `Scan.newBuilder().namespace(ns).table(tbl).all()` で全件スキャン
- 上限 10,000 件: それ以上存在する場合は `truncated: true` を返し、フロントで警告表示
- 認証済みユーザーのみアクセス可（既存の `principal` チェックパターン踏襲）
- **名前ベースのカラムマッピング**（位置依存禁止 — `docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md` 参照）
- `AppWiring.java` に `V2ScalarDbScanController` を登録
- `ApiRoutes.java` に `app.get("/api/v2/scalardb/tables/{ns}/{table}/rows", ...)` を追加

**成果物:** `V2ScalarDbScanController.java`（新規）、`AppWiring.java`（更新）、`ApiRoutes.java`（更新）

---

### Phase 3: フロントエンド Store & API

**API クライアント (`src/api/reportApi.ts` に追加):**

```ts
// ScalarDB テーブル行スキャン
export interface ScalarDbScanResponse {
  columns: { name: string; type: string; keyType?: string }[]
  rows: Record<string, unknown>[]
  total: number
  truncated: boolean
  offset: number
  limit: number
}

export async function scanScalarDbTable(
  namespace: string,
  table: string,
  params: { offset?: number; limit?: number; orderBy?: string; orderDir?: 'asc' | 'desc' },
): Promise<ScalarDbScanResponse>
```

**Zustand スライス `src/store/dataBrowserSlice.ts`（新規）:**

```ts
interface DataBrowserState {
  // 選択中のデータソース
  selectedSource: DataSourceNode | null
  // ScalarDB テーブル行キャッシュ (key: "ns.table:offset")
  tableDataCache: Map<string, ScalarDbScanResponse>
  // 検索・ソート UI 状態
  searchQuery: string
  sortCol: string | null
  sortDir: 'asc' | 'desc'
  currentPage: number
  // 詳細パネル
  detailRow: Record<string, unknown> | null
}
```

**成果物:** `src/api/reportApi.ts`（更新）、`src/store/dataBrowserSlice.ts`（新規）

---

### Phase 4: データブラウザ UI

**コンポーネント構成:**

```
src/pages/DataBrowserPage.tsx          ← ページルート
src/components/dataBrowser/
  DataSourceTree.tsx                   ← 左サイドバーツリー
  DataGrid.tsx                         ← 右ペインのデータグリッド
  DataGridToolbar.tsx                  ← 検索バー + CSV ボタン
  DataDetailPanel.tsx                  ← 右スライドイン詳細パネル
  EmptyState.tsx                       ← 空状態・エラー状態の共通コンポーネント
```

**DataSourceTree のノード型:**

```ts
type DataSourceNode =
  | { kind: 'scalardb-table'; namespace: string; table: string; label: string }
  | { kind: 'product-master' }
  | { kind: 'form-responses'; templateId: string; templateName: string }
```

**ツリーの初期表示 (SpecFlow 指摘対応):**
- ScalarDB: カタログ取得完了まで "読み込み中..." → テーブルがない場合は "テーブルが設定されていません（データ連携タブで設定）" を表示
- ScalarDB 503 エラー: ノードは表示したまま "ScalarDB に接続できません" をインライン表示
- デフォルト選択: 最初のノード（ScalarDB の最初のテーブル or 商品マスター）を自動選択

**DataGrid の空状態:**
- フォーム回答 0件: "0件の回答" バッジ + テンプレートへのリンク
- 検索結果 0件: "「○○」に一致するデータがありません"

**10,000件上限の警告:**
```tsx
{scanResult.truncated && (
  <p className="text-xs text-amber-600">
    ⚠ 上位 10,000 件のみ表示しています
  </p>
)}
```

**成果物:** 上記 5 コンポーネント（新規）

---

### Phase 5: CSV エクスポート & 詳細パネル

**CSV エクスポート:**
- 現在ページの表示データ（フィルタ・ソート後）を `downloadBlob()` でエクスポート
- ファイル名: `{データソース名}_{YYYY-MM-DD}.csv`
- 既存の `downloadBlob()` ユーティリティを流用（`src/api/reportApi.ts` 内）

**詳細スライドインパネル:**
- 行クリックで右から 360px のパネルをスライドイン
- 全フィールドを key-value テーブルで表示（読み取り専用）
- 商品マスターの場合: 価格履歴テーブルを折りたたみ表示
- `Escape` または ✕ で閉じる、ARIA `role="dialog"` 対応

**成果物:** `DataDetailPanel.tsx`（更新）、CSV 機能追加

---

## System-Wide Impact

### Interaction Graph

```
/data-browser ロード
  → DataSourceTree: fetchScalarDbCatalogCached() [既存, 5min TTL]
  → DataSourceTree: getProducts() [既存]
  → DataSourceTree: listTemplates() [既存]
    → ユーザーがノード選択
      → ScalarDB ノード: scanScalarDbTable(ns, table, {offset, limit})
        → GET /api/v2/scalardb/tables/{ns}/{table}/rows
          → V2ScalarDbScanController.scan()
      → 商品マスターノード: productSlice.products (キャッシュ済みなら再利用)
      → フォーム回答ノード: listResponses(templateId, {offset, limit}) [既存]
```

### Error & Failure Propagation

| エラー | 発生箇所 | 対処 |
|--------|---------|------|
| ScalarDB 503 | `scanScalarDbTable()` | グリッドに "ScalarDB に接続できません" + ツリーノードは残す |
| ScalarDB 503（カタログ取得） | `fetchScalarDbCatalogCached()` | "テーブルが読み込めません" をツリーに表示、再試行ボタン |
| 商品マスター取得失敗 | `getProducts()` | 商品マスターノードに "読み込み失敗" バッジ |
| フォーム回答 404 | `listResponses()` | "このテンプレートの回答はありません" |
| 未認証アクセス | `main.tsx` ルートガード | `/` (デザイナー) にリダイレクト（ログイン画面を経由） |

### State Lifecycle Risks

- **キャッシュ一貫性:** ScalarDB カタログは 5 分 TTL（既存の `fetchScalarDbCatalogCached()` を流用）。カタログと行データの TTL が異なるため、テーブル削除後も行スキャンを試みる可能性 → `scanScalarDbTable()` の 404 で "テーブルが見つかりません" を表示
- **ページ切り替え時のキャッシュ:** ページを変えるたびに API を呼ぶ（キャッシュは Phase 1 スコープ外）

### Security Considerations

- `V2ScalarDbScanController` は認証済みユーザー全員にアクセス許可（ブレインストーム決定）
- `namespace` / `table` パラメータは `IDENTIFIER` 正規表現で検証（既存の `RequestValidator.isValidIdentifier()` 踏襲）
- フロントエンドでのデータ表示: `__proto__` 等の危険キーをフィルタリング（`docs/solutions/security-issues/xss-prototype-pollution-image-validation.md` 参照）

---

## Acceptance Criteria

### Functional Requirements

**ルーティング:**
- [ ] `/data-browser` にアクセスするとデータブラウザページが表示される
- [ ] Toolbar に「データブラウザ」リンクが存在し、クリックで `/data-browser` に遷移
- [ ] データブラウザのヘッダーに「← デザイナーに戻る」リンクがあり、`/` に戻れる
- [ ] 未認証ユーザーが `/data-browser` にアクセスすると認証ページにリダイレクト

**左サイドバーツリー:**
- [ ] ScalarDB テーブル一覧がカタログ API から動的に読み込まれる
- [ ] ScalarDB 未設定時は "テーブルが設定されていません" の空状態を表示
- [ ] ScalarDB 503 時はツリーノードを残したまま "接続できません" をインライン表示
- [ ] 「商品マスター」固定ノードが表示される
- [ ] テンプレートごとの「フォーム回答」ノードが表示される
- [ ] ページロード時に最初のノードが自動選択される

**データグリッド:**
- [ ] 選択ノードに応じたデータが表示される
- [ ] 検索バーで現在ページ内をクライアントサイドフィルタリングできる
- [ ] 列ヘッダークリックでクライアントサイドソートができる
- [ ] 50件/ページのページネーションが動作する
- [ ] 10,000件超の場合に黄色の警告バナーを表示
- [ ] 空データ時に適切な空状態メッセージを表示

**CSV エクスポート:**
- [ ] CSV ボタンクリックで現在ページの表示データ（フィルタ・ソート後）をダウンロード
- [ ] ファイル名が `{データソース名}_{YYYY-MM-DD}.csv` 形式

**詳細パネル:**
- [ ] 行クリックで右スライドインパネルが開く
- [ ] 全フィールドが key-value 形式で表示される（読み取り専用）
- [ ] 商品マスターの場合は価格履歴が折りたたみで表示される
- [ ] `Escape` キーまたは ✕ で閉じられる

### Non-Functional Requirements

- [ ] ScalarDB テーブル行のロードが 2 秒以内（50件/ページ）
- [ ] 商品マスター・フォーム回答は既存 API 流用なのでキャッシュ済みなら即時表示
- [ ] `V2ScalarDbScanController` の `namespace` / `table` パラメータを識別子正規表現で検証
- [ ] フロント表示時に `__proto__` 等の危険キーをフィルタリング

### Quality Gates

- [ ] `npm run build` — 新規ファイルの型エラーなし
- [ ] バックエンドビルド `cd server && ./gradlew compileJava` — BUILD SUCCESSFUL
- [ ] `react-router-dom` が `package.json` に追加されている

---

## SpecFlow 指摘への対応

(SpecFlow 分析から取り込んだ要件)

1. **認証境界**: `/data-browser` ルートに認証ガードを追加（`main.tsx` のルート定義でラップ）
2. **ツリーの部分的失敗**: 各データソースを独立してロード — 一部失敗しても他は表示
3. **デフォルト選択**: マウント時に最初の利用可能ノードを自動選択
4. **ScalarDB 503 の表示**: グリッドに错误メッセージ、ツリーノードは残す
5. **フォーム回答 0件**: ヘッダーにカウント表示 + CTA リンク
6. **戻るナビゲーション**: ヘッダーに「← デザイナーに戻る」リンク（`<Link to="/">` ）

---

## Dependencies & Prerequisites

- `react-router-dom` (v7) — 現在未インストール、`npm install react-router-dom` が必要
- ScalarDB がデータ連携タブで接続済みであること（ScalarDB なしでも残りのデータソースは動作）

---

## Risk Analysis

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| React Router 追加が既存 App.tsx のルートと競合 | 低 | 中 | `App.tsx` を `/` ルートとして `<Route>` にラップするだけ |
| ScalarDB 全件スキャンがタイムアウト | 中 | 中 | 50件/ページでサーバーサイドページネーション、10,000件上限 |
| `getColumnNames()` の順序不定 | 高 | 高 | 名前ベースマッピング必須（`scalardb-column-ordering` 学習事項適用） |
| フォーム回答の `templateId` 一覧取得 | 低 | 低 | テンプレート一覧APIは既存（`getTemplateList()`） |

---

## Out of Scope

(see brainstorm: docs/brainstorms/2026-04-12-data-browser-brainstorm.md#out-of-scope-yagni)

- データの編集・追加・削除（読み取り専用）
- 全件 CSV エクスポート（表示ページのみ）
- クロスデータソースの JOIN・集計
- リアルタイム更新（ポーリング）
- グラフ・チャート表示
- クライアントサイド全件検索（現在ページ内のみ）

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-12-data-browser-brainstorm.md](docs/brainstorms/2026-04-12-data-browser-brainstorm.md)
  - Key decisions: 左サイドバーツリー、クライアントサイドフィルタ、右スライドインパネル、React Router、ScalarDB 新規 scan API (Option A)

### Internal References

- ScalarDB カタログパターン: `server/src/main/java/com/report/server/V2ScalarDbCatalogController.java`
- ScalarDB テーブル作成参考: `server/src/main/java/com/report/server/V2ScalarDbTableController.java`
- フォーム回答パターン: `src/components/sidebar/ResponsesPanel.tsx`
- 商品マスター API: `src/api/reportApi.ts:807` (`getProducts()`)
- fetchScalarDbCatalogCached: `src/api/reportApi.ts:648`
- downloadBlob: `src/api/reportApi.ts`
- Toolbar ボタンパターン: `src/components/toolbar/Toolbar.tsx`

### Institutional Learnings Applied

- ScalarDB 列順序バグ（**重要**）: `docs/solutions/integration-issues/scalardb-column-ordering-positional-binding-mismatch.md`
- XSS・prototype pollution 防止: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`
- エラーハンドリングパターン: `docs/solutions/logic-errors/export-error-handling-json-api.md`
