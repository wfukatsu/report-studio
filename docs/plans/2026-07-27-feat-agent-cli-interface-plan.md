# Report Studio エージェント操作インターフェース設計（CLI 先行 / MCP 条件付き）

Report Studio を LLM エージェントから操作するためのインターフェース設計。
**既存 CLI (`scripts/cli/report-studio.mjs`) の拡張 + Skill 化を先行させ、MCP サーバーは
条件付きの後続フェーズ**とする。

- **対象**: Report Studio backend (Javalin, `/api/v1` + `/api/v2`)
- **Phase 0 成果物**: CLI コマンド追加 + `.claude/skills/report-studio/SKILL.md`
- **Phase 1+ 成果物**（条件付き）: `mcp/` ワークスペース（`@report-studio/mcp`）

---

## 1. 設計方針

### 1.1 何をラップするか — REST API（UI 自動化ではない）

Report Studio の機能は 2 層に分かれる:

| 層 | 例 | エージェントから操作可能か |
|----|----|--------------------|
| サーバー側（REST） | テンプレート CRUD・PDF/Excel 生成・回答・ジョブ・ScalarDB・商品マスター | **可**（本設計の対象） |
| クライアント側のみ | キャンバスのドラッグ/リサイズ、FormTable のセル編集モード、undo/redo、レイヤーパネル | 不可 |

クライアント側の操作は **すべて最終的に `ReportDefinition` JSON への変更**として表現できる。
したがって「キャンバスを操作する」のではなく **「定義 JSON を編集して PUT する」** ことで
同等の結果を得る。ブラウザ自動化（Playwright/CDP）は非決定的でトークン効率も悪いため
採用しない（E2E 検証が必要なときは既存の `e2e/` を使う）。

### 1.2 なぜ MCP ではなく CLI を先行させるか

コンテキスト重量には 2 軸ある:

| 軸 | 内容 | MCP | CLI + Skill |
|----|------|-----|-------------|
| **常駐** | ツール定義が常にコンテキストを占める | 22 ツールで概算 5,000 tokens | **0**（Bash 経由、Skill は必要時のみロード） |
| **呼び出しごと** | 実行結果 | 投影次第 | 投影次第（同じ対策が必要） |

Claude Code は deferred tool loading（名前だけ提示し、スキーマは要求時にロード）を持つため
常駐コストを圧縮できるが、**CLI ならそもそもゼロ**。かつ `scripts/cli/report-studio.mjs` は
既に 585 行・依存ゼロで templates / pdf / batch / responses / jobs / db をカバーしており、
**追加実装は 5〜6 コマンド程度で足りる**。

MCP 固有の利点として当初「サムネイル画像を content block で返せる」を挙げたが、
**Claude Code の Read ツールは画像ファイルをそのまま視覚的に読める**ため、
CLI が JPEG をディスクに書けば目視確認ループは同等に成立する。この差は消える。

結果、CLI に対する MCP の実質的な優位は **「シェルを持たないクライアント（Claude Desktop
等）から使えること」の 1 点のみ**。それが要件になるまで MCP は建てない。

### 1.3 コンテキスト予算を最優先の制約として扱う（CLI でも同じ）

実測（`scripts/sample-forms/templates/`）:

| テンプレート | バイト数 | ページ | 要素数 | UUID 出現 | 中央値/要素 |
|--------------|---------|-------|--------|----------|------------|
| invoice.json | 62,618 | 1 | 61 | 128 | 296 B |
| quotation.json | 54,697 | 1 | 53 | 112 | 293 B |
| receipt.json | 24,437 | 1 | 30 | 35 | 250 B |

`templates get <id>` の全文はおよそ **18,000〜20,000 tokens**。
`cat` 相当の素朴な出力はコンテキストを一撃で焼く。よって CLI 側にも投影が要る:

- 既定は**要約 / アウトライン**、全文は明示要求かつサイズ上限つき
- 編集は「全文を読ませて全文を書かせる」のではなく **op ベースの部分編集**
- バイナリ（PDF/Excel/画像）はファイルに書き、標準出力にはパスとメタデータのみ

