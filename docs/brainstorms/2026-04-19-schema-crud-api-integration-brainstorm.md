# Schema CRUD API 統合 & フロントエンド連携

**Date:** 2026-04-19
**Status:** Brainstorm Complete

## What We're Building

フロントエンドの `schemaSlice`（Zustand）とバックエンドのスキーマAPIを接続し、スキーマのグループ・フィールドをフルCRUD（作成・読み取り・更新・削除）でAPI経由で永続化する。

既存の2つのスキーマAPI（`/api/v1/schemas` と `/api/v2/schema-library`）を統合した新しいv2エンドポイントに一本化する。

### 主な機能

1. **スキーマグループのCRUD** — グループの作成・更新・削除をAPIに永続化
2. **スキーマフィールドのCRUD** — フィールドの追加・変更・削除をAPIに永続化
3. **共有機能の維持** — visibility（private/shared）による他ユーザーへのスキーマ共有
4. **schemaSliceとの双方向同期** — フロントエンドの状態変更をAPIに反映、APIからの読み込みをstoreに反映

## Why This Approach

**アプローチ A: 統合v2 Schema API** を選択。

- 既存の `/api/v2/schema-library` は既にフルCRUD + visibility + 所有権管理を備えている
- `/api/v1/schemas` のID自動生成やScalarDB型マッピング機能を取り込むことで機能が完結する
- v2パターン（`JsonBlobRepository`、エンベロープ形式）に統一することでコード重複を削減

### 却下したアプローチ

- **B: テンプレート埋め込み型** — スキーマライブラリとの二重管理が複雑
- **C: フロントエンド主導バルク方式** — 粒度の細かいAPI操作ができない

## Key Decisions

1. **統合先は `/api/v2/schema-library`** — 既存のv2パターンを拡張
2. **フルCRUDをAPI経由で実行** — schemaSliceの各アクション（addSchemaGroup, removeSchemaGroup, updateSchemaField等）がAPIコールを伴う
3. **共有機能（visibility）を維持** — private/sharedの区別を新APIでも継続
4. **v1 APIの機能を統合** — ID自動生成（sch-, grp-, fld-プレフィックス）、ScalarDB型マッピングをv2に取り込み

## Scope

### In Scope

- `/api/v2/schema-library` の拡張（グループ・フィールド単位のCRUDエンドポイント追加）
- フロントエンドのAPIクライアント作成（`src/lib/` or `src/api/`）
- `schemaSlice` のアクションにAPI呼び出しを統合
- v1 APIの有用な機能（型マッピング、バリデーション）の移植

### Out of Scope

- v1 APIの廃止（別タスク）
- UIの変更（スキーマエディタのUI自体は既存のまま）
- ScalarDB接続の実行時テスト

## Data Flow Strategy

### 同期方式: 楽観的更新（Optimistic Update）

1. ユーザーがUIで操作 → schemaSliceを即座に更新（UIは即反映）
2. バックグラウンドでAPIコールを実行
3. 成功時: そのまま（stateは既に最新）
4. 失敗時: stateをロールバック + エラー通知を表示

### エラーハンドリング

- API失敗時はトースト通知でユーザーに伝達
- ネットワークエラー時はリトライ（最大3回）
- stateロールバックにはimmerのパッチ機能を活用可能

## API設計概要（案）

```
# スキーマ全体
GET    /api/v2/schemas              — 一覧（own + shared）
POST   /api/v2/schemas              — 新規作成
GET    /api/v2/schemas/{id}         — 取得
PUT    /api/v2/schemas/{id}         — 全体更新
DELETE /api/v2/schemas/{id}         — 削除

# グループ操作（ネストリソース）
POST   /api/v2/schemas/{id}/groups           — グループ追加
PUT    /api/v2/schemas/{id}/groups/{groupId} — グループ更新
DELETE /api/v2/schemas/{id}/groups/{groupId} — グループ削除

# フィールド操作（ネストリソース）
POST   /api/v2/schemas/{id}/groups/{groupId}/fields           — フィールド追加
PUT    /api/v2/schemas/{id}/groups/{groupId}/fields/{fieldId} — フィールド更新
DELETE /api/v2/schemas/{id}/groups/{groupId}/fields/{fieldId} — フィールド削除
```

注: `/api/v2/schema-library` から `/api/v2/schemas` にリネームするかは計画フェーズで決定。

## Migration Strategy

### v1 APIからの移行

- v1の有用な機能（バリデーション制限、ScalarDB型マッピング）をv2に移植
- v1 APIは当面そのまま残す（Out of Scope で廃止は別タスク）
- フロントエンドの既存v1呼び出し箇所があれば、新APIに切り替え

## Open Questions

_（なし — 主要な決定はすべて合意済み）_

## Technical Notes

### 既存の構造

- **Backend v1**: `SchemaController` — POST/GET/PUT、max 50 groups、max 200 fields/group
- **Backend v2**: `SchemaLibraryController` — full CRUD + visibility
- **Frontend store**: `schemaSlice` — addSchemaGroup, removeSchemaGroup, updateSchemaField, bindGroupToTable, setElementSchemaBinding
- **Storage**: `JsonBlobRepository` — フラットKV、JSONブロブ形式
