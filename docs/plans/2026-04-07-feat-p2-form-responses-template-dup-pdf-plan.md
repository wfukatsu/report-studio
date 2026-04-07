---
title: "feat: P2 — フォーム回答収集 / テンプレート複製 / バックエンドPDF生成"
type: feat
status: completed
date: 2026-04-07
deepened: 2026-04-07
origin: docs/brainstorms/2026-04-07-v1-backend-port-to-v2-brainstorm.md
---

# feat: P2 — フォーム回答収集 / テンプレート複製 / バックエンドPDF生成

## Enhancement Summary

**Deepened on:** 2026-04-07  
**Research agents:** security-reviewer, architect, database-reviewer, TypeScript patterns, 4 project learnings

### Key Improvements (Deep Research から)
1. **テンプレートに `createdBy` 追加が前提条件** — 既存の `V2TemplateController.create()` に `createdBy: userId` を追加しないとオーナーシップ検証が不可能。他の全機能はこれに依存する
2. **`v2_form_responses` を独立したテーブルとして作成** — V1と共有すると将来の移行で破綻する
3. **集計は `?aggregate=true` でオプトイン** — デフォルトは高速ページング; 集計は5000件上限でtruncated flagつき
4. **Blob ダウンロードは `apiFetchBlob()` で専用ハンドリング** — Zodバリデーションはバイナリには使えない

### New Considerations Discovered
- V1の `FormResponseController.delete/get` にオーナーシップチェックが存在しない (CRITICAL)
- `Principal.ANONYMOUS` が `user` ロールを保持している (HIGH — 修正が必要)
- CSV formula injectionの `|` 文字が漏れている (MEDIUM)
- Zustand のレスポンス状態は `responses` スライスで管理し、5分TTLキャッシュを使う

---

## Overview

V2バックエンドに3つのP2機能を追加する。最優先は**フォーム回答収集**（ログイン必須、CSV/Excel/PDF出力 + 画面集計）。次いで**テンプレート複製**、**バックエンドPDF生成**の順で実装する。

ブレインストーム決定事項: (see brainstorm: docs/brainstorms/2026-04-07-v1-backend-port-to-v2-brainstorm.md)
- 公開リンク不要 — ログイン済みユーザーのみ回答可能
- 出力: CSV・Excel・PDF回答票 + 画面集計
- フォーム回答収集を最優先

---

## Problem Statement

現在のV2では帳票の「設計」と「プレビュー」しかできない。実際に帳票データを入力して回答を収集・集計・出力する機能がなく、ユーザーはV1に戻るか手動でデータ管理する必要がある。

---

## Proposed Solution

V1の既存コード（`FormResponseController.java`、`TemplateExportController.java`、`PdfRenderer.java`）をV2 APIとして移植・シンプル化する。フロントエンドにはフォーム入力UI・回答一覧・集計画面を追加する。

**重要な設計決定**: V2でのフォームデータは既存の `testData: Record<string, unknown>` 構造を再利用する。`testData` は計算ルール評価・バリデーション評価に既に使われており、これがそのまま回答データになる。

---

## Technical Approach

### アーキテクチャ概要

```
フロントエンド                    V2バックエンド
────────────────────            ──────────────────────────────
DataBindingModal (既存)  ──→   (評価・バリデーション — 既存)
  testData入力
SubmitResponseModal(新規) ──→  POST /api/v2/templates/{id}/responses
ResponsesPanel (新規)    ←──   GET  /api/v2/templates/{id}/responses[?aggregate=true]
                          ←──   GET  /api/v2/templates/{id}/responses/export?format=csv|excel
                          ←──   GET  /api/v2/templates/{id}/responses/{rid}/pdf
TemplateList (既存改修)  ──→   POST /api/v2/templates/{id}/duplicate
Toolbar (既存改修)       ──→   POST /api/v2/templates/{id}/pdf  (バックエンドPDF)
```

### ScalarDB テーブル設計

**`v2_form_responses` テーブル** (新規作成 — V1と共有しない)

> **Research insight (architect):** V1 `form_responses` と共有すると V1/V2 のライフサイクルが結合する。`JsonBlobRepository` の1行追加で独立テーブルを作れるのでコストは最小。

```
id           TEXT  [PK]
json_data    TEXT  { id, templateId, data: Record<string,unknown>, submittedAt: long, submittedBy: string }
updated_at   BIGINT
group_key    TEXT  [2次索引 = templateId]
```

`AppWiring.java` 追加:
```java
v2ResponseRepo = new JsonBlobRepository(factory, NAMESPACE, "v2_form_responses");
v2ResponseRepo.ensureTable();
```

**⚠️ 前提条件 (CRITICAL): `v2_definitions` テーブルへの `createdBy` 追加**

> **Research insight (security-reviewer):** 現在の `V2TemplateController.create()` はオーナーID (`createdBy`) を保存しない。オーナーシップチェックなしでは誰でも他人の回答を読み書きできる。

`V2TemplateController.create()` に追加 (Phase 0):
```java
// create() 内、envelope構築時に追加
Principal principal = ctx.attribute("principal");
envelope.put("createdBy", principal.userId());
```

---

## Implementation Phases

