# 公開前セキュリティ監査（SCP-003）

- **実施日**: 2026-07-17
- **結論**: シークレット漏えいなし。npm 本番依存の既知脆弱性 0 件。
  既定パスワードの扱いを是正済み。**公開ブロッカーなし。**

## 1. シークレットスキャン（git 履歴全体）

- 方法: `gitleaks git` v8 系（既定ルールセット）
- 対象: 全 320 コミット / 約 38.9 MB
- 結果: **リーク検出 0 件**
- `server/scalardb.properties.example` は SQLite ローカルパスのみで資格情報なし。
  実運用設定 `server/scalardb.properties` は gitignore 済みであることを確認

## 2. 依存脆弱性（npm、production 依存）

- 方法: `npm audit --omit=dev`
- 監査前: 6 件（critical 1 / high 2 / moderate 3）
  - react-router 7.x 系: unauth RCE（GHSA-49rj-9fvp-4h2h）ほか → `npm audit fix` で解消
  - postcss / uuid: moderate → `npm audit fix` で解消
  - jspdf ≤4.2.0 ← dompurify ≤3.4.10（XSS 多数 + critical）→ **jspdf 2.5.2 → 4.2.1 へ
    メジャーアップグレードで解消**（使用 API は addPage/addImage/output のみで互換、
    ビルド・全テストで確認）
- 監査後: **0 件**
- dev 依存（vite/vitest 等のビルドチェーン）は配布物に含まれないため公開ブロッカー
  としては扱わない。CI の `npm audit` 定期実行は今後の改善項目

## 3. 既定パスワード（admin / changeme）の是正

- 従来: 起動のたびに admin ユーザーを ADMIN_PASSWORD（未設定時 changeme）で
  **無条件に上書き保存**していた。UI からパスワード変更しても再起動で
  changeme に巻き戻る挙動で、既定パスワード運用を事実上強制していた
- 是正後（`UserRepository.ensureDefaultUser`、テスト 5 本追加）:
  - admin 不在 → 作成（ADMIN_PASSWORD 未設定なら既定値 + **WARN ログで変更を促す**）
  - admin 存在 + ADMIN_PASSWORD 未設定 → **何も変更しない**
  - admin 存在 + ADMIN_PASSWORD 設定 → その値へリセット（ロックアウト復旧手段）
- README のログイン節に初回パスワード変更の誘導を明記
- SECURITY.md の本番運用チェックリストにも記載

## 4. 残課題（公開ブロッカーではない）

- Webhook シークレットの平文保存 → #73 で対応
- 認証コア（AuthController / FormSessionManager / RateLimiter）の単体テスト → #75
- CI への `npm audit` / gitleaks 定期実行の組み込み → #71 の後続改善
