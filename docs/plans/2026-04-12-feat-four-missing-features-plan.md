---
title: "feat: 不足機能4件追加 — バッチPDF・CSVインポート・自動採番・Webhook"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-missing-features-four-additions-brainstorm.md
---

# feat: 不足機能4件追加

## Enhancement Summary

**Deepened on:** 2026-04-13
**Research agents used:** security-sentinel, architecture-strategist, performance-oracle, julik-frontend-races-reviewer, data-integrity-guardian, code-simplicity-reviewer, learnings-researcher, best-practices-researcher

### 🔴 Critical Fixes Required Before Implementation

1. **[Feature 3] Sequence atomicity**: JsonBlobRepository は呼び出しごとに独立したトランザクションを開く。読み取り→インクリメント→書き込みを**単一の DistributedTransaction** で行わないと番号重複が発生する
2. **[Feature 3] OCC retry**: CommitConflictException をキャッチしてリトライ（3〜5回、バックオフ付き）が必須
3. **[Feature 4] Webhook executor 未定義**: `CompletableFuture.runAsync()` にエグゼキュータ未指定だと ForkJoinPool 共有になり PDF 生成スレッドを枯渇させる

### 🟡 Important Improvements

4. **[Feature 4] DNS リバインディング SSRF**: InetAddress は検証時に解決するが HTTP クライアントは送信時に再解決する。接続後の IP 検証が必要
5. **[Feature 4] シークレット平文保存**: AES-GCM 等でアプリレベル暗号化が必要
6. **[Feature 2] ZIP サイズ制限の強制**: 100MB 制限は `CountingOutputStream` で entry 書込前に判定する
7. **[Feature 3] 年次リセット**: cron ではなく「読み取り時チェック」（check-on-read）で実装する

### 🔵 Simplifications Applied

8. CSV プレビューを削除（インポート結果表示で十分）
9. バッチ PDF のファイル名変数を `{{seq}}` と `{{date}}` の2つに絞る
10. シーケンス `/reset` エンドポイントを v1 スコープ外へ
11. シーケンス「次の番号をプレビュー」ボタンを削除
12. Webhook URL の上限を 3 → **1** に絞る

---

## Overview

(see brainstorm: docs/brainstorms/2026-04-12-missing-features-four-additions-brainstorm.md)

4つの独立した機能を追加する。実装優先度順:

1. **商品マスター CSVインポート** — 確約済みフェーズ2機能
2. **帳票一括生成（バッチPDF）** — 実務価値最大
3. **ドキュメント番号自動採番** — 見積書・請求書に必須（アトミック設計に注意）
4. **Webhook通知** — 外部連携の第一歩

各機能は相互依存なし。並行開発可能。ただし Feature 3/4 は `V2FormResponseController.java` を共に変更するため順番実装推奨。

---

## Feature 1: 商品マスター CSVインポート

### Overview

CSVファイルを貼り付けまたはアップロードして商品を一括登録する。
先頭行を列名として自動認識し、既知フィールドは自動マッピング、未知列は `customFields` へ取り込む。

### Technical Approach

**Backend — 新規エンドポイント**

参考: `CsvDataSource.java`（RFC 4180パーサー）、`ProductController.create()`（コードユニーク検証）

```
POST /api/v1/products/import
Content-Type: application/json
Body: { "csv": "code,name,unitPrice\nP001,商品A,1000\n..." }

Response 200:
{
  "imported": 8,
  "skipped": 2,
  "errors": [
    { "row": 3, "column": "code", "value": "P001", "reason": "コード重複" },
    { "row": 7, "column": "unitPrice", "value": "abc", "reason": "数値ではありません" }
  ]
}
```

**列マッピング規則**

(see brainstorm: Feature 2 列マッピング規則テーブル)

| CSV列名 | マッピング先 |
|--------|-----------|
| `code` / `商品コード` | Product.code |
| `name` / `商品名` | Product.name |
| `unitPrice` / `単価` | Product.unitPrice |
| `category` / `カテゴリ` | Product.category |
| `taxType` | `none`/`standard`/`reduced` |
| `unit` / `単位` | Product.unit |
| `manufacturer` / `メーカー` | Product.manufacturer |
| その他 | `customFields[key]` に自動追加（最大50キー） |

