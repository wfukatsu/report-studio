# Adopters / 導入組織

このページは Report Design Studio を利用している組織を記録する、**自己申告ベース**の一覧です。
テレメトリ（利用状況の自動送信）は一切行っていません。プロジェクトが実際に使われているかを
知る唯一の手段が、この自己申告です。掲載は任意ですが、継続的な改善の大きな後押しになります。

This is a **self-reported** list of organizations using Report Design Studio.
The project collects **no telemetry** — this page is our only signal of real-world
adoption. Listing is optional but genuinely helps the project.

---

## 掲載されるとどう役立つか / Why add yourself

- メンテナが「何が実運用で使われているか」を把握し、優先順位を判断できます。
- 同じ業種・用途の利用者どうしが知見を共有するきっかけになります。
- プロジェクトの健全性指標（本番導入組織数）の測定に直接つながります。

掲載しても、連絡先や機密情報の公開を求めることはありません。組織名すら伏せたい場合は、
「匿名（製造業 / 日本）」のような粒度でも歓迎します。

---

## 追加方法 / How to add your organization

以下のいずれかで、下の表に 1 行追加してください。

1. **PR を送る**（推奨）: この `ADOPTERS.md` を編集して PR を作成。
2. **Issue を立てる**: 表に入れてほしい内容を Issue に書いていただければ、メンテナが追加します。
3. **Discussions で知らせる**: GitHub Discussions に一言でも構いません。

### 記入項目（導入ヒアリング設問 / intake questions）

差し支えない範囲で、以下を教えてください。**すべて任意**です。空欄でも構いません。

| 設問 | 目的 |
|------|------|
| 1. 組織名（または匿名の粒度） | 掲載名 |
| 2. 業種 / 国・地域 | 利用の広がりの把握 |
| 3. 利用ステータス（検討中 / PoC / 本番） | NSM「本番導入組織数」の測定 |
| 4. 主なユースケース（例: 見積書・請求書の PDF 生成、公開フォーム収集） | 実運用シナリオの把握 |
| 5. おおよその利用規模（テンプレート数 / 月間 PDF 生成数など、任意） | 負荷特性の参考 |
| 6. ScalarDB バックエンド（SQLite / PostgreSQL / その他） | 動作環境の分布 |
| 7. 公開してよい一言コメント / 連絡先（任意） | 事例紹介・相互連絡 |

> **本番（Production）の定義**: 直近 90 日に本番環境で Report Studio から実際に帳票を
> 出力している状態を指します（`reports/00_core/success-metrics.md` の NSM-001 と整合）。

---

## 導入組織一覧 / Adopters

| 組織 | 業種 / 地域 | ステータス | 主なユースケース | ScalarDB バックエンド | コメント |
|------|-------------|-----------|-----------------|----------------------|---------|
| _（最初の 1 組織になりませんか？ Be the first — send a PR.）_ | | | | | |

<!--
記入例 / Example row:
| Acme 商事 | 製造業 / 日本 | 本番 | 見積書・納品書の PDF 生成 | PostgreSQL | 月 500 件程度を出力 |
-->