### Phase 0: 前提条件 — オーナーシップ基盤の修正

**これを実装してからPhase 1以降に進む。**

#### 0-1. `Principal.ANONYMOUS` のロール修正

**ファイル**: `server/src/main/java/com/report/server/auth/Principal.java`

> **Research insight (security-reviewer):** `ANONYMOUS` が `Set.of("user")` ロールを持っているため、認証チェックの抜け道になりうる。

```java
// 変更前
public static final Principal ANONYMOUS = new Principal("anonymous", "Anonymous", Set.of("user"));
// 変更後
public static final Principal ANONYMOUS = new Principal("anonymous", "Anonymous", Set.of());
```

#### 0-2. `V2TemplateController.create()` に `createdBy` 追加

```java
void create(Context ctx) {
    Principal principal = ctx.attribute("principal");
    if (principal.isAnonymous()) throw new UnauthorizedResponse();
    // ... existing logic ...
    envelope.put("createdBy", principal.userId());  // ← 追加
    // ...
}
```

既存テンプレート (移行): `createdBy` がないテンプレートはアクセス制御をスキップし、警告ログを出力する (後方互換)。

#### 0-3. V2ルートへのレート制限追加

**ファイル**: `AppWiring.java` と `ApiRoutes.java`

> **Research insight (security-reviewer):** V2ルートには現在レート制限が一切ない。

```java
// AppWiring に追加
final RateLimiter v2SubmitLimiter = new RateLimiter(5, 60_000L);   // 5/分/userId
final RateLimiter v2ExportLimiter = new RateLimiter(3, 60_000L);   // 3/分/userId
```

> **Research insight (security-reviewer):** 認証済みエンドポイントでは IP ではなく `principal.userId()` をレート制限キーにする。IPローテーションによるバイパスを防ぐ。

---

### Phase 1: バックエンド — フォーム回答収集 API

**ファイル構成** (architect推奨による分割):

```
server/src/main/java/com/report/server/
  V2FormResponseController.java    (~250行: submit, list, get, delete)
  V2ResponseExportController.java  (~200行: CSV + Excel export)
  V2ResponsePdfController.java     (~150行: 単一回答PDF)
  V2ResponseAggregator.java        (~100行: フィールド集計ロジック、単体テスト可能)
```

#### 1-1. `V2FormResponseController.java` を新規作成

**エンドポイント:**

| メソッド | パス | 説明 |
|----------|------|------|
| POST | `/api/v2/templates/{id}/responses` | 回答を送信 |
| GET | `/api/v2/templates/{id}/responses` | 一覧取得 (ページング; `?aggregate=true` で集計追加) |
| GET | `/api/v2/templates/{id}/responses/{rid}` | 回答詳細 |
| DELETE | `/api/v2/templates/{id}/responses/{rid}` | 回答削除 |

**回答データ構造:**
```json
{
  "id": "resp-{uuid}",
  "templateId": "tmpl-xxx",
  "data": { "field1": "value1", "field2": 42 },
  "submittedAt": 1712345678000,
  "submittedBy": "user-id"
}
```

**submit() メソッド:**
```java
void submit(Context ctx) {
    String templateId = RequestValidator.validateId(ctx);
    if (templateId == null) return;

    Principal principal = ctx.attribute("principal");
    if (principal.isAnonymous()) throw new UnauthorizedResponse();

    // レート制限 (userId ベース)
    if (!submitLimiter.isAllowed(principal.userId())) {
        ctx.status(429);
        ctx.json(Map.of("error", "Too many submissions. Please wait."));
        return;
    }

    // テンプレート存在確認 + オーナーシップ検証
    var defJson = definitionsRepo.get(templateId);
    if (defJson.isEmpty()) { ctx.status(404); ...; return; }

    var defNode = mapper.readTree(defJson.get());
    String owner = defNode.path("createdBy").asText("");
    if (!owner.isEmpty() && !owner.equals(principal.userId())) {
        ctx.status(403); ctx.json(Map.of("error", "Access denied")); return;
    }

    // リクエストボディ: { data: Object }
    JsonNode body = mapper.readTree(ctx.body());
    JsonNode data = body.path("data");
    if (data.isMissingNode() || !data.isObject()) {
        ctx.status(400); ctx.json(Map.of("error", "data is required")); return;
    }

    // 1000フィールド制限 + ネスト深さ制限 (max 8)
    if (data.size() > 1000) { ctx.status(400); ...; return; }
    if (hasExcessiveDepth(data, 8)) { ctx.status(400); ...; return; }

    // submittedBy はサーバー側でスタンプ (クライアントから受け取らない)
    ObjectNode response = mapper.createObjectNode();
    response.put("id", UUID.randomUUID().toString());
    response.put("templateId", templateId);
    response.set("data", data);
    response.put("submittedAt", System.currentTimeMillis());
    response.put("submittedBy", principal.userId());  // ← 必ずサーバー側で設定

    responseRepo.put(response.get("id").asText(), response.toString(), templateId);
    ctx.status(201).json(Map.of("id", response.get("id").asText()));
}
```

