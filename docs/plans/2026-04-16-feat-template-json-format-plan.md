---
title: "feat: Template JSON Format Unification"
type: feat
status: completed
date: 2026-04-16
origin: docs/brainstorms/2026-04-16-template-json-format-brainstorm.md
---

# feat: Template JSON Format Unification

## Enhancement Summary

**Deepened on:** 2026-04-16
**Sections enhanced:** 6 (Architecture, Phase 1, Phase 2, Phase 3, Security, Testing)
**Research agents used:** Zod best practices, Vite JSON imports, prototype pollution defense, file I/O patterns, security review, architecture review, simplicity review, institutional learnings

### Key Improvements
1. **Vite lazy loading**: `import.meta.glob` でビルトインJSON遅延読み込み（初期バンドル削減）
2. **セキュリティ強化**: 構造的複雑度制限（depth/key-count）追加、`.passthrough()` リスク対策
3. **importFromJSON 戻り値**: Result型 `{ ok, definition?, error? }` パターンに統一
4. **日本語エラーメッセージ**: Zod `z.prettifyError()` + `z.locales.ja()` 活用
5. **`file.text()` 採用**: FileReader から `file.text()` に移行（モダン・簡潔）
6. **Template型の段階的廃止計画**: 明示的なdeprecationロードマップ追加

### New Considerations Discovered
- `.rds2.json` カスタム拡張子はViteのJSON処理で追加設定が必要な可能性
- Zodスキーマの `.passthrough()` が未知キーを通過させるセキュリティリスク
- サーバー側 `schema`/`bindingTree` blob に構造的バリデーションがない
- `defaultMode` フィールドがサーバー側で許可リスト検証されていない

---

## Overview

テンプレートの保存・配布・共有をJSON形式で統一する。ビルトインテンプレートを `.json` ファイルに外出しし、ローカルインポート/エクスポートを整備し、サーバー側でテンプレート共有/公開機能を追加する。

3フェーズで段階的に実装：
1. **JSON基盤 + ビルトインJSON化** — `.ts` → `.json`、Zodバリデーション、remapAllIdsバグ修正
2. **ローカルインポート/エクスポート** — クライアント側JSON保存/読込、フォーマット統一
3. **サーバー共有/公開** — visibility追加、テンプレートギャラリー拡張

## Problem Statement / Motivation

(see brainstorm: docs/brainstorms/2026-04-16-template-json-format-brainstorm.md)

- ビルトインテンプレートが TypeScript コードに埋め込まれており、テンプレート追加にビルドが必要
- ユーザーが作成したテンプレートをファイルとして持ち出す手段が限定的
- サーバーに保存したテンプレートは自分しか見えない
- クライアント側 (`$schema: "report-definition/v1"`) とサーバー側 (`formatVersion: 2`) でJSON形式が異なり、相互運用できない
- `remapAllIds()` が `page.elements`（deprecated）しか走査せず、`page.sections[].elements` のIDが再マップされないバグがある

## Proposed Solution

### フォーマット統一: `formatVersion: 2` エンベロープに一本化

クライアント/サーバー両方で同じJSON形式を使う：

```json
{
  "formatVersion": 2,
  "exportedAt": "2026-04-16T12:00:00.000Z",
  "template": {
    "name": "見積書（モダン）",
    "category": "見積書",
    "tags": ["ビジネス"],
    "thumbnail": "..."
  },
  "definition": {
    "id": "...",
    "metadata": { ... },
    "pages": [ ... ],
    ...
  }
}
```

- `definition`: `ReportDefinition` 型（canonical runtime type）
- `template`: テンプレートメタデータ（名前・カテゴリ・タグ・サムネ）— エクスポート時のみ付与
- ファイル拡張子: `.rds2.json`

### ビルトインテンプレートは `ReportDefinition` 形式で格納

ビルトインJSONファイルは `ReportDefinition` 形式で格納する。これにより：
- 既存の `ReportDefinitionSchema` (Zod) をそのまま使える — 新しいスキーマ不要
- `applyTemplate()` → `migrateReport()` の変換パイプラインをバイパスできる
- レガシー `Template` 型への依存を段階的に削減

ビルトインJSONファイルもエクスポートと同じ `formatVersion: 2` エンベロープ形式で格納する。`builtinTemplates.ts` のラッパーが `.definition` をアンラップし、テンプレート固有のメタデータ（名前・カテゴリ等）を付与する。

