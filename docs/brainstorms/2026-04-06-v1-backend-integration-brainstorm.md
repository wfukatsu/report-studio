# V1バックエンド統合ブレインストーム

**Date:** 2026-04-06  
**Status:** Final

---

## What We're Building

`report-design-studio` (V1) の本格的なバックエンドを `report-design-studio-v2` に統合する。

V1は **Java/Javalin + ScalarDB** バックエンドを持ち、以下を実装済み：
- JEXL式評価エンジン（sum/avg/count/min/max集計関数付き）
- CalculationEngine（トポロジカルソートによる依存関係解決）
- ValidationEngine（条件式バリデーション）
- サーバーサイドPDF（PDFBox）
- テンプレートCRUD + バージョン管理
- フォームレスポンス収集

V2は現在Pure SPA（`{{field}}`補間のみ、ブラウザ内状態のみ）。

---

## Why This Approach

**V1 Javaバックエンドを専用バックエンドとして維持しつつ、APIをV2の型定義に合わせて作り直す。**

- V1の計算・バリデーションエンジン（JEXL, CalculationEngine, ValidationEngine）は実績があり再実装コストが高い → 維持
- V1のAPI形式はV1フロントエンド向けに設計されており、V2とは乖離がある → V2型でAPIを作り直す
- Puppeteer PDF（独立リポジトリ）をサイドカーとして追加し、V2のReactコンポーネントをそのままPDF化

---

## System Architecture

```
V2 Frontend (React SPA)
    │
    ├── Template API ──────────────► V1 Java API (port 8080) ← V2の型定義に合わせてAPIを刷新
    │   (CRUD, バージョン管理)           ├── ScalarDB (SQLite)
    │                                   ├── ExpressionEngine (JEXL) — そのまま維持
    ├── 計算・バリデーション API ──────► ├── CalculationEngine — そのまま維持
    │                                   └── ValidationEngine — そのまま維持
    │
    └── PDF生成 ────────────────────► Puppeteer PDF Server (独立リポジトリ, port 3001)
                                        └── Headless Chromium → V2 UI をPDF化
```

---

## Key Decisions

### 1. V1 Java API を V2型定義に合わせて刷新

V1のAPI形式（ネスト構造の projection format）をV2の `ReportElement` 型定義に合わせて作り直す。  
**変換レイヤーは不要。** V1のエンジン（JEXL/Calculation/Validation）はそのまま維持し、APIのシリアライズ形式のみ変更する。

- V2の `src/types/index.ts` が唯一の型定義ソースとなる
- V1は V2の JSON をそのまま受け取り保存・評価する薄いサービスとして動作
- `projectionConverter` は廃止

### 2. Puppeteer PDF サーバー（独立リポジトリ）

V1のPDFBox は V2のReact UIと乖離している。V2 のUIをそのままPDF出力するために Puppeteer を使う。  
`report-pdf-server` として独立リポジトリを作成し、V2フロントエンドのプレビューページをPDF化する。

### 3. 式評価はV1 API経由（エンジンそのまま）

`{{sum(items, 'amount')}}` のような集計式は V1 ExpressionEngine API を呼び出して評価する。  
V2型でリクエストを送り、V1がJEXLで評価して結果を返す。プレビュー時にデバウンス付きで非同期評価する。

### 4. オフライン時は SPA フォールバック

V1バックエンドが起動していない場合、V2は現状のSPA動作（保存なし・式評価なし）で動作継続する。  
接続状態はUI上でインジケーター表示する。

### 5. 公開フォーム機能は将来準備のみ

型定義・データモデルの設計時に将来の公開フォーム機能を考慮した構造にするが、今回は実装しない。

### 6. 認証の引き継ぎ

V1はセッションCookie（bcrypt）認証。V2 フロントエンドは同じCookieを使う。  
開発環境ではViteの `proxy` 設定でV1へのCORS問題を回避する。

---

## Integration Scope (優先順位順)