---

## 2. Phase 0 — CLI 拡張 + Skill 化

### 2.1 追加コマンド

既存コマンドは変更しない。以下を追加する。

| コマンド | 対応 API | 目的 |
|----------|---------|------|
| `templates outline <id>` | `GET /api/v2/templates/{id}` | **投影の中核**。TSV + 短縮ハンドル |
| `templates summary <id>` | 同上 | 300〜600 tokens の俯瞰 |
| `templates edit <id> --ops ops.json` | GET → PUT | **オーサリングの中核**。op ベース部分編集 |
| `templates create <name>` | `POST /api/v2/templates` | 空 / duplicate / import を吸収 |
| `templates validate <id>` | `POST .../validate` + ローカル検査 | 保存前の構造・規約チェック |
| `templates thumbnail <id>` | `GET .../thumbnail` | JPEG を書き出し → Read で目視 |
| `evaluate <id> --data d.json` | `POST .../evaluate` | JEXL 計算ルールのデバッグ |
| `bindings resolve <id>` | `POST .../resolve-bindings` | DB バインドの切り分け |
| `schema infer --data sample.json` | `POST /api/v2/schemas/infer` | 新規作成の起点 |

既存の `pdf` / `batch` / `responses` / `jobs` / `db` / `templates {list,get,export,import,delete}`
はそのまま活用する。

### 2.2 投影レイヤ — 短縮ハンドル + TSV

UUID は 1 個あたり概算 16 tokens。61 要素の ID を列挙するだけで **約 1,000 tokens が
UUID 文字列**になる。`outline` では短縮ハンドルを振る。

```
$ npm run cli -- templates outline <id>
template  請求書  A4P  pages=1  elements=61  updatedAt=2026-07-27T12:00:00Z
handles   ~/.report-studio/handles/<templateId>.json  (updatedAt=2026-07-27T12:00:00Z)

# page 1 / section body
id   type        rect              bind
e1   text        12,10,80,8        -
e2   dataField   12,24,60,6        customer.name
e3   formTable   12,60,186,90      items
e4   tenantLogo  160,10,30,15      -
...
```

- **ハンドルマップ**は `~/.report-studio/handles/<templateId>.json` に
  `{updatedAt, map: {e1: "<uuid>", ...}}` として永続化（`$REPORT_STUDIO_HOME` 配下）
- `templates edit` の op はハンドル / UUID のどちらでも受理する
- `updatedAt` が変わったマップは無効化し、再 outline を促す
- JSON が必要なときは `--json`（既存のグローバルフラグ）

効果: JSON 素出力 約 3,700 tokens → **TSV + ハンドルで 約 1,200 tokens**。

`templates summary` は名前・可視性・更新日時・用紙・要素種別ごとの個数・スキーマグループ
（`dataKey` / `role` / `tableMeta.tableName` / フィールド数）・計算/検証ルール件数・
出力バリアント名を返す。

`templates get`（全文）は **40KB 超で `--force` を要求**する。このガードがないと、
エージェントは反射的に全文を取得してコンテキストを焼く。

### 2.3 op ベース編集と不変条件

```bash
npm run cli -- templates edit <id> --ops ops.json [--expect-updated-at <iso>] [--dry-run]
```

```jsonc
// ops.json
{
  "ops": [
    { "op": "addElement", "pageIndex": 0, "sectionId": "body",
      "element": { "type": "dataField", "fieldKey": "customer.name", "x": 12, "y": 24, "width": 60, "height": 6 } },
    { "op": "updateElement", "elementId": "e2", "patch": { "fontSize": 12 } },
    { "op": "moveElement",   "elementId": "e3", "y": 70 },
    { "op": "removeElement", "elementId": "e7" },
    { "op": "setSchemaField","dataKey": "customer", "fieldKey": "name", "patch": { "dbColumnName": "customer_name" } },
    { "op": "setPointer",    "pointer": "/pages/0/background", "value": "#ffffff" }
  ]
}
```

