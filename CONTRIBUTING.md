# コントリビューションガイド / Contributing

Report Design Studio への貢献に興味を持っていただきありがとうございます。
このドキュメントは、開発環境のセットアップ・変更の進め方・PR の作法をまとめたものです。

English speakers: this guide is written in Japanese, but the workflow is standard
GitHub flow (branch → PR → green CI → review → squash-merge). The commands below are
language-agnostic; feel free to open issues/PRs in English.

---

## 1. 行動規範 / Code of Conduct

建設的で敬意あるやり取りをお願いします。ハラスメント・差別的言動は受け入れません。
セキュリティ上の問題は Issue ではなく [SECURITY.md](./SECURITY.md) の手順で非公開に報告してください。

---

## 2. 開発環境のセットアップ

### 前提条件

- **Node.js 20+ / npm 10+**
- **JDK 21**（[Temurin](https://adoptium.net/) 推奨、または `brew install openjdk@21`）

> **JDK バージョンに注意:** バックエンドの Gradle は Java 21 toolchain を要求します。
> デフォルトの `java` が 21 以外の場合は `JAVA_HOME` を JDK 21 に向けてください。
> 例（macOS + Homebrew）:
> `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`

### 初回セットアップ

```bash
git clone https://github.com/wfukatsu/report-studio.git
cd report-studio

npm install                                            # フロントエンド依存
cp server/scalardb.properties.example server/scalardb.properties  # 開発は SQLite で追加設定不要
```

### 起動

```bash
npm run dev:full     # フロント (5173) + バックエンド (8080) を同時起動
# または個別に
npm run dev          # フロントエンドのみ
npm run dev:backend  # バックエンドのみ
```

Docker で丸ごと立ち上げたい場合は [README のクイックスタート（Docker）](./README.md#docker-でのクイックスタート) を参照してください。

---

## 3. ブランチ運用と PR

本リポジトリは **GitHub Flow**（`main` から作業ブランチを切り、PR 経由でマージ）です。

1. `main` から作業ブランチを作成する。ブランチ名は `<type>/<短い説明>` 形式を推奨:
   - 例: `fix/databrowser-retry`, `feat/csv-import`, `docs/contributing`, `test/binding-editor`
2. 変更をコミットする（コミット規約は §4）。
3. **`main` に直接 push しない。** 必ず PR を作成する。
4. CI（フロント + バックエンド）がグリーンであることを確認する。
5. レビューを受け、承認後にマージする（**squash merge** を推奨）。
6. Issue を閉じる場合は PR 本文に `Closes #123` を書く。
   - 複数の Issue を閉じるときは **各番号にキーワードを付ける**（`Closes #1, closes #2`）。
     `Closes #1, #2` は先頭の #1 しか自動クローズされない GitHub の仕様に注意。

---

## 4. コミット / PR 規約

### コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) に緩く従います。既存の履歴も参考にしてください。

```
<type>(<scope>): <要約>

<本文（任意）— なぜこの変更が必要かを説明>
```

- **type**: `feat` / `fix` / `docs` / `test` / `refactor` / `chore` / `perf` / `ci`
- **scope**（任意）: 変更対象。例: `ui`, `server`, `bindingEditor`, `dataBrowser`, `coverage`
- 要約は日本語・英語どちらでも構いません（既存履歴は日本語が主）。

### PR

- **1 PR = 1 論理的変更**にまとめる。無関係な変更を混ぜない。
- タイトルはコミットメッセージと同じ規約。
- 本文には「何を・なぜ」と、動作確認の方法・結果を書く。
- UI 変更はスクリーンショット / GIF を添えると助かります。

---

## 5. テストと品質ゲート

PR を出す前に、ローカルで以下がすべて通ることを確認してください（CI と同じ内容です）。

### フロントエンド

```bash
npm run lint             # ESLint
npm run build            # tsc 型チェック + vite ビルド
npm test -- --run        # Vitest（一回実行）
npm run test:coverage    # カバレッジ（ラチェット閾値 — 現状値を下回ると失敗）
```

### バックエンド

```bash
npm run test:backend     # JUnit 5 + ゴールデン PDF リグレッション（JaCoCo ゲート含む）
```

単一テストファイルだけ実行する例:

```bash
npx vitest run src/lib/dataBinding.test.ts                   # フロント
cd server && ./gradlew test --tests "com.report.server.SequenceControllerTest"  # バックエンド
```

### テスト方針

- **振る舞いをテストする** — 実装の内部ではなく、ユーザー/API から見た挙動を検証する。
- **バグ修正には回帰テストを添える** — 「修正前は失敗し、修正後は通る」テストを 1 本以上。
- **カバレッジはラチェット式** — 現状のカバレッジを下回るとゲートが失敗します。CI のフロントエンド
  Test ステップは `--coverage` 付きで実行され、この閾値を強制します。新規コードには
  相応のテストを付けてください（閾値の引き上げは歓迎、引き下げは原則不可）。
- 新しい振る舞いを追加/変更したら、テストの期待値も同じ PR で更新する。

---

## 6. コーディング規約

- **フロントエンド**: TypeScript + React。ESLint に従う。要素の状態変更は必ず Zustand ストア経由
  （コンポーネントから `element` を直接変更しない）。新しい要素タイプの追加手順は
  [CLAUDE.md](./CLAUDE.md) の「Add a new element type」を参照。
- **バックエンド**: Java 21 + Javalin。コントローラ/リポジトリ/エンジンの分離を保つ。
- **言語**: ユーザー向け文言・ドキュメントは日本語がデフォルト。コード識別子は英語。
- 迷ったら、まわりの既存コードのスタイル（命名・コメント量・イディオム）に合わせてください。

アーキテクチャの全体像は [docs/architecture.md](./docs/architecture.md)、
API 仕様は [docs/detailed-design.md](./docs/detailed-design.md) にあります。

---

## 7. Issue

- バグ報告には、再現手順・期待する挙動・実際の挙動・環境（OS / Node / JDK バージョン）を記載してください。
- 機能提案は、解決したい課題（なぜ）から書いていただけると議論しやすいです。
- セキュリティ脆弱性は **公開 Issue に書かず** [SECURITY.md](./SECURITY.md) の手順で報告してください。

導入・利用している方は、ぜひ [ADOPTERS.md](./ADOPTERS.md) への追加もご検討ください
（プロジェクトの継続的な改善の指標になります）。
