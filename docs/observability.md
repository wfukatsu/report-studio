# Observability / 運用可視性

Report Studio の運用可視性（ヘルスチェック・メトリクス・ログ）についてまとめます。
本番導入の判断材料となる最小限の可視性を、外部依存なし（Prometheus/Micrometer 等を使わず）で提供します。

---

## 1. ヘルスチェック

### 1.1 ライブネスプローブ（公開・認証不要）

外部の監視・ロードバランサ・Docker ヘルスチェック向けの軽量エンドポイント。**挙動は従来どおり不変**です。

| エンドポイント | レスポンス | 用途 |
|---------------|-----------|------|
| `GET /api/v1/health` | `200 {"status":"ok"}` | 汎用ライブネス |
| `GET /api/v2/health` | `204 No Content` | 軽量ライブネス |

> Docker Compose のバックエンドヘルスチェックは、全 ScalarDB テーブルの初期化完了後に
> ポート 8080 が listen を開始することを利用した TCP 接続チェックです（`docker-compose.yml` 参照）。

### 1.2 詳細ヘルスチェック（admin 専用）

`GET /api/v1/admin/health` — 内部状態を開示するため **admin ロール必須**（`/api/v1/admin/*` の before-filter で強制）。

チェック項目:

- **ScalarDB 接続性** — `report_studio` 名前空間への軽量メタデータ往復。`status`（up/down）と `latencyMillis`。
- **ジョブキュー滞留** — 永続ジョブの `PENDING` / `PROCESSING` 件数と合計 `backlog`。
- **ジョブ用ディスク残量** — `data/jobs` の `usableBytes` / `totalBytes` / `freeRatio`。

総合ステータス:

| status | HTTP | 条件 |
|--------|------|------|
| `UP` | 200 | 全項目正常 |
| `DEGRADED` | 200 | キュー滞留が閾値以上、またはディスク残量が閾値未満 |
| `DOWN` | 503 | ScalarDB 接続不可 |

劣化判定の閾値（`HealthController` の定数）:

- キュー滞留: `backlog >= 100`
- ディスク: `usableBytes < 512 MiB` または `freeRatio < 0.10`

レスポンス例:

```json
{
  "status": "UP",
  "uptimeMillis": 3600000,
  "scalardb": { "status": "up", "latencyMillis": 3 },
  "jobs": { "pending": 0, "processing": 1, "backlog": 1, "degraded": false },
  "disk": { "path": "/data/jobs", "usableBytes": 42000000000, "totalBytes": 62000000000, "freeRatio": 0.677, "degraded": false }
}
```

---

## 2. メトリクス（admin 専用）

`GET /api/v1/admin/metrics` — プロセス起動からの累積カウンタ（再起動でリセット）。**admin ロール必須**。

外部依存のない軽量な in-process レジストリ（`Metrics` クラス）で収集します。

| セクション | 指標 | 説明 |
|-----------|------|------|
| `pdf` | `count` / `errorCount` / `totalMillis` / `avgMillis` / `lastMillis` | PDF 生成の件数・失敗数・所要時間 |
| `jobs` | `completed` / `failed` / `cancelled` | バッチ PDF ジョブの終端結果 |
| `rateLimit` | `trips` | 全レートリミッタ（ログイン・エクスポート・行書き込み等）の拒否回数の合計 |
| （トップレベル） | `uptimeMillis` | プロセス稼働時間 |

レスポンス例:

```json
{
  "uptimeMillis": 3600000,
  "pdf": { "count": 128, "errorCount": 2, "totalMillis": 41000, "avgMillis": 320, "lastMillis": 290 },
  "jobs": { "completed": 12, "failed": 1, "cancelled": 0 },
  "rateLimit": { "trips": 4 }
}
```

計装ポイント: `PdfRenderer.renderToStream`（生成件数・所要時間・失敗）、`BatchPdfProcessor`（ジョブ終端）、`RateLimiter.isAllowed`（拒否）。

---

## 3. 構造化ログ（現状）

- **ロギング実装**: `slf4j-simple` 2.0.16（logback/log4j は不使用、`simplelogger.properties` は未配置でデフォルト設定）。出力は標準エラー。
- **監査ログ**: `AuditLog.op(...)` が `AUDIT op=... user=... ns=... table=... outcome=... correlationId=...` の
  **key=value（logfmt）形式**で出力。ログ集約基盤でのパースが可能です。
- **相関 ID**: 状態変更系エンドポイントは 8 文字の `correlationId` をレスポンス本文とログの両方に付与し、
  ログ行とクライアントが受け取ったエラーを突き合わせられます。

### 現状の評価と今後の選択肢

現状は完全な JSON 構造化ログではありませんが、logfmt + correlationId により実用的な追跡性は確保されています。
本番で JSON 構造化ログ（フィールド抽出・集約）が必要になった場合の選択肢:

- `slf4j-simple` を logback + `logstash-logback-encoder` に差し替え、JSON エンコーダを設定する。
- ログ収集側（Fluent Bit / Vector 等）で logfmt をパースする（アプリ変更不要）。

いずれも本番導入後のフィードバックを見て優先度を判断します（scope-definition.md の Must/Should 対象外）。

---

## 4. リバースプロキシ利用時の注意

Docker 構成では nginx 経由でアクセスするため、レート制限の `ctx.ip()` はプロキシの IP を見ます。
per-IP 制限を厳密に機能させたい本番環境では、信頼するプロキシと `X-Forwarded-For` の取り扱いを別途構成してください。