**バリデーション・スキップ規則**

- `code` 欠落: 行をスキップ
- 既存 `code` と重複: スキップ（上書きしない — YAGNI upsert）
- `unitPrice` が数値でない: スキップ
- `customFields` キーに `__proto__` 等の予約語: 行全体をスキップ（`docs/solutions/security-issues/xss-prototype-pollution-image-validation.md` 適用）
- **customFields のキー数上限: 50キー**（メモリ濫用防止）
- 最大 1,000 行/インポート（超過時は 400 エラー）
- 空 CSV（ヘッダーのみ）: `{ imported: 0, skipped: 0, errors: [] }` を返す（正常終了）
- **ボディサイズ**: 既存の `AppConfig` 5MB 上限でカバー済み（1,000行 × 500B ≈ 500KB）

**エラーレスポンス形式**（best-practices-researcher 推奨）

エラーには `row`, `column`, `value`, `reason` を全て含める（どのセルが問題か即座に特定可能）。

**Frontend — CSVインポートモーダル**

~~プレビュー表示~~ → **削除**（code-simplicity-reviewer の提案）

配置: `ProductMasterTab.tsx` の「追加」ボタンの隣に「CSVインポート」ボタン

モーダル構成（簡素化後）:
1. テキストエリアへの貼り付け **または** ファイルアップロード（`<input type="file" accept=".csv">`）
2. 「インポート実行」ボタン（クリック後は即時 disabled — 2重送信防止）
3. 結果: 成功N件 / スキップN件 + エラー一覧（行番号・列名・値・理由）

**⚠️ 重要: 文字コード注意**（julik-frontend-races-reviewer 指摘）

JS の `FileReader` と Java の `InputStreamReader` は文字コード処理が異なる（Shift-JIS の CSV など）。フロントエンドは CSV を解析せず**生ファイルをそのまま送信**する。

**実装ファイル**

- `server/.../ProductController.java` — `importCsv()` メソッド追加
- `server/.../ApiRoutes.java` — `POST /api/v1/products/import` 追加
- `src/api/reportApi.ts` — `importProductsCsv()` 関数追加（Zod バリデーション付き）
- `src/components/modals/ProductCsvImportModal.tsx` — 新規モーダル
- `src/components/modals/ProductMasterTab.tsx` — ボタン追加

### Acceptance Criteria

- [ ] `POST /api/v1/products/import` で CSV テキストを受け取りインポート実行
- [ ] 先頭行を自動的に列名として認識
- [ ] 既知フィールドを自動マッピング、未知列を customFields に取り込む（最大50キー）
- [ ] コード重複・型エラーの行はスキップし、エラー詳細（row/column/value/reason）を返す
- [ ] 最大 1,000 行の制限。超過時は 400 を返す
- [ ] 空 CSV は正常終了（0件）
- [ ] インポート実行ボタンは送信中に即時 disabled（2重送信防止）
- [ ] `__proto__` 等のプロトタイプ汚染キーはスキップ
- [ ] `npm run build` / `./gradlew compileJava` 通過

---

## Feature 2: 帳票一括生成（バッチPDF）

### Overview

フォーム回答パネルから複数回答を選択し、同一テンプレートに適用して複数PDFをZIPアーカイブで一括ダウンロードする。

### Technical Approach

**Backend — バッチジョブエンドポイント**

参考: `V2PdfJobController.java`（非同期ジョブキュー、`ConcurrentHashMap`、`CompletableFuture`）

```
POST /api/v2/pdf-jobs/batch
Body: {
  "templateId": "xxx",
  "responseIds": ["r1", "r2", "r3"],
  "filenamePattern": "{{seq}}_{{date}}.pdf"
}
→ 202 Accepted: { "batchJobId": "bjob-xxx", "totalCount": 3, "statusUrl": "/api/v2/pdf-jobs/batch/bjob-xxx" }

GET /api/v2/pdf-jobs/batch/{id}
→ { "status": "processing", "completed": 1, "failed": 0, "total": 3 }

GET /api/v2/pdf-jobs/batch/{id}/result
→ ZIP binary (application/zip)
   内容: 001_20260413.pdf, 002_20260413.pdf, summary.json
```

