# 導入方法（セットアップ）

Report Studio を動かすための手順をまとめます。用途に応じて次のいずれかを選んでください。

- **とにかく試したい** → [Docker でのクイックスタート](#docker-でのクイックスタート)（Node.js / JDK 不要）
- **開発・改修したい** → [ローカルセットアップ](#ローカルセットアップ)
- **本番運用したい** → [本番構成](#本番構成)＋[環境変数](#環境変数)

---

## 前提条件

| ソフトウェア | バージョン | 用途 |
|-------------|-----------|------|
| Node.js | 20 以上（CI・Docker は 22 を使用） | フロントエンドのビルド・開発サーバー |
| npm | 10 以上 | 依存管理・スクリプト実行 |
| JDK | **21**（[Temurin](https://adoptium.net/) 推奨。macOS は `brew install openjdk@21`） | バックエンド（Gradle toolchain が Java 21 を要求） |
| Docker / Docker Compose | 任意 | コンテナでの一括起動 |

> **JDK バージョンに注意:** バックエンドの Gradle toolchain は Java 21 を要求します。既定の `java` が 21 以外の場合は `JAVA_HOME` を JDK 21 に向けてください。
> Gradle 本体は同梱の wrapper（`server/gradlew`）を使うため、システムへの Gradle インストールは不要です。
>
> ```bash
> # macOS + Homebrew の例
> export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
> ```

> **補足:** `package.json` に `engines` フィールドはありません。Node.js のバージョン要件はドキュメント上の推奨であり、強制はされません。

---

## Docker でのクイックスタート

Node.js や JDK を用意せず、フロントエンド + バックエンド + SQLite をワンコマンドで起動できます。

```bash
git clone https://github.com/wfukatsu/report-studio.git
cd report-studio

docker compose up --build
```

起動後、ブラウザで **http://localhost:8080** を開き、`admin` / `changeme` でログインします。

### 構成

`nginx` が静的アセットを配信し、`/api` をバックエンド（`backend:8080`）へ同一オリジンでリバースプロキシします。ブラウザからは単一オリジンに見えるため CORS 不要で、Cookie / CSRF が素直に機能します。構成の詳細は [`docker-compose.yml`](../docker-compose.yml) と [`docker/nginx.conf`](../docker/nginx.conf) を参照。

- **フロントエンド**（`Dockerfile`）: `node:22-alpine` でビルドし、`nginx:1.27-alpine` で配信。
- **バックエンド**（`server/Dockerfile`）: `eclipse-temurin:21-jdk` でビルド（`./gradlew installDist`）し、`eclipse-temurin:21-jre` で実行。SQLite DB は `/data` ボリュームに永続化。

### 運用オプション

| やりたいこと | コマンド |
|-------------|---------|
| ポート変更（8080 が使用中） | `APP_PORT=8090 docker compose up --build`（`ALLOWED_ORIGIN` は自動追従） |
| 初期パスワードを変更して起動 | `ADMIN_PASSWORD=... docker compose up --build` |
| 停止（データ保持） | `docker compose down` |
| 停止（データも削除） | `docker compose down -v`（名前付きボリューム `report-studio-data` を削除） |

> SQLite データベースは名前付きボリューム `report-studio-data` に保存され、コンテナ再作成後も残ります。

---

## ローカルセットアップ

フロントエンドとバックエンドを個別のプロセスとして起動する開発向け構成です。

### 1. 依存関係のインストール

```bash
git clone https://github.com/wfukatsu/report-studio.git
cd report-studio

# フロントエンド依存関係
npm install

# バックエンド設定ファイルのコピー（開発用は SQLite で追加設定不要）
cp server/scalardb.properties.example server/scalardb.properties
```

### 2. 起動

```bash
# フロントエンド + バックエンドを同時起動
npm run dev:full

# または個別に起動
npm run dev          # フロントエンド (http://localhost:5173)
npm run dev:backend  # バックエンド   (http://localhost:8080)
```

- 開発時、フロントエンド（5173）から `/api` へのリクエストは Vite の proxy 経由でバックエンド（8080）に転送されます（`vite.config.ts`）。バックエンドのポートを変える場合は `.env` に `VITE_API_PORT=<port>` を設定します（`.env.example` を参照）。

### 3. ログイン

ブラウザで `http://localhost:5173` を開きます。

| ユーザーID | パスワード |
|-----------|-----------|
| `admin` | `changeme`（初期値） |

> **⚠ セキュリティ:** 初期パスワードのまま外部公開しないでください。初回起動前に `ADMIN_PASSWORD` 環境変数を設定するか、ログイン後に管理画面からパスワードを変更してください。初期パスワードのまま起動するとサーバーログに警告が出ます。UI で変更したパスワードは再起動しても巻き戻りません（`ADMIN_PASSWORD` を設定して再起動した場合のみリセット）。詳細は [SECURITY.md](../SECURITY.md) を参照。

### フロントエンドのコマンド

```bash
npm run dev              # 開発サーバー起動 (http://localhost:5173)
npm run build            # 型チェック + ビルド (dist/)
npm run lint             # ESLint
npm test                 # テスト実行（watch モード）
npm test -- --run        # テスト一回実行
npm run test:coverage    # カバレッジレポート（ラチェット閾値 — 現状値を下回ると失敗）
npm run storybook        # Storybook コンポーネントカタログ (http://localhost:6006)
```

単一テストファイルの実行:

```bash
npx vitest run src/lib/dataBinding.test.ts
```

### バックエンドのコマンド

```bash
npm run dev:backend      # バックエンド起動 (http://localhost:8080)
npm run test:backend     # バックエンドテスト（JUnit 5 + ゴールデン PDF 回帰テスト）
npm run seed             # サンプルテーブル・データを投入（Gradle SeedData。サンプル帳票 6 種の seed:samples とは別系統 → 「サンプル帳票」の節を参照）
```

> **注意（`build:backend`）:** `npm run build:backend` は `./gradlew shadowJar` を呼びますが、`server/build.gradle.kts` には Shadow プラグイン/`shadowJar` タスクが定義されていないため、このスクリプトは現状失敗します。実行可能な成果物を生成する動作する経路は `./gradlew installDist`（`server/build/install/` に自己完結ディストリビューションを生成、Docker ビルドと同じ方法）です。

---

## ScalarDB の設定

バックエンドのデータストアは ScalarDB 経由で扱います。設定は `server/scalardb.properties`（gitignore 対象。`server/scalardb.properties.example` をコピーして作成）または環境変数で行います。

### 開発（SQLite・既定）

`server/scalardb.properties.example` の内容:

```properties
scalar.db.storage=jdbc
scalar.db.contact_points=jdbc:sqlite:data/report-studio.db
scalar.db.username=
scalar.db.password=
scalar.db.jdbc.connection_pool.min_idle=1
scalar.db.jdbc.connection_pool.max_idle=5
scalar.db.jdbc.connection_pool.max_total=10
scalar.db.transaction_manager=jdbc
```

- DB ファイルはリポジトリルート基準の `data/report-studio.db`（`run`/`seed` タスクが `workingDir` をルートに設定するため）。
- テーブルは起動時に自動作成されるため追加設定は不要です。すべてのアプリテーブルは名前空間 `report_studio` に作成されます。

### 本番（任意の JDBC データベース）

`scalar.db.contact_points` を対象 DB の JDBC URL に変更し、`scalar.db.username` / `scalar.db.password` を設定します。

### 環境変数によるオーバーライド

`SCALARDB_CONTACT_POINTS` が設定されている場合、環境変数がファイルより優先されます（Docker 構成はこの方式を使用）。

| 変数名 | 既定値 | 説明 |
|--------|-------|------|
| `SCALARDB_CONTACT_POINTS` | （未設定） | 設定すると環境変数ベースの構成が有効化される |
| `SCALARDB_STORAGE` | `jdbc` | ストレージ種別 |
| `SCALARDB_USERNAME` | （空） | 接続ユーザー |
| `SCALARDB_PASSWORD` | （空） | 接続パスワード |
| `SCALARDB_TX_MANAGER` | `jdbc` | トランザクションマネージャ |
| `SCALARDB_POOL_MIN_IDLE` | `1` | JDBC 接続プール min_idle（#274。properties ファイル使用時もファイル値を上書き） |
| `SCALARDB_POOL_MAX_IDLE` | `5` | JDBC 接続プール max_idle（同上。ScalarDB 3.18 では本プロパティは無視され警告が出ます） |
| `SCALARDB_POOL_MAX_TOTAL` | `10` | JDBC 接続プール max_total（同上） |

---

## 環境変数

| 変数名 | 既定値 | 説明 |
|--------|-------|------|
| `PORT` | `8080` | バックエンドの待受ポート |
| `ADMIN_PASSWORD` | `changeme` | 初期管理者パスワード（初回起動前に設定） |
| `ALLOWED_ORIGIN` | （未設定） | CORS / CSRF Origin チェックで許可する追加オリジン。ブラウザの URL と一致させる |
| `LOGIN_RATE_LIMIT_MAX` | `5` | ログイン試行上限（IP / 窓あたり） |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | `300000` | レートリミット窓（ミリ秒、既定 5 分） |
| `WEBHOOK_SECRET_KEY` | （未設定） | Webhook シークレット暗号化キー（Base64 32 バイト、例: `openssl rand -base64 32`）。未設定時は平文保存 + 起動時警告 |
| `COOKIE_SECURE` | （未設定） | `true` でセッション Cookie に `Secure` 属性を付与（HTTPS の `ALLOWED_ORIGIN` 指定時は自動） |
| `LOG_LEVEL` | `INFO` | ルートログレベル（`TRACE`/`DEBUG`/`INFO`/`WARN`/`ERROR`、#274） |
| `LOG_FORMAT` | （未設定） | `json` で 1 行 1 JSON の構造化ログ出力（logstash 形式）。未設定時は人間可読パターン |
| `MAX_REQUEST_SIZE` | `5000000` | HTTP リクエストボディの最大サイズ（バイト） |
| `CORS_DEV_PORT_RANGE` | `5173-5200` | CORS で許可するローカル開発サーバのポート範囲（`lo-hi` 形式） |

---

## サンプルデータの投入

サンプルの帳票テンプレート 6 種（請求書・見積書・発注書・納品書・領収書・売上明細一覧）と、そのバインド先となる ScalarDB テーブル・行データを投入できます。売上明細一覧は繰り返しバンドの継続ページ分割（バンドフロー）を実演するサンプルで、明細 40 行がサーバ PDF で 3 ページに分割されます。

```bash
# 1) テンプレート JSON と db-seed.json を生成（決定論的・べき等）
npm run build:samples

# 2) バックエンド起動中に、テーブル作成・行 upsert・テンプレート保存を実行
npm run seed:samples
```

- `build:samples`（`scripts/sample-forms/build.mjs`）: `scripts/sample-forms/templates/` に 6 種のテンプレートと `db-seed.json` を生成。ID は SHA1 由来で決定論的なため何度実行しても同じ結果になります。
- `seed:samples`（`scripts/sample-forms/seed.mjs`、要バックエンド `:8080`）: ①`/api/v1/auth/login` でログイン、②HTTP API 経由で ScalarDB テーブルを作成・行を投入（生の SQLite 書き込みは不可、ScalarDB トランザクション層を通す）、③各テンプレートを admin 所有の公開テンプレートとして保存。作成した ID は `server/data/sample-form-ids.json` に記録され、再実行時は上書き（べき等）。
  - 環境変数: `API_BASE`（既定 `http://localhost:8080`）、`API_ORIGIN`（既定 `http://localhost:5173` — CSRF ガード用の Origin ヘッダ。サーバ自身のオリジンは CORS で拒否されるため Vite dev オリジンを送る）、`ADMIN_USER`（既定 `admin`）、`ADMIN_PASSWORD`（既定 `changeme`）。レートリミット（rows API 60 req/分）に当たった場合は 429 を自動リトライします。
  - テーブルは `demo.*` 名前空間（例: `demo.invmod_header`、`demo.delivery_items`）に作成されます。

> 別系統として `npm run seed`（Gradle の `SeedData`）もあります。こちらは Java からサンプルテーブル・データを投入します。

---

## スキーマ生成

テンプレート定義の JSON Schema は Zod スキーマから自動生成します。

```bash
npm run generate:schema
```

- `schemas/report-definition.schema.json`（JSON Schema draft 2020-12）を `src/lib/schemas/reportDefinition.ts` の Zod スキーマから再生成します。**手で編集しないでください。**
- 構造上限の単一ソースは `schemas/report-definition-limits.json`（手書き）で、フロントエンド（`src/lib/schemas/limits.ts`）とバックエンド（ビルド時に `processResources` でバンドル）の双方が同じ値を参照します。
- 生成物とのドリフトはテストで検出されます（`src/lib/schemas/jsonSchema.test.ts`、バックエンドの `ReportDefinitionValidatorTest`）。スキーマバインド系の変更後は `npm run generate:schema` を実行してコミットしてください。

---

## CLI

`scripts/cli/report-studio.mjs` は依存ゼロ（Node 18+ のグローバル `fetch` + 標準ライブラリのみ）の CLI です。GUI と同じサーバー API を叩くため、GUI と CLI を混在させたワークフローが可能です。

```bash
# 実行形式
node scripts/cli/report-studio.mjs <command> [options]
# または
npm run cli -- <command> [options]
```

- グローバルオプション: `--url <base>`（既定 `$REPORT_STUDIO_URL` または `http://localhost:8080`）、`--json`（機械可読出力）、`--help`。
- セッション Cookie は `~/.report-studio/cookies` に保存（`$REPORT_STUDIO_HOME` で変更可）。

### コマンド一覧

| カテゴリ | コマンド | 説明 |
|---------|---------|------|
| 認証 | `login [--user admin] [--password changeme]` | ログインしてセッションを保存 |
| 認証 | `whoami` | 現在のユーザー / ロールを表示 |
| テンプレート | `templates list` | テンプレート一覧（id, name, visibility, updatedAt） |
| テンプレート | `templates get <id>` | 定義 JSON を表示 |
| テンプレート | `templates export <id> [--out <file>]` | エクスポート（既定 `<id>.rds2.json`） |
| テンプレート | `templates import <file>` | インポート |
| テンプレート | `templates delete <id>` | 削除 |
| 出力 | `pdf <id> [--data <data.json>] [--out <file.pdf>]` | 単票 PDF を生成しファイルに保存 |
| 出力 | `batch <id> --csv <rows.csv> [--out <dir>] [--name <col>]` | CSV 1 行につき 1 PDF を生成（ヘッダはドット記法で入れ子に展開） |
| 回答 | `responses list <templateId>` | 回答一覧（id, status, submittedBy, summary） |
| 回答 | `responses status <templateId> <responseId> <draft\|issued\|sent\|void>` | 単一回答のステータス変更 |
| 回答 | `responses set-status <templateId> <status> (--ids a,b,c \| --status-from <old>)` | 複数回答の一括ステータス変更 |
| ジョブ | `jobs list` | ジョブ一覧（jobId, jobType, status, processed/total） |
| ジョブ | `jobs status <jobId>` | ジョブの詳細 JSON |
| DB | `db tables` | ScalarDB の名前空間・テーブル一覧 |
| DB | `db rows <ns.table>` | テーブルをスキャンして行を表示 |

詳細な使用例は `scripts/cli/README.md` を参照してください。

---

## CI/CD

`.github/workflows/ci.yml`（唯一のワークフロー）。トリガー: `main` への push、および全 PR。

- **frontend ジョブ**: Node 22 → `npm ci` → `npm run lint` → `npm run build`（型チェック + ビルド）→ `npx vitest run --reporter=basic`。
- **backend ジョブ**: Temurin 21 → `cp server/scalardb.properties.example server/scalardb.properties` → `./gradlew test`（JUnit + ゴールデン PDF 回帰）。失敗時はテストレポートをアーティファクトとしてアップロード。

デプロイ/リリース用のワークフローは現時点で存在しません。
