# アーキテクチャ設計書

**システム名:** Report Design Studio V2  
**作成日:** 2026-04-12  
**対象バージョン:** main ブランチ

---

## 1. システム概要

Report Design Studio V2 は、帳票・フォームのビジュアルデザインと PDF 出力を提供する Web アプリケーションです。フロントエンド SPA と Java バックエンドで構成され、ScalarDB を介してデータ永続化を行います。

### 解決する課題

- コードを書かずに複雑な帳票（日本語専用要素含む）を設計できる
- ScalarDB のテーブルデータを帳票に動的にバインドできる
- 計算・バリデーションルールを式で定義できる
- 公開フォームとして配布し、回答を収集・エクスポートできる

---

## 2. システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (http://localhost:5173)                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            React SPA (Vite + TypeScript)            │   │
│  │                                                     │   │
│  │  Toolbar ─── ReportCanvas ─── Sidebars             │   │
│  │                    │                               │   │
│  │             Zustand Store                          │   │
│  │   (layout / auth / tenant / schema / rules / ui)  │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │ REST API (fetch + cookie auth)    │
└─────────────────────────┼───────────────────────────────────┘
                          │ http://localhost:8080
┌─────────────────────────┴───────────────────────────────────┐
│  Java Backend (Javalin 6 / Java 21)                        │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   Auth   │  │ Template │  │  Eval /  │  │   PDF    │   │
│  │ Controller│  │   CRUD   │  │ Validate │  │  Export  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
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
| html2canvas + jsPDF | - | クライアントサイド PDF/PNG 出力 |
| Vitest | - | テストフレームワーク |

### 3.2 状態管理アーキテクチャ

単一の Zustand ストアに複数のスライスを合成します。

```
useReportStore (root store)
│
├── layoutSlice      — ReportDefinition（ページ・要素）+ 選択状態
├── historySlice     — Undo/Redo（ページスナップショット、50段階）
├── uiSlice          — プレビューモード・ズーム・グリッド・クリップボード
├── authSlice        — ログインユーザー・認証フロー
├── tenantSlice      — テナント情報（会社名・ロゴ等）
├── schemaSlice      — データスキーマ（マスタ/詳細グループ・フィールド）
├── rulesSlice       — 計算ルール・バリデーションルール
├── variantsSlice    — 出力バリアント・マスキングルール
├── responsesSlice   — フォーム回答データ
└── computedSlice    — 計算結果キャッシュ（バックエンド評価後）
```

**不変性の保証:** すべてのミューテーションは Immer の `produce` を経由します。コンポーネントが要素オブジェクトを直接変更することは禁止されています。

### 3.3 コンポーネント構成

```
App.tsx (ルートレイアウト)
├── Toolbar.tsx         — メニュー・保存・エクスポート・プレビュー切り替え
├── LeftSidebar
│   ├── ElementPalette  — 要素パレット（ドラッグ元）
│   ├── SchemaPanel     — データスキーマエディタ
│   ├── LayersPanel     — レイヤーツリー
│   ├── PagePanel       — ページ一覧
│   ├── ResponsesPanel  — フォーム回答
│   └── DataSourcePanel — テストデータ入力
├── ReportCanvas.tsx    — DnD コンテキスト・ページレンダリング
│   ├── SectionContainer — セクション（ヘッダー/ボディ/フッター）
│   ├── CanvasElement    — ドラッグ・リサイズ対応の要素ラッパー
│   └── ElementRenderer  — 型別レンダラーへのディスパッチ
├── RightSidebar
│   ├── PropertiesPanel  — 選択要素のプロパティエディタ
│   ├── VersionHistoryPanel — バージョン一覧
│   └── PageSettingsPanel — 用紙サイズ・余白設定
└── Modals
    ├── LoginModal
    ├── DataBindingModal
    ├── TemplateManagerModal
    ├── VariantsModal
    └── ServerSettingsModal
```

### 3.4 要素システム

各要素タイプは独立したディレクトリ (`src/elements/{type}/`) に実装されます。

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
│   └── BarcodeContent  — QR/バーコードレンダラー
├── hooks/
│   └── useDataResolver — フィールド解決 + フォーマット適用
└── panels/
    ├── TextStyleSection    — フォント・サイズ・色・配置
    ├── BorderSection       — ボーダー設定
    ├── DataBindingSection  — フィールドキー入力
    ├── FormatSection       — 数値・日付フォーマット
    └── FuriganaSection     — ふりがな設定
```

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
├── auth/
│   ├── AuthController.java     — ログイン・ログアウト・セッション管理
│   ├── UserRepository.java     — ユーザー CRUD
│   ├── UserRecord.java         — ユーザーエンティティ
│   ├── Principal.java          — 認証済み/匿名ユーザー
│   ├── FormSessionManager.java — フォームパスワード保護
│   └── RateLimiter.java        — 固定窓レートリミッタ
├── V2TemplateController.java   — テンプレート CRUD
├── V2VersionController.java    — バージョン管理
├── V2EvaluateController.java   — 計算式評価
├── V2BindingResolveController  — ScalarDB データ解決
├── V2ScalarDbCatalogController — ScalarDB カタログ取得
├── V2FormResponseController    — フォーム回答管理
├── V2TenantController.java     — テナント情報 CRUD
├── V2PdfCtrl.java              — 同期 PDF 生成
├── V2PdfJobCtrl.java           — 非同期 PDF ジョブ
├── AdminUserController.java    — ユーザー管理（管理者専用）
├── ExpressionEngine.java       — JEXL サンドボックス
├── CalculationEngine.java      — 計算ルール実行
├── ValidationEngine.java       — バリデーションルール実行
├── JexlFunctions.java          — 独自関数（sum, avg, formatDate 等）
├── PdfRenderer.java            — PDFBox 帳票描画
├── TemplateRepository.java     — テンプレート永続化
├── VersionRepository.java      — バージョン永続化
├── TenantRepository.java       — テナント情報永続化
└── AuditLog.java               — 監査ログ
```

