# Report Design Studio V2

[![CI](https://github.com/wfukatsu/report-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/wfukatsu/report-studio/actions/workflows/ci.yml)

ドラッグ&ドロップで帳票・フォームを設計し、PDF/PNG エクスポートや ScalarDB との連携を提供する Web アプリケーションです。

## 特徴

- **ビジュアルデザイン** — ドラッグ&ドロップで帳票を設計
- **27種類の要素** — テキスト・データフィールド・グラフ・バーコード・日本語帳票専用要素（印鑑・収入印紙・承認欄・元号選択）
- **データバインディング** — `{{fieldKey}}` トークンによる動的データ差し込み
- **ScalarDB 連携** — テーブルスキーマの取得とデータバインディング
- **PDF/PNG エクスポート** — クライアントサイド・サーバーサイド両対応
- **テナント情報管理** — 会社名・ロゴ・住所などの組織情報を帳票に埋め込み
- **バージョン管理** — テンプレートのバージョン履歴と復元
- **フォーム回答収集** — 公開フォームからの回答収集と Excel/PDF エクスポート
- **計算・バリデーション** — JEXL 式による計算ルールと入力検証

## 技術スタック

| 層 | 技術 |
|----|------|
| フロントエンド | Vite 6 + React 19 + TypeScript 5.7 |
| 状態管理 | Zustand 5 (Immer ミドルウェア) |
| スタイル | Tailwind CSS 3.4 + Radix UI |
| ドラッグ&ドロップ | @dnd-kit/core |
| バックエンド | Java 21 + Javalin 6 |
| データベース | ScalarDB 3.14 + SQLite (開発) |
| テスト | Vitest (フロントエンド) / JUnit 5 (バックエンド) |

## クイックスタート

### 前提条件

- Node.js 20+
- Java 21+
- npm 10+

### セットアップ

```bash
# リポジトリのクローン
git clone <repository-url>
cd report-design-studio-v2

# フロントエンド依存関係のインストール
npm install

# バックエンド設定ファイルのコピー
cp server/scalardb.properties.example server/scalardb.properties
```

### 起動

```bash
# フロントエンド + バックエンドを同時起動
npm run dev:full

# または個別に起動
npm run dev          # フロントエンド (http://localhost:5173)
npm run dev:backend  # バックエンド   (http://localhost:8080)
```

### ログイン

起動後、ブラウザで `http://localhost:5173` を開きます。

| ユーザーID | パスワード |
|-----------|-----------|
| `admin` | `changeme`（初期値） |

> **⚠ セキュリティ:** 初期パスワードのまま外部公開しないでください。初回ログイン後に
> 管理画面からパスワードを変更するか、初回起動前に `ADMIN_PASSWORD` 環境変数を
> 設定してください。初期パスワードのまま起動するとサーバーログに警告が出ます。
> 変更したパスワードが再起動で巻き戻ることはありません（`ADMIN_PASSWORD` を
> 設定して再起動した場合のみリセットされます）。詳細は [SECURITY.md](./SECURITY.md) を参照。

## コマンド一覧

### フロントエンド

```bash
npm run dev              # 開発サーバー起動 (http://localhost:5173)
npm run build            # 型チェック + ビルド (dist/)
npm run lint             # ESLint
npm test                 # テスト実行 (watch モード)
npm test -- --run        # テスト一回実行
npm run test:coverage    # カバレッジレポート (80% 閾値)
```

### バックエンド

```bash
npm run dev:backend      # バックエンド起動 (http://localhost:8080)
npm run test:backend     # バックエンドテスト実行
npm run build:backend    # fat-JAR ビルド
```

## 環境変数

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `ADMIN_PASSWORD` | `changeme` | 初期管理者パスワード |
| `LOGIN_RATE_LIMIT_MAX` | `5` | ログイン試行上限 (IP/5分) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `300000` | レートリミット窓 (ミリ秒) |

## ドキュメント

| ドキュメント | 内容 |
|-------------|------|
| [アーキテクチャ設計](docs/architecture.md) | システム全体の構成とデータフロー |
| [設計書](docs/design.md) | コンポーネント設計と主要パターン |
| [詳細設計書](docs/detailed-design.md) | API仕様・型定義・実装詳細 |
| [ユーザーマニュアル](docs/user-manual.md) | 操作方法と機能説明 |

## プロジェクト構造

```
report-design-studio-v2/
├── src/                    # フロントエンド (React/TypeScript)
│   ├── components/         # UI コンポーネント
│   ├── elements/           # 要素タイプ別 Renderer/PropertiesPanel
│   ├── store/              # Zustand ストアスライス
│   ├── api/                # バックエンド API クライアント
│   ├── lib/                # ユーティリティ (エクスポート・データバインディング等)
│   └── templates/          # ビルトインテンプレート
├── server/                 # バックエンド (Java/Javalin)
│   └── src/main/java/com/report/server/
│       ├── auth/           # 認証・セッション管理
│       └── *.java          # コントローラ・リポジトリ・エンジン
├── docs/                   # ドキュメント
└── CLAUDE.md               # Claude Code 向け開発ガイド
```

## ライセンス

[Apache License 2.0](./LICENSE)

サードパーティ依存のライセンス監査結果は [docs/license-audit.md](./docs/license-audit.md) を参照してください。
