# 設計（デザイン）

フロントエンド・バックエンドの内部設計、状態管理、要素システム、データバインディング、拡張手順をまとめます。全体像は [システムアーキテクチャ](./architecture.md)、操作方法は [ユーザー操作マニュアル](./user-manual.md) を参照してください。

## 1. フロントエンド設計

### 技術スタック

| 関心事 | ライブラリ | バージョン |
|--------|-----------|-----------|
| UI | react / react-dom | 19 |
| 状態管理 | zustand | 5（immer ミドルウェア） |
| ドラッグ&ドロップ | @dnd-kit/core / modifiers / sortable | 6 / 9 / 10 |
| グラフ | recharts | 3 |
| 画像/PDF 出力 | html2canvas / jspdf | 1 / 4 |
| スタイル | tailwindcss + Radix UI + lucide-react | 3.4 |
| ルーティング | react-router-dom | 7 |
| 式エンジン（クライアント） | @pawel-up/jexl | 4 |
| 数式エディタ | CodeMirror 6 | — |
| バリデーション | zod | 4 |
| バーコード/QR | react-barcode / qrcode.react | — |
| ビルド/テスト | Vite 8 / Vitest 4 / TypeScript 7（native tsc。lint 用に TS6 API を alias 併存） | — |
| コンポーネントカタログ | Storybook 8 | — |

### 画面構成

- **ルーティング**（`src/main.tsx`）: `/` → `AppShell`、`/data-browser` → 遅延読み込みの `DataBrowserPage`。
- **AppShell**（`src/components/layout/AppShell.tsx`）: 上部タブ（デザイン / バインド / テンプレート管理 / 回答 / データブラウザ / 管理）。デザインタブは `<Activity>` でマウント保持。
- **デザインタブ**（`src/App.tsx`）: 3 ペイン構成。
  - 左サイドバー: 要素（パレット）/ レイヤー / ページ / スキーマ
  - 中央: `ReportCanvas`（編集）または `PreviewPane`（ライブプレビュー）
  - 右サイドバー: プロパティ / バージョン / ページ設定
  - 上部に `Toolbar`、下部に `EditorStatusBar`

### キャンバス編集

- **`ReportCanvas`**: `@dnd-kit` の `DndContext`（`PointerSensor` + `restrictToParentElement`）でドラッグを扱い、セクション単位に `SectionContainer` を描画。パレットドロップやスキーマフィールド/グループのドロップ（MIME `SCHEMA_FIELD_MIME` / `SCHEMA_GROUP_MIME`）でバインド済み要素を生成。mm↔px 変換（`mmToPx` / `pxToMm`）、グリッド/余白境界スナップ対応。
- **`CanvasElement`**: 絶対配置の要素ラッパー。`useDraggable` + 8 方向リサイズハンドル（コーナー 4 + 辺 4）。`data-element-id` / `data-element-type` を付与（エクスポート時に利用）。`ElementErrorBoundary` で要素単位のエラーを隔離。
- **FormTable のインタラクティブ編集**: ダブルクリックで専用エディタ（`FormTableEditor`）に進入。`useReducer`（`tableEditState`）+ 補助モジュール（`tableOperations` の行/列挿入・削除・リサイズ、`tableMerge` のセル結合/分割、`CellPopover` / `TableContextMenu` / `TableToolbar`）。テーブル専用 Undo スタック（グローバル履歴と分離、モード離脱時に 1 エントリに統合）。

### 設計モード vs プレビューモード

1 つの `readonly` プロップ（`ReportCanvas` → `SectionContainer` → `CanvasElement` → `ElementRenderer` に伝播）が全ての差異を駆動します。`uiSlice.previewMode` ではありません。

