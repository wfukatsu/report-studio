# Brainstorm: 不足機能4件の追加

**Date:** 2026-04-12
**Status:** Draft
**Feature:** 帳票一括生成・商品マスターCSVインポート・ドキュメント番号自動採番・Webhook通知

---

## What We're Building

4つの独立した機能を追加する。いずれも既存パターンの延長線上にあり、バックエンド・フロントエンドの両側で実装が必要。

---

## Feature 1: 帳票一括生成（バッチPDF）

### 概要

フォーム回答一覧から複数の回答を選択し、同一テンプレートに適用して複数PDFを一括生成する。生成物はZIPアーカイブとしてダウンロード可能にする。

### Key Decisions

**既存パターンの活用:**
- `POST /api/v2/pdf-jobs` — 既存の非同期PDFジョブエンドポイントを流用
- `V2PdfJobController.java` の ConcurrentHashMap ジョブキューに「バッチモード」を追加
- ExecutorService + CompletableFuture タイムアウト処理を踏襲

**API設計:**
```
POST /api/v2/pdf-jobs/batch
Body: { templateId, responseIds: string[], filenamePattern: "{{seq}}_{{submittedBy}}.pdf" }
→ 202 Accepted: { batchJobId, totalCount, statusUrl }

GET /api/v2/pdf-jobs/batch/{id}       → { status, completed, failed, total }
GET /api/v2/pdf-jobs/batch/{id}/result → ZIP binary (Content-Type: application/zip)
```

**UI設計:**
- フォーム回答パネルにチェックボックスを追加
- 「一括PDFダウンロード」ボタン → バッチジョブ投入 → **2秒ポーリング**で進捗表示 → ZIP自動ダウンロード
- 最大50件/バッチ（サーバー負荷制限）

**ファイル名パターン:**
- `{{seq}}` — 連番（1〜）
- `{{submittedBy}}` — 回答者ID
- `{{templateName}}` — テンプレート名
- `{{date}}` — 生成日時

### Out of Scope
- CSVデータからの一括生成（別機能）
- 100件超のバッチ（非同期キューのスケールアウト）

---

## Feature 2: 商品マスター CSVインポート

### 概要

CSVファイルを貼り付けまたはアップロードして商品を一括登録する。先頭行が列名として自動認識され、既知フィールド（code, name, unitPrice 等）は自動マッピング、未知列はカスタムフィールドに取り込む。

### Key Decisions

**既存パターンの活用:**
- `CsvDataSource.java` — RFC 4180 準拠パーサーがすでに存在
- `V2ResponseExportController.java` — formula injection エスケープパターン
- `ProductController.java` — 既存の商品登録ロジックを流用（コードユニーク検証を含む）

**列マッピング規則:**
| CSV列名 | マッピング先 |
|--------|-----------|
| `code` / `商品コード` | Product.code |
| `name` / `商品名` | Product.name |
| `unitPrice` / `単価` | Product.unitPrice |
| `category` / `カテゴリ` | Product.category |
| `taxType` | Product.taxType（`none`/`standard`/`reduced`）|
| `unit` / `単位` | Product.unit |
| `manufacturer` / `メーカー` | Product.manufacturer |
| その他 | customFields へ自動追加 |

**インポートAPI:**
```
POST /api/v1/products/import
Content-Type: multipart/form-data  (or application/json with csvText field)
Body: { csv: "code,name,unitPrice\nP001,商品A,1000\n..." }
→ 200: { imported: N, skipped: N, errors: [{row: 3, reason: "コード重複"}] }
```

**UI設計:**
- 商品マスタータブにCSVインポートモーダルを追加
- テキストエリアへの貼り付け OR ファイルアップロード
- プレビュー表示（最初の5行）→ 確認→インポート実行
- エラー一覧表示（スキップされた行の理由）

**バリデーション:**
- `code` 必須。既存 code と重複する場合はスキップ（上書きしない）
- `unitPrice` が数値でない場合はスキップ
- 最大1,000行/インポート

### Out of Scope
- 既存商品の更新（upsert）— YAGNI。初回インポートのみ

---

## Feature 3: ドキュメント番号の自動採番

### 概要

テンプレートごとに連番カウンターを持ち、帳票保存時にドキュメント番号を自動でインクリメントして挿入する。テンプレート変数の一種として実装する。

### Key Decisions

**設計方針:**
- 既存の `TemplateVariable` 機能を拡張。`type: "auto_sequence"` を追加
- カウンターはバックエンド管理（テンプレートIDに紐づく整数値をJSONBlob保存）
- フォーマットはユーザーが設定: `prefix + ゼロ埋め桁数 + suffix`
  - 例: `QUO-{{seq:4}}` → `QUO-0001`, `QUO-0002`
  - 例: `INV-{{year}}-{{seq:3}}` → `INV-2026-001`

**バックエンド:**
```
GET  /api/v1/sequences/{templateId}   → { current, prefix, suffix, digits, resetOn }
PUT  /api/v1/sequences/{templateId}   → 設定更新（prefix/suffix/digits）
POST /api/v1/sequences/{templateId}/next → { value: "QUO-0003" }（採番して+1）
POST /api/v1/sequences/{templateId}/reset → カウンターリセット（管理者のみ）
```