## Technical Approach

### Architecture Insights (from research)

**Vite JSON Import Strategy**: 9テンプレート x ~20KB = ~180KB。静的importではなく `import.meta.glob` による遅延読み込みを推奨。テンプレートギャラリー表示時にのみロードされ、初期バンドルサイズを削減できる。

**migration.ts の肥大化防止**: 現在307行。v2エンベロープ対応を追加すると400-500行に膨張する可能性。フォーマット検出ロジックを `formatDetector.ts` に分離することを検討。

**Template型の段階的廃止**: Phase 1でビルトインがJSON化された後、`Template` インターフェースは Phase 3 までサーバーから取得したレガシーテンプレート変換用に残すが、Phase 3完了時に廃止対象とする。

### Architecture

```
src/templates/
├── builtin/                         ← JSONファイル（ReportDefinition形式）
│   ├── quotation-modern.rds2.json
│   ├── invoice-modern.rds2.json
│   ├── purchase-order-modern.rds2.json
│   └── ...（9テンプレート）
├── builtinTemplates.ts              ← JSONインポート + メタデータ付与
└── businessTemplateHelpers.ts       ← 定数のみ残す（A4_W, A4_H等）

src/lib/
├── exportUtils.ts                   ← exportToJSON() を formatVersion:2 に統一
├── migration.ts                     ← 既存 importFromJSON() を拡張（formatVersion:2 対応）
├── sanitize.ts                      ← NEW: prototype pollution防御ユーティリティ
└── schemas/
    └── reportDefinition.ts          ← 既存Zodスキーマ（変更なし）

server/src/main/java/.../
└── V2TemplateExportController.java  ← remapAllIds修正、visibilityサポート
```

### Implementation Phases

#### Phase 1: JSON基盤 + ビルトインJSON化

**1-1. ビルトインテンプレートJSON変換スクリプト**

- `scripts/convert-templates.ts` を作成
- 各テンプレートの `.ts` ファイルを読み込み、`applyTemplate()` で `ReportDefinition` に変換
- 結果を `src/templates/builtin/*.rds2.json` に書き出し（`formatVersion: 2` エンベロープ付き）
- `businessTemplateHelpers.ts` の共有定数（`A4_W`, `A4_H`, `ML` 等）はそのまま残す
- ヘルパー関数（`lbl`, `df`, `rect` 等）は変換完了後に削除する（JSONに結果が焼き込まれるため）
- 変換完了後、元の `.ts` テンプレートファイル（`quotationTemplate.ts` 等）も削除する

ファイル: `scripts/convert-templates.ts`（新規・ワンショット変換用、変換後は削除可）

**1-2. TypeScript設定 + builtinTemplates.ts リファクタ**

`tsconfig.app.json` に `"resolveJsonModule": true` を追加（現在未設定のため、JSONインポートがコンパイルエラーになる）。

> **Research insight**: `import.meta.glob` による遅延読み込みを採用する場合、`resolveJsonModule` は不要になる可能性がある。ただし他のJSONインポートのために設定しておくのが安全。

```typescript
// src/templates/builtinTemplates.ts — import.meta.glob パターン（推奨）
const templateModules = import.meta.glob('./builtin/*.rds2.json', { eager: true }) as Record<string, { default: { formatVersion: number; definition: unknown } }>

interface BuiltinEntry {
  id: string
  name: string
  category: string
  tags: string[]
  thumbnail?: string
  definition: ReportDefinition
}

// メタデータはラッパーで付与（JSONは純粋なReportDefinition）
const BUILTIN_META: Omit<BuiltinEntry, 'definition'>[] = [
  { id: 'quotation-modern', name: '見積書（モダン）', category: '見積書', tags: ['ビジネス', 'モダン'] },
  // ... 他8テンプレート
]

export const BUILTIN_TEMPLATES: BuiltinEntry[] = BUILTIN_META.map(meta => {
  const mod = templateModules[`./builtin/${meta.id}.rds2.json`]
  if (!mod) { console.error(`Missing builtin template: ${meta.id}`); return null }
  const result = ReportDefinitionSchema.safeParse(mod.default.definition)
  if (!result.success) { console.error(`Invalid builtin: ${meta.id}`, result.error); return null }
  return { ...meta, definition: result.data }
}).filter((t): t is BuiltinEntry => t !== null)
```

