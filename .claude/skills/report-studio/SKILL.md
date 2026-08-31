---
name: report-studio
description: Report Studio の帳票テンプレートをCLIから操作する。テンプレートの閲覧・作成・編集（op ベース）、PDF/サムネイル生成、JEXL式やDBバインドの診断、回答・ジョブ・商品マスターの操作。トリガー: 「帳票を作って」「テンプレートを編集」「請求書のPDFを出して」「バインドが解決しない」「report-studio」「帳票が白紙になる」。対象外: キャンバスのドラッグ操作やUIのE2Eテスト（e2e/ を使う）。
---

# Report Studio CLI

Report Studio のバックエンド REST API を CLI から操作する。帳票テンプレートは
`ReportDefinition` という JSON で表現され、キャンバス上の操作はすべて
この JSON への変更に還元できる — つまり CLI だけで帳票を作り切れる。

## セットアップ

バックエンドが必要（`npm run dev:backend`、JDK 21 が要る）。認証は **PAT 必須**:

```bash
export REPORT_STUDIO_URL=http://localhost:8080     # 既定値なので通常は不要
export REPORT_STUDIO_TOKEN=rpat_xxxxxxxx
```

トークンは人間が発行する（管理画面「APIトークン」または `npm run cli -- tokens create --label agent`）。

**Cookie セッション（`login --user/--password`）では書き込みができない。** CLI は Origin
ヘッダを送らず、サーバーの CSRF フィルタは `/api/v1/auth/*` と `/api/v1/public/*` 以外で
Origin 欠落を 403 にするため。Bearer PAT は CSRF チェックを迂回するので、これが唯一の
ヘッドレス経路。403 が出たら PAT が設定されているか最初に疑う。

以降 `rs` は `node scripts/cli/report-studio.mjs`（または `npm run cli --`）を指す。

## コンテキストを焼かないための鉄則

テンプレート 1 件は 25〜65 KB の JSON（≒18〜20k tokens）。**`templates get` を反射的に
使わない。** 40KB を超えると CLI が拒否する。

| やりたいこと | 使うコマンド | 目安 |
|-------------|------------|------|
| どんな帳票か知る | `rs templates summary <id>` | ~700 B |
| 要素を一覧する・編集対象を探す | `rs templates outline <id>` | ~60 B/要素 |
| 特定要素の詳細が要る | `rs templates get <id> --out /tmp/t.json` してから jq | ファイル経由 |
| 全文が本当に要る | `rs templates get <id> --force` | 最終手段 |

## コマンド

```
# 読む
rs templates list                     一覧
rs templates summary <id>             概要（ページ/要素種別/スキーマ/ルール）
rs templates outline <id> [--page N]  要素一覧 TSV + 短縮ハンドル e1,e2,…
rs templates get <id> [--out f.json]  全文（40KB 超は --force か --out）

# 作る・変える
rs templates create <name>                        空テンプレート（ページ0枚で始まる）
rs templates create <name> --from <id>            複製
rs templates create <name> --import <file.json>   .rds2.json を取り込み
rs templates edit <id> --ops ops.json [--dry-run] [--expect-updated-at <iso>] [--no-snapshot]
rs templates validate <id> [--data d.json]        保存前検証
rs templates versions list <id>                   バージョン一覧
rs templates versions snapshot <id>               手動スナップショット
rs templates versions restore <id> <vid>          復元（edit の undo）
rs templates delete <id> --yes                    完全削除（--yes 必須）

# 出す
rs pdf <id> [--data d.json] [--out f.pdf]         単票PDF
rs templates thumbnail <id> [--out f.jpg]         サムネイル（Read ツールで目視できる）
rs batch <id> --csv rows.csv --out dir/           一括PDF
rs jobs list / jobs status <jobId> / jobs cancel <jobId>

# 診断
rs evaluate <id> --data d.json        計算ルール（JEXL）を評価
rs bindings resolve <id> [--keys k.json]  DBバインドを解決
rs schema infer --data sample.json    サンプルJSONからスキーマ推論
rs schema list

# データ・回答
rs db tables / db rows <ns.table>
rs responses list <id>
rs responses status <id> <rid> <draft|issued|sent|void>
rs responses set-status <id> <status> --ids a,b | --status-from <old>
```

グローバル: `--json`（機械可読）`--url <base>`。

**`/api/v1/admin/*` は扱わない。** サーバー再起動・DB接続先変更・ユーザー管理は人間の操作。

## テンプレートを編集する（op ベース）

全文を書き換えるのではなく op を適用する。`templates outline` が振った短縮ハンドル
（`e1`, `e2`, …）と UUID のどちらでも指定できる。

