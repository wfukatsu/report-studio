# 詳細設計書

**システム名:** Report Design Studio V2  
**作成日:** 2026-04-12  
**最終更新:** 2026-07-17

> **2026-07-17 更新:** API サーフェスを現行実装（エンベロープ形式・バッチ PDF ジョブ・ScalarDB 行操作・管理 API 等）に追随し、型定義・ストアアクション・エクスポート形式・環境変数の記述を更新。

---

## 1. API 仕様

ベース URL: `http://localhost:8080`  
認証: Cookie `session_id` (HttpOnly, SameSite=Lax, 24時間TTL)  
コンテンツタイプ: `application/json`

認証・認可の原則:
- `/api/v1/public/*`・`/api/v1/auth/*`・health 以外の **全エンドポイントは認証必須**（before-filter で強制）
- `/api/v1/admin/*` は **admin ロール必須**（before-filter で強制。個別ハンドラのチェックに依存しない）
- 状態変更メソッド（POST/PUT/PATCH/DELETE）は **CSRF Origin 検証**の対象

テンプレートの入出力形式（正準エンベロープ `{ formatVersion: 2, definition }`）は
[template-envelope-spec.md](template-envelope-spec.md) が正。

---

### 1.1 認証 API

#### `GET /api/v1/auth/me`

現在のセッション状態を確認します。

**レスポンス (200):**
```json
{
  "userId": "admin",
  "displayName": "管理者",
  "roles": ["admin", "user"],
  "anonymous": false
}
```

未認証の場合:
```json
{ "anonymous": true, "roles": [], "userId": "anonymous", "displayName": "Anonymous User" }
```

---

#### `POST /api/v1/auth/login`

**リクエスト:**
```json
{ "userId": "admin", "password": "changeme" }
```

**レスポンス (200):** `Me` オブジェクト + `Set-Cookie: session_id=...`

**エラー:**
- `400` — `userId` または `password` が未指定
- `401` — 認証情報が不正
- `429` — レートリミット超過 (5回/5分)

**挙動仕様（意図的）:**
- **レート制限は IP 単位・固定ウィンドウ**で、**ログイン成功時に当該 IP のカウンタをリセット**する。
  したがって制限は失敗試行を対象とし、正規の繰り返しログイン（NAT/共有 IP 配下の複数ユーザー含む）を
  スロットリングしない。ただし既に 429 到達後は認証情報の検証前にブロックされるため、正しいパスワードでも
  ウィンドウ満了までは 429 のままとなる。
- **単一アクティブセッション方針**: ログイン成功時、同一ユーザーの既存セッションをすべて無効化する。
  これはセキュリティ優先の意図的仕様であり、**同一アカウントの多端末同時サインインは不可**（最後のログインが常に有効）。

---

#### `POST /api/v1/auth/logout`

セッションを無効化します。レスポンス: `200 {}`

---

#### `POST /api/v1/auth/change-profile`

**リクエスト:**
```json
{ "displayName": "新しい表示名" }
```

---

### 1.2 テンプレート API

#### `GET /api/v2/templates`

テンプレート一覧を返します。既定では自分がオーナーのテンプレートのみを返し、
`visibility` クエリパラメータ（`public` / `shared`）で公開範囲フィルタを切り替えます。