**ファイル名パターン変数**（簡素化: 4変数 → 2変数）

| 変数 | 内容 |
|-----|------|
| `{{seq}}` | ゼロ埋め3桁の連番（001〜） |
| `{{date}}` | 生成日時 (YYYYMMDD) |

~~`{{submittedBy}}`、`{{templateName}}`~~ → v1 スコープ外（code-simplicity-reviewer の提案）

**部分失敗の扱い**

- 一部失敗でも成功分でZIPを作成・配信
- ZIP内に `summary.json`: `{ completed: N, failed: M, failures: [{responseId, reason}] }`
- 全件失敗した場合のみ 500 を返す

**制限**

- 最大 50 件/バッチ（超過時 400）
- **ZIP サイズ上限: 100MB**（`CountingOutputStream` で entry 書込前に判定 — architecture-strategist 指摘）

```java
// CountingOutputStream パターン
long bytesWritten = 0;
for (File pdf : pdfFiles) {
    long entrySize = pdf.length();
    if (bytesWritten + entrySize > MAX_ZIP_BYTES) {
        // ZIP に _TRUNCATED.txt エントリを追加して終了
        break;
    }
    zos.putNextEntry(new ZipEntry(filename));
    Files.copy(pdf.toPath(), zos);
    bytesWritten += entrySize;
    zos.closeEntry();
}
```

- **並列 PDF 生成**: 既存の `pdfExecutor`（固定4スレッド）で並列生成。メモリ使用量は 4スレッド × ~5MB = ~20MB（performance-oracle 推奨）
- タイムアウト: 全バッチで 5分

**認可（security-sentinel 指摘）**

各 `responseId` がリクエスト送信者のテナントに属することを確認してから PDF 生成。IDOR を防ぐ。

**Frontend — フォーム回答パネルの拡張**

フロントエンドのバッチジョブ状態は**ローカル state**で管理（Zustand store 不使用 — julik-frontend-races-reviewer 指摘）

```tsx
// Symbol-based 状態管理（2重送信防止）
const IDLE = Symbol(), SUBMITTING = Symbol(), POLLING = Symbol()
const [batchState, setBatchState] = useState<symbol>(IDLE)
const cancelRef = useRef<{ canceled: boolean } | null>(null)

const handleBatchPdf = async () => {
  if (batchState !== IDLE) return  // ガード
  setBatchState(SUBMITTING)
  const cancelToken = { canceled: false }
  cancelRef.current = cancelToken

  try {
    const { batchJobId } = await submitBatchPdfJob(...)
    setBatchState(POLLING)

    while (true) {
      if (cancelToken.canceled) break          // アンマウント前チェック
      await sleep(2000)
      if (cancelToken.canceled) break          // スリープ後チェック
      const status = await getBatchPdfJobStatus(batchJobId)
      setProgress(status)
      if (status.status === 'completed') {
        await downloadBatchPdfResult(batchJobId)  // 別try/catchで囲む
        break
      }
      if (status.status === 'failed') break
    }
  } finally {
    setBatchState(IDLE)
  }
}

useEffect(() => () => { if (cancelRef.current) cancelRef.current.canceled = true }, [])
```

**実装ファイル**

- `server/.../V2PdfJobController.java` — バッチ用メソッド追加（既存クラス拡張）
- `server/.../ApiRoutes.java` — `POST /api/v2/pdf-jobs/batch` 等を追加
- `src/api/reportApi.ts` — `submitBatchPdfJob()`, `getBatchPdfJobStatus()`, `downloadBatchPdfResult()` 追加
- `src/components/sidebar/ResponsesPanel.tsx` — チェックボックス + 「一括PDF」ボタン追加

### Acceptance Criteria