対応 op: `addElement` / `updateElement`（浅いマージ）/ `removeElement` / `moveElement` /
`addPage` / `removePage` / `setSchemaGroup` / `setSchemaField` / `setRule` /
`setPointer`（JSON Pointer 脱出ハッチ）。

CLI は GET → apply → 検査 → PUT を行い、**差分サマリだけを出力**する（更新後の定義全文は
出さない）:

```
✓ 4 ops applied → <id> (updatedAt=2026-07-27T12:05:00Z)
  + e62 dataField  customer.name  @12,24
  ~ e2  fontSize 10 → 12
  ~ e3  y 60 → 70
  - e7  text
  ⚠ schema.customer.name.dbColumnName は定義スキーマに存在しないと import 時に除去されます
```

**PUT 前に必ず実行するローカル不変条件チェック**（いずれも実際に踏まれた罠で、
かつ**サーバー側では検出されない**）:

1. **要素の格納先** — `page.elements`（`@deprecated`）への追加を拒否。要素は必ず
   `page.sections[N].elements`。`sectionId` 省略時は最初の `body` セクションに入れる
2. **スキーマパスは 2 階層まで** — `fieldKey` が `a.b.c` のような 3 階層なら拒否し、
   「DB バインド不能（`buildFlatDataFromResolved` が `data[dataKey]` にしか置かない）」と説明
3. **要素型** — `schemas/element-types.json` に無い `type` を拒否。廃止済みの
   `label` / `table` は `text` / `formTable` への読み替えを提案
4. **Zod strip 対象** — `dbColumnName` / `computed` / `expression` / `tableMeta` /
   `linkedMasterGroupId` はスキーマ側の定義が伴わないと import 時に黙って消える → 警告

**構造バリデーション本体は Ajv を持ち込まずサーバーに委ねる**。PUT 境界では
`ReportDefinitionValidator` が必ず走るため、`--dry-run` は「ローカル 4 検査 + 差分表示」、
本 PUT の 400 応答をそのまま構造エラーとして扱う。依存ゼロという CLI の性質を保つ。

**楽観ロック**: `--expect-updated-at` 不一致なら PUT せず即エラー。省略時は GET 直後の
`updatedAt` を使う（read-modify-write のウィンドウは残るが単独利用では実用上十分）。

### 2.4 Skill の構成

`.claude/skills/report-studio/SKILL.md`。**必要時のみロードされる**ため、ここに仕様を
集約しても常駐コストはかからない。

| セクション | 内容 |
|-----------|------|
| コマンドリファレンス | 上記コマンド一覧（1 行説明 + 代表例） |
| **オーサリング規約** | 後述の踏み抜きポイント集 |
| ワークフロー | 新規作成 / 診断 / 白紙 PDF 切り分け / 一括発行 |
| エラーコード対応表 | `code` → 回復手順 |

補助ファイル（Skill から参照、本体には埋め込まない）:

- `references/authoring-rules.md` — 規約詳細
- `references/element-types.md` — 24 要素型と主要プロパティ
- `schemas/report-definition.schema.json` — 既存ファイルを参照（複製しない）
- `docs/openapi.yaml` — 既存ファイルを参照

**オーサリング規約に必ず書くこと**（すべて実際に踏まれた罠）:

- 要素は `page.sections[N].elements` に置く。`page.elements` はレンダラーに無視される
- スキーマパスは 2 階層（`customer.name` は可、`quotation.customer.name` は不可）
- `dbColumnName` / `computed` / `expression` / `tableMeta` / `linkedMasterGroupId` は
  Zod で passthrough されない → スキーマ側にも定義がないと import 時に黙って消える
- design と preview の差は `readonly` フラグ 1 本。preview では空バインド要素は消える、
  `repeatingBand` / `repeatingList` / `formTable` は `readonly && dataSource` のときだけ実データ