### 4.3 リクエスト処理フロー

```
HTTP リクエスト
    │
    ▼
グローバル例外ハンドラ
    │
    ▼
セキュリティヘッダー付与 (X-Content-Type, X-Frame-Options 等)
    │
    ▼
CSRF Origin チェック (POST/PUT/DELETE)
    │
    ▼
認証解決 (session_id Cookie → Principal)
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

---

## 5. データフロー

### 5.1 データバインディングフロー

```
ユーザーがデータスキーマを定義 (SchemaPanel)
    │
    ▼
store.setSchema(schema)
    │
    ▼
テストデータ入力 (DataSourcePanel)
    │
    ▼
store.setTestData(data)
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

### 5.2 保存フロー

```
ユーザーが「保存」クリック
    │
    ├─[新規]─ SaveTemplateDialog (名前入力)
    │              │
    │          POST /api/v2/templates → { id }
    │              │
    │          store.setCurrentTemplateId(id)
    │
    └─[既存]─ PUT /api/v2/templates/{id}
                   │
               ScalarDB にテンプレート定義を保存

自動保存: 定義変更 → 1秒後 localStorage 保存 (rds-autosave)
```

### 5.3 PDF 出力フロー

```
クライアントサイド PDF (html2canvas + jsPDF)
    ページ DOM → html2canvas → Canvas → jsPDF.addImage → .pdf

サーバーサイド PDF (PDFBox)
POST /api/v2/pdf/generate
    │
    ▼
テンプレート定義 + データ受信
    │
    ▼
PdfRenderer (PDFBox)
    │  ┌─ テキスト要素: フォント・サイズ・配置
    │  ├─ 画像要素: 画像埋め込み
    │  ├─ 繰り返しバンド: データ行ループ
    │  └─ バーコード: ZXing でビットマップ生成
    │
    ▼
PDF バイト配列 → HTTP レスポンス
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
- CSRF 対策: SameSite=Lax + Origin ヘッダー検証
- レートリミット: IP 単位で 5回/5分 (環境変数で調整可)
- タイミング攻撃対策: 存在しないユーザーでも BCrypt 検証実行

---

## 7. データベース設計

ScalarDB 3.14 を使用します。開発環境は SQLite、本番環境は任意の JDBC 対応 DB です。

### テーブル構成

| テーブル名 | 用途 |
|-----------|------|
| `templates` | 帳票テンプレート定義 (JSON) |
| `versions` | バージョン履歴スナップショット |
| `form_responses` | フォーム回答データ |
| `users` | ユーザーアカウント |
| `tenant_info` | テナント（組織）設定 |

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
- **バージョニング**: `/api/v1/` (レガシー互換) と `/api/v2/` (現行)
- **エラー形式**: `{ "error": "メッセージ" }` で統一
- **コンテンツタイプ**: `application/json` (ファイルダウンロードは `application/pdf` 等)

詳細は [詳細設計書](detailed-design.md) の API 仕様を参照してください。

---

## 9. 非機能要件

### パフォーマンス

| 項目 | 設計値 |
|------|--------|
| JEXL 計算タイムアウト | 500ms |
| 最大計算式数/テンプレート | 50 式 |
| 最大計算式長 | 500 文字 |
| Undo 履歴上限 | 50 段階 |
| LocalStorage 自動保存遅延 | 1 秒 |
| セッション有効期限 | 24 時間 |
| セッション掃除間隔 | 30 分 |

### セキュリティ

- XSS: SVG サニタイズ（`script`, `on*`, `data:` URI フィルタリング）
- インジェクション: JEXL サンドボックス（Math 関数のみ許可）
- 画像 XSS: 許可 URL スキーム (`data:image/png|jpeg|gif|webp`, `https://` のみ)
- ファイルサイズ制限: data URI 最大 2MB

### 可用性

- バックエンド未接続時もフロントエンドは動作（LocalStorage 保存のみ）
- バックエンド接続状態を `useConnectionState` フックで監視・UI 表示

---

## 10. 拡張ポイント

### 新しい要素タイプの追加

1. `src/types/index.ts` に `ReportElement` の Union に新インターフェース追加
2. `src/elements/{type}/Renderer.tsx` 作成
3. `src/elements/{type}/PropertiesPanel.tsx` 作成
4. `src/components/canvas/ElementRenderer.tsx` に case 追加
5. `src/components/sidebar/PropertiesPanel.tsx` に case 追加
6. `src/lib/elementFactories.ts` にファクトリ関数追加
7. `src/components/sidebar/paletteData.tsx` にパレット項目追加

### 新しいカスタム関数 (JEXL) の追加

`server/src/main/java/com/report/server/JexlFunctions.java` にメソッドを追加し、`ExpressionEngine.java` で登録します。