- [ ] フォーム回答パネルで複数回答を選択して一括PDF生成できる
- [ ] 生成物はZIPファイルでダウンロードされ、各PDFは `{{seq}}_{{date}}.pdf` 形式のファイル名
- [ ] 一部失敗しても成功分のZIPが配信され、`summary.json` に失敗詳細が含まれる
- [ ] ZIP 合計 100MB 超の場合は entry 追加前に早期打ち切り（`_TRUNCATED.txt` をZIPに追加）
- [ ] 最大50件制限。超過時はボタンが無効化
- [ ] 2秒ポーリングで進捗（N/M完了）を表示（ローカル state で管理）
- [ ] ナビゲーション離脱時はキャンセルトークンで安全にポーリング停止
- [ ] 2重送信防止（Symbol-based state machine）
- [ ] responseIds の認可チェック（リクエスト送信者テナントのものかを確認）
- [ ] `npm run build` / `./gradlew compileJava` 通過

---

## Feature 3: ドキュメント番号自動採番

### Overview

テンプレートごとに連番カウンターを持ち、フォーム回答送信時にドキュメント番号を採番・記録する。
帳票上では `{{documentNumber}}` トークン（既存トークン置換機構を流用）で表示する。

### ⚠️ Critical Design Requirement: 単一トランザクション

（architecture-strategist + data-integrity-guardian 指摘）

`JsonBlobRepository.put()` は呼び出しのたびに独立した `DistributedTransaction` を開く。
**シーケンス読み取り → インクリメント → 回答保存 の3操作を単一の `DistributedTransaction` でまとめなければ番号重複が発生する**。

```java
// 誤った実装（2つの独立したトランザクション — 番号重複の原因）
String seqJson = seqRepo.get(templateId);          // TX-A
seqRepo.put(templateId, newSeqJson);               // TX-B (異なるトランザクション)
responseRepo.put(responseId, responseJson);        // TX-C (さらに別)

// 正しい実装（単一トランザクション）
DistributedTransaction tx = manager.start();
try {
    Optional<Result> seqRow = tx.get(seqGet);       // シーケンス読み取り
    SequenceRecord seq = parse(seqRow);
    checkAndResetForYear(seq);                      // 年次リセット check-on-read
    seq.increment();
    tx.put(seqPut(templateId, serialize(seq)));     // シーケンス書き込み
    tx.put(responsePut(responseId, responseJson));  // 回答書き込み（同一TX）
    tx.commit();
    return seq.format();                            // "QUO-0006"
} catch (CommitConflictException e) {
    tx.abort();
    throw e;  // 呼び出し側がリトライ（3〜5回、バックオフ付き）
} catch (Exception e) {
    tx.abort();
    throw e;
}
```

これには `JsonBlobRepository` に `withTransaction(DistributedTransaction tx, ...)` メソッドを追加するか、`SequenceRepository` を専用クラスとして新設する必要がある。

### Technical Approach

**Backend — シーケンスエンドポイント**（簡素化後）

```
GET  /api/v1/sequences/{templateId}
→ { "current": 5, "prefix": "QUO-", "suffix": "", "digits": 4, "resetOn": null }

PUT  /api/v1/sequences/{templateId}
Body: { "prefix": "QUO-", "suffix": "", "digits": 4, "resetOn": "year" }
→ 200: updated config
```

~~POST /api/v1/sequences/{templateId}/next~~ → フォーム送信時の内部処理のみ（外部公開しない）
~~POST /api/v1/sequences/{templateId}/reset~~ → v1 スコープ外（code-simplicity-reviewer の提案）

**ストレージ**: `sequences` 専用 `JsonBlobRepository` テーブル（または専用 `SequenceRepository`）

**OCC リトライ**（data-integrity-guardian 指摘 — 必須）

```java
// V2FormResponseController.submit() 内のシーケンス採番ロジック
String docNum = null;
for (int attempt = 0; attempt < 5; attempt++) {
    try {
        docNum = seqCtrl.nextAndSaveResponse(templateId, responseId, responseJson);
        break;
    } catch (CommitConflictException e) {
        if (attempt == 4) throw new ServiceUnavailableException("採番の競合が解消されませんでした");
        Thread.sleep((long) Math.pow(2, attempt) * 50); // 50, 100, 200, 400ms
    }
}
```

**年次リセット — check-on-read**（data-integrity-guardian 指摘）

cron ジョブではなく、シーケンス読み取り時にカレンダーチェックを行う:

```java
// SequenceRecord 内
void checkAndResetForYear(int currentYear) {
    if (this.resetOn != null && this.resetOn.equals("year") && this.resetYear < currentYear) {
        this.counter = 0;
        this.resetYear = currentYear;
    }
}
// currentYear は ZonedDateTime.now(ZoneId.of("Asia/Tokyo")).getYear()
```

これにより年末年始の境界でも自動的に正しい採番が行われる（アトミック）。

**帳票上での表示**

- 既存の `interpolate()` 関数（`src/lib/dataBinding.ts:62`）を流用
- `{{documentNumber}}` トークン → PDF生成時に回答メタデータから解決
- プレビューモードでは `{{documentNumber}}` はそのまま表示（採番しない）
- **シーケンス未設定のテンプレートで `{{documentNumber}}` が書かれている場合**: 空文字列に展開（エラーにしない）

**documentNumber の上書き防止**（data-integrity-guardian 指摘）

将来の回答 PUT 処理で `documentNumber` が誤って消えないよう、回答保存時に既存の `documentNumber` フィールドを保持するよう read-modify-write パターンを強制する。

**採番ルール**

- フォーム送信時に採番するため、**欠番は発生する**（回答削除後も番号は再利用しない — 監査上許容、ブレインストーム合意）
- OCC 競合でリトライが全て失敗した場合のみ回答保存も失敗（番号消費なし）

**UI設計**（簡素化後）

- `PageSettingsPanel.tsx` のメタデータセクション（折りたたみ）内に「採番設定」を追加
- プレフィックス / サフィックス / 桁数 / 年次リセット の設定フォーム
- ~~「次の番号をプレビュー」ボタン~~ → 削除（設定値から自明、code-simplicity-reviewer の提案）

**実装ファイル**

- `server/.../JsonBlobRepository.java` — `withTransaction()` メソッド追加（または `SequenceRepository.java` 新規）
- `server/.../SequenceController.java` — 新規（`nextAndSaveResponse()` を含む）
- `server/.../AppWiring.java` — `sequences` リポジトリ追加
- `server/.../ApiRoutes.java` — `GET/PUT /api/v1/sequences/{templateId}` 追加
- `server/.../V2FormResponseController.java` — `submit()` に採番統合（OCC リトライ付き）
- `src/api/reportApi.ts` — `getSequenceConfig()`, `updateSequenceConfig()` 追加
- `src/components/sidebar/PageSettingsPanel.tsx` — 採番設定UI追加

### Acceptance Criteria

- [ ] テンプレートごとにシーケンス番号を設定できる（プレフィックス/桁数/年次リセット）
- [ ] フォーム回答送信時に**単一 DistributedTransaction** でシーケンス採番 + 回答保存が行われる
- [ ] 同時送信でも OCC リトライにより重複番号が発生しない（5回リトライ）
- [ ] `{{documentNumber}}` トークンが帳票のPDF出力時に正しい番号に展開される
- [ ] プレビューモードでは `{{documentNumber}}` はトークンのまま表示
- [ ] 未設定テンプレートへのアクセスは空文字列展開（エラーなし）
- [ ] 年次リセットは check-on-read で実装（cron 不使用）
- [ ] 回答更新時に既存の `documentNumber` が保持される
- [ ] `npm run build` / `./gradlew compileJava` 通過

---

## Feature 4: Webhook通知（フォーム回答受信時）

### Overview

テンプレートごとにWebhook URLを設定し、フォーム回答が送信されるたびに指定URLへHTTP POSTを送信する。

### Technical Approach

**Backend — Webhookエンドポイント**

参考: `ImagePdfRenderer.java`（Java 11 `HttpClient` + SSRF防止）

```
GET /api/v1/webhooks/{templateId}
→ { "url": "https://...", "secret": "****" }  // secret はマスク（AES-GCM 復号後もマスク返却）

PUT /api/v1/webhooks/{templateId}
Body: { "url": "https://hooks.slack.com/...", "secret": "my-secret" }
→ 200

POST /api/v1/webhooks/{templateId}/test
→ 200: { "delivered": true }
```

**ストレージ**: `webhooks` 専用 `JsonBlobRepository` テーブル。`id = "{templateId}"` の singleton。
**URL は 1件のみ**（code-simplicity-reviewer の提案。3件 → 1件に絞る）。

**Webhookシークレット暗号化**（security-sentinel 指摘 — 重要）

