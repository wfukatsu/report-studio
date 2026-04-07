# V1バックエンド機能のV2移植 — ブレインストーム

**Date:** 2026-04-07  
**Status:** Completed (P1 + P2 implemented 2026-04-07)

---

## What We're Building

V1バックエンドに存在するが V2 バックエンドにまだ移植されていない機能を特定し、
どの機能を・どの順序で・どのような設計で V2 に追加すべきかを検討する。

---

## 現状サマリー

### V2で完全実装済み

| 機能 | エンドポイント | 状態 |
|------|--------------|------|
| Template CRUD | `/api/v2/templates` | ✅ 動作中 |
| バージョン管理 | `/api/v2/templates/{id}/versions` | ✅ 動作中 |
| 計算ルール評価 | `/api/v2/templates/{id}/evaluate` | ✅ 動作中 |
| バリデーション評価 | `/api/v2/templates/{id}/validate` | ✅ バックエンド実装済み |
| 認証 | `/api/v1/auth/*` | ✅ 動作中 |

### フロントエンドで接続待ち (バックエンド実装済み)

- **Validateボタン接続**: `Toolbar.tsx`の`handleValidate()`が実装済みだが、UIボタンが無効化またはP2マーク

### V1にあってV2未実装のギャップ

| 機能 | V1エンドポイント | 優先度 |
|------|--------------|--------|
| Validateボタン接続 | (フロントのみ) | P1 |
| PDF生成 (バックエンド) | `/api/v1/templates/{id}/pdf` | P2 |
| 非同期PDFジョブ | `/api/v1/jobs/*` | P2 |
| フォーム回答収集 | `/api/v1/templates/{id}/responses/*` | P3 |
| 公開フォームリンク | `/api/v1/public/forms/{id}/*` | P3 |
| CSV/Excelエクスポート | `/api/v1/templates/{id}/export-submission` | P3 |
| テンプレート複製 | `/api/v1/templates/{id}/duplicate` | P2 |
| テンプレートインポート/エクスポート | `/api/v1/templates/import` など | P2 |
| サムネイル生成 | `/api/v1/templates/{id}/thumbnail` | P3 |
| スキーマ・バインディングツリー | `/api/v1/schemas/{id}` など | P3 |

---

## Why This Approach

### 設計原則

1. **フロントエンドで代替可能なものはそのまま** — PDF出力はhtml2canvas+jsPDFで十分。バックエンドPDFは不要かもしれない。
2. **使われない機能は実装しない (YAGNI)** — 公開フォーム・回答収集はユースケースが確定してから。
3. **既存エンジンを再利用** — V1の`ExpressionEngine`, `CalculationEngine`, `ValidationEngine`はV2バックエンドに移植済み。

---

## Key Decisions

| 決定事項 | 内容 |
|---------|------|
| PDF生成 | クライアントサイド(html2canvas)を維持。バックエンドPDFはP2として後回し |
| フォーム回答 | V2ではまず「設計ツール」としての完成を優先。収集機能はP3 |
| テンプレート複製 | UIニーズが高いため P2 で追加 |
| Validateボタン | 既にバックエンド完成。フロントの接続のみでP1達成可能 |

---

## Open Questions

1. **テンプレートインポート/エクスポート**: JSONファイルによる共有が必要か?

---

## Resolved Questions

| 質問 | 回答 |
|------|------|
| テンプレート複製機能は必要か | 必要 → P2で実装 |
| PDFはクライアントサイドで十分か | バックエンドPDF生成も必要 → P2で追加 |
| V2のスコープ | 帳票設計 + フォーム回答収集の両方を含める |
| 公開フォームリンクは必要か | 不要。回答はログインユーザーのみ |
| 回答データの出力形式 | CSV・Excel・PDF回答票 + 画面上で集計表示 |
| P2で最優先の機能 | フォーム回答収集 |

---

## フォーム回答収集の設計方針

- **アクセス制御**: ログイン必須（公開リンクなし）
- **出力**: CSV、Excel、PDF回答票、画面集計
- **API設計案**:
  - `GET /api/v2/templates/{id}/responses` — 回答一覧
  - `POST /api/v2/templates/{id}/responses` — 回答送信 (ログイン済みユーザー)
  - `GET /api/v2/templates/{id}/responses/{rid}` — 回答詳細
  - `GET /api/v2/templates/{id}/responses/export?format=csv|excel` — エクスポート
  - `GET /api/v2/templates/{id}/responses/{rid}/pdf` — PDF回答票
  - `GET /api/v2/templates/{id}/responses/summary` — 集計データ

---

## Next Steps

優先度別の実装候補:

### P1 (すぐに対応)
- [x] `Toolbar.tsx`のValidateボタンをバックエンドAPIに接続 — 実装済み確認、コメント更新のみ

### P2 (次のフェーズ) — フォーム回答収集を最優先
- [x] フォーム回答収集 API (`/api/v2/templates/{id}/responses`)
- [x] 回答一覧・集計UI
- [x] CSV/Excelエクスポート
- [x] PDF回答票生成
- [x] テンプレート複製 API (`POST /api/v2/templates/{id}/duplicate`)
- [x] バックエンドPDF生成 (`POST /api/v2/templates/{id}/pdf`)

### P3 (将来)
- [x] テンプレートエクスポート/インポート  ← PR #2
- [x] 非同期PDFジョブキュー  ← PR #5
- [x] サムネイル生成  ← PR #3
- [x] データバインディング用スキーマ管理  ← PR #5
