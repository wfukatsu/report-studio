# システムアーキテクチャ

Report Studio の全体構成・データフロー・認証・データ層・API・非機能要件を説明します。実装の内部設計は [設計（デザイン）](./design.md) を参照してください。

## 1. システム概要

Report Studio は、日本のビジネス帳票に特化したビジュアル帳票デザイナー + 帳票エンジンです。

| 特性 | 内容 |
|------|------|
| アプリ形態 | シングルページアプリケーション（SPA）+ REST API バックエンド |
| フロントエンド | Vite 6 + React 19 + TypeScript 5.7（Zustand で状態管理） |
| バックエンド | Java 21 + Javalin 7（仮想スレッド活用） |
| データストア | ScalarDB 3.14.4 → SQLite（開発）/ 任意の JDBC（本番） |
| 帳票エンジン | Apache PDFBox 3.0.8（和文フォント埋め込み・ページ分割） |
| 式エンジン | Apache Commons JEXL 3.7.0（サンドボックス） |
| 主な用途 | 見積書・請求書・発注書・納品書・領収書などの帳票、公開フォームによる回答収集 |

設計思想:

- **1 テンプレート → 複数出力**: 同一テンプレートから、宛先ごとに項目をマスキングした PDF（出力バリアント）を生成できます。
- **設計時と出力時の値の一致**: デザイナーもプレビューも同じデータに対して解決されるため、フィールドの値は一致し、差異は表現（プレースホルダー抑制など）のみです。
- **サーバーサイド PDF が本番出力**: ブラウザ内のプレビュー用ラスタライズ出力とは別に、サーバー側でベクター PDF を正確なページ分割・和文フォント埋め込みで生成します。

## 2. システム構成図

```
┌──────────────────────────────────────────────────────────────┐
│ ブラウザ（React SPA）                                          │
│  ┌───────────┬───────────┬───────────┬───────────┬─────────┐ │
│  │ デザイン   │ バインド   │ テンプレ   │ 回答       │ データ   │ │
│  │ (編集)     │ (結線)     │ 管理       │            │ブラウザ  │ │
│  └───────────┴───────────┴───────────┴───────────┴─────────┘ │
│  Zustand ストア（13 スライス） / html2canvas + jsPDF（画像出力）│
└──────────────────────────┬───────────────────────────────────┘
                           │ REST /api/v2/*, /api/v1/*（Cookie セッション）
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ Java / Javalin バックエンド                                    │
│  ApiRoutes（ルーティング + ミドルウェア）                       │
│   ├─ 認証 / CSRF / セキュリティヘッダ / レート制限              │
│   ├─ Controller 群（V1 / V2）                                  │
│   ├─ エンジン: ExpressionEngine(JEXL) / CalculationEngine /    │
│   │            ConditionEvaluator / ValidationEngine           │
│   ├─ PDF: PdfRenderer + 要素/セクションレンダラ + FontProvider │
│   └─ ジョブ基盤: BatchPdfProcessor / JobStore（仮想スレッド）  │
└──────────────────────────┬───────────────────────────────────┘
                           │ ScalarDB Transaction API
                           ▼
┌──────────────────────────────────────────────────────────────┐
│ ScalarDB 3.14.4                                                │
│  名前空間 report_studio: v2_definitions / template_versions /  │
│   v2_form_responses / tenant / products / sequences /          │
│   webhooks / jobs / schemas / users ...                        │
│  データバインド用ユーザーテーブル（例: demo.*）                 │
│    → SQLite（開発） / 任意の JDBC（本番）                       │
└──────────────────────────────────────────────────────────────┘
```