**ネスト深さチェックヘルパー:**
```java
private static boolean hasExcessiveDepth(JsonNode node, int maxDepth) {
    if (maxDepth <= 0) return true;
    var it = node.fields();
    while (it.hasNext()) {
        JsonNode child = it.next().getValue();
        if (child.isContainerNode() && hasExcessiveDepth(child, maxDepth - 1)) return true;
    }
    return false;
}
```

**list() メソッド (集計オプトイン):**

> **Research insight (architect):** 集計は `?aggregate=true` でオプトイン。デフォルト高速ページング。集計は5000件上限でtruncated flagつき。

```java
void list(Context ctx) {
    String templateId = RequestValidator.validateId(ctx);
    // オーナーシップ確認...
    int offset = parseIntParam(ctx.queryParam("offset"), 0);
    int limit = Math.min(parseIntParam(ctx.queryParam("limit"), 50), 500);
    boolean includeAggregation = "true".equals(ctx.queryParam("aggregate"));

    List<String> allJson = responseRepo.listByGroupKey(templateId);

    // 安全上限: 2000件超はエクスポートエンドポイントへ誘導
    if (allJson.size() > 2_000) {
        ctx.status(422);
        ctx.json(Map.of("error", "Too many responses for inline listing. Use the export endpoint.", "total", allJson.size()));
        return;
    }

    // ページング (in-memory)
    var sorted = allJson.stream()
        .map(this::parseToSummary).filter(Objects::nonNull)
        .sorted(Comparator.comparingLong(ResponseSummary::submittedAt).reversed())
        .toList();

    int total = sorted.size();
    var page = sorted.subList(Math.min(offset, total), Math.min(offset + limit, total));

    Map<String, Object> result = new LinkedHashMap<>();
    result.put("items", page);
    result.put("total", total);
    result.put("offset", offset);
    result.put("limit", limit);
    result.put("hasMore", offset + limit < total);

    if (includeAggregation) {
        int aggLimit = Math.min(total, 5_000);
        result.put("fieldSummary", V2ResponseAggregator.build(sorted.subList(0, aggLimit)));
        result.put("aggregationTruncated", total > 5_000);
    }

    ctx.json(result);
}
```

**delete() — オーナーシップチェック付き:**

> **Research insight (security-reviewer):** V1の `delete` にはオーナーシップチェックがない。V2では必須。

```java
void delete(Context ctx) {
    String templateId = RequestValidator.validateId(ctx);
    String responseId = RequestValidator.validateId(ctx, "rid");
    if (templateId == null || responseId == null) return;

    Principal principal = ctx.attribute("principal");

    // レスポンスが指定テンプレートに属することを確認
    var stored = responseRepo.get(responseId);
    if (stored.isEmpty()) { ctx.status(404); ...; return; }
    var node = mapper.readTree(stored.get());
    if (!templateId.equals(node.path("templateId").asText(""))) {
        ctx.status(404);  // 403ではなく404 (存在確認を防ぐ)
        ctx.json(Map.of("error", "Response not found"));
        return;
    }

    // テンプレートオーナーまたは回答送信者のみ削除可
    String submittedBy = node.path("submittedBy").asText("");
    String templateOwner = getTemplateOwner(templateId);
    if (!principal.userId().equals(submittedBy) && !principal.userId().equals(templateOwner)) {
        ctx.status(403); ctx.json(Map.of("error", "Access denied")); return;
    }

    responseRepo.delete(responseId);
    ctx.json(Map.of("deleted", true, "id", responseId));
}
```

#### 1-2. `V2ResponseExportController.java` を新規作成

**export() メソッド:**

> **Research insight (security-reviewer):** CSV formula injectionには `|` 文字も含める。Excelは `CellType.STRING` + `SXSSFWorkbook` (ストリーミング)。

```java
// CSV エスケープ (修正版)
private static String escapeCsvField(String value) {
    if (value == null) return "\"\"";
    // formula injection 対策: =+-@\t\r| を先頭で検出
    if (!value.isEmpty() && "=+-@\t\r|".indexOf(value.charAt(0)) >= 0) {
        value = "'" + value;
    }
    value = value.replace("\0", "");  // nullバイト除去
    // 常にクォート (最も安全な戦略)
    return "\"" + value.replace("\"", "\"\"") + "\"";
}

// Excel export (Apache POI SXSSFWorkbook — ストリーミング)
private void exportExcel(List<ParsedResponse> responses, Set<String> keys, Context ctx) throws IOException {
    try (SXSSFWorkbook wb = new SXSSFWorkbook(100)) {  // 100行ウィンドウ
        SXSSFSheet sheet = wb.createSheet("Responses");
        // ヘッダー行
        Row header = sheet.createRow(0);
        int col = 0;
        for (String key : keys) {
            Cell cell = header.createCell(col++);
            cell.setCellType(CellType.STRING);  // formula injection 防止
            cell.setCellValue(key);
        }
        // データ行
        int rowNum = 1;
        for (var resp : responses) {
            Row row = sheet.createRow(rowNum++);
            // ...
            for (String key : keys) {
                Cell cell = row.createCell(colIdx++);
                cell.setCellType(CellType.STRING);  // 必ずSTRING型
                cell.setCellValue(String.valueOf(resp.data().getOrDefault(key, "")));
            }
        }
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        wb.write(bos);
        wb.dispose();
        ctx.contentType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        ctx.header("Content-Disposition", "attachment; filename=\"responses-" + templateId + ".xlsx\"");
        ctx.result(bos.toByteArray());
    }
}
```