```bash
rs templates outline <id>              # ← 先にこれ。ハンドルが確定する
cat > /tmp/ops.json <<'EOF'
{ "ops": [
  { "op": "addPage", "preset": "A4P" },
  { "op": "addElement", "pageIndex": 0,
    "element": { "type": "text", "content": "御 請 求 書", "x": 10, "y": 12, "width": 100, "height": 10,
                 "style": { "fontSize": 20, "fontWeight": "bold" } } },
  { "op": "updateElement", "elementId": "e3", "patch": { "style": { "fontSize": 12 } } },
  { "op": "moveElement", "elementId": "e5", "y": 34 },
  { "op": "removeElement", "elementId": "e7" },
  { "op": "setSchemaField", "dataKey": "customer", "fieldKey": "name",
    "patch": { "dbColumnName": "customer_name" } },
  { "op": "setPointer", "pointer": "/pages/0/background", "value": "#ffffff" }
] }
EOF
rs templates edit <id> --ops /tmp/ops.json --dry-run   # 差分と検証だけ
rs templates edit <id> --ops /tmp/ops.json             # 適用
```

op 一覧: `addElement` `updateElement` `removeElement` `moveElement` `addPage` `removePage`
`setSchemaGroup` `setSchemaField` `setRule` `setPointer`。

要素の座標は `x/y/width/height`（mm、フラット指定可。内部で `position`/`size` に正規化される）。

**適用後、ハンドルは無効化される。** 続けて編集するなら `templates outline` を取り直す。

**同時更新の検知**: `--expect-updated-at <iso>` を付けると、取得時から変わっていた場合に
PUT せず停止する。

### undo — 編集は取り消せる

`templates edit` は **PUT の前に自動でスナップショットを取る**（`--no-snapshot` で抑止）。
編集を間違えたら戻せる:

```bash
rs templates versions list <id>                 # スナップショット一覧
rs templates versions restore <id> <versionId>  # 復元（復元前の状態も自動保存される）
```

`edit` の出力に毎回 `変更前の状態を <versionId> として保存しました` と復元コマンドが
出るので、直前の状態に戻すだけならその ID をそのまま使う。

**`templates delete` だけは戻せない。** サーバー側は完全削除（ソフトデリートなし）なので
`--yes` が必須。消す前に `templates export <id> --out backup.json` で退避できる。

## オーサリング規約（違反すると黙って壊れる）

CLI が PUT 前に自動検査し、違反は**エラーで止める**。サーバー側は検出しない。
詳細と背景は `references/authoring-rules.md`。

1. **要素は `page.sections[N].elements` に置く。** `page.elements` は `@deprecated` で
   レンダラーに無視される（保存は通るのに画面に出ない）
2. **スキーマパスは2階層まで。** `customer.name` は可、`quotation.customer.name` は不可
   （`buildFlatDataFromResolved` が `data[dataKey]` にしか置かないため DB バインド不能）
3. **要素型は 24 種のみ**（`schemas/element-types.json`）。`label`→`text`、`table`→`formTable` に統合済み
4. **スキーマの未知キーは import 時に除去される**（Zod が passthrough しない）。警告で報告する

## ワークフロー

### 新しい帳票を作る
```bash
rs schema infer --data sample.json          # 1. サンプルからスキーマの形を得る
rs templates create "請求書"                 # 2. 空で作る（ページ0枚）
rs templates outline <id>                   # 3. 状態確認
rs templates edit <id> --ops ops.json --dry-run  # 4. addPage → addElement を検証
rs templates edit <id> --ops ops.json       # 5. 適用
rs pdf <id> --data sample.json --out /tmp/out.pdf   # 6. 出力
rs templates thumbnail <id> --out /tmp/t.jpg        # 7. Read で目視確認
```

### 帳票を診断する
```bash
rs templates summary <id>      # 構造の俯瞰。page.elements 混入もここで警告が出る
rs templates validate <id>     # 規約違反 + 検証ルール
rs bindings resolve <id>       # DBバインドが解決するか（207 部分成功）
rs evaluate <id> --data d.json # 計算式が通るか
```

### PDF が白紙になる
1. `rs pdf <id> --out /tmp/x.pdf` — 2000 バイト未満なら CLI が警告を出す
2. `rs templates outline <id>` — 要素が 0 件、またはページが 0 枚ではないか
3. `rs templates summary <id>` — `page.elements` への混入警告が出ていないか
4. `rs bindings resolve <id>` — バインドが空を返していないか
   （preview/PDF では空バインド要素は描画されない。エディタとの差はこれ）

## エラーコード

サーバーは `{error, code, correlationId}` を返す。CLI が回復手順を添えて表示する。

| code | 意味と対処 |
|------|-----------|
| `NOT_FOUND` | 所有者以外にも 404 を返す仕様（ID列挙防止）。可視性・所有者を確認 |
| `VALIDATION_ERROR` | `templates validate <id>` を先に |
| `VERSION_CONFLICT` | `templates outline` で取り直し `--expect-updated-at` を更新 |
| `RATE_LIMITED` | CLI が 1s/2s/4s で自動再試行済み。evaluate は 10req/10s、bindings resolve は 3req/10s |
| `PAYLOAD_TOO_LARGE` | stateless PDF は 512KB 上限 |
| 403 | PAT が設定されているか確認（Cookie セッションでは書き込み不可） |

## 参照

- `references/authoring-rules.md` — 規約の詳細と背景
- `references/element-types.md` — 24 要素型と主要プロパティ
- `schemas/report-definition.schema.json`（リポジトリ）— 定義スキーマ
- `docs/openapi.yaml`（リポジトリ）— REST 仕様