**帳票上での表示:**
- **`{{documentNumber}}` トークン**として既存のテキスト要素に記述する
- 既存のトークン置換機構（`{{fieldKey}}` 展開）をそのまま流用
- デザイン時はリテラル `{{documentNumber}}` が表示され、フォーム回答・PDF生成時に実際の番号に展開

**フォーム回答への統合（採番タイミング: フォーム送信時）:**
- `V2FormResponseController` の回答保存直後に `next` を呼び、シーケンス番号を回答メタデータ（`submissionModel`）に記録
- PDF生成時にメタデータから番号を取得し `{{documentNumber}}` を解決
- プレビューモードでは `{{documentNumber}}` はそのまま表示（採番しない）

**採番ルール:**
- テンプレートごとに独立（見積書テンプレートは1〜、請求書テンプレートは別途1〜）
- 年次リセット設定可能（`resetOn: "year"` → 毎年1月1日に1に戻る）
- **欠番は発生する**: フォーム送信時に採番するため、PDF生成失敗・回答削除時でも番号は消費済み

**UI設計:**
- **メタデータセクション**（PageSettingsPanel の折りたたみ済みメタデータ欄）に「採番設定」を追加
- プレフィックス/サフィックス/桁数の設定UI
- 「次の番号をプレビュー」ボタン

---

## Feature 4: Webhook 通知（フォーム回答受信時）

### 概要

テンプレートごとに Webhook URL を設定し、フォーム回答が送信されるたびに指定URLへHTTP POSTを送信する。Slack・Teams・外部システム連携に使用できる。

### Key Decisions

**既存パターンの活用:**
- `ImagePdfRenderer.java` の Java 11 `HttpClient` + SSRF 防止ロジックを流用
- `V2FormResponseController.java` の回答保存処理の直後に呼び出し

**Webhook 設定:**
- テンプレートごとに最大3件のURLを設定可能
- 設定場所: データ設定モーダル → 新規「Webhook」タブ
- ストレージ: `webhooks` 専用 `JsonBlobRepository` テーブル。`id = "webhook:{templateId}"` で singleton 保存（`tenantRepo` パターン踏襲）

**ペイロード（POST body）:**
```json
{
  "event": "form_response.received",
  "templateId": "xxx",
  "templateName": "見積依頼フォーム",
  "responseId": "yyy",
  "submittedAt": "2026-04-12T10:00:00Z",
  "submittedBy": "user@example.com",
  "summary": ["田中 一郎", "¥100,000"],
  "data": { ...フォーム回答データ... }
}
```

**セキュリティ:**
- SSRF 防止: プライベート IP・ループバック・クラウドメタデータ禁止（既存 `ImagePdfRenderer` のロジックを流用）
- 秘密鍵（`X-Webhook-Secret`ヘッダー）オプション設定
- タイムアウト: 5秒。失敗してもフォーム回答の保存は継続（非同期実行）
- リトライ: なし（シンプルに保つ）

**UI設計:**
- データ設定モーダルに「Webhook」タブを追加
- URL + 秘密鍵の入力フォーム（最大3件）
- 「テスト送信」ボタン（テスト用ダミーペイロードを送信）

---

## Resolved Questions

1. ~~一括生成のデータソース~~ → フォーム回答一覧
2. ~~採番スコープ~~ → テンプレートごとに独立
3. ~~Webhookトリガー~~ → フォーム回答受信時のみ
4. ~~CSV列マッピング~~ → 先頭行自動認識 + 未知列はcustomFields
5. ~~採番トリガー~~ → フォーム回答送信時に採番し回答メタデータに記録
6. ~~採番の帳票表示~~ → `{{documentNumber}}` トークン（既存テンプレート変数機構を流用）
7. ~~採番設定UI場所~~ → PageSettingsPanel のメタデータセクション

## Open Questions

（なし）

---

## Why This Approach

1. **既存パターン最大活用**: PDF非同期ジョブ・CSVパーサー・HTTPクライアントはすべて既存実装を流用
2. **独立した実装**: 4機能は相互依存なし。並行開発またはバック・フロント分担が可能
3. **フォーム回答中心**: 一括生成もWebhookもフォーム回答を軸にし、既存の `V2FormResponseController` の拡張として実装
4. **シンプルさ優先**: リトライなし・最大件数制限・upsertなし（YAGNI）

---

## Implementation Priority

1. **商品マスター CSV インポート** — 既約束のフェーズ2機能
2. **帳票一括生成** — 実務価値最大
3. **ドキュメント番号自動採番** — 見積書・請求書に必須
4. **Webhook通知** — 外部連携の第一歩

---

## Out of Scope (YAGNI)

- 既存商品のCSVアップデート（upsert）
- 100件超のバッチ
- Webhookリトライ
- メール送信（Webhook経由で代替可）
- 承認ワークフロー（別途設計が必要）