| | 設計モード（`readonly=false`） | プレビュー/出力（`readonly=true`） |
|---|---|---|
| 空バインド | プレースホルダー表示 | `isDataEmptyInPreview` が空要素を非表示 |
| 繰り返し要素（band/list/formTable） | デザインプレビュー（モック行・`{{fieldKey}}` セル・バッジ） | `dataSource` の実行時レコードを表示 |
| 自動/テナントフィールド | リテラルトークン/書式（`{{会社名}}`・`yyyy/MM/dd`） | 解決値（未設定時は `（…未設定）`） |
| サンプルヒント | データ駆動要素に点線下線・「サンプル」バッジ | なし（非破壊・出力に残らない） |

両モードとも同じ `data`（`dataOverride ?? livePreviewData ?? sampleData`）に対して解決するため、フィールドの値は一致します。

### 出力（`src/lib/exportUtils.ts`）

- **PNG**: `html2canvas`（`scale=2`）→ `toDataURL('image/png')` → ダウンロード。
- **PDF**: 各ページを **逐次** ラスタライズ（`Promise.all` を使わずピークメモリを抑制。20 ページ A4 で約 14MB vs 約 280MB）。`jsPDF` を先頭ページ寸法で生成し、ページごとの寸法で `addPage`（A4/A3・縦横混在に忠実）。描画後すぐキャンバスを解放。
- **自動フィールドの解決**: 出力時に `pageNumber` / `currentDate` の DOM テキストを要素モデルから計算した値に一時的に書き換え（`resolveAutoFields`）、`finally` で復元。
- **JSON エクスポート/インポート**: `formatVersion: 2` エンベロープでラップ（`JSON.parse(JSON.stringify(...))` で immer プロキシを除去）。画像ソースは `isSafeImageSrc` / `isSafeSvgDataUri` でサニタイズ（ラスタ ≤ 2MB、スクリプトなし SVG ≤ 512KB、https のみ）。

## 2. 状態管理（`src/store/`）

単一の Zustand ストアを 13 スライスで構成（`store/index.ts` で `create<StoreState>()(immer(...))`）。データブラウザは独立ストア。

| スライス | 責務 |
|---------|------|
| `layoutSlice` | `ReportDefinition`・ページ・セクション・要素・選択。要素 CRUD、z-order、整列、グループ化、セクション高さ調整、インポート/エクスポート、テンプレート読込 |
| `clipboardSlice` | クリップボード + スタイルクリップボード（コピー/カット/ペースト、スタイルのコピー/ペースト） |
| `rulesSlice` | 計算ルール・検証ルールの CRUD |
| `historySlice` | Undo/Redo。`{pages, schema, calculationRules, validationRules}` を JSON クローンでスナップショット（上限 30） |
| `uiSlice` | 表示状態: `activeTab`・`previewMode`・ズーム・グリッド/スナップ/トンボ/余白ガイド・`livePreviewEnabled`・`backendConnected`・`currentTemplateId`・保存/読込ステート |
| `computedSlice` | サーバー式評価の結果（`computedValues` / `computedErrors` / `computedViolations`）。undo 履歴外（undo 後の陳腐化を防ぐ） |
| `schemaSlice` | `SchemaDefinition` CRUD、3 フェーズ DB バインド、商品マスターのシステムグループ、`setElementSchemaBinding` |
| `variantsSlice` | `OutputVariant` CRUD、要素の非表示トグル、マスキングルール CRUD |
| `responsesSlice` | フォーム回答一覧（5 分 TTL キャッシュ）、送信モーダル状態、キャッシュ無効化 |
| `authSlice` | `currentUser`・認証状態、`checkAuth` / `loginUser` / `logoutUser` |
| `tenantSlice` | `tenantInfo`、取得/更新 |
| `productSlice` | 商品カタログ・カスタムフィールド定義、CRUD、操作ロック |
| `adminSlice` | 管理者ユーザー一覧・サーバー設定、取得/作成/削除・設定編集/保存 |

**主なセレクタ**（`selectors.ts`）:

- `flattenPageElements(page)` — セクションをまたいだ要素の平坦配列（`sections.flatMap(s => s.elements)`）。
- `selectActivePage` / `selectActivePageId` — アクティブページ（フォールバックは `pages[0]`）。
- `selectSelectedElements` — アクティブページ上の選択要素。
- `selectSchemaFieldKeyById(fieldId)` — UUID から `SchemaField.key` を逆引き（Phase 2 バインド用）。