- テナント値と fallback が両方未設定の `tenant*` 要素は preview/PDF で何も描画しない
- サーバーが永続化する既定文言（「新しいテンプレート」「 (コピー)」）は ja 固定

### 2.5 認証と安全弁

既存 CLI の認証をそのまま使う。エージェント利用では **PAT (Bearer) を推奨**:

```bash
export REPORT_STUDIO_TOKEN=rs_pat_xxxxxxxx
export REPORT_STUDIO_URL=http://localhost:8080
```

- `ApiRoutes.csrfRejectReason` より **Bearer 付きリクエストは CSRF チェックを即バイパス**する。
  Cookie セッションは Origin の扱いが面倒（CLI は「Origin を送らない」回避策を取っている）
- `ApiTokenController` の管理系は**実セッション必須**で、PAT からさらに PAT を作れない。
  この性質（権限の自己増殖不可）を維持するため、**エージェントに `login` / `tokens create`
  を使わせない**運用とし、Skill にもそう書く
- **`/api/v1/admin/*` は Skill に載せない**。サーバー再起動や DB 接続先変更は
  エージェントが誤って踏むには重すぎる。必要になったら人間が GUI か手打ち CLI で行う

**破壊的操作のゲート**（要決定 / §6）: `templates delete` などに `--yes` を必須化するか。
既存挙動の変更になるため `scripts/cli/report-studio.test.mjs` の更新を伴う。

### 2.6 成果物と目視確認

CLI は元々ファイルに書くため、この軸は最初から軽い。

```bash
npm run cli -- pdf <id> --data d.json --out out/invoice.pdf
npm run cli -- templates thumbnail <id> --out out/invoice.jpg
# → エージェントは Read ツールで out/invoice.jpg を視覚的に確認できる
```

- 出力先は `--out` 指定。既定は `$REPORT_STUDIO_ARTIFACT_DIR`（既定 `./.rs-artifacts/`）
- 標準出力には `path` / `bytes` / `pages` / `sha256` のみ
- **白紙 PDF 検知**: `bytes < 2000` または `pages === 0` のとき警告を出す
  （534B の空エンベロープ事故の再発防止）

---

## 3. Phase 1+ — MCP サーバー（条件付き）

### 3.1 建てる条件

以下のいずれかが実要件になったときに着手する。**それまでは建てない。**

1. シェルを持たない MCP クライアント（Claude Desktop 等）からの利用が必要になった
2. Report Studio を社内共有サービスとして複数人のエージェントに開放する
   （Streamable HTTP + リクエスト単位の PAT が要る）
3. CLI の出力パースがエージェントにとって不安定と実測された

### 3.2 建てる場合の要点

Phase 0 の資産をほぼそのまま流用できる設計にしておく:

- **配置**: リポジトリ内 `mcp/`（npm workspace）。`schemas/*.json` と `docs/openapi.yaml`
  を直接参照し、要素型の変更に自動追従する
- **HTTP 層・投影・op 適用・不変条件チェックは CLI と共有モジュール化**して二重実装を避ける
  （Phase 0 の時点で `scripts/cli/lib/` に切り出しておく）
- **ツール数は 8 前後**に抑える。`template`（action: list/get/create/edit/delete/versions/
  export/import/validate）のように family を `action` enum で束ねる
- 詳細仕様は MCP Resources（`report-studio://guide/*`）に逃がす — Skill の
  `references/*.md` をそのまま供給できる
- 権限ティア: R（参照・レンダリング）常時 / W（更新）既定有効 / D（削除・DB 書き込み）
  既定無効 / A（admin）非公開

---

## 4. 横断的な設計（Phase 0 / 1 共通）

### 4.1 エラー

サーバーは全エラーを `{error, code, correlationId}` で返す（#267）。人間可読メッセージは
ja 固定（#412）なのでそのまま透過し、**コードごとの回復手順を添える**:

```
✗ [VERSION_CONFLICT] テンプレートは別のクライアントに更新されています (correlationId=abc123)
  → templates outline <id> で updatedAt を取り直し、--expect-updated-at を更新して再実行
```

| code | 添えるヒント |
|------|--------------|
| `NOT_FOUND` | 所有者以外には 404 を返す仕様（ID 列挙防止）。可視性も確認 |
| `VALIDATION_ERROR` | `templates validate` を先に実行 |
| `VERSION_CONFLICT` | 再取得 → 再適用 |
| `RATE_LIMITED` | CLI が 1s/2s/4s バックオフで最大 3 回再試行してから報告 |
| `PAYLOAD_TOO_LARGE` | stateless PDF は 512KB 上限 → `templateId` 経路に切り替える |
| 403 | このトークンのロールでは実行不可（トークン再発行は誘導しない） |

### 4.2 レート制限

サーバー側の制限を CLI が知っていること:

- `POST .../evaluate` — **10 req / 10 s / IP**（JEXL は CPU 集約）
- `POST .../resolve-bindings` — **3 req / 10 s / user**、かつ Phase 2 制限で
  `role=master` グループのみ解決可能（detail グループは error エントリで返る）

`bindings resolve` / `evaluate` は直列化 + 指数バックオフを CLI 内で行う。

### 4.3 V1 / V2 の分岐を隠す

ジョブ状態は単票 `/api/v2/pdf-jobs/{id}`、バッチ `/api/v2/pdf-jobs/batch/{id}`、
旧 CSV `/api/v1/jobs/{id}` に散っている（既存 `cmdJobStatus` も実際にフォールバックしている）。
`jobs status` に集約済み — この方針を維持し、Skill には統一ビューだけを書く。

---

## 5. テスト戦略

1. **ユニット（既存 `report-studio.test.mjs` を拡張）** — 投影ロジック（summary / outline /
   ハンドル採番）、op 適用、不変条件チェック、エラーマッピング。ネットワーク非依存
2. **不変条件の回帰テスト（必須）** — `page.elements` への追加 / 3 階層 fieldKey /
   未知要素型 / Zod strip 対象フィールド の 4 ケースが**必ず拒否・警告される**ことを固定
3. **契約テスト** — CLI が叩く `(method, path)` を列挙し `docs/openapi.yaml` に存在することを
   検証。API 変更で CLI が壊れたら CI で落ちる（既存の OpenAPI parity テストと同じ発想）
4. **統合テスト** — テスト用 Javalin 起動 → 作成 → 編集 → PDF 生成 → 削除のラウンドトリップ。
   PDF はバイト数と `pages` を assert（白紙検知）

---

## 6. 実装順序と状況

| Step | 内容 | 状況 |
|------|------|------|
| 0-a | `scripts/cli/lib/` へ HTTP 層を切り出し（`api()` / エラーマッピング / バックオフ） | ✅ 完了 |
| 0-b | `templates summary` / `templates outline`（TSV + ハンドル）+ `templates get --force` ガード | ✅ 完了 |
| 0-c | `templates thumbnail` | ✅ 完了 |
| 0-d | `templates edit --ops`（+ 4 不変条件、`--dry-run`）/ `templates create` / `templates validate` | ✅ 完了 |
| 0-e | `evaluate` / `bindings resolve` / `schema infer` / `schema list` | ✅ 完了 |
| 0-f | `.claude/skills/report-studio/SKILL.md` + `references/` | ✅ 完了 |
| 0-g | `templates versions list/snapshot/restore` + `edit` の自動スナップショット、`delete --yes` | ✅ 完了 |
| 1+ | MCP（§3.1 の条件成立時のみ） | 未着手（条件未成立） |

### 破壊的操作の扱い（§7 の未決事項を解決）

`templates edit` は毎回上書きで、サーバーに undo が無い。一方バージョン API
（snapshot / restore）は存在するのに CLI から届いていなかった。よって:

- **`templates edit` は PUT の前に既定でスナップショットを取る**（`--no-snapshot` で抑止）。
  opt-in にしないのは、防ぎたい失敗が「スナップショットを忘れること」そのものだから —
  覚えていないと働かない安全機構は安全機構ではない
- `templates versions restore` はサーバーの restore が定義を**返すだけ**なので、CLI が
  PUT まで行う。復元前の状態もスナップショットするため restore 自体も可逆
- **`templates delete` のみ `--yes` 必須**。サーバー側は完全削除（`definitionsRepo.delete`
  直呼び、ソフトデリートも復元経路も無い）。設計時に検討した env 方式
  （`RS_CLI_DESTRUCTIVE=1`）は採らない — 一度設定すると恒久的に無効化され、実行ログにも
  残らないため。フラグなら毎回の意思表示が必要で、記録にも残る
- ゲートはリクエスト送出**前**に判定する（誤った ID を打っても通信が起きない）。
  回帰テストで「ガードのメッセージが出て、接続エラーが出ないこと」を固定している

### 実測（2026-07-27、invoice.json をサーバーへ取り込んで計測）

| ビュー | サイズ | 対 full 比 |
|--------|-------|-----------|
| `templates get`（整形済み全文） | 62,956 B | 1.00 |
| `templates outline` | 3,606 B | **0.057** |
| `templates summary` | 728 B | **0.012** |

`templates get` は 40KB 超で拒否され、`summary` / `outline` / `--out` を案内する。

### 実装ファイル

```
scripts/cli/lib/
├── config.mjs      引数パース + パス/URL 解決
├── output.mjs      out/err/die/printJson/pad/sleep
├── http.mjs        api() + code→回復手順 + 429 バックオフ
├── projection.mjs  summary / outline / bindingOf / stray page.elements 検出
├── handles.mjs     短縮ハンドルの採番・永続化・失効・剪定
├── ops.mjs         op 適用 + 4 不変条件（ELEMENT_TYPES / dbIdentifierPattern を参照）
├── ops.test.mjs        22 tests
└── projection.test.mjs 13 tests
```

不変条件は `schemas/element-types.json` と `schemas/shared-constants.json` を実行時に
読むため、`npm run generate:schema` の結果に自動追従する。

### 副産物: サーバーのルーティング欠陥を修正

E2E 検証中に `POST /api/v2/templates/import` が `POST /api/v2/templates/{id}` に
食われていることが判明（Javalin は登録順で照合する）。**インポートは常に「id が文字列
`import` のテンプレートへの PUT」として処理され、200 と正常な応答を返しながら
取り込みに失敗していた** — フロントの取り込み UI も同じ経路を使う。

- 修正: `ApiRoutes.registerV2Routes` で literal path を `{id}` より前に登録
- 回帰防止: `RouteShadowingTest`（ApiRoutes.java を解析し、後から登録された literal path を
  先行する param path が食っていないかを verb ごとに検査。この種の欠陥は
  `OpenApiRouteParityTest` では検出できない — 両方のルートは存在し文書化もされているため）

---

## 7. 未決事項

- ~~**破壊的コマンドのゲート**~~ → 解決（§6「破壊的操作の扱い」）
- ~~**ハンドルマップの寿命**~~ → 解決（`pruneHandles` が 7 日で剪定、`outline` 実行時に走る）
- **stateless PDF の 512KB 制限**: 大きなテンプレートの保存前 dry-run ができない。
  一時テンプレートを作って生成 → 削除する代替経路を用意するか
- **バージョンの保持ポリシー**: `edit` ごとにスナップショットが増える。サーバー側に
  保持上限が無いため、頻繁に編集するテンプレートで `v2_template_versions` が膨らむ。
  世代数上限（例: 直近 50 件）をサーバーに入れるのが筋
- **要素プロパティの機械可読カタログ**: 現状 `element-types.json` は型名のみ。各要素の
  必須/任意プロパティまで生成できると `templates edit` の精度が上がる
  （`npm run generate:schema` の拡張として別途検討）