シークレットは平文で保存しない。アプリケーションレベルで AES-GCM 暗号化を適用:

```java
// 環境変数 WEBHOOK_ENCRYPTION_KEY (256-bit base64) が必要
String encrypted = AesGcm.encrypt(secret, encryptionKey);
// 保存: encrypted 値のみ。GET 時は "****" を返す
```

**Webhookペイロード**（タイムスタンプ付き — best-practices-researcher 推奨）

```json
{
  "event": "form_response.received",
  "timestamp": "1713012000",
  "templateId": "xxx",
  "templateName": "見積依頼フォーム",
  "responseId": "yyy",
  "submittedAt": "2026-04-13T10:00:00Z",
  "submittedBy": "user@example.com",
  "summary": ["田中 一郎", "¥100,000"],
  "data": { ... }
}
```

`X-Webhook-Signature: sha256=HMAC(secret, timestamp + "." + body)` ヘッダーを付与（タイムスタンプバインディングでリプレイ攻撃を防止）。

**セキュリティ**

`ImagePdfRenderer.java` の SSRF 保護ロジックを流用 + 追加強化:

- `https://` のみ許可
- プライベートIPブロック: `10.x`, `172.16-31.x`, `192.168.x`
- ループバック: `127.x`, `0.0.0.0`
- IPv6 ループバック: `::1`, リンクローカル `fe80::/10`
- クラウドメタデータ: `169.254.169.254`, `*.internal`
- リダイレクト: `HttpClient.Redirect.NEVER`

**⚠️ DNS リバインディング対策**（security-sentinel 指摘）

`InetAddress.getByName()` での検証後、HTTP クライアントが再解決するリスクがある。
`isSafeUrl()` で validate した後、接続確立後に `socket.getRemoteSocketAddress()` で実 IP を再検証するか、
Forward proxy（テスト環境の場合）を使う。あるいはより実用的には、**URL 保存時のバリデーションを信頼**しつつ定期的な再チェックを行う方針でも許容される（v1 では後者で可）。

**Webhook 専用 ExecutorService**（architecture-strategist 指摘 — 必須）

`CompletableFuture.runAsync()` には必ず専用のエグゼキュータを渡す:

```java
// AppWiring.java に追加
final ExecutorService webhookExecutor = new ThreadPoolExecutor(
    2, 8,                        // core=2, max=8
    60L, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(100),
    new ThreadPoolExecutor.CallerRunsPolicy()  // キュー溢れ時は呼び出しスレッドで実行
);

// shutdown() に追加
webhookExecutor.shutdown();
```

PDF 生成スレッドとは分離し、Webhook の HTTP 待機が PDF 生成を阻害しないようにする。

**リトライポリシー**

リトライなし（シンプルさ優先、ブレインストーム合意）。
失敗はサーバーログに記録（PII を含む body はログに含めない — security-sentinel 指摘）。
フォーム回答の保存は成功 — Webhookの失敗は回答保存をブロックしない。

**フォーム回答への統合**

```java
// V2FormResponseController.submit()（Feature 3 の採番処理の後）
responseRepo.put(responseId, json, templateId);  // or single-TX with sequence
// 非同期Webhook（失敗しても回答保存に影響しない）
CompletableFuture.runAsync(() ->
    webhookDispatcher.dispatch(templateId, buildPayload(responseId, json)),
    webhookExecutor  // 専用エグゼキュータ必須
);
```

**UI設計**

- データ設定モーダル（`DataBindingModal.tsx`）に「Webhook」タブを追加
- URL + 秘密鍵の入力フォーム（**1件のみ**）
- 「テスト送信」ボタン（ダミーペイロードを送信して疎通確認）

**実装ファイル**

- `server/.../WebhookDispatcher.java` — 新規（SSRF検証 + AES-GCM + HttpClient送信）
- `server/.../WebhookController.java` — 新規（GET/PUT/テスト送信エンドポイント）
- `server/.../AppWiring.java` — `webhooks` リポジトリ + `WebhookDispatcher` + `webhookExecutor` 追加
- `server/.../ApiRoutes.java` — `/api/v1/webhooks/*` 追加
- `server/.../V2FormResponseController.java` — 非同期Webhook呼び出し追加
- `src/api/reportApi.ts` — `getWebhookConfig()`, `updateWebhookConfig()`, `testWebhook()` 追加
- `src/components/modals/WebhookTab.tsx` — 新規
- `src/components/modals/DataBindingModal.tsx` — 「Webhook」タブ追加