**dataBrowserStore**（`dataBrowserStore.ts`）: `/data-browser` 専用の独立ストア。検索/ソート/ページングの状態がエディタを再描画しないよう分離。

## 3. 要素システム

### 要素タイプ（24 種）

`ReportElement` は `type` を判別子とする直和型。全要素が `ElementBase`（`id` / `type` / `position` / `size`（mm）/ `zIndex` / `locked` / `visible` / `name` / `conditionalDisplay` / `printable` / `schemaBinding`）を継承します。

| カテゴリ | 要素タイプ |
|---------|-----------|
| テキスト | `text` |
| データ表示 | `dataField`, `chart` |
| 繰り返し | `repeatingBand`, `repeatingList` |
| テーブル | `formTable` |
| 図形・画像 | `shape`, `image`, `barcode` |
| 記入・入力 | `manualEntry`, `checkbox`, `eraSelect` |
| 日本語帳票専用 | `hanko`, `approvalStampRow`, `revenueStamp` |
| 自動フィールド | `pageNumber`, `currentDate`, `divider` |
| テナント情報 | `tenantCompanyName`, `tenantAddress`, `tenantPhone`, `tenantRepresentative`, `tenantLogo`, `tenantCustom` |

> 廃止要素: `label` → `text` に統合、`table` → `formTable` に統合（ElementRenderer で自動変換）。

### 合成パターン（`src/elements/_blocks/`）

各要素は `src/elements/{type}/` に自己完結（`Renderer.tsx` / `PropertiesPanel.tsx` / `*.stories.tsx` / `*.test.tsx`）し、共通部品から合成します。

```
_blocks/
├── renderers/   ElementFrame（枠/背景/余白）, TextContent（縦書き・ふりがな）,
│                ChartContent, BarcodeContent, GridLines, ElementErrorBoundary
├── hooks/       useDataResolver（フィールド解決 + 書式適用）
└── panels/      DataBindingSection, TextStyleSection, ColorSection,
                 BorderSection, FormatSection, FuriganaSection
```

ディスパッチは中央集約（レジストリではなく）。`components/canvas/ElementRenderer.tsx` が `switch(element.type)` で各 Renderer に振り分け、末尾の `assertNever(element)` で網羅性を型で保証します（新要素の未配線をコンパイルエラーで検出）。

## 4. 要素タイプの追加手順

1. `src/types/index.ts` の `ElementType` 直和に文字列を追加し、`ElementBase` を継承する `XxxElement` インターフェースを定義、`ReportElement` 直和に追加。
2. `src/elements/xxx/Renderer.tsx` を作成（`_blocks/renderers/` から合成）。
3. `src/elements/xxx/PropertiesPanel.tsx` を作成（`_blocks/panels/` から合成）。
4. `ElementRenderer.tsx` に `import` と `case 'xxx':` を追加（`assertNever` が未配線を弾く）。
5. `lib/elementFactories.ts` にファクトリを追加。
6. `components/sidebar/ElementPalette.tsx`（`PALETTE_ITEM_MAP`）にパレット項目を登録。
7. サーバー側 PDF 出力が必要なら `com.report.server.pdf` に要素レンダラを追加し `ElementPdfRendererRegistry` に登録。

> テンプレート作成規約: 要素は必ず `page.sections[N].elements` に格納します。`Page.elements`（トップレベル）は `@deprecated` で、レンダラーに無視されます。

## 5. データバインディング

### `{{fieldKey}}` トークンとデータフィールド

- **`interpolate(template, data, pageContext?)`**（`lib/dataBinding.ts`）: `{{...}}` トークンをデータで置換。システム変数 `$page` / `$totalPages` / `$printDate` は `pageContext` から解決。
- **`resolveField(data, "a.b.c")`**: ドット記法でレコードを辿る。`FORBIDDEN_KEYS`（`__proto__` / `constructor` / `prototype`）でプロトタイプ汚染を防止。
- **`useDataResolver(fieldKey, data, {format, fallbackText})`**: フィールド解決 + 書式適用（`applyFormat`）を担うフック。`{resolved, raw, error}` を返し、空/エラー時は `fallbackText` にフォールバック。