#### 1-3. `V2ResponsePdfController.java` を新規作成

> **Research insight (architect):** 既存の `pdfExecutor` を再利用する。リクエストスレッドをブロックしない。

```java
void generatePdf(Context ctx) {
    // ...オーナーシップ確認...
    try {
        byte[] pdf = CompletableFuture
            .supplyAsync(() -> renderV2Pdf(defJson, responseJson), pdfExecutor)
            .get(30, TimeUnit.SECONDS);
        ctx.contentType("application/pdf");
        ctx.header("Content-Disposition", "attachment; filename=\"response-" + responseId + ".pdf\"");
        ctx.result(pdf);
    } catch (TimeoutException e) {
        ctx.status(504); ctx.json(Map.of("error", "PDF generation timed out"));
    } catch (Exception e) {
        log.error("PDF failed for response {}", responseId, e);
        ctx.status(500); ctx.json(Map.of("error", "PDF generation failed"));
    }
}
```

> **Research insight (security-reviewer):** `GET .../responses/{rid}/pdf` は client-supplied projection を受け取ってはならない。サーバー側でテンプレート定義をロードし、stored response の `data` を `_formData` として渡す。

#### 1-4. `AppWiring.java` に追加

```java
// 新規テーブル
v2ResponseRepo = new JsonBlobRepository(factory, NAMESPACE, "v2_form_responses");
v2ResponseRepo.ensureTable();

// レート制限
final RateLimiter v2SubmitLimiter = new RateLimiter(5, 60_000L);
final RateLimiter v2ExportLimiter = new RateLimiter(3, 60_000L);

// コントローラ
v2FormResponseCtrl = new V2FormResponseController(v2ResponseRepo, v2DefinitionsRepo, v2SubmitLimiter);
v2ResponseExportCtrl = new V2ResponseExportController(v2ResponseRepo, v2ExportLimiter);
v2ResponsePdfCtrl = new V2ResponsePdfController(v2ResponseRepo, v2DefinitionsRepo, pdfExecutor);
```

#### 1-5. `ApiRoutes.java` にルート登録

```java
app.post("/api/v2/templates/{id}/responses",        w.v2FormResponseCtrl::submit);
app.get("/api/v2/templates/{id}/responses",         w.v2FormResponseCtrl::list);
app.get("/api/v2/templates/{id}/responses/export",  w.v2ResponseExportCtrl::export);
app.get("/api/v2/templates/{id}/responses/{rid}",   w.v2FormResponseCtrl::get);
app.delete("/api/v2/templates/{id}/responses/{rid}",w.v2FormResponseCtrl::delete);
app.get("/api/v2/templates/{id}/responses/{rid}/pdf",w.v2ResponsePdfCtrl::generatePdf);
```

---

### Phase 2: フロントエンド — フォーム回答収集 UI

#### 2-1. `src/lib/schemas/formResponse.ts` を新規作成

> **Research insight (TypeScript patterns):** Blob レスポンスには Zod は使えない。Zod スキーマを独立ファイルに定義し `satisfies z.ZodType<T>` でコンパイル時チェック。

```typescript
import { z } from 'zod'

export interface FormResponse {
  id: string
  templateId: string
  data: Record<string, unknown>
  submittedAt: number
  submittedBy: string
}

export interface FormResponseList {
  items: FormResponse[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  fieldSummary?: Record<string, { count: number; topValues: unknown[] }>
  aggregationTruncated?: boolean
}

export const FormResponseSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  data: z.record(z.string(), z.unknown()),
  submittedAt: z.number(),
  submittedBy: z.string(),
}) satisfies z.ZodType<FormResponse>

export const FormResponseListSchema = z.object({
  items: z.array(FormResponseSchema),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
  fieldSummary: z.record(z.string(), z.object({
    count: z.number(),
    topValues: z.array(z.unknown()),
  })).optional(),
  aggregationTruncated: z.boolean().optional(),
}) satisfies z.ZodType<FormResponseList>

export const SubmitResponseResultSchema = z.object({ id: z.string() })
export const DuplicateReportResultSchema = z.object({ id: z.string(), name: z.string() })
```

#### 2-2. `src/api/client.ts` に Blob 専用ヘルパー追加

> **Research insight (TypeScript patterns + export-error-handling learning):** Blob には Zod を使わない。`apiFetchBlob` を追加しエラーハンドリングも統一。

```typescript
// Blob ダウンロード用 (CSV, Excel, PDF)
export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'include', ...init })
  } catch (cause) {
    throw new NetworkError('Network request failed', { cause })
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body, `HTTP ${res.status}: ${res.statusText}`)
  }
  return res.blob()
}

// ファイル名付きダウンロード
export async function apiFetchBlobWithFilename(path: string): Promise<{ blob: Blob; filename: string }> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'include' })
  } catch (cause) {
    throw new NetworkError('Network request failed', { cause })
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body, `HTTP ${res.status}: ${res.statusText}`)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') ?? ''
  const match = cd.match(/filename="?(.+?)"?(?:;|$)/)
  const filename = match ? match[1] : 'download'
  return { blob, filename }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

#### 2-3. `src/api/reportApi.ts` に API 関数を追加

```typescript
import {
  FormResponseSchema, FormResponseListSchema,
  SubmitResponseResultSchema, DuplicateReportResultSchema,
  type FormResponse, type FormResponseList,
} from '@/lib/schemas/formResponse'
import { apiFetchBlobWithFilename, downloadBlob } from './client'