### Acceptance Criteria

- [ ] テンプレートごとに Webhook URL を1件設定できる
- [ ] フォーム回答受信時に設定済み URL へ HTTP POST が送信される（非同期）
- [ ] ペイロードに `event`, `timestamp`, `templateId`, `responseId`, `data` が含まれる
- [ ] `X-Webhook-Signature` ヘッダーが付与される（HMAC-SHA256）
- [ ] シークレットは AES-GCM で暗号化して保存（GET レスポンスでは `****` でマスク）
- [ ] プライベートIP・ループバック・クラウドメタデータへの SSRF 攻撃をブロック（`https://` のみ）
- [ ] `webhookExecutor` は PDF エグゼキュータと分離された独立スレッドプール
- [ ] Webhook 失敗はフォーム回答の保存をブロックしない
- [ ] ログに Webhook ペイロード本文を含めない（PII 保護）
- [ ] 「テスト送信」ボタンで疎通確認できる
- [ ] `npm run build` / `./gradlew compileJava` 通過

---

## System-Wide Impact

### Interaction Graph

```
フォーム回答送信 (POST /api/v2/templates/{id}/responses)
  → V2FormResponseController.submit()
    → 単一 DistributedTransaction:
        tx.get(seqRow) + checkAndResetForYear()          [採番, Feature 3]
        tx.put(seqRow, incremented)
        tx.put(responseRow, jsonWithDocNumber)
        tx.commit()                                       → CommitConflictException → OCC リトライ
    → CompletableFuture.runAsync(webhook, webhookExecutor)  [非同期, Feature 4]
      → WebhookDispatcher.dispatch()
        → isSafeUrl() SSRF check → HttpClient.send()
    → 200 レスポンス返却

バッチPDF (POST /api/v2/pdf-jobs/batch)
  → V2PdfJobController.submitBatch()
    → 認可: 全 responseId が送信者テナントに属するか確認
    → ConcurrentHashMap にジョブ登録 → 202 返却
    → pdfExecutor (4スレッド) で並列PDF生成
      → 成功: CountingOutputStream で ZipOutputStream に追加
      → 100MB 超過: _TRUNCATED.txt を追加して早期終了
      → 失敗: summary.json に記録、他は継続

CSVインポート (POST /api/v1/products/import)
  → ProductController.importCsv()
    → CsvDataSource.parse() → バリデーション → センチネルチェック → save
    → 結果: { imported, skipped, errors: [{row, column, value, reason}] }
```

### Error & Failure Propagation

| エラー源 | 影響範囲 | 対処 |
|---------|---------|------|
| CSV: コード重複 | 該当行スキップ | `errors[]` に row/column/value/reason を記録 |
| バッチPDF: 1件生成失敗 | 該当ファイルのみスキップ | `summary.json` に記録、他は継続 |
| バッチPDF: ZIP 100MB 超過 | 超過エントリをスキップ | `_TRUNCATED.txt` をZIPに追加 |
| バッチPDF: 全件失敗 | バッチジョブ全体が失敗 | `status: "failed"` + 500 |
| 採番: OCC 競合 | 採番のみ失敗 | abort → retry 最大5回（50ms, 100ms, 200ms, 400ms）|
| 採番: 5回全て失敗 | 回答保存も失敗 | 503 を返す |
| Webhook: 外部URL到達不能 | Webhook配信のみ失敗 | ログ記録（body除く）。回答保存は成功 |
| Webhook: SSRF検出 | URL保存時に400 | バリデーションエラーを返す |
| Webhook: キュー溢れ | CallerRunsPolicy で同期実行 | 最悪でも form submit のレイテンシが増加するだけ |

### State Lifecycle Risks