### スキーマバインドの 3 フェーズ

| フェーズ | 内容 |
|---------|------|
| Phase 1（グループ → テーブル） | `SchemaGroup.tableMeta` で ScalarDB テーブルに紐付け。`SchemaField.dbColumnName` は列のヒント |
| Phase 2（フィールド → 列） | 要素はスキーマフィールドを **UUID** で参照（`ElementSchemaBinding.fieldId`）。key ではないためリネームで壊れない。`selectSchemaFieldKeyById` で現在の key を逆引き |
| Phase 3（計算フィールド） | `SchemaField.computed=true` + `expression`（JEXL）。同一グループの兄弟フィールドと組み込み関数（`sum`/`count`/`avg`/`min`/`max`/`round`/`concat`/`formatDate`/`formatNumber`/`ifExpr`）が文脈 |

> **2 階層制約**: スキーマは意図的に 2 階層（`SchemaGroup.dataKey` + `SchemaField.key`、例 `items.price`）。両セグメントは識別子文法 `^[a-zA-Z_][a-zA-Z0-9_]*$` を満たす必要があり、3 階層キー（`quotation.customer.name` 等）は DB バインド不可です。

> **Zod の重要な注意**: `src/lib/schemas/reportDefinition.ts` の `SchemaFieldSchema` / `SchemaGroupSchema` / `ScalarDbTableMetaSchema` は `dbColumnName` / `computed` / `expression` / `tableMeta` / `linkedMasterGroupId` を明示的に許可します（`.passthrough()` ではない）。スキーマバインド系のフィールドを追加したらここにも追加しないと、テンプレートインポート時に **無言で除去** されます。変更後は `npm run generate:schema` を実行してください。

## 6. API リファレンス（概要）

全ルートは `ApiRoutes.java` に登録。エラーレスポンスは全エンドポイント共通で
`{"error": <人間可読>, "code": <UPPER_SNAKE>, "correlationId": <id>}`（`ApiError`、#267）。
代表的なもの:

### 認証（`/api/v1/auth/*`）

| メソッド | パス | 用途 |
|---------|------|------|
| GET | `/api/v1/health` | 生存確認 |
| GET | `/api/v1/auth/me` | 現在のセッションユーザー |
| POST | `/api/v1/auth/login` | ログイン（`session_id` Cookie 発行） |
| POST | `/api/v1/auth/logout` | ログアウト |
| POST | `/api/v1/auth/change-profile` | 表示名/パスワード変更 |

### テンプレート（`/api/v2/templates`）

| メソッド | パス | 用途 |
|---------|------|------|
| GET / POST | `/api/v2/templates` | 一覧 / 作成 |
| GET / PUT / DELETE | `/api/v2/templates/{id}` | 取得 / 更新 / 削除 |
| POST | `/api/v2/templates/{id}/duplicate` `/copy` | 複製 / コピー |
| PUT | `/api/v2/templates/{id}/visibility` | 可視性変更 |
| POST | `/api/v2/templates/{id}/evaluate` `/validate` | 計算 / 検証の評価 |
| GET / POST | `/api/v2/templates/{id}/versions` | バージョン一覧 / 作成 |
| POST | `/api/v2/templates/{id}/versions/{vid}/restore` | バージョン復元 |
| GET | `/api/v2/templates/{id}/export` | エクスポート |
| POST | `/api/v2/templates/import` | インポート |
| POST | `/api/v2/templates/{id}/pdf` | テンプレート PDF 生成 |
| POST | `/api/v2/templates/{id}/resolve-bindings` | 実データ解決（部分成功は 207） |

### 回答（`/api/v2/templates/{id}/responses`）