export async function submitResponse(
  templateId: string,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  return apiFetch(`/api/v2/templates/${encodeURIComponent(templateId)}/responses`,
    SubmitResponseResultSchema, jsonBody({ data }))
}

export async function listResponses(
  templateId: string,
  opts: { offset?: number; limit?: number; aggregate?: boolean } = {},
): Promise<FormResponseList> {
  const params = new URLSearchParams({
    offset: String(opts.offset ?? 0),
    limit: String(opts.limit ?? 50),
    ...(opts.aggregate ? { aggregate: 'true' } : {}),
  })
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses?${params}`,
    FormResponseListSchema,
  )
}

export async function getResponse(templateId: string, responseId: string): Promise<FormResponse> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}`,
    FormResponseSchema,
  )
}

export async function deleteResponse(templateId: string, responseId: string): Promise<void> {
  return apiFetch(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}`,
    z.undefined(), { method: 'DELETE' },
  )
}

export async function exportResponses(
  templateId: string,
  format: 'csv' | 'excel',
): Promise<void> {
  const { blob, filename } = await apiFetchBlobWithFilename(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/export?format=${format}`,
  )
  downloadBlob(blob, filename)
}

export async function getResponsePdf(templateId: string, responseId: string): Promise<Blob> {
  const { blob } = await apiFetchBlobWithFilename(
    `/api/v2/templates/${encodeURIComponent(templateId)}/responses/${encodeURIComponent(responseId)}/pdf`,
  )
  return blob
}

export async function duplicateReport(id: string): Promise<{ id: string; name: string }> {
  return apiFetch(`/api/v2/templates/${encodeURIComponent(id)}/duplicate`,
    DuplicateReportResultSchema, { method: 'POST' })
}
```

#### 2-4. Zustand store へのレスポンス状態追加

> **Research insight (sidebar-ui learning + zustand-learning):** レスポンス状態は Zustand で管理。ローカル state 不可。5分TTLキャッシュで不要な再フェッチを防ぐ。

`src/store/uiSlice.ts` に追加:
```typescript
submitResponseModalOpen: boolean
openSubmitResponseModal: () => void
closeSubmitResponseModal: () => void
```

`src/store/responsesSlice.ts` を新規作成:
```typescript
type ResponsesSlice = {
  responses: FormResponse[]
  responsesTotal: number
  responsesCacheTime: number  // timestamp (5分TTL)
  responsesLoading: boolean
  setResponses: (items: FormResponse[], total: number) => void
  setResponsesLoading: (v: boolean) => void
  invalidateResponsesCache: () => void
}
```

バッチ更新ルール:
```typescript
setResponses: (items, total) => set((s) => {
  s.responses = items    // 1回の set() で両フィールドを更新
  s.responsesTotal = total
  s.responsesCacheTime = Date.now()
})
```

#### 2-5. `ResponsesPanel.tsx` を新規作成

`src/components/sidebar/ResponsesPanel.tsx`:

> **Research insight (sidebar-ui learning):** 左サイドバータブは `LEFT_TABS` 配列に追加。タブ状態は Zustand。ARIA roles 必須。

```typescript
// 非同期データロードは mountedRef + AbortController パターン
const mountedRef = useRef(true)
useEffect(() => () => { mountedRef.current = false }, [])

