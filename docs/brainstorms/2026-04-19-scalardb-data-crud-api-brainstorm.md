---
date: 2026-04-19
topic: scalardb-data-crud-api
---

# ScalarDB データ CRUD API + データブラウザ編集 UI

## What We're Building

ScalarDB テーブルの行データを挿入・更新・削除するための汎用 REST API と、既存のデータブラウザ UI にインライン編集 + モーダル詳細編集機能を追加する。

現状、ScalarDB テーブルは読み取り専用（`GET .../rows`）とテーブル作成（`POST .../tables`）のみ。データの投入はシードスクリプト (`SeedData.java`) か外部ツール経由でしか行えない。この機能により、ユーザーがブラウザ上でデータを直接管理できるようになる。

## Why This Approach

3つのアプローチを検討した:

1. **テーブル固有のコントローラー** — テーブルごとに専用エンドポイント。型安全だが、テーブル追加のたびにコード変更が必要。
2. **汎用 CRUD エンドポイント (採用)** — 既存の Scan コントローラーと同じパターンで `{ns}/{table}` パスパラメータを使う汎用 API。テーブルスキーマ (`TableMetadata`) から動的に型検証する。
3. **GraphQL / OData** — 柔軟だが、ScalarDB の制約（パーティションキー必須、セカンダリインデックス制限）と合わない。過剰な複雑さ。

アプローチ 2 を採用。理由: 既存の `V2ScalarDbScanController` と同じパターンで一貫性があり、新テーブル追加時にバックエンド変更不要。YAGNI の観点からも最もシンプル。

## Key Decisions

- **エンドポイント設計**: 既存 Scan と同じ `{ns}/{table}` パスパラメータパターンを踏襲
  - `POST   /api/v2/scalardb/tables/{ns}/{table}/rows` — 行挿入
  - `PUT    /api/v2/scalardb/tables/{ns}/{table}/rows` — 行更新 (upsert: キーで行を特定し、渡された値カラムのみ上書き)
  - `DELETE /api/v2/scalardb/tables/{ns}/{table}/rows` — 行削除
- **名前空間保護**: `report_studio` 名前空間への書き込みは拒否（403）。システムテーブル（users, templates, products 等）の誤操作を防ぐ。読み取り（既存 Scan）は引き続き許可
- **削除方式**: 物理削除（ScalarDB の Delete 操作）。ソフトデリートはカラム追加が全テーブルに必要になり過剰
- **リクエスト形式**: JSON ボディでカラム値を渡す。パーティションキー + クラスタリングキーは必須フィールド
- **バリデーション**: `TableMetadata` からカラム名・型を動的に取得し、リクエスト値を検証。存在しないカラム名は拒否
- **型変換**: ScalarDB DataType に基づく変換（TEXT→String, INT→int, BIGINT→long, FLOAT→float, DOUBLE→double, BOOLEAN→boolean）
- **エラーレスポンス**: 既存パターン準拠 `{"error": "...", "correlationId": "..."}` — 400 (バリデーション), 403 (保護名前空間), 404 (行/テーブル不在), 503 (ScalarDB 障害)
- **UI 編集方式**: インライン編集（セルダブルクリック）+ モーダル詳細編集（行クリック）の両方
- **認証**: 既存パターンと同様、認証済みユーザーのみ書き込み可能
- **監査ログ**: 全書き込み操作を `AuditLog.op()` で記録
- **レート制限**: 書き込み操作は 10 req/min per user

## API 詳細設計

### POST /api/v2/scalardb/tables/{ns}/{table}/rows (挿入)

```json
// Request
{
  "values": {
    "id": "C-003",
    "customer_name": "テスト株式会社",
    "postal_code": "150-0001",
    "address": "東京都渋谷区神宮前1-1-1"
  }
}

// Response 201 Created
{
  "row": { "id": "C-003", "customer_name": "テスト株式会社", ... }
}
```

### PUT /api/v2/scalardb/tables/{ns}/{table}/rows (更新)

```json
// Request — パーティションキー + クラスタリングキーで特定、残りは更新値
{
  "values": {
    "id": "C-003",
    "customer_name": "テスト株式会社（更新）",
    "address": "東京都渋谷区神宮前2-2-2"
  }
}

// Response 200 OK
{
  "row": { "id": "C-003", "customer_name": "テスト株式会社（更新）", ... }
}
```

### DELETE /api/v2/scalardb/tables/{ns}/{table}/rows (削除)

```json
// Request — キーカラムのみ必須
{
  "keys": {
    "id": "C-003"
  }
}

// Response 204 No Content
```

## UI 設計

### データグリッドのインライン編集
- セルをダブルクリックで編集モードに入る
- Enter で確定（PUT API コール）、Escape でキャンセル
- 型に応じた入力コントロール（テキスト/数値/真偽値チェックボックス）

### 行操作ボタン
- グリッド上部に「行を追加」ボタン → 空行をグリッドに追加、入力後に POST
- 各行の右端に削除ボタン（確認ダイアログ付き） → DELETE API コール

### モーダル詳細編集
- 行をクリック（非編集セル）でモーダルを開く
- 全カラムをフォーム形式で表示・編集
- 保存ボタンで PUT API コール

## Open Questions

なし — 全ての主要決定が完了。

## Next Steps

→ `/workflows:plan` for implementation details