| メソッド | パス | 用途 |
|---------|------|------|
| POST / GET | `.../responses` | 送信（5/60s）/ 一覧（ページング） |
| GET | `.../responses/export` | エクスポート（csv/excel、3/60s） |
| GET / DELETE | `.../responses/{rid}` | 取得 / 削除 |
| PATCH | `.../responses/{rid}/status` | ステータス変更 |
| GET | `.../responses/{rid}/pdf` | 回答票 PDF |

### 出力・ジョブ・データ

| メソッド | パス | 用途 |
|---------|------|------|
| POST | `/api/v2/pdf/generate` | ステートレス PDF（テンプレ + データ inline） |
| POST | `/api/v2/excel/generate` | ステートレス XLSX |
| POST / GET | `/api/v2/pdf-jobs` `/{jobId}` `/{jobId}/result` | 非同期 PDF ジョブ（202 → ポーリング → 取得） |
| POST / GET | `/api/v2/pdf-jobs/batch` `/{id}` `/{id}/result` | バッチ PDF（ZIP） |
| GET | `/api/v2/scalardb/catalog` | ScalarDB カタログ |
| POST | `/api/v2/scalardb/tables` | テーブル作成 |
| GET/POST/PUT/DELETE | `/api/v2/scalardb/tables/{ns}/{table}/rows` | 行のスキャン/挿入/upsert/削除 |
| GET / PUT | `/api/v2/tenant` | テナント設定の取得 / 更新 |

その他 V1 群: 管理（`/api/v1/admin/*`）、商品（`/api/v1/products/*`）、Webhook（`/api/v1/webhooks/*`）、採番（`/api/v1/sequences/*`）、公開フォーム（`/api/v1/public/forms/*`）、ジョブ（`/api/v1/jobs/*`）。

## 7. バックエンドの内部設計

### パッケージ構成

```
com.report.server                app 起動・ルーティング・エンジン・Controller・Repository
  App, AppConfig, AppWiring, ApiRoutes    起動・設定・DI 配線・ルート登録
  ExpressionEngine, JexlFunctions         JEXL サンドボックス + カスタム関数
  CalculationEngine, ConditionEvaluator, ValidationEngine
  PdfRenderer                             PDFBox レンダリングエンジン
  Repositories: JsonBlobRepository, ProjectionRepository, VersionRepository,
                TemplateListRepository（ファイルベース）
  Controllers                             各機能の HTTP ハンドラ（FormResponseController は
                                          ResponseStatusUpdater / IssuedDocumentQuery 等の
                                          package-private collaborators へ分割済み、#276）
  Support: ProjectionMerger, CsvDataSource, SecretCrypto, RequestValidator,
           ReportDefinitionValidator, Metrics, AuditLog, ApiError ...
  com.report.server.auth   AuthController, FormSessionManager, RateLimiter,
                           Principal, UserRepository, AdminUserController
  com.report.server.job    BatchPdfProcessor, JobController, JobRepository,
                           JobStore, JobConcurrencyLimiter, JobTtlReaper
  com.report.server.pdf    要素/セクションレンダラ（約 40 種）, FontProvider,
                           PdfUnits, RelativeLayoutResolver,
                           SectionRenderHelper（facade — PagePlanBuilder /
                           BandFlowPlanner / SectionGeometry 等へ分割済み、#276）...
resources/
  fonts/  NotoSansJP-Regular.ttf, NotoSansJP-Bold.ttf, NotoSerifJP-Regular.otf
  schemas/e-tax/  XML スキーマ
  logback.xml（LOG_LEVEL / LOG_FORMAT=json で挙動切替、#274）
  report-definition-limits.json（ビルド時に ../schemas からコピー）
```

### エンジンの要点