### P0 — 基盤接続
- [ ] V1 Java API への接続設定（Vite proxy / CORS）
- [ ] V1 Java API を V2型定義に合わせて刷新（テンプレートCRUD）
- [ ] V2 から API を呼ぶ `src/api/` レイヤーの追加
- [ ] 認証フロー（login/logout/me）

### P1 — データバインディング強化
- [ ] 式評価 API エンドポイント（V1 ExpressionEngine、V2型でI/F刷新）
- [ ] CalculationEngine 連携（計算フィールドの依存関係解決）
- [ ] ValidationEngine 連携（条件式バリデーション表示）
- [ ] 集計関数対応：`{{sum(items, 'price')}}` など
- [ ] `src/lib/dataBinding.ts` の拡張（非同期評価対応）

### P2 — PDF 強化
- [ ] `report-pdf-server` 独立リポジトリの作成（Puppeteer + Express）
- [ ] V2 UI の `?mode=pdf` ルート追加（PDF専用レンダリングモード）
- [ ] `POST /pdf` エンドポイント → V2 UIのプレビューページをPDF化

### P3 — テンプレート管理
- [ ] バージョン管理UI（一覧・復元）
- [ ] テンプレートインポート/エクスポート
- [ ] スキーマ管理（フィールドメタデータ定義）

---

## Risks

| リスク | 影響 | 対策 |
|--------|------|------|
| V1 Java APIの刷新コストが想定より大きい | 実装期間の延長 | 最初にP0のAPI PoC を実施し規模感を確認 |
| V1 Java の起動コスト（開発体験） | 開発者体験の低下 | docker-compose で V1 + V2 を一括起動 |
| Puppeteer の CSS/フォント再現性 | PDF 品質 | プレビューモードで専用 CSS を適用 |
| 式評価のレイテンシ（ネットワーク往復） | プレビュー体験の低下 | デバウンス500ms + ローカルキャッシュ |

---

## Out of Scope (今回)

- 公開フォーム・レスポンス収集機能（将来のための型設計のみ）
- ジョブキュー（バッチ PDF）
- 新しい DB の導入（ScalarDB を維持）

---

## Frontend API Layer Design

### ファイル構成

```
src/
  api/
    client.ts        # ベースfetchラッパー（認証Cookie・エラー処理・オフライン検知）
    templates.ts     # テンプレートCRUD
    evaluate.ts      # 式評価・計算・バリデーション
    versions.ts      # バージョン管理
    auth.ts          # ログイン/ログアウト/me
  store/
    computedStore.ts # 計算結果専用ストア（履歴に含まない）
```

### API モジュールインターフェース

```typescript
// templates.ts
export const templates = {
  list():   Promise<{ items: TemplateListItem[]; total: number }>,
  get(id):  Promise<ReportDefinition>,   // ← V2型そのまま、変換なし
  create(name): Promise<TemplateListItem>,
  save(id, definition: ReportDefinition): Promise<ReportDefinition>,
  delete(id): Promise<void>,
}

// evaluate.ts
export const evaluate = {
  calculations(rules: CalculationRule[], data): Promise<{
    results: Record<string, unknown>,
    errors:  Record<string, string>,
  }>,
  validate(rules: ValidationRule[], data): Promise<{
    violations: ValidationViolation[],
  }>,
}

// versions.ts
export const versions = {
  list(templateId): Promise<VersionListItem[]>,
  create(templateId): Promise<VersionListItem>,
  restore(templateId, versionId): Promise<ReportDefinition>,
}
```

### Zustand ストアへの追加

```typescript
// uiSlice に追加
backendConnected: boolean        // V1 Java API 接続状態
currentTemplateId: string|null   // 開いているテンプレートID

// layoutSlice に追加（store内に直接、非同期アクション）
loadFromBackend(id: string): Promise<void>   // GET → loadReport()
saveToBackend(): Promise<void>               // PUT with definition

// src/store/computedStore.ts（新規）
{
  values:     Record<string, unknown>,    // calculationRule key → 評価済み値
  errors:     Record<string, string>,     // key → エラーメッセージ
  violations: ValidationViolation[],
  loading:    boolean,
}
```