- **採番の欠番**: OCC が5回失敗した場合は番号消費なし。通常の削除では欠番発生（許容）
- **バッチPDFのメモリ**: PDF はディスク書き込み → ZIP ストリーミング（ByteArrayOutputStream 禁止）
- **Webhookシークレット**: AES-GCM 暗号化済み。GET レスポンスではマスク返却
- **DocumentNumber の上書き**: 回答更新時は read-modify-write パターンで既存値を保持

### Integration Test Scenarios

1. フォーム回答送信 → OCC 競合シミュレーション（2スレッド同時送信）→ 一方が採番成功、他方はリトライで次の番号を取得
2. 10件の回答を選択 → バッチジョブ投入 → 2秒ポーリング → ZIP 内のファイル数と `summary.json` 確認
3. 重複コードを含む CSV をインポート → エラー行のみスキップされ他は正常登録、エラーに column/value を含む
4. Webhook URL にプライベートIP (`http://192.168.1.1`) を設定 → 保存時 400 エラー
5. Webhook 設定済みテンプレートにフォーム回答を送信 → 外部URLへのPOSTが非同期で発火、回答保存は即時完了

---

## Dependencies & Prerequisites

- **Feature 3 の前提**: `JsonBlobRepository` に `withTransaction()` メソッドの追加、または専用 `SequenceRepository` の新設が必要。これが Feature 3 実装の最初のコミットになる
- **Feature 4 の前提**: `WEBHOOK_ENCRYPTION_KEY` 環境変数（256-bit base64）の設定が必要
- **Feature 3 + 4 の競合**: 両機能が `V2FormResponseController.java` を変更する。順番に実装するか、ブランチを分けること
- **Feature 2 の競合なし**: `V2PdfJobController.java` の拡張は既存単件ジョブとコンフリクトしない

---

## Risk Analysis

| リスク | 確率 | 影響 | 対策 |
|--------|------|------|------|
| **採番の競合状態** | 高 | 高（番号重複） | 単一 DistributedTransaction + OCC リトライ（最重要） |
| JsonBlobRepository API 拡張の複雑さ | 中 | 中 | `withTransaction()` or 専用リポジトリを先行実装 |
| バッチPDF ZIP メモリOOM | 低 | 高 | ディスク書き込み → ストリーミング、ByteArrayOutputStream 禁止 |
| Webhook DNS リバインディング SSRF | 低 | 高 | v1 は URL保存時バリデーション + 定期チェック。v2 で接続後検証 |
| Webhook シークレット漏洩 | 低 | 高 | AES-GCM 暗号化、ログ除外 |
| CSV injection（formula） | 低 | 中 | CsvDataSource.java の escape 適用、customFields キー検証 |
| V2FormResponseController 競合変更 | 高 | 中 | Feature 3 → Feature 4 の順で順番実装 |

---

## Out of Scope (YAGNI)

(see brainstorm: docs/brainstorms/2026-04-12-missing-features-four-additions-brainstorm.md#out-of-scope-yagni)

- 既存商品の CSV upsert
- 100件超のバッチ
- Webhook リトライ
- Webhook ペイロードのフィールド選択
- メール送信（Webhook経由で代替可）
- 承認ワークフロー
- シーケンス `/reset` エンドポイント（v1）
- バッチPDF ファイル名の `{{submittedBy}}`、`{{templateName}}` 変数

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-12-missing-features-four-additions-brainstorm.md](docs/brainstorms/2026-04-12-missing-features-four-additions-brainstorm.md)
  - Key decisions: CSV スキップポリシー、部分バッチ失敗は partial ZIP + summary.json、採番はフォーム送信時、Webhookリトライなし

### Internal References

- 非同期PDFジョブ: `server/src/main/java/com/report/server/V2PdfJobController.java`
- CSVパーサー: `server/src/main/java/com/report/server/CsvDataSource.java`
- SSRF防止: `server/src/main/java/com/report/server/pdf/ImagePdfRenderer.java:162-207`
- トークン置換: `src/lib/dataBinding.ts:62`
- 商品登録ロジック: `server/src/main/java/com/report/server/ProductController.java`
- フォーム回答Controller: `server/src/main/java/com/report/server/V2FormResponseController.java`
- XSS/Prototype pollution 防止: `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md`
- エクスポートエラー処理: `docs/solutions/logic-errors/export-error-handling-json-api.md`