- **`ExpressionEngine`**: 共有スレッドセーフな `JexlEngine`。`JexlPermissions.ClassPermissions` で許可リスト方式（`JexlFunctions` と `java.lang.Math` のみ公開）。`strict(true)` / `silent(false)`。上限（式長 500 / ネスト深さ 16 / テンプレあたり 50）と評価あたり 500ms タイムアウト（仮想スレッド executor）。formula-v1（`SUM(`・`IF(`→`ifExpr(` 等）→ JEXL 変換層をフロント `functionCatalog.ts` と同期。`evaluate()` はフェイルセーフ（null/空→true・エラー→false）、`calculate()` は厳格（例外送出）。
- **`CalculationEngine`**: 計算ルールを依存グラフからトポロジカル順（Kahn 法、O(V+E)）で評価。循環/自己参照は `CircularDependencyException`（→ 422）。丸めは BigDecimal（`floor`/`ceil`/`round`/`half_up`/`half_even` + `roundingScale`）で double 演算を回避。
- **`ConditionEvaluator`**: 要素の `conditionalDisplay` を評価（`equals`/`contains`/`greater_than`/`empty` などの演算子 + `and`/`or`）。JEXL とは別の軽量 JSON 評価器。
- **`ValidationEngine`**: `FieldConstraint`（text: 必須・文字数・文字種・`inputPattern`（RE2J）、numeric: 範囲、date: ISO + 範囲、codeSet）を検証し `List<Violation>` を返す（→ 422）。

### PDF レンダリング

- **`PdfRenderer`**: mm を pt に変換（`PdfUnits.MM_TO_PT`）。`render(json)→byte[]` と `renderToStream`（バッチ向け、ヒープ回避）。上限（投影あたりテンプレ 20 / 物理ページ 2000）。
- **要素レンダラ**（`ElementPdfRendererRegistry`）: Text / Shape / Line / Barcode / QrCode / Image / Check / SealBox / Hanko / Divider / RevenueStamp / ApprovalStampRow / EraSelect / DataField / ManualEntry / Chart / Repeating* / Table / FormGrid / FormTable / StyledText（自動・テナント）など約 40 種。
- **セクションレンダラ**（`SectionPdfRendererRegistry`、`SectionPdfRenderer` インターフェース）: `PageBaseSectionRenderer` / `DetailTableSectionRenderer` / `FreeSectionRenderer` / `MultiRowTableSectionRenderer`。ページ分割の詳細は [ページ分割仕様](./pagination-spec.md)。
- **`FontProvider`**: CJK フォントを class 初期化時に 1 度ロードしバイト列を JVM レベルでキャッシュ。`PDType0Font` はサブセット化のためドキュメント単位に生成。CJK 不在時は Standard-14 Helvetica にフォールバック（`isSyntheticBold` で疑似ボールド）。
- **画像**（`ImagePdfRenderer`）: Base64 データ URI と HTTP/HTTPS URL 対応。SSRF 対策で 10s タイムアウト・リダイレクト禁止・10MB 上限。

### ジョブ基盤

- **`JobStore` / `JobRepository`**: メタデータは ScalarDB `report_studio.jobs`、成果物 PDF/ZIP はファイルシステム `data/jobs/{jobId}/`。起動時 `reconcileOrphans` で非終了ジョブを FAILED に整合、TTL リーパで掃除。
- **`BatchPdfProcessor`**: テンプレート投影から N 件の PDF を生成（行ごとにエラー隔離）。仮想スレッド + セマフォで並列度制御（`clamp(cores, 2..8)`）。進捗は 10 件ごとにチェックポイント、キャンセル可能、成果物を ZIP 化。
- **`JobController`**: `MAX_ACTIVE_JOBS=20`（超過は 429 + Retry-After）、`MAX_ROW_COUNT=10,000`。JSON または multipart CSV を受理。詳細は [ジョブ基盤](./job-infrastructure.md)。

## 8. 出力バリアント（項目マスキング）

`variantsSlice` が `OutputVariant[]` を保持。各バリアントは出力時に特定フィールドをマスク（`fullReplace` = 完全置換、`partial` = 先頭/末尾を残して伏せ字）し、`hiddenElementIds` で要素を非表示にできます。`lib/variantApplicator.ts` が選択バリアントに対する不変ページ配列を生成（このマスキングロジックはサーバー側 PDF 経路と共有）。用途: 1 つのテンプレートから宛先別 PDF を出力。
