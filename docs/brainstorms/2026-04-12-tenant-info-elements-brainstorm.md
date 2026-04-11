# Brainstorm: テナント情報要素（Tenant Info Elements）

**Date:** 2026-04-12  
**Status:** Draft  
**Requested by:** User

---

## What We're Building

テナント（組織）全体で共有する情報（会社名・住所・電話番号・ロゴ・代表者名など）を
バックエンドに保存し、帳票テンプレートの専用要素として配置・印刷できる機能。

設定は「データ設定」ダイアログの新タブ「テナント情報」で管理する。

---

## Why This Matters

現状、帳票に会社名・住所・ロゴを入れるには毎回テキスト要素に直接入力するか、
サンプルデータのフィールドとして定義する必要がある。
テナント情報は全帳票で共通なので、一元管理してどこでも再利用できれば：

- 住所変更時に全帳票を再編集しなくて済む
- ブランドロゴの差し替えが一か所で完結する
- 新規テンプレート作成時のボイラープレートが不要になる

---

## Chosen Approach: 専用要素タイプ × バックエンドAPI

`pageNumber` / `currentDate` と同じパターンで専用要素タイプを複数追加する。

### 要素タイプ（パレット「テナント情報」カテゴリに追加）

| 要素名 | type | 内容 |
|--------|------|------|
| 会社名 | `tenantCompanyName` | 会社名（テキスト） |
| 住所 | `tenantAddress` | 郵便番号＋住所（テキスト） |
| 電話番号 | `tenantPhone` | 電話番号（テキスト） |
| ロゴ | `tenantLogo` | 画像（URL or Base64） |
| 代表者名 | `tenantRepresentative` | 代表者名（テキスト） |
| カスタムフィールド | `tenantCustom` | キーを指定してカスタム値を表示 |

各要素はレンダラー・プロパティパネルを持ち、既存ブロック（`ElementFrame`, `TextContent`）を流用する。

### バックエンドAPI

```
GET    /api/v2/tenant          # テナント情報取得
PUT    /api/v2/tenant          # テナント情報更新（全フィールド）
```

スキーマ（JSON）:
```json
{
  "companyName": "株式会社サンプル",
  "postalCode": "100-0001",
  "address": "東京都千代田区...",
  "phone": "03-1234-5678",
  "email": "info@example.com",
  "representativeName": "山田太郎",
  "logoUrl": "https://...",
  "custom": {
    "taxRegistrationNumber": "T1234567890123"
  }
}
```

バックエンドの実装: `TenantController.java` + `TenantService.java`  
Storage: ScalarDB / SQLite の `tenant` テーブル（一行のみ）

### フロントエンド Zustand ストア

```ts
// store slice: tenantSlice
tenantInfo: TenantInfo | null
fetchTenantInfo(): Promise<void>   // アプリ起動時に呼ぶ
updateTenantInfo(info): Promise<void>
```

各要素のレンダラーは `useTenantInfo()` フックで値を取得し表示する。

### 管理UI

「データ設定」ダイアログ → 新タブ「テナント情報」  
- 各フィールドのフォーム入力
- ロゴ: ファイルアップロード（Base64形式でDB保存）+ プレビュー表示
- カスタムフィールド: key/value のリスト（データ設定の既存UIを流用）

---

## Key Decisions

| 決定事項 | 選択 | 理由 |
|----------|------|------|
| 要素設計 | 複数専用タイプ | pageNumber/currentDate と同パターンで指一性高い |
| 保存場所 | バックエンドAPI | 複数ユーザーで共有・永続化が必要 |
| 管理UI | データ設定ダイアログの新タブ | 既存フローに自然に統合 |
| ロゴ | ファイルアップロード（Base64） | 最初から使えるべき。URLは外部依存でアクセス不能リスクあり |
| カスタムフィールド | `tenantCustom` 要素 + キー指定 | 汎用性を確保しつつ要素タイプを増やさない |

---

## Resolved Questions

| 質問 | 決定 |
|------|------|
| ロゴの取り扱い | ファイルアップロード（Base64）を最初から実装 |
| 認可 | 全ログインユーザーが編集可能（ロール判定不要） |

## Open Questions

1. **カスタムフィールドの数**: 上限を設けるか（例: 最大20フィールド）？
2. **プレビューデータとの統合**: PDF エクスポート時にテナント情報を `evaluate` APIに渡す方法（テナント情報は `$tenant.*` 変数として `ExpressionEngine` に注入するか、または通常のフィールドとしてマージするか）？

---

## Out of Scope (YAGNI)

- マルチテナント（テナント切り替え）— 現在は単一テナント前提
- テナントごとのユーザー分離 — 既存の認証モデルを変更しない
- 帳票ごとにテナント情報をオーバーライドする機能
- i18n / 多言語対応

---

## Implementation Sketch (not plan)

フェーズ的には：
1. バックエンド: `TenantController` + DB テーブル作成
2. フロント: Zustand `tenantSlice` + API クライアント
3. UI: データ設定ダイアログ「テナント情報」タブ
4. 要素: 各 `tenant*` 要素タイプの Renderer + PropertiesPanel
5. パレット: `ElementPalette.tsx` に「テナント情報」カテゴリを追加
