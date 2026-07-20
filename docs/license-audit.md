# 依存ライセンス監査（SCP-001 / ASM-008）

- **実施日**: 2026-07-17
- **結論**: **コピーレフト（GPL/LGPL/AGPL 等）依存はゼロ。全依存が Apache-2.0 と互換であり、本リポジトリを Apache License 2.0 で公開可能。**

## フロントエンド（npm、production 依存）

方法: `npx license-checker --production --summary`

| ライセンス | パッケージ数 | 互換性 |
|---|---|---|
| MIT | 196 | ✅ |
| ISC | 19 | ✅ |
| Apache-2.0 | 3 | ✅ |
| (MIT OR Apache-2.0) | 2 | ✅（どちらを選択しても可） |
| BSD-3-Clause | 2 | ✅ |
| (MPL-2.0 OR Apache-2.0) | 1 | ✅（Apache-2.0 を選択） |
| (AFL-2.1 OR BSD-3-Clause) | 1 | ✅（BSD-3-Clause を選択） |
| 0BSD | 1 | ✅ |
| MIT AND ISC | 1 | ✅ |
| MIT*（表記ゆれ） | 1 | ✅ `rgbcolor@1.0.1` — リポジトリ上は MIT（SPDX 非標準表記のため `*` 付き） |
| UNLICENSED | 1 | —（report-studio 自身。本監査に伴い `"license": "Apache-2.0"` を設定済み） |

## バックエンド（Gradle、直接依存）

方法: `server/build.gradle.kts` の直接依存を個別確認

| 依存 | ライセンス | 互換性 |
|---|---|---|
| io.javalin:javalin 6.6.0 | Apache-2.0 | ✅ |
| com.fasterxml.jackson.core:jackson-databind 2.18.3 | Apache-2.0 | ✅ |
| com.scalar-labs:scalardb 3.17.3（Community Edition） | Apache-2.0 | ✅ |
| org.xerial:sqlite-jdbc 3.47.2.0 | Apache-2.0（同梱 SQLite は Public Domain） | ✅ |
| org.apache.pdfbox:pdfbox 3.0.3 | Apache-2.0 | ✅ |
| com.google.zxing:core / javase 3.5.3 | Apache-2.0 | ✅ |
| at.favre.lib:bcrypt 0.10.2 | Apache-2.0 | ✅ |
| com.google.re2j:re2j 1.7 | Go License（BSD-3-Clause 系） | ✅ |
| org.apache.commons:commons-jexl3 3.4.0 | Apache-2.0 | ✅ |
| org.apache.poi:poi-ooxml 5.3.0 | Apache-2.0 | ✅ |
| org.slf4j:slf4j-simple 2.0.16 | MIT | ✅ |
| junit-jupiter 5.11.4（test） | EPL-2.0 | ✅（テストのみ、配布物に含まれない） |
| mockito-core 5.14.2（test） | MIT | ✅ |
| javalin-testtools 6.6.0（test） | Apache-2.0 | ✅ |

## 同梱フォント

`server/src/main/resources/fonts/` に Noto Sans JP / Noto Serif JP を同梱:

| ファイル | ライセンス | 互換性 |
|---|---|---|
| NotoSansJP-Regular.ttf / NotoSansJP-Bold.ttf / NotoSerifJP-Regular.otf | SIL OFL-1.1 | ✅ 同梱・PDF 埋め込み・再配布可（`fonts/LICENSE.md` に帰属表示同梱済み） |

## 注意事項・フォローアップ
- Gradle の推移的依存は網羅監査していない（直接依存が全て Apache 系エコシステムのため
  リスクは低い）。公開 CI に license-gradle-plugin 等を組み込む場合は #71 の後続で検討。
- 本体のライセンス表記: `LICENSE`（Apache-2.0 全文）、`NOTICE`、`package.json` の
  `license` フィールド、README のライセンス節を本監査と同時に整備済み。
- NOTICE の著作権者表記は暫定で個人名（OQ-C1: リポジトリの Scalar Labs org 移管が
  決まった場合は要更新）。