> **Alternative**: 静的 `import x from './builtin/x.rds2.json'` でも動作する。`.rds2.json` 拡張子がViteのJSON処理で問題を起こす場合は、拡張子を `.json` に変更するか、Viteプラグインを追加する。

ファイル: `src/templates/builtinTemplates.ts`（既存を書き換え）

**1-3. templateUtils.ts + 呼び出し元の更新**

- `loadBuiltinTemplate()` を `BuiltinEntry` 対応に変更
- `ReportDefinition` を直接返す（`applyTemplate` / `migrateReport` バイパス）
- 深いクローンは `JSON.parse(JSON.stringify())` で維持
- `TemplateSelectionModal.tsx` が `applyTemplate()` を直接呼んでいるため、`loadBuiltinTemplate()` 経由に変更する
- `applyTemplate()` はサーバーから取得したレガシー `Template` 形式の変換用に残す（Phase 3まで使用）

ファイル: `src/lib/templateUtils.ts`, `src/components/modals/TemplateSelectionModal.tsx`

**1-4. Zodバリデーション適用**

- ビルトインJSON読み込み時に `ReportDefinitionSchema.safeParse()` を実行
- 失敗時はコンソールエラー + テンプレートギャラリーからスキップ（アプリは起動継続）
- CI/ビルド時のバリデーションはスコープ外（必要になったら別タスクで追加）

ファイル: `src/templates/builtinTemplates.ts`

**1-5. remapAllIds バグ修正（サーバー側）**

- `V2TemplateExportController.remapAllIds()` を修正（line 211-262）
- 現在は `page.path("elements")` のみ走査 → `page.path("sections")` 配下の要素も走査するよう追加
- 両方を走査する（`page.elements` と `page.sections[].elements` の両方）— レガシー形式とモダン形式の両対応
- `childIds`（グループ要素）の参照更新は既存の `remapElementReferences()` が処理（変更不要）

ファイル: `server/src/main/java/com/report/server/V2TemplateExportController.java`

**1-6. テスト**

- ビルトインテンプレートの読み込みテスト（全9テンプレートがZodバリデーション通過）
- `loadBuiltinTemplate()` が正しい `ReportDefinition` を返すことを確認
- サーバー側 `remapAllIds` が sections 内の要素IDを正しくリマップすることをテスト

#### Phase 2: ローカルインポート/エクスポート

**2-1. prototype pollution 防御ユーティリティ + 構造的複雑度制限**

> **Research insight (Security)**: `JSON.parse()` 自体はモダンエンジンでプロトタイプ汚染を引き起こさない。真のリスクはパース後の `Object.assign` / spread で発生する。Zodの `.passthrough()` が未知キーを通過させるため、セキュリティ敏感なサブスキーマでは `.strict()` を検討。
>
> **Research insight (Performance)**: 再帰的キー除去は100KBのJSONで ~1-2ms。パフォーマンス影響は無視できる。
>
> **Research insight (Security)**: クライアント側にも構造的複雑度制限を追加すべき（サーバー側の `MAX_JSON_DEPTH=50`, `MAX_OBJECT_COUNT=5000` に準拠）。

```typescript
// src/lib/sanitize.ts
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_DEPTH = 50
const MAX_OBJECT_COUNT = 5000

export function sanitizeJSON(obj: unknown, depth = 0, counter = { count: 0 }): unknown {
  if (obj === null || typeof obj !== 'object') return obj
  if (depth > MAX_DEPTH) throw new Error('JSON構造が深すぎます')
  if (++counter.count > MAX_OBJECT_COUNT) throw new Error('JSONオブジェクト数が上限を超えています')

  if (Array.isArray(obj)) return obj.map(item => sanitizeJSON(item, depth + 1, counter))

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!DANGEROUS_KEYS.has(key)) {
      cleaned[key] = sanitizeJSON(value, depth + 1, counter)
    }
  }
  return cleaned
}
```

ファイル: `src/lib/sanitize.ts`（新規）

**2-2. exportToJSON 統一**

- `exportUtils.ts` の `exportToJSON()` を `formatVersion: 2` エンベロープ形式に変更
- テンプレートメタデータ付きエクスポート関数 `exportTemplateToJSON()` を追加
- 既存の `$schema: "report-definition/v1"` 形式は後方互換のためインポート時にも受け付ける

ファイル: `src/lib/exportUtils.ts`

**2-3. importFromJSON 拡張**

