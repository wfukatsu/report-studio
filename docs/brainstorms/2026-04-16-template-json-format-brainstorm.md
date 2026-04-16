# テンプレートJSON保存形式 ブレインストーム

**日付**: 2026-04-16
**ステータス**: 設計完了・実装待ち

## 何を作るか

テンプレートの保存・配布・共有をJSON形式で統一する。3つの柱：

1. **ビルトインテンプレートのJSON外出し** — 現在 `.ts` 定数で定義されているビルトインテンプレートを `.json` ファイルに外出しし、コード変更なしでテンプレート追加・編集を可能にする
2. **ローカルインポート/エクスポート** — ユーザーがブラウザからテンプレートを `.json` ファイルとしてダウンロード保存し、後からインポートできる機能
3. **サーバー共有/公開** — テンプレートを他ユーザーと共有したり、マーケットプレイス的に公開できる機能

## なぜこのアプローチか

### 現状の課題

- ビルトインテンプレートが TypeScript コードに埋め込まれており、テンプレート追加にビルドが必要
- ユーザーが作成したテンプレートをファイルとして持ち出す手段がない
- サーバーに保存したテンプレートは自分しか見えない

### 既存の基盤（活用する）

- `exportUtils.ts` に `exportToJSON()` / `SCHEMA_VERSION` が既に存在 — これを拡張する形で進める
- V2 API (`/api/v2/templates`) で JSON blob 保存の CRUD は実装済み
- `templateUtils.ts` に `applyTemplate()` で `Template` → `ReportDefinition` 変換あり

### JSON統一の利点

- **ポータビリティ**: ローカルファイル、サーバー、Git管理すべてで同じ形式
- **開発者フレンドリー**: JSON Schemaによるバリデーション付きで手書き編集も安全
- **拡張性**: 新しいテンプレートをJSON配置だけで追加可能

## キー決定事項

### 1. JSON形式は `Template` 型ベース

JSONファイルの形式は `Template` 型（名前・カテゴリ・タグ・サムネ等のメタデータ + `pages` + `settings`）をベースとする。
- ビルトインテンプレートJSON: `Template` 型そのもの
- エクスポート/インポート: `Template` 型 + `$schema` / `exportedAt` メタデータ
- サーバー保存: 既存の `ReportDefinition` blob に `Template` メタデータを付与（既存APIの拡張）

既存の `exportToJSON()`（`ReportDefinition` ベース）は、テンプレートエクスポート用に `exportTemplateToJSON()` を追加する形で共存させる。

### 2. JSON Schema による厳密バリデーション

- `Template` 型に対応するJSON Schemaを定義
- インポート時にスキーマバリデーションを実行し、不正なJSONを早期検出
- スキーマバージョンを `$schema` フィールドで管理（既存の `"report-definition/v1"` を踏襲）

### 2. ビルトインテンプレートの格納形式

```
src/templates/
├── builtin/                    ← JSONファイル置き場
│   ├── quotation-modern.json
│   ├── invoice-modern.json
│   ├── purchase-order-modern.json
│   └── ...
├── builtinTemplates.ts         ← JSONをimportして配列化
├── templateSchema.ts           ← JSON Schema定義 + バリデーション関数
└── businessTemplateHelpers.ts  ← 既存ヘルパー
```

- Viteの `import ... from './builtin/xxx.json'` でビルド時に取り込み
- `builtinTemplates.ts` はJSONをimportしてTemplate[]として公開する薄いラッパーに変更

### 3. ローカルインポート/エクスポート

**エクスポート**:
- テンプレート一覧またはエディタから「JSONエクスポート」ボタン
- `Blob` + `URL.createObjectURL` でダウンロード
- ファイル名: `{template-name}-{date}.json`
- メタデータ含む: `$schema`, `exportedAt`, `version`

**インポート**:
- テンプレートギャラリーに「JSONインポート」ボタン
- `<input type="file" accept=".json">` でファイル選択
- JSON Schema バリデーション → エラー表示 or テンプレート読み込み
- 重複検出: 同じIDのテンプレートが既にある場合は上書き確認

**ユースケース**:
- テンプレート共有（ファイル渡し）
- バックアップ/復元
- 開発者によるJSON直接編集

### 4. サーバー共有/公開機能

**既存基盤**: V2 API (`/api/v2/templates`) で既にJSON blob保存あり

**方向性**:
- テンプレートに `visibility`（private / shared / public）を追加
- テンプレートギャラリーで共有・公開テンプレートを閲覧・コピーできるようにする
- 具体的なAPI設計・DB変更はPhase 3のPlan作成時に詰める

### 5. マイグレーション考慮点

- 現在のビルトインテンプレートは `businessTemplateHelpers.ts` のヘルパー関数で要素を動的生成している
- JSON化する際は、ヘルパーの出力結果（最終的な要素配列）をJSONに書き出す必要がある
- ヘルパー関数自体はインポート時のバリデーションやデフォルト値生成に引き続き活用可能

## 実装フェーズ

### Phase 1: JSON基盤 + ビルトインJSON化
- JSON Schema 定義
- バリデーション関数
- ビルトインテンプレートを `.json` に変換
- `builtinTemplates.ts` をJSONインポートに切り替え

### Phase 2: ローカルインポート/エクスポート
- エクスポートUI + ダウンロード処理
- インポートUI + バリデーション + 読み込み処理
- 重複検出と上書き確認ダイアログ

### Phase 3: サーバー共有/公開
- `visibility` フィールド追加（DB + API）
- テンプレートギャラリーUI拡張（共有/公開タブ、コピー機能）

## 解決済みの質問

- **Q: バリデーションの厳密さは？** → JSON Schemaで厳密に行う
- **Q: 最初のスコープは？** → 全体設計を先に行い、段階的に実装
- **Q: サーバー側の追加要件は？** → 共有/公開機能が必要

## オープンクエスチョン

なし（全体設計レベルでは決定済み。実装時の詳細はPlan作成時に詰める）