**レスポンス (200):**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "見積書",
      "createdAt": "2026-04-01T09:00:00Z",
      "updatedAt": "2026-07-17T10:00:00Z",
      "visibility": "private",
      "isOwner": true
    }
  ],
  "total": 5
}
```

---

#### `POST /api/v2/templates`

新規テンプレートを作成します。

**リクエスト:** 正準エンベロープ (JSON)

**レスポンス (201):**
```json
{ "id": "新しいUUID", "name": "テンプレート名" }
```

---

#### `GET /api/v2/templates/{id}`

テンプレートの完全定義を返します。

**レスポンス (200):** 正準エンベロープ（リソース表現 — `id`, `name`, `createdAt`, `updatedAt`, `visibility` 付き）

---

#### `PUT /api/v2/templates/{id}`

テンプレートを上書き保存します (完全置換)。

**リクエスト:** 正準エンベロープ（裸の `ReportDefinition` も非推奨形式として受理 — 旧クライアント互換）

保存前に `ReportDefinitionValidator` による構造バリデーション（上限値チェック）が実行されます。

**レスポンス (200):** 正準エンベロープ（リソース表現）

---

#### `DELETE /api/v2/templates/{id}`

テンプレートを削除します。

**レスポンス (204):** 本体なし

---

#### `POST /api/v2/templates/{id}/duplicate`

テンプレートを複製します。

**レスポンス (201):** `{ "id": "新しいUUID" }`

---

#### `POST /api/v2/templates/{id}/copy` / `PUT /api/v2/templates/{id}/visibility`

テンプレートのコピー作成と、公開範囲（visibility）の変更を行います。

---

#### `GET /api/v2/templates/{id}/export` / `POST /api/v2/templates/import`

エンベロープ形式でのエクスポート（`exportedAt` 付き）とインポート。
インポートは**正準エンベロープ必須**（裸の定義は 400）。

---

#### `GET /api/v2/templates/{id}/thumbnail`

テンプレートのサムネイル画像を返します。

---

### 1.3 バージョン API

#### `GET /api/v2/templates/{id}/versions`

**レスポンス (200):**
```json
{
  "versions": [
    { "versionId": "v1", "createdAt": "2026-04-12T10:00:00Z", "label": "手動保存" }
  ]
}
```

---

#### `POST /api/v2/templates/{id}/versions`

バージョンスナップショットを作成します。

**リクエスト:**
```json
{ "label": "v1.0 リリース前" }
```

---

#### `POST /api/v2/templates/{id}/versions/{vid}/restore`

指定バージョンに復元します。

**レスポンス (200):** 正準エンベロープ（`formatVersion` + `definition`）

---

### 1.4 評価・検証 API

#### `POST /api/v2/templates/{id}/evaluate`

計算ルールをテストデータで評価します。

**リクエスト:**
```json
{
  "testData": {
    "price": 1000,
    "qty": 5,
    "taxRate": 0.1
  }
}
```

**レスポンス (200):**
```json
{
  "results": {
    "subtotal": 5000,
    "tax": 500,
    "total": 5500
  },
  "errors": {}
}
```

---

#### `POST /api/v2/templates/{id}/validate`

バリデーションルールを評価します。

**レスポンス (200):**
```json
{
  "violations": [
    {
      "ruleKey": "required_name",
      "message": "名前は必須です",
      "severity": "error"
    }
  ]
}
```

---

### 1.5 フォーム回答 API

#### `POST /api/v2/templates/{id}/responses`

フォーム回答を送信します。

**リクエスト:**
```json
{
  "data": { "name": "田中太郎", "amount": 10000 },
  "formPassword": "optional-password"
}
```

**レスポンス (201):**
```json
{ "responseId": "uuid", "submittedAt": "2026-04-12T10:00:00Z" }
```

---

#### `GET /api/v2/templates/{id}/responses`

回答一覧を返します。

**レスポンス (200):**
```json
{
  "items": [
    {
      "responseId": "uuid",
      "submittedAt": "2026-04-12T10:00:00Z",
      "data": { "name": "田中太郎" }
    }
  ],
  "total": 10
}
```

---

#### `GET /api/v2/templates/{id}/responses/{rid}` / `DELETE ...`

個別回答の取得・削除。

---

#### `GET /api/v2/templates/{id}/responses/{rid}/pdf`

回答を PDF として出力します。

**レスポンス (200):** `Content-Type: application/pdf`

---

#### `GET /api/v2/templates/{id}/responses/export`

回答を一括エクスポートします。

**クエリパラメータ:** `format=pdf|excel`

**レスポンス (200):** PDF または Excel ファイル

---

### 1.6 PDF 生成 API

サーバ PDF は全 24 要素タイプの描画とページ分割に対応します（→ [pagination-spec.md](pagination-spec.md)）。

#### `POST /api/v2/pdf/generate`

テンプレート ID 不要のステートレス PDF 生成（デザイナーのエクスポートが使用する主経路）。

**リクエスト:**
```json
{
  "definition": { /* ReportDefinition */ },
  "data": { /* バインドデータ */ },
  "variantId": "optional-variant"
}
```

**レスポンス (200):** `Content-Type: application/pdf`

---

#### `POST /api/v2/templates/{id}/pdf`

保存済みテンプレートからの同期 PDF 生成。

---

#### `POST /api/v2/pdf-jobs`

非同期 PDF ジョブを開始します。ジョブは投入ユーザーを所有者として記録し、
状態参照・結果取得は**所有者のみ**に許可されます（Issue #58）。

**レスポンス (202):** `{ "jobId": "uuid", "status": "pending" }`

---

#### `GET /api/v2/pdf-jobs/{jobId}`

ジョブ状態を確認します。

**レスポンス (200):**
```json
{ "jobId": "uuid", "status": "completed", "progress": 100 }
```

`status`: `pending` | `processing` | `completed` | `failed` | `cancelled`
（統一ステータス語彙。V2 API は小文字表現 — → [job-infrastructure.md](job-infrastructure.md)）

---

#### `GET /api/v2/pdf-jobs/{jobId}/result`

完了した PDF をダウンロードします。

**レスポンス (200):** `Content-Type: application/pdf`

---

#### `POST /api/v2/pdf-jobs/batch` / `GET .../batch/{id}` / `GET .../batch/{id}/result`

複数レコードの一括 PDF 生成ジョブ。結果は ZIP でダウンロードします
（結果はヒープではなくファイルへストリーミング — → [job-infrastructure.md](job-infrastructure.md)）。

---

### 1.7 テナント情報 API

#### `GET /api/v2/tenant`

組織情報を返します。

**レスポンス (200):**
```json
{
  "companyName": "株式会社サンプル",
  "address": "東京都千代田区...",
  "phone": "03-0000-0000",
  "representative": "代表取締役 山田太郎",
  "logoDataUri": "data:image/png;base64,...",
  "customFields": {
    "field1": "カスタム値1"
  }
}
```

未設定の場合: `200 {}`

---

#### `PUT /api/v2/tenant`

組織情報を更新します。

**リクエスト:** テナント情報オブジェクト (部分更新可)

**レスポンス (200):** 更新後のテナント情報

---

### 1.8 ScalarDB 連携 API

#### `GET /api/v2/scalardb/catalog`

ScalarDB の名前空間・テーブル・カラム情報を返します。

**レスポンス (200):**
```json
{
  "namespaces": [
    {
      "name": "order_system",
      "tables": [
        {
          "name": "orders",
          "columns": [
            { "name": "order_id", "type": "TEXT", "isPartitionKey": true },
            { "name": "customer_name", "type": "TEXT", "isPartitionKey": false }
          ]
        }
      ]
    }
  ]
}
```

---

#### `POST /api/v2/scalardb/tables`

テーブルを作成します（データブラウザから利用）。

---

#### `GET/POST/PUT/DELETE /api/v2/scalardb/tables/{ns}/{table}/rows`

テーブル行のスキャン・挿入・更新・削除（データブラウザタブの行編集が使用）。

**行不在時のセマンティクス（意図的な非対称）:**
- `PUT`（更新）は書き込み前に読み取りを行い、対象行が存在しなければ **404** を返す（更新は既存行に対してのみ意味を持つ）。
- `DELETE` は**冪等**で、行の存在有無に関わらず **204** を返す。ScalarDB の `delete` は事前読み取りを要さず、
  冪等 delete は REST の標準セマンティクス（再実行で同一状態に収束）。**204 から事前の行存在を推論してはならない。**
- システム名前空間（`report_studio` / `scalardb` / `coordinator`）への書き込みは **403**。

---

#### `POST /api/v2/templates/{id}/resolve-bindings`

テンプレートのスキーマバインディングを ScalarDB データで解決して返します。

---

#### `POST /api/v2/schemas/infer`

サンプルデータからスキーマを推論します。

---

### 1.9 スキーマライブラリ API

#### `GET/POST /api/v2/schemas`, `GET/PUT/DELETE /api/v2/schemas/{id}`

再利用可能なデータスキーマの CRUD。旧パス `/api/v2/schema-library` は 301 リダイレクトされます。

---

### 1.10 管理 API (admin ロール専用)

`/api/v1/admin/*` 全体が before-filter で admin ロールを要求します。

#### `GET /api/v1/admin/users`

ユーザー一覧を返します。レスポンスにパスワードハッシュは含まれません。

---

#### `POST /api/v1/admin/users`

**リクエスト:**
```json
{
  "userId": "user1",
  "displayName": "ユーザー1",
  "password": "initial-password",
  "roles": ["user"]
}
```

---

#### `PUT /api/v1/admin/users/{id}`

ユーザー情報を更新します。`password` フィールドを含む場合はパスワードも変更されます。

---

#### `DELETE /api/v1/admin/users/{id}`

ユーザーを削除します。自分自身は削除できません。

---

#### `GET/PUT /api/v1/admin/server-config`, `POST .../server-config/test`, `POST /api/v1/admin/server/restart`

サーバー設定（ScalarDB 接続等）の取得・更新・接続テストと再起動（管理タブの「サーバー設定」が使用）。

---

#### `GET /api/v1/admin/health` / `GET /api/v1/admin/metrics`

運用可視性エンドポイント。詳細ヘルスチェック（ScalarDB 接続性・ジョブキュー滞留・ディスク残量、総合ステータス UP/DEGRADED/DOWN）と、プロセス累積メトリクス（PDF 生成件数/所要時間・ジョブ成功/失敗・レート制限発動数）。公開ライブネス（`GET /api/v1/health` / `GET /api/v2/health`）とは別に admin 専用で内部状態を開示します。詳細は [observability.md](observability.md)。

---

### 1.11 その他の API（V1 系）

| エンドポイント群 | 用途 |
|-----------------|------|
| `GET/POST/PATCH/DELETE /api/v1/templates*` | V1 テンプレート一覧・メタデータ（サムネイル `/thumbnail`、エクスポート/インポート/複製含む） |
| `GET/PUT /api/v1/templates/{id}/designer-projection` | デザイナープロジェクション |
| `GET/POST/PATCH/DELETE /api/v1/templates/{id}/versions*` | V1 バージョン管理 |
| `GET/PUT /api/v1/schemas/{id}`, `POST /api/v1/schemas` | V1 スキーマ |
| `GET/PUT /api/v1/binding-trees/{id}` | バインディングツリー |
| `GET/POST /api/v1/public/forms/{id}/*` | 公開フォーム（認証不要。verify / projection / submit） |
| `GET/POST/DELETE /api/v1/templates/{id}/responses*`, `/api/v1/responses/{id}` | V1 フォーム回答 |
| `POST/GET/DELETE /api/v1/jobs*` | V1 バッチジョブ（→ [job-infrastructure.md](job-infrastructure.md)） |
| `POST /api/v1/templates/{id}/pdf` | V1 PDF 生成 |
| `GET/PUT /api/v1/webhooks/{templateId}`, `POST .../test` | Webhook 設定（送信は SSRF ガード + HMAC-SHA256 署名付き） |
| `GET/PUT /api/v1/sequences/{templateId}` | 採番設定 |
| `GET/POST/PUT/DELETE /api/v1/products*`, `POST /api/v1/products/import` | 商品マスタ CRUD + CSV インポート |

---

## 2. 型定義

### 2.1 ReportDefinition

交換・永続化時は正準エンベロープ `{ formatVersion: 2, definition }` に包まれます
（旧 `$schema: "report-definition/v1"` マーカーは formatVersion 1 としてマイグレーションされる
— → [template-envelope-spec.md](template-envelope-spec.md)）。

```typescript
interface ReportDefinition {
  id: string
  metadata: {
    documentName: string
    category?: string
    tags?: string[]
    description?: string
    createdAt?: string
    updatedAt?: string
  }
  pageSettings: {
    width: number               // mm
    height: number              // mm
    marginTop: number           // mm
    marginRight: number         // mm
    marginBottom: number        // mm
    marginLeft: number          // mm
    backgroundColor?: string    // "#ffffff"
    clipToMargins?: boolean     // opt-in マージンクリッピング (→ pagination-spec.md)
  }
  defaultTextStyle: TextStyle
  templateVariables: TemplateVariable[]
  calculationRules: CalculationRule[]
  dataSources: DataSourceDefinition[]
  outputVariants: OutputVariant[]
  submissionModels: SubmissionModel[]
  validationRules: ValidationRule[]
  pages: PageDef[]
  schema?: SchemaDefinition
  masterHeader?: Section
  masterFooter?: Section
  formulaLanguage?: 'jexl' | 'formula-v1'
}
```

構造上限値（ページ数・要素数・文字列長など）は `schemas/report-definition-limits.json` が単一ソースで、フロント（Zod）とサーバ（`ReportDefinitionValidator`）の両方が参照します。

### 2.2 PageDef

```typescript
interface PageDef {
  id: string
  name: string
  background?: string           // CSS color
  sections: Section[]
  groups?: LayerGroup[]         // レイヤーグループ
  // 廃止: elements は page.sections[N].elements に配置すること
}
```

### 2.3 Section

```typescript
interface Section {
  id: string
  sectionType: 'header' | 'body' | 'footer' | 'custom'
  height: number                // mm
  elements: ReportElement[]
  label?: string                // sectionType === 'custom' の場合の表示名
}
```

### 2.4 TextStyle

```typescript
interface TextStyle {
  fontFamily?: string
  fontSize?: number             // pt
  bold?: boolean
  italic?: boolean
  underline?: boolean
  color?: string                // "#000000"
  backgroundColor?: string
  align?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  writingMode?: 'horizontal' | 'vertical'
  letterSpacing?: number        // px
  lineHeight?: number           // 倍率
  padding?: number              // mm
}
```

### 2.5 CalculationRule

```typescript
interface CalculationRule {
  id: string
  key: string                   // 一意キー（式内から参照可能）
  label: string
  expression: string            // JEXL 式
  resultType: 'number' | 'string' | 'boolean'
  onError: 'zero' | 'empty' | 'error_text'
  errorText?: string
}
```

### 2.6 ValidationRule

```typescript
interface ValidationRule {
  id: string
  key: string
  label: string
  expression: string            // JEXL 式（true で違反）
  message: string               // 違反時のメッセージ
  severity: 'error' | 'warning' | 'info'
}
```

### 2.7 SchemaDefinition

```typescript
interface SchemaDefinition {
  masterGroup: SchemaGroup
  detailGroups: SchemaGroup[]
}

interface SchemaGroup {
  id: string
  name: string
  label: string
  fields: SchemaField[]
  scalarDbBinding?: {
    namespace: string
    table: string
    partitionKeyField: string
  }
}

interface SchemaField {
  id: string
  key: string                   // フィールドキー（一意）
  label: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'array'
  required?: boolean
  scalarDbColumn?: string       // バインド先カラム名
}
```

### 2.8 OutputVariant

```typescript
interface OutputVariant {
  id: string
  name: string
  maskingRules: MaskingRule[]
}

interface MaskingRule {
  id: string
  fieldKey: string
  strategy: 'redact' | 'partial' | 'replace' | 'custom'
  replaceValue?: string
  keepFirst?: number            // strategy='partial' 時: 先頭N文字を残す
}
```

### 2.9 DisplayCondition

```typescript
interface DisplayCondition {
  operator: 'and' | 'or'
  conditions: SingleCondition[]
}

interface SingleCondition {
  fieldKey: string
  comparator:
    | 'eq' | 'neq'
    | 'gt' | 'gte' | 'lt' | 'lte'
    | 'contains'
    | 'empty' | 'not_empty'
  value?: string | number | boolean
}
```

---

## 3. 要素タイプ詳細

### 3.1 全要素タイプ一覧

| タイプ | カテゴリ | 説明 |
|--------|----------|------|
| `text` | テキスト系 | `{{token}}` 対応のテキスト。縦書き・ふりがな対応 |
| `dataField` | テキスト系 | 単一フィールドを解決してフォーマット表示 |
| `chart` | データ表示 | Recharts ラッパー (bar/line/pie/donut/scatter/area) |
| `repeatingBand` | 繰り返し要素 | 配列データを行として繰り返す帳票バンド |
| `repeatingList` | 繰り返し要素 | カード/ラベル形式のグリッドレイアウト |
| `formTable` | 帳票テーブル | 固定ヘッダー + データ行の複合表 |
| `shape` | 図形・画像 | 矩形・円・線 |
| `image` | 図形・画像 | 画像埋め込み (PNG/JPEG/WebP/GIF, Base64/HTTPS) |
| `barcode` | 図形・画像 | QR/CODE128/CODE39/JAN13 バーコード |
| `pageNumber` | 帳票共通 | 自動ページ番号 (カスタムフォーマット対応) |
| `currentDate` | 帳票共通 | 現在日付 (カスタムフォーマット対応) |
| `divider` | 帳票共通 | 区切り線 (水平/垂直、実線/破線/点線) |
| `manualEntry` | 記入欄 | 手書き入力欄 (グリッド/ライン表示) |
| `checkbox` | 記入欄 | チェックボックス (データバインディング対応) |
| `hanko` | 日本語帳票専用 | 印鑑 (丸/角/楕円、縦書き/横書き) |
| `approvalStampRow` | 日本語帳票専用 | 承認印欄の行 |
| `revenueStamp` | 日本語帳票専用 | 収入印紙欄 |
| `eraSelect` | 日本語帳票専用 | 元号選択 (令和/平成/昭和/大正) |
| `tenantCompanyName` | テナント情報 | 組織の会社名 |
| `tenantAddress` | テナント情報 | 組織の住所 |
| `tenantPhone` | テナント情報 | 組織の電話番号 |
| `tenantRepresentative` | テナント情報 | 組織の代表者名 |
| `tenantLogo` | テナント情報 | 組織のロゴ画像 |
| `tenantCustom` | テナント情報 | 組織のカスタムフィールド |

**廃止タイプ (自動変換):**
- `label` → `text` に自動変換 (ElementRenderer)
- `table` → `formTable` に移行を警告表示

**サーバ PDF パリティ:** 上記 24 タイプすべてがサーバ PDF（`ElementPdfRendererRegistry`）で描画可能です。パリティは `V2ElementParityMatrixTest` により保証されます（Issue #53）。

### 3.2 共通プロパティ (ElementBase)

```typescript
interface ElementBase {
  id: string                    // UUID
  type: string                  // 判別子
  x: number                     // mm (セクション左端から)
  y: number                     // mm (セクション上端から)
  width: number                 // mm
  height: number                // mm
  locked?: boolean              // ロック (移動・リサイズ不可)
  visible?: boolean             // 表示/非表示
  displayCondition?: DisplayCondition
  groupId?: string              // レイヤーグループ ID
  zIndex?: number               // 描画順序
  opacity?: number              // 0.0 - 1.0
  borderColor?: string
  borderWidth?: number          // mm
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none'
  borderRadius?: number         // mm
  backgroundColor?: string
  padding?: number              // mm
  shadow?: boolean
}
```

### 3.3 データバインディング対応要素の固有プロパティ

#### RepeatingBandElement

```typescript
interface RepeatingBandElement extends ElementBase {
  type: 'repeatingBand'
  dataSource: string            // 配列フィールドキー ("orders")
  columns: BandColumn[]
  showHeader: boolean
  showFooter: boolean
  headerHeight: number          // mm
  rowHeight: number             // mm
  footerHeight?: number         // mm
  alternateRowColor?: string
  maxRows?: number
  totals?: BandTotal[]
  groupBy?: string              // グループ集計フィールド
}

interface BandColumn {
  id: string
  fieldKey: string
  label: string
  width: number                 // mm
  format?: FormatConfig
  style?: Partial<TextStyle>
  align?: 'left' | 'center' | 'right'
}
```

#### FormTableElement

```typescript
interface FormTableElement extends ElementBase {
  type: 'formTable'
  columns: FormTableColumn[]
  fixedRows: FormTableRow[]     // 固定行（ヘッダー等）
  dataSource?: string           // 配列フィールドキー (省略可)
  maxDataRows?: number          // データ行の最大数
  rowHeight: number             // mm
  showBorders: boolean
  headerBackgroundColor?: string
}
```

#### ChartElement

```typescript
interface ChartElement extends ElementBase {
  type: 'chart'
  chartType: 'bar' | 'line' | 'pie' | 'donut' | 'scatter' | 'area'
  dataSource: string            // 配列フィールドキー
  xAxisKey: string              // X軸フィールド
  yAxisKeys: string[]           // Y軸フィールド（複数系列可）
  title?: string
  showLegend: boolean
  showGrid: boolean
  colors?: string[]             // 系列色
  xAxisLabel?: string
  yAxisLabel?: string
}
```

---

## 4. フォーマット設定

### 4.1 FormatConfig

```typescript
interface FormatConfig {
  type: 'number' | 'date' | 'currency' | 'percentage' | 'kanji' | 'custom'
  // type='number'
  decimalPlaces?: number
  thousandSeparator?: boolean
  // type='date'
  datePattern?: string          // "yyyy/MM/dd", "M月d日(E)" 等
  // type='currency'
  currencySymbol?: string       // "¥", "$"
  // type='kanji'
  kanjiStyle?: 'lowercase' | 'uppercase'  // 一二三 / 壱弐参
  // type='custom'
  customPattern?: string
  // 共通
  fallbackText?: string         // null/undefined 時の表示
  prefix?: string
  suffix?: string
}
```

### 4.2 数値フォーマット関数 (numberFormatter.ts)

```typescript
formatNumber(value: number, config: FormatConfig): string

// 例
formatNumber(12345.678, { type: 'number', decimalPlaces: 2, thousandSeparator: true })
// → "12,345.68"

formatNumber(1234567, { type: 'currency', currencySymbol: '¥', thousandSeparator: true })
// → "¥1,234,567"

formatNumber(123, { type: 'kanji', kanjiStyle: 'uppercase' })
// → "壱百弐拾参"
```

---

## 5. ストアアクション一覧

### 5.1 レイアウトスライスアクション

| アクション | 引数 | 説明 |
|-----------|------|------|
| `addPage` | `(name?)` | ページ追加 |
| `removePage` | `(pageId)` | ページ削除 |
| `renamePage` | `(pageId, name)` | ページ名変更 |
| `updatePageBackground` | `(pageId, background)` | ページ背景色変更 |
| `updateSectionHeight` | `(pageId, sectionId, heightMm)` | セクション高さ変更 |
| `addElement` | `(pageId, element, sectionId?)` | 要素追加 (→ 履歴) |
| `updateElement` | `(pageId, elementId, patch)` | 要素更新 (→ 履歴) |
| `moveElement` | `(pageId, elementId, pos)` | 要素移動 (履歴なし) |
| `resizeElement` | `(pageId, elementId, size)` | 要素リサイズ (履歴なし) |
| `removeElement` | `(pageId, elementId)` | 要素削除 (→ 履歴) |
| `duplicateElement` | `(pageId, elementId)` | 要素複製 (→ 履歴) |
| `selectElement` | `(elementId, multi?)` | 要素選択 |
| `selectAll` / `clearSelection` / `setSelectionIds` | | 全選択 / 選択解除 / 選択 ID 設定 |
| `setActivePage` | `(pageId)` | アクティブページ変更 |
| `alignElements` | `(pageId, ids, type)` | 要素整列 |
| `groupSelectedElements` | `(pageId, name)` | グループ化 |
| `leaveGroup` | `(pageId, elementId)` | グループから離脱 |
| `addLayerGroup` / `removeLayerGroup` / `updateLayerGroup` | | レイヤーグループ操作 |
| `reorderElements` | `(pageId, sectionId, orderedIds)` | 要素の並び替え |
| `setZOrder` | `(pageId, elementId, action)` | 前後順序変更 |
| `setDataSource` / `updateTestData` | | テストデータ設定 / 個別値更新 |
| `loadReport` / `loadLegacyReport` | `(definition)` | テンプレート読み込み（旧形式は変換） |
| `newReport` | `()` | 新規レポート作成 |
| `exportReportJSON` / `importReportJSON` | | JSON 入出力（エンベロープ形式） |
| `updateSettings` | `(settings)` | 用紙設定変更 |
| `updateMetadata` / `setReportName` / `updateDefaultTextStyle` | | メタデータ・既定スタイル |
| `setMasterHeader` / `setMasterFooter` | `(section \| null)` | マスターヘッダー/フッター設定 |

### 5.2 UI スライスアクション

| アクション | 説明 |
|-----------|------|
| `setActiveTab(tab)` | トップナビのタブ切り替え (`design`/`binding`/`templates`/`responses`/`databrowser`/`admin`) |
| `setPreviewMode(bool)` | プレビューモード切り替え |
| `setZoom` / `setEditorZoom` / `setPreviewZoom` | ズーム設定 |
| `toggleGrid()` / `toggleSnapToGrid()` | グリッド表示 / スナップ切り替え |
| `toggleTrimMarks()` / `toggleMarginGuide()` | トンボ / 余白ガイド切り替え |
| `toggleHeaderEditMode()` / `setHeaderEditMode(bool)` | H/F 編集モード |
| `toggleLivePreview()` / `setLivePreviewEnabled(bool)` | ライブプレビューパネル |
| `setCurrentTemplateId(id?)` | 現在のテンプレート ID |
| `setBackendConnected(bool)` | バックエンド接続状態 |
| `setLoadState` / `setSaveState` | ロード・保存状態表示 |

### 5.3 クリップボードスライスアクション

| アクション | 説明 |
|-----------|------|
| `copyElements(pageId, elementIds)` | クリップボードにコピー |
| `cutElements(pageId, elementIds)` | 切り取り |
| `pasteElements(pageId)` | 貼り付け |
| `copyStyle(pageId, elementId)` / `pasteStyle(pageId, elementIds)` | スタイルのコピー/貼り付け |

### 5.4 認証スライスアクション

| アクション | 説明 |
|-----------|------|
| `checkAuth()` | マウント時セッション確認 |
| `loginUser(userId, password)` | ログイン (→ fetchTenantInfo) |
| `logoutUser()` | ログアウト (LocalStorage クリア) |

### 5.5 計算・バリデーションスライスアクション

| アクション | 説明 |
|-----------|------|
| `addCalculationRule(rule)` | 計算ルール追加 |
| `updateCalculationRule(key, patch)` | 計算ルール更新 (key で特定) |
| `removeCalculationRule(key)` | 計算ルール削除 |
| `addValidationRule(rule)` | バリデーションルール追加 |
| `updateValidationRule(id, patch)` | バリデーションルール更新 |
| `removeValidationRule(id)` | バリデーションルール削除 |

バックエンド評価の結果は `computedSlice` の `setComputedResults` / `setComputedViolations` に格納されます。

---

## 6. キーボードショートカット

| ショートカット | 動作 |
|---------------|------|
| `⌘Z` / `Ctrl+Z` | Undo |
| `⌘⇧Z` / `Ctrl+Shift+Z` | Redo |
| `⌘C` / `Ctrl+C` | コピー |
| `⌘X` / `Ctrl+X` | 切り取り |
| `⌘V` / `Ctrl+V` | 貼り付け |
| `⌘D` / `Ctrl+D` | 複製 |
| `Delete` / `Backspace` | 削除 |
| `Escape` | 選択解除 / モーダルを閉じる |
| `⌘+` / `Ctrl+=` | ズームイン |
| `⌘-` / `Ctrl+-` | ズームアウト |
| `⌘0` / `Ctrl+0` | ズームリセット |
| `⌘S` / `Ctrl+S` | 保存 |
| `⌘⇧S` / `Ctrl+Shift+S` | 名前を付けて保存 |
| `Tab` | 次の要素を選択 |
| `⇧Tab` | 前の要素を選択 |

---

## 7. ファイルインポート/エクスポート形式

### JSON エクスポート形式（正準エンベロープ）

```json
{
  "formatVersion": 2,
  "exportedAt": "2026-07-17T10:00:00.000Z",
  "definition": {
    "id": "uuid",
    "metadata": { ... },
    "pageSettings": { ... },
    "pages": [ ... ],
    "schema": { ... },
    "calculationRules": [ ... ],
    "validationRules": [ ... ]
  }
}
```

詳細（文脈ごとの拡張フィールド・前方互換ポリシー）は [template-envelope-spec.md](template-envelope-spec.md) を参照。

### インポート

`importFromJSON(json)` が `detectFormatVersion()` で形式を判別し、マイグレーションラダー
（v0 旧 `Report` → v1 裸の定義 → v2 エンベロープ）を一段ずつ適用した後、
Zod バリデーションと内容正規化を行います:
- `page.elements` (旧) → `page.sections[0].elements` (新) に自動移行
- `label` タイプ → `text` タイプに自動変換
- `table` タイプ → `formTable` に警告付きで変換
- `formatVersion` が現行値より大きいファイルは常に拒否（部分読み込みしない）

---

## 8. エラーコード一覧

### HTTP ステータスコード

| コード | 意味 |
|--------|------|
| `200` | 成功 |
| `201` | 作成成功 |
| `204` | 成功 (本体なし) |
| `400` | リクエスト不正 |
| `401` | 認証が必要 |
| `403` | アクセス権限なし |
| `404` | リソースが見つからない |
| `409` | 競合 (重複 ID 等) |
| `429` | レートリミット超過 |
| `500` | サーバー内部エラー |

### エラーレスポンス形式

```json
{ "error": "エラーメッセージ (日本語)" }
```

---

## 9. テスト設定

### フロントエンド (Vitest)

```typescript
// vitest.config.ts
{
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
    }
  }
}
```

### バックエンド (JUnit 5)

```java
// gradle test コマンドで実行
// SQLite インメモリ DB を使用したインテグレーションテスト
@Test
void givenValidCredentials_whenLogin_thenReturnsSession() {
    // ...
}
```

---

## 10. 開発環境セットアップ手順

### 必要条件

- Node.js 20 以上
- Java 21 以上  
- npm 10 以上

### 手順

```bash
# 1. リポジトリクローン
git clone <repository-url>
cd report-design-studio-v2

# 2. フロントエンド依存関係インストール
npm install

# 3. バックエンド設定ファイル作成
cp server/scalardb.properties.example server/scalardb.properties
# → 必要に応じて DB 接続情報を編集

# 4. 起動
npm run dev:full
# → フロントエンド: http://localhost:5173
# → バックエンド:   http://localhost:8080

# 5. ブラウザでアクセス
# → http://localhost:5173
# → admin / changeme (初期値) でログイン
```

> **JDK バージョン:** バックエンドの Gradle は Java 21 toolchain を要求します。
> デフォルトの `java` が 21 以外の場合は `JAVA_HOME` を JDK 21 に向けてください。

### 環境変数設定 (本番/テスト用)

```bash
# バックエンド
export ADMIN_PASSWORD="secure-password"
export LOGIN_RATE_LIMIT_MAX=100          # テスト時は上限を緩和
export LOGIN_RATE_LIMIT_WINDOW_MS=60000  # 1分窓に短縮
export ALLOWED_ORIGIN="https://example.com"  # 本番オリジン (CSRF/CORS 許可)
```

**`ADMIN_PASSWORD` の挙動（非破壊）:**
- admin ユーザーが存在しない場合: `ADMIN_PASSWORD`（未設定時は既定値 `changeme`）で作成
- admin が既に存在する場合: `ADMIN_PASSWORD` が**明示的に設定されているときだけ**その値にリセット（ロックアウト復旧用）。未設定なら変更しない — UI からのパスワード変更が再起動で巻き戻ることはありません

### CI

GitHub Actions（`.github/workflows/ci.yml`）が push / PR ごとにフロントエンド（lint・型チェック・Vitest 3）とバックエンド（JUnit）のテストを実行します。