既存の `src/lib/migration.ts` 内の `importFromJSON` を拡張する（新ファイル作成ではない）。
呼び出し元: `App.tsx`, `layoutSlice.ts`, `useToolbarFile.ts`

> **Research insight (Learnings)**: `importFromJSON` は Result型 `{ ok, definition?, error? }` パターンを使うべき（既存の実装パターンに準拠）。throwではなくエラーを返すことで呼び出し元でのハンドリングが容易になる。
>
> **Research insight (Zod)**: `safeParse` を使い、エラー時は `z.prettifyError()` でユーザーフレンドリーなメッセージを生成。日本語ロケール `z.locales.ja()` が利用可能（Zod 4）。
>
> **Research insight (Architecture)**: migration.ts が肥大化する場合、フォーマット検出ロジックを `formatDetector.ts` に分離することを検討。

```typescript
// src/lib/migration.ts（既存ファイルを拡張）
export type ImportResult =
  | { ok: true; definition: ReportDefinition }
  | { ok: false; error: string }

export function importFromJSON(raw: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'JSONの解析に失敗しました。ファイル形式を確認してください。' }
  }

  let sanitized: unknown
  try {
    sanitized = sanitizeJSON(parsed)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '不正なJSON構造です' }
  }

  const obj = sanitized as Record<string, unknown>

  // formatVersion: 2 エンベロープ → unwrap
  if (obj.formatVersion === 2) {
    const result = ReportDefinitionSchema.safeParse(obj.definition)
    if (!result.success) return { ok: false, error: `バリデーションエラー: ${z.prettifyError(result.error)}` }
    return { ok: true, definition: result.data }
  }
  // $schema: "report-definition/v1" レガシー形式 → 直接パース
  if (obj.$schema === SCHEMA_VERSION) {
    const result = ReportDefinitionSchema.safeParse(obj)
    if (!result.success) return { ok: false, error: `バリデーションエラー: ${z.prettifyError(result.error)}` }
    return { ok: true, definition: result.data }
  }
  // レガシー Report 形式 → migrateReport（既存ロジック）
  try {
    return { ok: true, definition: migrateReport(obj as Report) }
  } catch (e) {
    return { ok: false, error: 'レポート形式の変換に失敗しました' }
  }
}
```

ファイル: `src/lib/migration.ts`（既存を拡張）

**2-4. クライアント側エクスポートUI**

- ツールバーの「保存」メニューに「JSONとしてダウンロード」追加
- `Blob` + `URL.createObjectURL` でダウンロード
- **ダウンロード後に `URL.revokeObjectURL()` を即座に呼ぶ**（メモリリーク防止）
- ファイル名: `{name}-{YYYY-MM-DD}.rds2.json`
- サーバーラウンドトリップなし
- エクスポートボタンに `isExporting` ローディング状態を追加

> **Research insight (File I/O)**: ダウンロード後の `revokeObjectURL` は必須。リンク要素の作成→クリック→削除→revoke の順序で実行。

ファイル: `src/components/toolbar/ToolbarDialogs.tsx`（または関連コンポーネント）

**2-5. クライアント側インポートUI**

- ツールバーの「開く」メニューに「JSONファイルを開く」統合
- `<input type="file" accept=".json,.rds2.json">` で統一
- **ファイルサイズ検証**: 読み込み前に `file.size > 10 * 1024 * 1024` で 10MB 上限チェック
- **`file.text()` を使用**: FileReader ではなくモダンな `file.text()` API を採用
- `importFromJSON()` で全形式対応（formatVersion:2、$schema:v1、レガシーReport）
- バリデーションエラー時は `role="alert"` トースト表示（5秒で自動消去）
- 重複検出: 同じIDのテンプレートが既存の場合は上書き確認ダイアログ
- インポートボタンに `isImporting` ローディング状態を追加
- **画像セキュリティ**: インポートしたテンプレート内の画像は `isSafeImageSrc()` でレンダー時に検証（既存ガード活用）

> **Research insight (Learnings)**: `file.text()` は FileReader より簡潔で Promise ベース。エラー時はユーザー向けトースト表示が必須（コンソールのみは不可）。

ファイル: `src/components/toolbar/ToolbarDialogs.tsx`, `src/hooks/useToolbarFile.ts`

**2-6. テスト**