### 自動保存フロー（2秒デバウンス）

```
ユーザー操作（addElement, updateElement など）
    ↓
Zustand store 即座に更新 → UI反映（楽観的更新）
    ↓ debounce 2000ms
saveToBackend() → PUT /api/v2/templates/:id
    ├── 成功 → UIに「保存済み ✓」
    └── 失敗 → UIに「保存失敗 ⚠」トースト（SPA動作は継続）

calculationRules or testData 変更
    ↓ debounce 500ms
evaluate.calculations() → POST /api/v2/evaluate/calculations
    ↓
computedStore.values 更新 → ElementRenderer が参照
```

---

## API Design (V2-first)

### エンドポイント一覧

```
# テンプレート CRUD
GET    /api/v2/templates              → { items: TemplateListItem[], total: number }
POST   /api/v2/templates              → TemplateListItem
GET    /api/v2/templates/:id          → ReportDefinition
PUT    /api/v2/templates/:id          → ReportDefinition
DELETE /api/v2/templates/:id          → 204

# バージョン管理
GET    /api/v2/templates/:id/versions        → VersionListItem[]
POST   /api/v2/templates/:id/versions        → VersionListItem
GET    /api/v2/templates/:id/versions/:vid   → ReportDefinition
POST   /api/v2/templates/:id/versions/:vid/restore → ReportDefinition

# 式評価（JEXL エンジン維持）
POST   /api/v2/evaluate/expression    → { result: unknown, error?: string }
POST   /api/v2/evaluate/calculations  → { results: Record<key, value>, errors: Record<key, string> }
POST   /api/v2/evaluate/validate      → { violations: ValidationViolation[] }

# 認証（V1 そのまま引き継ぎ）
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
```

**バージョン戦略**: `/api/v1/` は V1 フロントエンドとの互換性保持のため維持。V2 向けに `/api/v2/` を新設し、移行完了後に `/api/v1/` を廃止。

### 型差分マッピング

| 項目 | V1 現在 | V2 (正) |
|------|---------|---------|
| ルート構造 | `{ templates: [...] }` ラップ | `ReportDefinition` 直渡し |
| ページ概念 | `sections[]` (page_base/detail/repeat) | `pages[].sections[]` (header/body/footer/custom) |
| 要素種別名 | `kind: 'text'/'seal_box'/'row_block'` (25種) | `type: 'text'/'hanko'/'table'` (14種) |
| セクション種別 | `'page_base'/'detail_table'/'repeat'/'free'` | `'header'/'body'/'footer'/'custom'` |
| 計算ルール | `targetField + roundingPolicy` | `key + label + resultType + onError + format` |
| ページ設定 | `pageSetup.margins.topMm` | `pageSettings.margins.top` (mm暗黙) |

### 式評価リクエスト例

```json
POST /api/v2/evaluate/calculations
{
  "rules": [
    { "key": "subtotal", "expression": "qty * unitPrice", "resultType": "number", "onError": "zero" },
    { "key": "total",    "expression": "subtotal * 1.1",  "resultType": "number", "onError": "zero" }
  ],
  "data": { "qty": 5, "unitPrice": 1000 }
}
→ { "results": { "subtotal": 5000, "total": 5500 }, "errors": {} }
```

---

## Resolved Questions

| # | 質問 | 決定 |
|---|------|------|
| OQ-1 | V2型とV1 projection形式の互換性 | **V2型定義を正とし、V1 Java API を `/api/v2/` で刷新。変換レイヤー不要** |
| OQ-2 | V1未起動時のV2挙動 | **現状SPAにフォールバック。UIにオフラインインジケーター表示** |
| OQ-3 | Puppeteer PDFサーバーの配置 | **独立リポジトリ（`report-pdf-server`）** |
| OQ-4 | 公開フォーム機能のスコープ | **今回は実装なし。型設計のみ将来を考慮** |