// 5分 TTL キャッシュ確認
useEffect(() => {
  const now = Date.now()
  if (!templateId) return
  if (now - cacheTime < 5 * 60 * 1000 && responses.length > 0) return
  // フェッチ...
}, [templateId, cacheTime])
```

UI 構成:
- 一覧テーブル: `submittedAt` (日時フォーマット)、`submittedBy` (userId)、フィールド数
- CSV / Excel エクスポートボタン (`isExporting` フラグで多重クリック防止)
- 各回答行: 「PDF回答票」「削除」アクション
- 集計セクション (`?aggregate=true` で取得): フィールドごとの件数・上位値

> **Research insight (XSS learning):** 回答値を DOM に表示する際は `textContent` を使い、`innerHTML` を避ける。`isSafeImageSrc()` を経由しない画像URLは表示しない。

#### 2-6. `SubmitResponseModal.tsx` を新規作成

`src/components/modals/SubmitResponseModal.tsx`:
- 現在の `testData` を表示して確認してから送信
- `Toolbar.tsx` に `Send` アイコンボタンを追加 (バックエンド接続中のみ表示)
- モーダル状態は Zustand `uiSlice` で管理

---

### Phase 3: テンプレート複製

#### 3-1. `V2TemplateController.java` に `duplicate()` 追加

```java
void duplicate(Context ctx) throws Exception {
    String sourceId = RequestValidator.validateId(ctx);
    if (sourceId == null) return;

    Principal principal = ctx.attribute("principal");
    if (principal.isAnonymous()) throw new UnauthorizedResponse();

    var stored = definitionsRepo.get(sourceId);
    if (stored.isEmpty()) { ctx.status(404); ...; return; }

    JsonNode original = mapper.readTree(stored.get());

    // オーナーシップ確認
    String owner = original.path("createdBy").asText("");
    if (!owner.isEmpty() && !owner.equals(principal.userId())) {
        ctx.status(403); ctx.json(Map.of("error", "Access denied")); return;
    }

    String newId = UUID.randomUUID().toString();
    long now = System.currentTimeMillis();
    String originalName = original.path("name").asText("テンプレート");
    String newName = originalName + " (コピー)";

    JsonNode originalDef = original.path("definition");
    ObjectNode newDef = originalDef.deepCopy();
    ((ObjectNode) newDef).put("id", newId);

    // 新規テンプレートとして createdBy を設定
    ObjectNode newEnvelope = buildEnvelope(newId, newName, now, now, newDef);
    newEnvelope.put("createdBy", principal.userId());

    definitionsRepo.put(newId, mapper.writeValueAsString(newEnvelope));
    // バージョン履歴はコピーしない (クリーンスタート)
    ctx.status(201).json(Map.of("id", newId, "name", newName));
}
```

`ApiRoutes.java` に追加:
```java
app.post("/api/v2/templates/{id}/duplicate", w.v2TemplateCtrl::duplicate);
```

#### 3-2. `TemplateSelectionModal.tsx` に複製ボタン追加

各テンプレート行にコンテキストメニュー or アイコンボタン。複製後にリストを再取得。

---

### Phase 4: バックエンドPDF生成

#### 4-1. `V2PdfController.java` を新規作成

```java
// POST /api/v2/templates/{id}/pdf
// Body: { testData?: Record<string, unknown>, variantId?: string }
// ⚠️ client-supplied projection は受け取らない (SSRF リスク)
void generate(Context ctx) {
    String templateId = RequestValidator.validateId(ctx);
    Principal principal = ctx.attribute("principal");
    // オーナーシップ確認...

    JsonNode body = mapper.readTree(ctx.body());
    JsonNode testData = body.path("testData");
    String variantId = body.path("variantId").asText(null);

    var defJson = definitionsRepo.get(templateId);
    // V2定義 → プロジェクション変換 (V2ProjectionBuilder)
    // CalculationEngine で計算適用
    // PdfRenderer.render() を30秒タイムアウト付き (pdfExecutor 再利用)
}
```

**V2ProjectionBuilder.java** (新規ユーティリティ):
`V2EvaluateController.wrapForCalculation()` パターンを参考に `ReportDefinition` → projection JSON 変換。

#### 4-2. Toolbar.tsx PDF ボタン改修

バックエンド接続中 (`hasTemplateId && backendConnected`) 時に「バックエンドPDF」オプションを追加。クライアントサイドPDFをデフォルト維持。

---

## System-Wide Impact

### Interaction Graph

```
submitResponse()
  → POST /api/v2/templates/{id}/responses
    → Rate limit check (userId-based)
    → Auth check (Principal.isAnonymous → 401)
    → Template existence + ownership check (v2_definitions.createdBy)
    → Depth + field count validation (max 8 levels, 1000 fields)
    → Write v2_form_responses (group_key = templateId)
    → submittedBy = principal.userId() [サーバースタンプ]
    → 201 response

listResponses()
  → GET /api/v2/templates/{id}/responses[?aggregate=true]
    → Ownership check
    → v2_form_responses.listByGroupKey(templateId)
    → Row count guard (>2000 → 422 + export誘導)
    → In-memory sort (submittedAt desc)
    → Pagination (offset/limit)
    → [?aggregate=true] → V2ResponseAggregator.build() (max 5000)
    → hasMore, aggregationTruncated flags

delete()
  → DELETE /api/v2/templates/{id}/responses/{rid}
    → Auth check
    → Rate limit
    → templateId cross-check (stored templateId == path templateId)
    → 所有者確認 (submittedBy == userId OR templateOwner == userId)
    → Hard delete
