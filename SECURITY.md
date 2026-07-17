# セキュリティポリシー / Security Policy

## 脆弱性の報告 / Reporting a Vulnerability

本プロジェクトの脆弱性を発見した場合は、**公開 Issue には書かず**、GitHub の
[Private Vulnerability Reporting](../../security/advisories/new) から報告してください。

Please report vulnerabilities via GitHub Private Vulnerability Reporting
(Security タブ → "Report a vulnerability"), not via public issues.

報告に含めてほしい情報:

- 影響を受けるコンポーネント（フロントエンド / バックエンド API / PDF エンジン）
- 再現手順（可能であれば PoC）
- 想定される影響

初回応答の目安は **7 日以内**です。修正がリリースされるまで、報告内容の公開は
控えていただくようお願いします。

## サポート対象バージョン / Supported Versions

| バージョン | サポート |
|---|---|
| main ブランチ最新 | ✅ |
| それ以前のコミット | ❌（最新版への更新を推奨） |

## 本番運用時の注意 / Production Hardening Checklist

- **`ADMIN_PASSWORD` 環境変数を必ず設定する**。未設定の場合、初回起動時に
  既定パスワードで admin ユーザーが作成され、サーバーログに警告が出ます。
  admin が既に存在する場合、パスワードが勝手に変更されることはありません
  （`ADMIN_PASSWORD` を設定して再起動した場合のみリセット＝ロックアウト復旧）。
- `ALLOWED_ORIGIN` を実際のフロントエンド URL に設定する（CSRF Origin 検証）。
- HTTPS 終端の背後で運用し、`COOKIE_SECURE` の自動判定を確認する。
- `server/scalardb.properties` に本番 DB の資格情報を書いた場合、この
  ファイルは gitignore 済みだがバックアップ等での漏えいに注意する。
