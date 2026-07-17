# アーキテクチャ設計書

**システム名:** Report Design Studio V2  
**作成日:** 2026-04-12  
**最終更新:** 2026-07-17  
**対象バージョン:** main ブランチ

> **2026-07-17 更新:** トップナビ 6 タブ構成、テンプレートエンベロープ (#52)、サーバ PDF エンジン全要素対応とページネーション (#53/#55/#64)、ジョブ基盤統合 (#60)、セキュリティ強化 (#58) 等、2026-04 以降の実装変更を反映。

---

## 1. システム概要

Report Design Studio V2 は、帳票・フォームのビジュアルデザインと PDF 出力を提供する Web アプリケーションです。フロントエンド SPA と Java バックエンドで構成され、ScalarDB を介してデータ永続化を行います。

### 解決する課題

- コードを書かずに複雑な帳票（日本語専用要素含む）を設計できる
- ScalarDB のテーブルデータを帳票に動的にバインドできる
- 計算・バリデーションルールを式で定義できる
- 公開フォームとして配布し、回答を収集・エクスポートできる
- サーバサイド PDF で、ページ分割・和文タイポグラフィ対応の高品質な帳票を出力できる

---

## 2. システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (http://localhost:5173)                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            React SPA (Vite + TypeScript)            │   │
│  │                                                     │   │
│  │  TopNavigation (6 タブ)                             │   │
│  │   デザイン │ バインド │ テンプレート管理 │ 回答        │   │
│  │          │ データブラウザ │ 管理                     │   │
│  │                    │                               │   │
│  │             Zustand Store (13 slices)              │   │
│  │   + dataBrowserStore (データブラウザ専用)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │ REST API (fetch + cookie auth)    │
└─────────────────────────┼───────────────────────────────────┘
                          │ http://localhost:8080
┌─────────────────────────┴───────────────────────────────────┐
│  Java Backend (Javalin 6 / Java 21)                        │
│                                                             │
│  ミドルウェア: 例外ハンドラ → セキュリティヘッダ →           │
│               CSRF Origin 検証 → 認証解決 → admin ロール強制 │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │   Auth   │ │ Template │ │  Eval /  │ │ PDF エンジン  │   │
│  │ /Admin   │ │  CRUD /  │ │ Validate │ │ (レジストリ + │   │
│  │          │ │ Envelope │ │          │ │ ページネーション)│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│  ┌──────────────────────┐ ┌──────────────────────────┐     │
│  │ JobStore (ジョブ基盤) │ │ Webhook / Products / etc. │     │
│  └──────────────────────┘ └──────────────────────────┘     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  ScalarDB 3.14                       │   │
│  │         (SQLite / 任意の JDBC DB)                    │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. フロントエンドアーキテクチャ

### 3.1 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Vite | 6 | ビルドツール・開発サーバー |
| React | 19 | UI フレームワーク |
| TypeScript | 5.7 | 型安全性 |
| Zustand | 5 | グローバル状態管理 |
| Immer | - | イミュータブル状態更新 |
| Tailwind CSS | 3.4 | スタイリング |
| Radix UI | - | アクセシブルなプリミティブ UI |
| @dnd-kit/core | - | ドラッグ&ドロップ |
| Recharts | 3.8 | グラフ描画 |
| html2canvas + jsPDF | - | クライアントサイド PDF/PNG 出力（フォールバック） |
| Vitest | 3 | テストフレームワーク |

### 3.2 トップナビゲーション（6 タブ構成）

`AppShell` + `TopNavigation` が画面全体を 6 つのタブに分割します（Issue #48 の 3 タブ統合から発展）。アクティブタブは `uiSlice.activeTab` で管理されます。

| タブ | コンポーネント | 内容 |
|------|--------------|------|
| デザイン | `App` | 帳票デザイナー本体（キャンバス + サイドバー）。`<Activity>` で非表示時も状態保持 |
| バインド | `BindingEditor` | 3 ペインのスキーマ/要素バインディングエディタ（要素 ⇄ フィールドを矢印で可視化） |
| テンプレート管理 | `TemplateManagementTab` | サーバテンプレートの一覧・複製・公開範囲・インポート/エクスポート |
| 回答 | `ResponsesPanel` | フォーム回答の一覧・PDF/Excel エクスポート |
| データブラウザ | `dataBrowser/*` | ScalarDB テーブルの閲覧・行編集（専用の `dataBrowserStore` を使用） |
| 管理 | `AdminTab` | ユーザー管理・サーバー設定（`/api/v1/admin/*` はサーバ側で admin ロール必須） |

### 3.3 状態管理アーキテクチャ

単一の Zustand ストアに 13 のスライスを合成します。データブラウザだけは独立した `dataBrowserStore` を使用します。

```
useReportStore (root store)
│
├── layoutSlice      — ReportDefinition（ページ・要素）+ 選択状態
├── historySlice     — Undo/Redo（ページスナップショット、50段階）
├── uiSlice          — アクティブタブ・プレビュー・ズーム・グリッド・接続状態
├── clipboardSlice   — 要素/スタイルのコピー・切り取り・貼り付け
├── authSlice        — ログインユーザー・認証フロー
├── adminSlice       — 管理タブ（ユーザー管理・サーバー設定）の状態
├── tenantSlice      — テナント情報（会社名・ロゴ等）
├── schemaSlice      — データスキーマ（マスタ/詳細グループ・フィールド）
├── rulesSlice       — 計算ルール・バリデーションルール
├── variantsSlice    — 出力バリアント・マスキングルール
├── responsesSlice   — フォーム回答データ
├── productSlice     — 商品マスタ（SKU・価格・税・カスタムフィールド）
└── computedSlice    — 計算結果キャッシュ（バックエンド評価後）

useDataBrowserStore  — データブラウザ専用（選択テーブル・行データ）
```

**不変性の保証:** すべてのミューテーションは Immer の `produce` を経由します。コンポーネントが要素オブジェクトを直接変更することは禁止されています。

### 3.4 コンポーネント構成

```
AppShell.tsx (ルート — 6 タブの切り替え)
├── TopNavigation.tsx   — メインナビゲーション（role=tablist）
├── App.tsx             — デザインタブ本体
│   ├── Toolbar.tsx     — 保存・エクスポート・プレビュー・ズーム
│   ├── LeftSidebar (タブ: 要素 / レイヤー / ページ / スキーマ)
│   │   ├── ElementPalette  — 要素パレット（ドラッグ元）
│   │   ├── LayersPanel     — レイヤーツリー
│   │   ├── PagePanel       — ページ一覧
│   │   └── SchemaFieldsTab — データスキーマエディタ
│   ├── ReportCanvas.tsx    — DnD コンテキスト・ページレンダリング
│   │   ├── SectionContainer — セクション（ヘッダー/ボディ/フッター）
│   │   ├── CanvasElement    — ドラッグ・リサイズ対応の要素ラッパー
│   │   │                      （あふれ警告バッジ: overflowWarning.ts）
│   │   └── ElementRenderer  — 型別レンダラーへのディスパッチ
│   └── RightSidebar (タブ: プロパティ / バージョン / ページ設定)
├── BindingEditor       — バインドタブ
├── TemplateManagementTab — テンプレート管理タブ
├── ResponsesPanel      — 回答タブ
├── DataBrowserPage     — データブラウザタブ
└── AdminTab            — 管理タブ (UserManagement / ServerSettings)
```

### 3.5 要素システム

各要素タイプは独立したディレクトリ (`src/elements/{type}/`) に実装されます。`ReportElement` は 24 タイプの判別可能 Union です。

```
src/elements/{type}/
├── Renderer.tsx        — Canvas 上での描画
└── PropertiesPanel.tsx — 右サイドバーのプロパティエディタ

src/elements/_blocks/   — 共通ビルディングブロック
├── renderers/
│   ├── ElementFrame    — ボーダー・背景・パディング
│   ├── TextContent     — テキスト描画（縦書き・ふりがな）
│   ├── GridLines       — CSS ベースグリッド線
│   ├── ChartContent    — Recharts ラッパー
│   ├── BarcodeContent  — QR/バーコードレンダラー
│   └── ElementErrorBoundary — 要素単位エラーキャッチ
├── hooks/
│   └── useDataResolver — フィールド解決 + フォーマット適用
└── panels/
    ├── TextStyleSection    — フォント・サイズ・色・配置
    ├── BorderSection       — ボーダー設定
    ├── DataBindingSection  — フィールドキー入力
    ├── FormatSection       — 数値・日付フォーマット
    └── FuriganaSection     — ふりがな設定
```

`formTable` 要素はキャンバス上で Excel 風の直接編集（ダブルクリックで編集モード、セル選択・結合・行列操作・コピペ・テーブル専用 Undo）をサポートします。

---

## 4. バックエンドアーキテクチャ

### 4.1 技術スタック

| 技術 | バージョン | 用途 |
|------|-----------|------|
| Java | 21 | ランタイム（Virtual Threads 利用） |
| Javalin | 6 | HTTP サーバーフレームワーク |
| ScalarDB | 3.14 | トランザクション対応データアクセス層 |
| SQLite | - | 開発環境 DB（本番は JDBC 互換 DB）|
| Apache Commons JEXL | 3.4 | 計算式評価エンジン（サンドボックス） |
| Apache PDFBox | 3.0 | PDF 生成 |
| ZXing | - | QR コード・バーコード生成 |
| Apache POI (SXSSF) | - | Excel エクスポート |
| BCrypt | - | パスワードハッシュ |
| JUnit 5 + Mockito | - | テスト |
| Gradle | 8 | ビルドツール |

### 4.2 パッケージ構成

```
com.report.server
├── App.java                    — エントリポイント・Javalin 起動
├── AppWiring.java              — 依存性注入（手動 DI）
├── ApiRoutes.java              — ルート定義・ミドルウェア設定
├── auth/                       — 認証・認可
│   ├── AuthController          — ログイン・ログアウト・セッション管理
│   ├── AdminUserController     — ユーザー管理（admin ロール専用）
│   ├── UserRepository          — ユーザー CRUD + admin ブートストラップ
│   ├── Principal               — 認証済み/匿名ユーザー
│   ├── FormSessionManager      — 公開フォームのパスワード保護
│   └── RateLimiter             — 固定窓レートリミッタ
├── job/                        — ジョブ基盤（詳細: docs/job-infrastructure.md）
│   ├── JobStore (interface)    — 単一のジョブ抽象
│   ├── JobRepository           — ScalarDB 永続実装（成果物はファイルシステム）
│   ├── JobRecord / JobStatus   — 共通レコード型・統一ステータス語彙
│   ├── JobConcurrencyLimiter   — 同時実行制限
│   ├── JobTtlReaper            — TTL 回収スケジューラ（60 秒周期）
│   └── BatchPdfProcessor       — バッチ PDF 実行
├── pdf/                        — PDF エンジン（§4.4 参照）
├── V2TemplateController        — テンプレート CRUD（エンベロープ形式）
├── V2VersionController         — バージョン管理
├── V2EvaluateController        — 計算式評価・バリデーション
├── V2BindingResolveController  — ScalarDB データ解決
├── V2ScalarDbCatalog/Table/Scan/RowController — ScalarDB カタログ・行操作
├── V2FormResponseController    — フォーム回答管理
├── V2TenantController          — テナント情報 CRUD
├── V2PdfController / V2StatelessPdfController — 同期 PDF 生成
├── V2PdfJobController / V2BatchPdfController  — 非同期 PDF ジョブ
├── AdminServerController       — サーバー設定・再起動（admin 専用）
├── ProductController           — 商品マスタ CRUD + CSV インポート
├── WebhookController / WebhookDispatcher — Webhook 設定・送信（SSRF ガード + HMAC 署名）
├── SequenceController          — 採番設定
├── SchemaLibraryController     — スキーマライブラリ
├── ExpressionEngine            — JEXL サンドボックス
├── CalculationEngine           — 計算ルール実行（BigDecimal 金額計算）
├── ValidationEngine            — バリデーションルール実行
├── JexlFunctions               — 独自関数（sum, avg, formatDate 等）
├── TemplateEnvelope            — エンベロープの unwrap/マイグレーション
├── ReportDefinitionValidator   — 定義の構造バリデーション（上限値）
├── JsonBlobRepository          — JSON ドキュメント永続化の共通実装
└── AuditLog                    — 監査ログ
```

### 4.3 リクエスト処理フロー（ミドルウェア順序）

```
HTTP リクエスト
    │
    ▼
グローバル例外ハンドラ（スタックトレースを含まない統一 JSON エラー）
    │
    ▼
セキュリティヘッダー付与 (after-filter)
    X-Content-Type-Options / X-Frame-Options: DENY /
    Referrer-Policy / Content-Security-Policy /
    PDF・ZIP ダウンロードは Cache-Control: no-store
    │
    ▼
CSRF Origin チェック (before-filter、状態変更メソッドのみ。
    localhost:8080 / Vite dev ポート / ALLOWED_ORIGIN 以外は 403)
    │
    ▼
認証解決 (before-filter: session_id Cookie → Principal。
    /api/v1/public/* と /api/v1/auth/*、health 以外は認証必須)
    │
    ▼
admin ロール強制 (before-filter: /api/v1/admin/* は admin ロール必須)
    │
    ▼
ルートハンドラ (コントローラメソッド)
    │
    ▼
ScalarDB トランザクション (必要な場合)
    │
    ▼
JSON レスポンス
```

### 4.4 PDF エンジン構成

サーバ PDF はフロントエンドの全 24 要素タイプをネイティブ描画します（`V2ElementParityMatrixTest` がパリティを保証）。クライアントサイド PDF（html2canvas + jsPDF）はバックエンド未接続時のフォールバックです。

```
server/src/main/java/com/report/server/pdf/
├── PdfRenderer                    — エントリポイント（ページ計画 → 描画）
├── ElementPdfRendererRegistry     — 要素種別 → レンダラーのレジストリ
│     Text / Shape / Line / Barcode / QrCode / Image / Check /
│     SealBox / Hanko / Divider / RevenueStamp / ApprovalStampRow /
│     EraSelect / DataField / ManualEntry / Chart / RepeatingBand /
│     RepeatingList / FormTable / Table / FormGrid / RowBlock /
│     StyledText (pageNumber・currentDate・tenant*・carryover 等)
├── SectionPdfRendererRegistry     — セクション種別 → レンダラー
│     PageBase / DetailTable / MultiRowTable / Free
├── SectionRenderHelper            — 行領域導出・ページ計画・バンドフロー
├── RelativeLayoutResolver         — 押し下げレイアウト + 自動改ページ
├── FontProvider                   — 同梱 Noto フォント
│     (NotoSansJP-Regular/Bold, NotoSerifJP-Regular — 折返し・縦書き・
│      ふりがな・太字埋め込みを含む和文タイポグラフィ)
├── SystemValueResolver            — システム変数のサーバ側解決
│     (ページ番号・日付・和暦フォーマット)
└── PageContext / VariantContext   — ページ状態・バリアントマスキング
```

- **ページネーション/オーバーフロー**: `detail_table` / `multi_row_table` の行フロー、繰越小計、グループ改ページ、押し下げ自動改ページ、マージンクリッピング、V2 `repeatingBand`/`repeatingList` のバンドフロー。仕様は **[docs/pagination-spec.md](pagination-spec.md)** が正。
- **システム変数・テナント情報**: `SystemValueResolver` と `TenantInfoProvider` によりサーバ側で解決（クライアント差し替え不要）。
- **金額計算**: `CalculationEngine` / `JexlFunctions` は BigDecimal ベースで浮動小数点誤差を排除。

### 4.5 ジョブ基盤

V1（バッチ）と V2（単発/バッチ PDF）のジョブは単一の `JobStore` 抽象に統合されています。メタデータは ScalarDB `report_studio.jobs`、成果物はファイルシステム `data/jobs/{jobId}/` に置かれ、再起動時の orphan reconcile と TTL 回収を備えます。詳細は **[docs/job-infrastructure.md](job-infrastructure.md)** が正。

| スタック | jobType | API | 同時実行上限 |
|---|---|---|---|
| V1 バッチ | `V1_BATCH` | `/api/v1/jobs` | 20 |
| V2 単発 PDF | `V2_PDF` | `/api/v2/pdf-jobs` | 10 |
| V2 バッチ | `V2_BATCH` | `/api/v2/pdf-jobs/batch` | 10 |

ジョブは投入した Principal を所有者として記録し、状態参照・結果ダウンロードは所有者のみに許可されます（Issue #58）。

---

## 5. データフロー

### 5.1 データバインディングフロー

```
ユーザーがデータスキーマを定義 (スキーマタブ / バインドタブ)
    │
    ▼
store.setSchema(schema)
    │
    ▼
テストデータ入力
    │
    ▼
ReportCanvas が要素をレンダリング
    │
    ▼
ElementRenderer → type 別 Renderer
    │
    ▼
useDataResolver hook
    │  ┌─ resolveField(data, "customer.name")
    │  └─ interpolate("注文 {{customer.name}}", data)
    │
    ▼
Canvas 上にデータ差し込み済み要素を表示
```

バインドタブ（`BindingEditor`）では、テンプレート要素とスキーマフィールドの対応を矢印で可視化し、クリック/ドラッグでバインドできます。

### 5.2 保存フロー

テンプレートはすべて**正準エンベロープ** `{ formatVersion: 2, definition: {...} }` で受け渡しされます。サーバは V2 `ReportDefinition` を直接解釈し、保存境界（PUT / import）では `ReportDefinitionValidator` による構造バリデーションが必ず実行されます。旧形式（v0 / v1）はマイグレーションラダーで引き上げられます。詳細は **[docs/template-envelope-spec.md](template-envelope-spec.md)** が正。

```
ユーザーが「保存」クリック
    │
    ├─[新規]─ SaveTemplateDialog (名前入力)
    │              │
    │          POST /api/v2/templates → { id }
    │              │
    │          store.setCurrentTemplateId(id)
    │
    └─[既存]─ PUT /api/v2/templates/{id}   (エンベロープ形式)
                   │
               ReportDefinitionValidator → ScalarDB v2_definitions に保存

自動保存: 定義変更 → 1秒後 localStorage 保存 (rds-autosave)
```

### 5.3 PDF 出力フロー

**サーバーサイド PDF が正**（ベクターテキスト・ページ分割・和文フォント埋め込み対応）。クライアントサイド PDF はバックエンド未接続時のフォールバックです（Issue #61）。

```
サーバーサイド PDF (PDFBox) — 推奨
POST /api/v2/pdf/generate  (ステートレス: definition + data)
POST /api/v2/templates/{id}/pdf  (保存済みテンプレート)
    │
    ▼
PdfRenderer
    │  ┌─ SectionPdfRendererRegistry: セクション別ページ計画
    │  ├─ ElementPdfRendererRegistry: 全 24 要素タイプの描画
    │  ├─ SystemValueResolver: ページ番号・日付・和暦
    │  ├─ TenantInfoProvider: テナント情報の解決
    │  └─ FontProvider: Noto フォント埋め込み
    │
    ▼
PDF バイト配列 → HTTP レスポンス

非同期: POST /api/v2/pdf-jobs (+/batch) → ジョブ状態ポーリング → 結果取得

クライアントサイド PDF (フォールバック)
    ページ DOM → html2canvas → Canvas → jsPDF.addImage → .pdf
```

---

## 6. 認証アーキテクチャ

```
クライアント                    サーバー
    │                              │
    │ GET /api/v1/auth/me          │ checkAuth() on mount
    │ ────────────────────────────►│
    │◄──── 200 { anonymous: true } │ セッションなし
    │                              │
    │ LoginModal 表示              │
    │                              │
    │ POST /api/v1/auth/login      │
    │ { userId, password }         │
    │ ────────────────────────────►│
    │                              │ BCrypt 検証
    │                              │ セッション生成 (UUID)
    │                              │ ConcurrentHashMap に保存
    │◄──── 200 { userId, roles }   │
    │      Set-Cookie: session_id  │ HttpOnly, SameSite=Lax, 24h TTL
    │                              │
    │ fetchTenantInfo()            │ (authSlice.loginUser 後に呼び出し)
    │ GET /api/v2/tenant           │
    │ ────────────────────────────►│
    │◄──── 200 { companyName, ... }│
    │                              │
    │ 以降のリクエスト              │
    │ Cookie: session_id=xxx       │ セッション検証 → Principal 取得
    │ ────────────────────────────►│
```

**セキュリティ:**
- パスワード: BCrypt (cost 12)
- セッション: HttpOnly Cookie (JavaScript から読めない)
- CSRF 対策: SameSite=Lax + Origin ヘッダー検証（状態変更メソッド）
- レートリミット: IP 単位で 5回/5分 (環境変数で調整可)
- タイミング攻撃対策: 存在しないユーザーでも BCrypt 検証実行
- **admin ロール強制**: `/api/v1/admin/*` は before-filter で admin ロールを要求
- **admin ブートストラップ**: 初回起動時に `ADMIN_PASSWORD` 環境変数（未設定時は既定値）で admin ユーザーを作成。**admin が既に存在する場合、環境変数が明示的に設定されているときのみパスワードをリセット**する（UI からの変更が再起動で巻き戻らない — 非破壊）

---

## 7. データベース設計

ScalarDB 3.14 を使用します。開発環境は SQLite、本番環境は任意の JDBC 対応 DB です。名前空間は `report_studio` です。

### テーブル構成

| テーブル名 | 用途 |
|-----------|------|
| `templates` | V1 テンプレート一覧メタデータ |
| `v2_definitions` | V2 テンプレート定義（エンベロープ形式の JSON） |
| `versions` | バージョン履歴スナップショット |
| `form_responses` / `v2_form_responses` | フォーム回答データ |
| `users` | ユーザーアカウント |
| `tenant` | テナント（組織）設定 |
| `jobs` | ジョブメタデータ（成果物はファイルシステム `data/jobs/`） |
| `schemas` / `schema_library` | データスキーマ・スキーマライブラリ |
| `binding_trees` | バインディングツリー |
| `products` | 商品マスタ |
| `sequences` | 採番設定 |
| `webhooks` | Webhook 設定 |

多くのテーブルは `JsonBlobRepository`（JSON ドキュメント永続化の共通実装）経由でアクセスされます。

### 設定ファイル

`server/scalardb.properties` に接続情報を記述します（gitignore 対象）。

```properties
# 開発 (SQLite)
scalar.db.storage=jdbc
scalar.db.contact_points=jdbc:sqlite:data/rds.db

# 本番 (PostgreSQL 例)
scalar.db.storage=jdbc
scalar.db.contact_points=jdbc:postgresql://localhost:5432/rds
scalar.db.username=rds_user
scalar.db.password=secret
```

---

## 8. API 設計方針

- **REST**: リソース中心の URL 設計
- **認証**: Cookie ベースセッション（Bearer トークン不使用）
- **バージョニング**: `/api/v1/` (認証・管理・V1 資産) と `/api/v2/` (テンプレート・PDF・ScalarDB 連携の現行 API)
- **テンプレート交換形式**: 正準エンベロープ `{ formatVersion: 2, definition }`（→ [template-envelope-spec.md](template-envelope-spec.md)）
- **エラー形式**: `{ "error": "メッセージ" }` で統一
- **コンテンツタイプ**: `application/json` (ファイルダウンロードは `application/pdf` 等)

エンドポイント一覧は [詳細設計書](detailed-design.md) の API 仕様を参照してください。

---

## 9. 非機能要件

### パフォーマンス

| 項目 | 設計値 |
|------|--------|
| JEXL 計算タイムアウト | 500ms |
| 最大計算式数/テンプレート | 50 式 |
| 最大計算式長 | 500 文字 |
| 最大ネスト深さ | 16 |
| Undo 履歴上限 | 50 段階 |
| LocalStorage 自動保存遅延 | 1 秒 |
| セッション有効期限 | 24 時間 |
| PDF ジョブ同時実行上限 | V1: 20 / V2: 10（→ [job-infrastructure.md](job-infrastructure.md)） |
| 押し下げ改ページ上限 | 100 継続ページ / バンドフロー上限 200 ページ |

### セキュリティ

- XSS: SVG サニタイズ（`script`, `on*`, `data:` URI フィルタリング）+ CSP レスポンスヘッダ
- インジェクション: JEXL サンドボックス — `JexlPermissions.ClassPermissions` によりホワイトリスト（`JexlFunctions` と数学関数）以外のクラスアクセスを全面禁止
- SSRF: `WebhookDispatcher` がプライベートアドレス等への送信をブロック + HMAC-SHA256 署名
- Webhook シークレット: `WEBHOOK_SECRET_KEY` 設定時は AES-256-GCM で暗号化保存（未設定時は平文保存 + 起動時警告）
- ジョブ認可: ジョブの状態参照・結果取得は投入者本人のみ
- 画像 XSS: 許可 URL スキーム (`data:image/png|jpeg|gif|webp`, `https://` のみ)
- ファイルサイズ制限: data URI 最大 2MB

公開前セキュリティ監査の結果と脆弱性対応は [docs/security-audit.md](security-audit.md)、報告窓口は `SECURITY.md` を参照。

### 可用性

- バックエンド未接続時もフロントエンドは動作（LocalStorage 保存 + クライアント PDF フォールバック）
- バックエンド接続状態を `useConnectionState` フックで監視・UI 表示
- ジョブは ScalarDB 永続化により再起動後も orphan reconcile で整合（→ [job-infrastructure.md](job-infrastructure.md)）

---

## 10. 開発・リリース基盤

- **ライセンス**: Apache License 2.0（依存ライセンス監査: [docs/license-audit.md](license-audit.md)）
- **CI**: GitHub Actions（`.github/workflows/ci.yml`）— フロントエンド lint/型チェック/Vitest 3、バックエンド JUnit
- **テスト**: フロント Vitest 3（カバレッジ閾値 80%）、バックエンド JUnit 5 + Mockito（PDF はパースバックテストとゴールデンテンプレートテスト）

---

## 11. 拡張ポイント

### 新しい要素タイプの追加

1. `src/types/index.ts` に `ReportElement` の Union に新インターフェース追加
2. `src/elements/{type}/Renderer.tsx` 作成
3. `src/elements/{type}/PropertiesPanel.tsx` 作成
4. `src/components/canvas/ElementRenderer.tsx` に case 追加
5. `src/components/sidebar/PropertiesPanel.tsx` に case 追加
6. `src/lib/elementFactories.ts` にファクトリ関数追加
7. `src/components/sidebar/paletteData.tsx` にパレット項目追加
8. サーバ PDF 対応: `pdf/` にレンダラーを実装し `ElementPdfRendererRegistry` に登録（`V2ElementParityMatrixTest` がパリティを検証）

### 新しいカスタム関数 (JEXL) の追加

`server/src/main/java/com/report/server/JexlFunctions.java` にメソッドを追加します（`ExpressionEngine` はこのクラスをホワイトリストとして許可）。

### エンベロープの formatVersion を上げる場合

[template-envelope-spec.md](template-envelope-spec.md) の「前方互換ポリシー」の手順に従ってください。