```

### Error Propagation

| レイヤー | エラー | 処理 |
|---------|--------|------|
| Controller | UnauthorizedResponse | 401 |
| Controller | NotFoundResponse | 404 (オーナーシップ違反も404で返す — 存在確認防止) |
| Controller | BadRequestResponse | 400 with message |
| Controller | Rate limit exceeded | 429 |
| Controller | Row count exceeded | 422 + export endpoint誘導 |
| ScalarDB | TransactionException | 500 + abortQuietly |
| PdfRenderer | TimeoutException | 504 |
| Frontend | fetch 4xx | toast error (role="alert") + 5秒後自動dismiss |
| Frontend | fetch 5xx | toast error + retry guidance |

> **Research insight (export-error-handling learning):** エクスポートボタンは `isExporting` フラグで多重クリックを防止。エラーは `role="alert"` + `aria-live="assertive"` で表示。

### State Lifecycle Risks

- `submitResponse` はトランザクション失敗時に `abortQuietly()` でクリーンアップ → orphaned state なし
- `duplicate` は1操作のみ (単純 `put`) → rollback 不要
- V1 `form_responses` テーブルとは完全分離 → 競合なし

### API Surface Parity

- `/api/v2/templates/{id}/responses` は認証済みユーザーのみ (see brainstorm: 公開リンク不要)
- V1の `/api/v1/public/forms/{id}` は V2 では実装しない
- セキュリティ修正 (Phase 0) は V1 コードにも適用すること

---

## Acceptance Criteria

### Phase 0 (前提条件)

- [x] `Principal.ANONYMOUS` のロールが空 (`Set.of()`) になっている
- [x] `V2TemplateController.create()` が `createdBy: userId` を保存する
- [x] V2ルートにレート制限が設定されている

### フォーム回答収集

- [x] ログイン済みユーザーが現在の `testData` を回答として送信できる
- [x] `submittedBy` はサーバー側でのみ設定される (クライアント値は無視)
- [x] 回答一覧がサイドバーパネルに表示される (submittedAt, submittedBy, フィールド数)
- [x] `?aggregate=true` パラメータで集計が返される
- [x] 2000件超はCSVエクスポートへ誘導する (422)
- [x] 回答をCSV形式でダウンロードできる (UTF-8 BOM付き、formula injection防止、`|`文字含む)
- [x] 回答をExcel形式でダウンロードできる (`.xlsx`、`CellType.STRING`で全セル設定)
- [x] 各回答のPDF回答票をダウンロードできる
- [x] 画面上でフィールドごとの集計が表示される (最頻値、件数)
- [x] 他ユーザーの回答への削除・閲覧は404を返す
- [x] 未認証アクセスは401を返す
- [x] JSONネスト深さ8超は400を返す
- [x] 1000フィールド超は400を返す

### テンプレート複製

- [x] テンプレートリストから「複製」できる
- [x] 複製後のテンプレート名は「{元の名前} (コピー)」
- [x] 複製後テンプレートの `createdBy` は実行ユーザーのIDになる
- [x] 他ユーザーのテンプレート複製は403を返す

### バックエンドPDF生成

- [x] `POST /api/v2/templates/{id}/pdf` が `application/pdf` を返す
- [x] `testData` が計算ルールに適用された状態でレンダリングされる
- [x] 30秒でタイムアウトし504を返す
- [x] クライアントから projection を渡しても無視される
- [x] クライアントサイドPDFは引き続きデフォルト動作

### 共通品質要件

- [x] テストカバレッジ 80%以上
- [x] 全エンドポイントに認証チェック
- [x] エラーレスポンスにスタックトレースを含めない

---

## Success Metrics

- 回答送信: 1秒以内 (p95)
- 1000件CSVエクスポート: 3秒以内
- バックエンドPDF生成: 10秒以内 (A4 1ページ)
- テンプレート複製: 2秒以内
- ResponsesPanel 初期ロード: 500ms以内 (50件)

---

## Dependencies & Prerequisites

| 依存 | 種類 | 備考 |
|------|------|------|
| `v2_form_responses` テーブル | **新規作成** | V1とは独立。`AppWiring` で `ensureTable()` |
| `v2_definitions.createdBy` フィールド | **前提条件修正** | Phase 0 で追加 |
| `PdfRenderer.java` | 既存 | Phase 4 で再利用 |
| Apache POI 5.2.5 | **新規依存** | `SXSSFWorkbook` (ストリーミング) |
| `pdfExecutor` (ExecutorService) | 既存 | `AppWiring` から注入 |

### Apache POI 追加 (build.gradle.kts)
```kotlin
implementation("org.apache.poi:poi-ooxml:5.2.5")
// Note: 約15-20MB fat-jar増加。SXSSFWorkbookで起動時影響最小化
```

---

## Risk Analysis

| リスク | 確率 | 影響 | 緩和策 |
|--------|------|------|--------|
| `createdBy` なし既存テンプレートへのアクセス | 高 | 中 | `owner.isEmpty()` の場合はアクセス許可 + 警告ログ (移行期) |
| PDF生成タイムアウト (複雑な帳票) | 中 | 中 | 30秒制限 + 非同期ジョブ (P3) |
| 大量回答でのCSVメモリ | 低 | 中 | 2000件上限ガード + export誘導 |
| DNS rebinding (PDF image SSRF) | 低 | 高 | DNS解決後IPピン留め (security-reviewerの推奨) |
| ScalarDB TEXT列サイズ制限 | 低 | 中 | V1で100KB制限が既存; 継続適用 |

---

## Implementation Order & Tasks

```
[x] Phase 0: 前提条件 — オーナーシップ基盤
    [x] Principal.ANONYMOUS のロールを Set.of() に修正
    [x] V2TemplateController.create() に createdBy 追加
    [x] AppWiring に v2SubmitLimiter, v2ExportLimiter 追加
    [x] ApiRoutes に V2ルートのレート制限適用
    [x] テスト

