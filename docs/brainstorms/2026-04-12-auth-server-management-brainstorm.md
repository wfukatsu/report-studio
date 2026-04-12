# Brainstorm: ログイン・ユーザー管理・サーバー設定

**Date:** 2026-04-12  
**Status:** Draft  
**Target:** 小規模チーム（10人以下）

---

## What We're Building

アプリに認証フローと管理機能を追加する。

1. **ログインUI** — 未認証時にモーダルを表示、認証後に通常の編集画面へ
2. **ユーザー表示 + ログアウト** — ツールバー右端にユーザー名を常時表示
3. **統合設定モーダル** — 1つのモーダルに3タブ:
   - アカウント: パスワード変更
   - ユーザー管理（admin専用）: 一覧・追加・削除・ロール変更
   - サーバー設定: ScalarDB接続設定のUI変更

---

## Why This Approach

**統合設定パネル（案A）を選択:**
- 管理系の導線が一本化される
- `ツールバー右端 → ユーザーアバター → モーダル` のシンプルなフロー
- `Settings2` アイコン（テンプレート管理ボタン）と同パターンで実装可能

---

## Chosen Approach

### ログインフロー

```
アプリ起動
  → GET /api/v1/auth/me
    → 200: store.currentUser をセット（接続中、編集画面表示）
    → 401: ログインモーダルを表示
```

- ログインモーダル: userId + password のフォーム
- 成功後: `currentUser` を store にセット、モーダルを閉じる
- 既存バグ修正: `login()` 関数が `email` を送信していた → `userId` に修正

### ツールバー右端

```
[...既存ボタン] | [ユーザー名 ▾]
                       ↓クリック
               ┌──────────────────────┐
               │ 設定                  │
               │ ログアウト            │
               └──────────────────────┘
```

- ユーザー名クリックで設定モーダルを開く
- 「ログアウト」は `POST /api/v1/auth/logout` → ログインモーダルに戻る

### 設定モーダル（3タブ）

**① アカウント**
- 現在のユーザー情報表示（userId, displayName, roles）
- パスワード変更フォーム: 現在のパスワード + 新しいパスワード（確認付き）
- 新規バックエンドエンドポイント: `POST /api/v1/auth/change-password`

**② ユーザー管理**（admin ロールのみ表示）
- ユーザー一覧テーブル（userId / displayName / roles）
- ユーザー追加フォーム（userId, displayName, password, roles）
- 削除ボタン（自分自身は削除不可）
- 新規バックエンドエンドポイント:
  - `GET /api/v1/admin/users`
  - `POST /api/v1/admin/users`
  - `PUT /api/v1/admin/users/{id}` (displayName, password, roles)
  - `DELETE /api/v1/admin/users/{id}`

**③ サーバー設定**（admin ロールのみ表示）
- ScalarDB接続設定フォーム: storage backend タイプ / JDBC URL / ユーザー名 / パスワード
- 「設定を保存」→ `PUT /api/v1/admin/server-config` → サーバー側で `scalardb.properties` を更新
- 「接続テスト」→ `POST /api/v1/admin/server-config/test` → 新しい設定で接続テスト
- 注意: 設定変更後はサーバー再起動が必要（UIで警告表示）

---

## Key Decisions

| 決定事項 | 選択 | 理由 |
|----------|------|------|
| UI構成 | 統合設定モーダル（案A） | 管理導線を一本化 |
| 認証検知 | アプリ起動時に `/api/v1/auth/me` を呼ぶ | 現在の healthcheck と分離 |
| ユーザー管理 | adminロールのみアクセス可能 | 小規模チームの要件 |
| ScalarDB設定 | UIで書き換え + 再起動が必要 | ScalarDB はランタイム再設定非対応 |
| ログインバグ | `email` → `userId` に修正 | バックエンドのフィールド名に合わせる |

---

## Resolved Questions

| 質問 | 決定 |
|------|------|
| 対象ユーザー | 小規模チーム（10人以下） |
| ScalarDB設定の範囲 | UIから接続設定を変更できる |
| UI構成 | 統合設定パネル（案A） |

## Resolved Questions（追加）

| 質問 | 決定 |
|------|------|
| ScalarDB再起動 | UIから「再起動」ボタンを押すと自動再起動 |
| ロールの種類 | admin / user の2種類のみ |
| displayName変更 | アカウントタブでパスワードと一緒に変更可能 |

## Open Questions

なし

---

## Out of Scope (YAGNI)

- マルチテナント
- SSO / OAuth
- 2FA
- 操作ログ・監査ログ
- パスワードリセットメール（管理者がリセットする方式で対応）
- ScalarDB の全設定項目のUI化（主要項目のみ）

---

## Implementation Sketch (not plan)

フェーズ:
1. **バックエンド API**: change-password / admin/users / admin/server-config エンドポイント
2. **フロントエンド基盤**: `currentUser` store slice, `/api/v1/auth/me` 呼び出し, loginバグ修正
3. **ログインモーダル**: 未認証検知 → ログインUI
4. **ツールバー右端**: ユーザー表示 + ドロップダウン
5. **設定モーダル**: 3タブUI（アカウント / ユーザー管理 / サーバー設定）