- `sanitizeJSON` ユニットテスト（`__proto__` 除去確認）
- `importFromJSON` — 3形式すべての読み込みテスト
- `exportToJSON` — `formatVersion: 2` 形式の出力確認
- ラウンドトリップテスト: export → import → 元の定義と一致
- **既存テスト更新**: `exportUtils.test.ts` の `$schema` アサーション → `formatVersion: 2` に変更、`migration.test.ts` のラウンドトリップテストも更新

#### Phase 3: サーバー共有/公開

**3-1. DBスキーマ変更**

- `v2_definitions` テーブルに `visibility` カラム追加（`VARCHAR`, デフォルト `'private'`）
- マイグレーションで既存レコードは `'private'` に設定

**3-2. API拡張**

- `GET /api/v2/templates` — `?visibility=` クエリパラメータ追加
  - `private`: 自分のテンプレートのみ（既存動作）
  - `shared`: 同一テナント内で閲覧可能
  - `public`: 全ユーザーが閲覧可能
- `PUT /api/v2/templates/{id}/visibility` — 公開状態変更（オーナーのみ）
- `POST /api/v2/templates/{id}/copy` — テンプレートを自分にコピー（shared/public対象）
  - `remapAllIds()` で全ID再マップ（Phase 1で修正済み）
  - `created_by` をコピー実行者に設定
  - `visibility` は `private` にリセット
- `GET /api/v2/templates/{id}/export` — `public` テンプレートは非オーナーもエクスポート可能に

**3-3. テナントスコーピング**

- `shared` は `created_by` のテナントプレフィックスで判定
- テナント情報は既存の `FormSessionManager` から取得
- テナント未設定の場合 `shared` は事実上 `private` と同じ動作

**3-4. テンプレートギャラリーUI拡張**

- `TemplateSelectionModal` にタブ追加: 「ビルトイン」「マイテンプレート」「共有」「公開」
- 共有/公開テンプレートには「コピーして使用」ボタン
- テンプレート設定で `visibility` 変更UI

**3-5. セキュリティ考慮事項（Phase 3）**

> **Research insight (Security Review)**:
> - `duplicate` エンドポイントに認証チェックが不足している可能性 — visibility 追加時にサーバー側で所有権検証を必ず実施
> - `defaultMode` フィールドがサーバー側で許可リスト検証されていない — `Set.of("standard","review","readonly")` でバリデーション追加
> - サーバー側 `schema`/`bindingTree` blob に構造的バリデーション（depth/object-count）がない — インポート時に `RequestValidator` 相当のチェックを適用

**3-6. テスト**

- API: visibility フィルタリングの正確性
- 権限: 非オーナーがprivateテンプレートにアクセスできないこと
- コピー: ID再マップ、created_by変更、visibility リセット
- セキュリティ: duplicate エンドポイントの認証チェック

## System-Wide Impact

### Interaction Graph

- ビルトインテンプレート読み込み: `builtinTemplates.ts` → JSONインポート → `TemplateSelectionModal` → `loadReport()` (store)
- エクスポート: Toolbar → `exportToJSON()` → Blob download（サーバー不要）
- インポート: Toolbar → FileReader → `sanitizeJSON()` → `importFromJSON()` → Zodバリデーション → `loadReport()` (store)
- サーバーインポート: ToolbarDialogs → `importTemplate()` API → `V2TemplateExportController` → `remapAllIds()` → `JsonBlobRepository`

### Error Propagation

- JSONパースエラー → `importFromJSON` で catch → ユーザーへエラーメッセージ
- Zodバリデーションエラー → `safeParse` failure → 具体的なフィールドエラー表示
- prototype pollution → `sanitizeJSON` で除去 → Zod前に処理済み
- サーバーインポートエラー → HTTP 400/422 → クライアントでトースト表示

### State Lifecycle Risks

- ビルトインテンプレート切り替え: JSONからのロードに失敗した場合、テンプレートギャラリーに表示されない（他テンプレートには影響なし）
- インポート中のブラウザクラッシュ: store未更新のため影響なし
- サーバーコピー中の障害: コピー先テンプレートが部分的に作成される可能性 → トランザクション保護必要

### API Surface Parity

- クライアントエクスポート (`exportToJSON`) とサーバーエクスポート (`/api/v2/templates/{id}/export`) が同じ `formatVersion: 2` 形式に統一される
- クライアントインポート (`importFromJSON`) が全3形式（v2、v1、レガシー）をハンドル

