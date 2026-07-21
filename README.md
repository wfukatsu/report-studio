# Report Design Studio V2

[![CI](https://github.com/wfukatsu/report-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/wfukatsu/report-studio/actions/workflows/ci.yml)

📖 **English**: see [README.en.md](./README.en.md).

ドラッグ&ドロップで帳票・フォームを設計し、PDF/PNG エクスポートや ScalarDB との連携を提供する Web アプリケーションです。日本のビジネス帳票（見積書・請求書・税務様式）に必要な印鑑欄・和暦・縦書き・ふりがなをネイティブサポートします。

![デザイナー画面 — 御見積書テンプレートの編集](docs/images/designer.png)

デザイナーの `{{fieldKey}}` トークン（左）は、ライブプレビュー（右）で実データに解決されます:

![ライブプレビュー — データバインディングの解決](docs/images/live-preview.png)

### 操作の流れ

ログイン → テンプレート選択 → 編集 → プレビュー → バインド → 出力 → 回答/ステータス管理の一連の流れです（実操作を撮影）。ステップごとの解説は [ユーザー操作マニュアル](docs/user-manual.md) を参照してください。

![Report Studio 操作フローのウォークスルー](docs/images/manual/walkthrough.gif)

## 特徴

- **ビジュアルデザイン** — ドラッグ&ドロップで帳票を設計
- **24種類の要素** — テキスト・データフィールド・グラフ・バーコード・日本語帳票専用要素（印鑑・収入印紙・承認欄・元号選択）
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
| フロントエンド | Vite 8 + React 19 + TypeScript 7（native tsc。typescript-eslint 用に TS6 API を alias 併存） |
| 状態管理 | Zustand 5 (Immer ミドルウェア) |
| スタイル | Tailwind CSS 4 + Radix UI |
| ドラッグ&ドロップ | @dnd-kit/core |
| バックエンド | Java 21 + Javalin 7 |
| データベース | ScalarDB 3.17 + SQLite (開発) |
| テスト | Vitest 4 + Playwright (フロントエンド) / JUnit 5 (バックエンド) |
| コンポーネントカタログ | Storybook 10 |

## クイックスタート（約 15 分）

### 前提条件

- Node.js 22+ / npm 10+（CI は Node 22 で検証）
- JDK 21（[Temurin](https://adoptium.net/) または `brew install openjdk@21`）

> **JDK のバージョンに注意:** バックエンドの Gradle は Java 21 toolchain を要求します。
> デフォルトの `java` が 21 以外の場合は `JAVA_HOME` を JDK 21 に向けてください。
> 例（macOS + Homebrew）: `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`

### セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/wfukatsu/report-studio.git
cd report-studio

# フロントエンド依存関係のインストール
npm install

# バックエンド設定ファイルのコピー（開発用は SQLite で追加設定不要）
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

### 最初の帳票を作る

1. ログイン後、ツールバーの **新規作成** をクリック
2. テンプレート一覧から **御見積書（モダン）** を選び **変更** — 帳票がキャンバスに展開されます
3. ツールバー右側の **プレビューを表示** で、`{{fieldKey}}` トークンがサンプルデータに解決される様子を確認
4. **エクスポート** から PDF を出力 — サーバーサイド PDF はページ分割・和文フォント埋め込みに対応しています

## Docker でのクイックスタート

Node.js や JDK を用意せず、フロントエンド + バックエンド + SQLite をワンコマンドで起動できます
（要 [Docker](https://docs.docker.com/get-docker/) / Docker Compose）。

```bash
git clone https://github.com/wfukatsu/report-studio.git
cd report-studio

docker compose up --build
```

起動後、ブラウザで **http://localhost:8080** を開き、`admin` / `changeme` でログインします。

- **データ永続化**: SQLite データベースは名前付きボリューム `report-studio-data` に保存され、コンテナ再作成後も残ります。停止は `docker compose down`（データ保持）、データも消す場合は `docker compose down -v`。
- **ポート変更**: 8080 が使用中なら `APP_PORT=8090 docker compose up --build`（`ALLOWED_ORIGIN` は自動で追従します）。
- **初期パスワード**: 公開用途では初回起動前に `ADMIN_PASSWORD=... docker compose up --build` で変更してください。

> nginx が静的アセットを配信し `/api` をバックエンドへ同一オリジンでリバースプロキシするため、
> ブラウザからは単一オリジンに見えます（CORS 不要・Cookie/CSRF が素直に機能）。構成の詳細は
> [`docker-compose.yml`](./docker-compose.yml) と [`docker/nginx.conf`](./docker/nginx.conf) を参照。

## コマンド一覧

### フロントエンド

```bash
npm run dev              # 開発サーバー起動 (http://localhost:5173)
npm run build            # 型チェック (TS 5.7) + ビルド (dist/)
npm run typecheck:native # TS7 native tsc での tsconfig 別型検査
npm run lint             # ESLint
npm test                 # テスト実行 (watch モード)
npm test -- --run        # テスト一回実行
npm run test:coverage    # カバレッジレポート (ラチェット閾値 — 現状値を下回ると失敗)
npm run test:e2e         # E2E テスト (Playwright — バックエンドも自動起動)
npm run storybook        # Storybook 起動 (http://localhost:6006)
npm run generate:schema  # レポート定義 JSON Schema の再生成（Zod 変更時に必須）
```

### バックエンド

```bash
npm run dev:backend      # バックエンド起動 (http://localhost:8080)
npm run test:backend     # バックエンドテスト実行
cd server && ./gradlew installDist  # 配布物ビルド（server/build/install/ — Docker と同じ経路）
```

### CLI・サンプルデータ

```bash
npm run cli -- --help    # 公式 CLI（テンプレート管理・PDF 出力・ジョブ・PAT 認証対応）
npm run build:samples    # サンプル帳票 5 種（請求書等）のテンプレート生成
npm run seed:samples     # サンプル帳票をサーバへ投入（要バックエンド起動）
```

詳細は [scripts/cli/README.md](scripts/cli/README.md) と [docs/setup.md](docs/setup.md) を参照。

## 環境変数

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `ADMIN_PASSWORD` | `changeme` | 初期管理者パスワード |
| `LOGIN_RATE_LIMIT_MAX` | `5` | ログイン試行上限 (IP/5分) |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `300000` | レートリミット窓 (ミリ秒) |
| `WEBHOOK_SECRET_KEY` | （未設定） | Webhook シークレット暗号化キー（32 バイトの Base64、例: `openssl rand -base64 32`）。未設定時は平文保存 + 起動時警告 |

## ドキュメント

ドキュメントの入口は [docs/README.md](docs/README.md) です。

| ドキュメント | 内容 |
|-------------|------|
| [導入方法（セットアップ）](docs/setup.md) | ローカル/Docker 起動・環境変数・設定・CLI・サンプルデータ |
| [ユーザー操作マニュアル](docs/user-manual.md) | 画面構成・テンプレート編集・データ設計・出力・ステータス管理 |
| [システムアーキテクチャ](docs/architecture.md) | 全体構成・データフロー・認証・データ層・API・非機能要件 |
| [設計（デザイン）](docs/design.md) | フロントエンド/バックエンド設計・状態管理・要素システム・拡張手順 |
| [運用可視性](docs/observability.md) | ヘルスチェック・メトリクス・ログ |
| [OpenAPI 仕様](docs/openapi.yaml) | REST API の機械可読仕様（PAT/Bearer による外部利用の入口） |

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

## コントリビューション

開発環境のセットアップ・ブランチ運用・PR 規約・テスト方針は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。
バグ報告・機能提案・PR を歓迎します。セキュリティ脆弱性は公開 Issue ではなく [SECURITY.md](./SECURITY.md) の手順で報告してください。

Report Studio を利用している場合は、ぜひ [ADOPTERS.md](./ADOPTERS.md) への追加をご検討ください（自己申告ベース・テレメトリなし）。

## ライセンス

[Apache License 2.0](./LICENSE)

サードパーティ依存のライセンス監査結果は [docs/license-audit.md](./docs/license-audit.md) を参照してください。