[x] Phase 1: バックエンド — フォーム回答収集
    [x] v2_form_responses テーブル作成 (AppWiring)
    [x] V2FormResponseController.java 作成
        [x] submit() (認証 + オーナーシップ + 深さ制限)
        [x] list() (ページング + ?aggregate=true オプトイン)
        [x] get() (オーナーシップチェック)
        [x] delete() (submittedBy or templateOwner のみ)
    [x] V2ResponseAggregator.java 作成
    [x] V2ResponseExportController.java 作成
        [x] CSV export (formula injection修正版)
        [x] Excel export (SXSSFWorkbook + CellType.STRING)
    [x] V2ResponsePdfController.java 作成 (pdfExecutor再利用)
    [x] ApiRoutes.java にルート登録
    [x] バックエンドテスト (JUnit)

[x] Phase 2: フロントエンド — フォーム回答収集 UI
    [x] src/lib/schemas/formResponse.ts 新規作成
    [x] src/api/client.ts に apiFetchBlob, downloadBlob 追加
    [x] src/api/reportApi.ts に API 関数追加
    [x] src/store/responsesSlice.ts 新規作成 (5分TTLキャッシュ)
    [x] src/store/uiSlice.ts に submitResponseModalOpen 追加
    [x] ResponsesPanel.tsx 新規作成 (mountedRef + AbortController)
    [x] SubmitResponseModal.tsx 新規作成
    [x] Toolbar.tsx に「回答送信」ボタン追加
    [x] 左サイドバーに「回答」タブ追加 (ARIA roles)
    [x] フロントエンドテスト (Vitest)

[x] Phase 3: テンプレート複製
    [x] V2TemplateController.java に duplicate() 追加 (オーナーシップ確認付き)
    [x] ApiRoutes.java にルート登録
    [x] reportApi.ts に duplicateReport() 追加
    [x] TemplateSelectionModal.tsx に複製ボタン追加
    [x] テスト

[x] Phase 4: バックエンドPDF生成
    [x] V2ProjectionBuilder.java 新規作成 (定義→projection変換)
    [x] V2PdfController.java 新規作成 (client projection受け取らない)
    [x] ApiRoutes.java にルート登録
    [x] Toolbar.tsx PDF ボタン改修
    [x] テスト
```

---

## Future Considerations

- **P3**: 非同期PDFジョブキュー (大量ページの帳票、既存 `JobController` パターン活用)
- **P3**: 回答のステータス管理 (下書き/提出済/承認済)
- **P3**: 公開フォームリンク (現在は不要とブレインストームで決定)
- **P3**: `submitted_at` / `submitted_by` を ScalarDB 独立カラムに昇格 (フィルタ/ソート最適化)
- **移行**: 既存テンプレートへの `createdBy` バックフィル

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-07-v1-backend-port-to-v2-brainstorm.md](docs/brainstorms/2026-04-07-v1-backend-port-to-v2-brainstorm.md)
  - Key decisions: 公開リンク不要・ログイン必須、CSV/Excel/PDF/画面集計の4出力、フォーム回答収集を最優先

### Internal References

| 参照先 | パス | 目的 |
|--------|------|------|
| V2 Template CRUD パターン | `server/src/main/java/com/report/server/V2TemplateController.java` | コントローラ構造 |
| V1 フォーム回答 (移植元) | `server/src/main/java/com/report/server/FormResponseController.java` | submit/list/CSV ロジック |
| V1 テンプレート複製 (移植元) | `server/src/main/java/com/report/server/TemplateExportController.java:306` | duplicate ロジック |
| PDF レンダラー | `server/src/main/java/com/report/server/PdfRenderer.java` | Phase 4 で再利用 |
| PDF非同期パターン | `server/src/main/java/com/report/server/PdfController.java` | CompletableFuture + 30s timeout |
| ScalarDB リポジトリ | `server/src/main/java/com/report/server/JsonBlobRepository.java` | テーブル操作パターン |
| DI コンテナ | `server/src/main/java/com/report/server/AppWiring.java` | 依存注入登録先 |
| ルーティング | `server/src/main/java/com/report/server/ApiRoutes.java` | ルート登録先 |
| 入力バリデーション | `server/src/main/java/com/report/server/RequestValidator.java` | 全境界値チェック |
| 認証プリンシパル | `server/src/main/java/com/report/server/auth/Principal.java` | Phase 0 修正先 |
| フロントエンド API クライアント | `src/api/reportApi.ts` | 既存パターン踏襲 |
| Zod スキーマ例 | `src/lib/schemas/evaluateResponse.ts` | スキーマ記述パターン |
| 既存サイドバーパネル | `src/components/sidebar/VersionHistoryPanel.tsx` | タブパネル UI パターン |
| テンプレートモーダル | `src/components/modals/TemplateSelectionModal.tsx` | 複製ボタン追加先 |

### Project Learnings Applied

| Learning | 適用箇所 |
|---------|---------|
| `docs/solutions/logic-errors/export-error-handling-json-api.md` | exportResponses の try/catch、isExporting フラグ、Blob download パターン |
| `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md` | 回答データの Zod バリデーション、ResponsesPanel での XSS 防止 |
| `docs/solutions/feature-implementation/sidebar-ui-reorganization-databinding-modal-templates.md` | ResponsesPanel タブ、SubmitResponseModal の Zustand 管理パターン |
| `docs/solutions/performance-issues/zustand-store-batch-updates-and-state-leak-fixes.md` | responses スライスのバッチ更新、5分TTLキャッシュ |