## Acceptance Criteria

### Phase 1

- [ ] 9つのビルトインテンプレートが `.rds2.json` ファイルとして存在する
- [ ] `builtinTemplates.ts` がJSONインポートから `BuiltinEntry[]` を公開している
- [ ] 全ビルトインテンプレートが `ReportDefinitionSchema` のZodバリデーションを通過する
- [ ] テンプレートギャラリーから全ビルトインテンプレートが正常にロード・表示できる
- [ ] `remapAllIds()` が `page.sections[].elements` と `childIds` を正しくリマップする
- [ ] `businessTemplateHelpers.ts` のヘルパー関数が削除され、定数のみ残る

### Phase 2

- [ ] ツールバーからJSONエクスポートできる（`.rds2.json`, `formatVersion: 2`）
- [ ] ツールバーからJSONインポートできる（`formatVersion: 2`, `$schema: v1`, レガシー全対応）
- [ ] prototype pollution キーが除去される（`__proto__`, `constructor`, `prototype`）
- [ ] バリデーションエラー時にユーザーフレンドリーなメッセージが表示される
- [ ] ラウンドトリップテスト: export → import で定義が一致する

### Phase 3

- [ ] テンプレートに `visibility` フィールドが存在する（デフォルト `private`）
- [ ] 共有/公開テンプレートがギャラリーで閲覧できる
- [ ] 「コピーして使用」で自分のテンプレートとして複製できる
- [ ] 非オーナーが private テンプレートにアクセスできない

## Dependencies & Risks

| リスク | 影響 | 緩和策 |
|--------|------|--------|
| ビルトインテンプレートのJSON変換で要素が欠落 | テンプレートが壊れる | 変換後にスクリーンショット比較で目視確認 |
| `remapAllIds` 修正が既存インポートに影響 | 既存ユーザーのインポートフローが壊れる | 修正前後でのインポートテスト |
| `formatVersion: 2` 統一で旧形式エクスポートとの互換性 | 過去にエクスポートしたファイルが読めなくなる | `importFromJSON` で `$schema: v1` もフォールバック対応 |
| `exportToJSON()` 出力形式変更 | `layoutSlice.ts:234` の `exportReportJSON` store action 経由でツールバーダウンロードに影響 | store action と `useToolbarFile.ts` のテストを更新 |
| Phase 3 のテナントスコーピング | テナント未設定環境で `shared` が意味をなさない | `shared` はテナント設定済みの場合のみ有効化 |

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-16-template-json-format-brainstorm.md](docs/brainstorms/2026-04-16-template-json-format-brainstorm.md)
  - Key decisions: JSON Schema厳密バリデーション、Template型ベース（→ 調査後ReportDefinition形式に変更）、3フェーズ実装

### Internal References

- Template types: `src/types/index.ts:981-1044`
- Builtin templates: `src/templates/builtinTemplates.ts`
- Export utilities: `src/lib/exportUtils.ts:19-32`
- Template utilities: `src/lib/templateUtils.ts`
- Zod schema: `src/lib/schemas/reportDefinition.ts`
- Server export/import: `server/src/main/java/com/report/server/V2TemplateExportController.java`
- Template gallery: `src/components/modals/TemplateSelectionModal.tsx`
- Toolbar dialogs: `src/components/toolbar/ToolbarDialogs.tsx`

### Institutional Learnings

- `docs/solutions/logic-errors/export-error-handling-json-api.md` — エクスポートのエラーハンドリング、FileReader安全性、Result型パターン
- `docs/solutions/security-issues/xss-prototype-pollution-image-validation.md` — prototype pollution防御（3層バリデーション）、`isSafeImageSrc()` ガード
- `docs/solutions/feature-implementation/sidebar-ui-reorganization-databinding-modal-templates.md` — テンプレート選択UI統合パターン、モーダル状態管理

### External Research (2024-2026)

- MDN Web Security: Prototype Pollution — `JSON.parse()` はモダンエンジンで安全、リスクは merge/spread 操作時
- CVE-2025-55182 (React Server Components RCE) — JSON デシリアライゼーション経由の prototype pollution
- Zod 4: `z.prettifyError()`, `z.locales.ja()`, 6.5x パフォーマンス改善
- Vite JSON Import: `import.meta.glob` による遅延読み込み、`resolveJsonModule` 設定
- File API: `file.text()` が FileReader に代わるモダン標準