Docker 構成では nginx が SPA を配信し `/api` を同一オリジンでバックエンドへプロキシします（[導入方法](./setup.md#構成) 参照）。

## 3. フロントエンドアーキテクチャ

詳細は [設計 › フロントエンド](./design.md#1-フロントエンド設計) を参照。要点:

- **ルーティング**（`src/main.tsx`）: `BrowserRouter` で `/`（`AppShell`）と `/data-browser`（コード分割された `DataBrowserPage`）の 2 ルート。
- **画面シェル**（`src/components/layout/AppShell.tsx`）: 上部タブ（デザイン / バインド / テンプレート管理 / 回答 / データブラウザ / 管理）。デザインタブは React の `<Activity>` でマウントを保持し、タブ切替でも編集状態を失いません。バックエンド健全性を 30 秒間隔でポーリングします。
- **状態管理**: 単一の Zustand ストアを 13 スライスで構成（immer ミドルウェア）。データブラウザは独立ストア（`dataBrowserStore`）で分離し、編集画面の再描画に影響しません。
- **要素システム**: `ReportElement` は `type` を判別子とする直和型（24 種）。各要素は `src/elements/{type}/` に Renderer と PropertiesPanel を持ち、共通部品（`_blocks/`）から合成します。
- **クライアント出力**: `html2canvas` + `jsPDF` によるプレビュー用の PNG/PDF 出力。本番品質の PDF はサーバー側で生成します。

## 4. バックエンドアーキテクチャ

- **フレームワーク**: Javalin 7。エントリポイントは `com.report.server.App`。起動時に `AppConfig` でポート解決・トランザクションファクトリ生成、`AppWiring` で依存を組み立て、`ApiRoutes.register` でルート登録します。
- **並行処理**: Java 21 の仮想スレッドを活用（`ExpressionEngine` の評価タイムアウト、`BatchPdfProcessor` の行並列レンダリングなど）。
- **ミドルウェアの層**（`ApiRoutes`）:
  1. グローバル例外ハンドラ（JSON エラー本文、スタックトレースは返さない）
  2. セキュリティレスポンスヘッダ（`X-Content-Type-Options` / `X-Frame-Options: DENY` / `Referrer-Policy` / CSP、PDF・ZIP は `no-store`）
  3. CSRF Origin チェック（状態変更メソッドに対し、許可オリジン以外を拒否）
  4. 認証フィルタ（`/api/v1/public/*`・`/api/v1/auth/*`・ヘルスチェックは免除、それ以外は 401）
  5. 管理者ロールフィルタ（`/api/v1/admin/*` は `admin` ロール必須、なければ 403）
- **エンジン群**（詳細は [設計 › バックエンド](./design.md#5-バックエンドの内部設計)）:
  - `ExpressionEngine` — JEXL サンドボックス。許可リスト方式・式長/ネスト深さ/本数の上限・評価あたり 500ms タイムアウト。
  - `CalculationEngine` — 計算ルールを依存グラフからトポロジカル順（Kahn 法）で評価。循環は 422。丸めは BigDecimal。
  - `ConditionEvaluator` — 要素の条件表示ルールを評価（PDF レンダリング時の表示可否）。
  - `ValidationEngine` — 入力制約のサーバー側検証（RE2J による ReDoS 安全な正規表現）。
- **PDF レンダリング**: `PdfRenderer`（PDFBox）が要素レンダラレジストリ（`ElementPdfRendererRegistry`）とセクションレンダラレジストリ（`SectionPdfRendererRegistry`）に委譲。`FontProvider` が CJK フォント（Noto Sans JP / Noto Serif JP）を埋め込みます。
- **ジョブ基盤**: 単一 PDF・バッチ PDF を非同期ジョブとして実行。`JobStore`（メタデータは ScalarDB、成果物はファイルシステム）で統一管理。

## 5. データフロー

### 設計 → 保存

```
デザイナーで編集
  → Zustand ストア（ReportDefinition）
  → 自動保存（localStorage、1 秒デバウンス、ユーザー別キー）
  → 「サーバーに保存」で POST/PUT /api/v2/templates
  → ScalarDB v2_definitions に JSON blob として保存
  → 5 分間隔で自動バージョン、明示的にもバージョン作成可能
```

### プレビュー / 出力

```
テンプレート + データ（サンプル / ScalarDB 実データ）
  → POST /api/v2/templates/{id}/evaluate（計算ルールを JEXL 評価）
  → プレビュー（readonly レンダリング）
  → 出力:
     ├─ クライアント: html2canvas + jsPDF（PNG / 簡易 PDF）
     └─ サーバー: POST /api/v2/pdf/generate または /templates/{id}/pdf
        → PdfRenderer が PDFBox でベクター PDF（ページ分割・フォント埋め込み）
```

### データバインド解決

```
スキーマグループ（tableMeta で ScalarDB テーブルに紐付け）
  → POST /api/v2/templates/{id}/resolve-bindings
  → ScalarDB から実行時に行データを取得（部分成功は HTTP 207）
  → {{fieldKey}} / データフィールドが実データに解決
```

### 回答収集 → バッチ PDF

```
公開フォーム or「回答を送信」
  → POST /api/v2/templates/{id}/responses（レート制限 5/60s）
  → ScalarDB v2_form_responses
  → ステータス管理（下書き→発行済→送付済→無効）
  → 複数選択して一括 PDF
     → POST /api/v2/pdf-jobs/batch（202）→ ポーリング → ZIP ダウンロード
```

## 6. 認証アーキテクチャ

- **方式**: セッションベース認証。`AuthController` がインメモリの `ConcurrentHashMap<sessionId, SessionEntry>` を保持（TTL 24 時間、30 分ごとにデーモン仮想スレッドが期限切れを掃除）。
- **パスワード**: bcrypt（コスト 12）でハッシュ化。ユーザー不在時も定数時間のダミー検証を行いタイミング攻撃を緩和。
- **レート制限**: ログインは IP 単位（既定 5 回 / 5 分、`LOGIN_RATE_LIMIT_*` で変更可）。成功でカウンタをリセット。
- **単一セッションポリシー**: ログイン時に同一ユーザーの過去セッションを全て無効化。
- **Cookie**: `session_id`（HttpOnly、SameSite=LAX、path `/api/`）。HTTPS の `ALLOWED_ORIGIN` または `COOKIE_SECURE=true` のとき `Secure` 属性付与。
- **ロール**: `Principal`（userId / displayName / roles）。`admin` ロールが管理系エンドポイントを制御。ユーザーは ScalarDB に永続化（`UserRepository`）し、起動時に既定アカウントを seed。
- **公開フォームセッション**: ログインとは別系統。`FormSessionManager` がパスワード保護フォームのセッションを管理（TTL 1 時間、32 バイトの `SecureRandom` トークン）。

## 7. データベース設計（ScalarDB）

すべてのアプリテーブルは名前空間 **`report_studio`** に作成されます。ほとんどのエンティティは汎用の `JsonBlobRepository`（`id`（パーティションキー）/ `json_data` / `updated_at` / `group_key`（副次索引））に JSON blob として格納されます。

| 用途 | 格納先 | 備考 |
|------|--------|------|
| V2 テンプレート（ReportDefinition） | `v2_definitions` | JSON blob |
| テンプレートバージョン | `template_versions` | 自動 30 / 手動 20 世代保持、自動間隔 5 分 |
| フォーム回答 | `v2_form_responses` | `submittedBy` はサーバー側で設定 |
| テナント設定 | `tenant` | 会社名・住所・電話・代表者名・ロゴなど（プロセス全体で単一ドキュメント） |
| 商品マスター | `products` | SKU・価格・税・カスタムフィールド |
| 採番シーケンス | `sequences` | `{{documentNumber}}` 用 |
| Webhook | `webhooks` | 署名シークレットは AES-256-GCM 暗号化（`WEBHOOK_SECRET_KEY`） |
| ジョブメタデータ | `jobs` | 成果物 PDF/ZIP はファイルシステム `data/jobs/{jobId}/` |
| スキーマ定義・ライブラリ | `schemas` / `schema_library` | |
| ユーザー | users テーブル | bcrypt ハッシュ |

> **V1 テンプレート索引の例外**: V1 のテンプレート一覧は ScalarDB ではなく JSON ファイル `data/templates.json` に保持します（ScalarDB のパーティションキーのみのテーブルでは索引用の全走査が非効率なため）。個々の投影は `ProjectionRepository`（ScalarDB）にあります。

### 環境ごとの構成

```properties
# 開発（SQLite）
scalar.db.storage=jdbc
scalar.db.contact_points=jdbc:sqlite:data/report-studio.db
scalar.db.transaction_manager=jdbc

# 本番（例: PostgreSQL）
scalar.db.storage=jdbc
scalar.db.contact_points=jdbc:postgresql://<host>:5432/<db>
scalar.db.username=<user>
scalar.db.password=<pass>
scalar.db.transaction_manager=jdbc
```

環境変数（`SCALARDB_*`）でのオーバーライドは [導入方法 › ScalarDB の設定](./setup.md#scalardb-の設定) を参照。

## 8. API 設計方針

- **機械可読仕様**: 全エンドポイントの OpenAPI 3.0 定義は [`docs/openapi.yaml`](./openapi.yaml)。`ApiRoutes.java` との経路一致は `OpenApiRouteParityTest` が CI で強制する（#225）。
- **バージョニング**: `/api/v2/*` が現行の主 API（ReportDefinition ベース）。`/api/v1/*` は未移行の周辺 API のみ（認証/PAT・admin・商品・ジョブ・Webhook・シーケンス・公開フォーム・binding-trees）。かつての投影ベース v1 デッドスタックは削除済み。
- **認証**: Cookie セッション。公開フォームとヘルスチェックのみ免除。
- **CSRF 防御**: 状態変更メソッドに Origin チェック。
- **エラー形式**: JSON。検証失敗は 422、レート制限超過は 429（`Retry-After` 付き）、権限不足は 403、未認証は 401。バインド解決の部分成功は 207。
- **主なエンドポイント群**（全一覧は [設計 › API リファレンス](./design.md#6-api-リファレンス概要)）:
  - テンプレート CRUD・複製・可視性・エクスポート/インポート
  - 評価/検証（`/evaluate`・`/validate`）
  - バージョン（一覧・作成・復元）
  - 回答（送信・一覧・エクスポート・ステータス変更・PDF）
  - PDF/Excel 生成（ステートレス・ジョブ・バッチ）
  - ScalarDB カタログ/スキャン/行操作・バインド解決
  - テナント・商品・Webhook・採番・スキーマ

## 9. 非機能要件

| 観点 | 対応 |
|------|------|
| セキュリティ | JEXL サンドボックス（許可リスト・上限・500ms タイムアウト）、RE2J による ReDoS 安全な正規表現、bcrypt、CSRF Origin チェック、CSP、SSRF 対策（画像取得は 10s タイムアウト・リダイレクト禁止・10MB 上限）、Webhook シークレット暗号化、CSV/Excel の数式インジェクション無害化 |
| 性能・スケール | PDF はページ逐次レンダリングでピークメモリを抑制、バッチは仮想スレッド + セマフォで並列度制御（`clamp(cores, 2..8)`）、ジョブは同時実行数上限（`MAX_ACTIVE_JOBS=20`、超過は 429） |
| 上限（乱用防止） | 式長 500 / ネスト深さ 16 / テンプレートあたり式 50、投影あたりテンプレート 20 / 物理ページ 2000、バッチ行数 10,000 |
| 可用性・回復 | 起動時に非終了ジョブを FAILED に整合化（`reconcileOrphans`）、TTL で期限切れジョブを掃除、保存は 3 回リトライ |
| 可観測性 | `Metrics.GLOBAL`（PDF レンダリング時間・ジョブ結果・レート制限トリップ）、監査ログ、管理 API（`/api/v1/admin/health`・`/metrics`）。詳細は [運用可視性](./observability.md) |

## 10. 開発・リリース基盤

- **CI**: GitHub Actions（`.github/workflows/ci.yml`）。frontend（lint + build + vitest）と backend（`./gradlew test`、ゴールデン PDF 回帰）の 2 ジョブ。
- **テスト**: フロントは Vitest、バックエンドは JUnit 5。カバレッジはラチェット閾値（`test:coverage`）。
- **スキーマ整合**: 構造上限は `schemas/report-definition-limits.json` を単一ソースとし、フロント/バック双方が参照。生成 JSON Schema とのドリフトはテストで検出。
- **コンテナ**: フロント/バックエンドの 2 イメージ + nginx リバースプロキシで単一オリジン配信。

## 11. 拡張ポイント

- **新しい要素タイプ**: 型定義 → Renderer/PropertiesPanel → `ElementRenderer` の分岐 → ファクトリ → パレット登録 → PDF 側の要素レンダラ。手順は [設計 › 要素タイプの追加](./design.md#4-要素タイプの追加手順)。
- **新しい計算/検証関数**: フロント（`functionCatalog.ts`）とバック（`JexlFunctions` + formula-v1 変換）を同期。
- **本番 DB の差し替え**: `scalardb.properties` / `SCALARDB_*` の変更のみで JDBC 互換 DB に移行可能。
- **出力形式の追加**: サーバー側レンダラ（PDF/Excel）に処理系を追加。
