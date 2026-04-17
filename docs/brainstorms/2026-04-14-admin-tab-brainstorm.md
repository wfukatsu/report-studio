# 管理タブ ブレインストーム

**Date:** 2026-04-14
**Status:** Ready for planning

---

## What We're Building

トップナビゲーションに「管理」タブを追加する。admin ロールを持つログイン済みユーザーにのみ表示され、以下の4セクションを左ナビ形式で提供する。

| セクション | 内容 | バックエンド API |
|------------|------|----------------|
| ユーザー管理 | ユーザー一覧・追加・編集・削除・ロール設定 | `/api/v1/admin/users` (CRUD 実装済み) |
| サーバー設定 | ScalarDB 接続・メール設定・サーバー再起動 | `/api/v1/admin/server-config`, `/api/v1/admin/server/restart` (実装済み) |
| テナント情報 | 会社名・住所・電話・ロゴ | `/api/v2/tenant` (GET/PUT 実装済み) |
| テンプレート管理 | 保存テンプレートの一覧表示・削除 | `/api/v2/templates` (実装済み) |

---

## Why This Approach

### 採用パターン: トップナビ第4タブ

既存の「データ管理」「テンプレート管理」タブと同じ構造で実装する。

- `AppTab` 型に `'admin'` を追加
- `TopNavigation.tsx` に管理タブを追加（admin ロール条件付き）
- `AppShell.tsx` に `AdminTab` コンポーネントの条件レンダリングを追加
- `DataManagementTab` と同じ左ナビ + 右コンテンツの2カラムレイアウト

**この方法を選んだ理由:**
1. 既存パターンの踏襲でコードの一貫性を保てる
2. 既存 `ServerSettingsModal` はツールバーから削除できて重複を排除できる
3. バックエンド API は既に実装済みなので、フロントエンドのみの作業

---

## Key Decisions

1. **アクセス制御:** `currentUser?.roles?.includes('admin')` が true のときのみタブを表示。未ログインまたは非 admin には完全に非表示
2. **レイアウト:** `DataManagementTab` と同じ `w-44` 左ナビ + `flex-1` 右コンテンツの構成
3. **ユーザー管理UI:** パスワード変更はユーザー本人の操作（プロフィール編集）と分離し、管理者はロールとアカウント有効/無効のみ操作できる
4. **サーバー設定:** 既存 `ServerSettingsModal` のコンテンツをこのセクションに移植し、モーダルを廃止する
5. **テナント情報:** `tenantSlice` の `fetchTenantInfo` / `updateTenantInfo` を再利用
6. **テンプレート管理:** バックエンドテンプレートの一覧・削除のみ（テンプレートの作成・編集はデザインタブで行う）

---

## Implementation Scope

### 追加・変更するファイル

```
src/store/types.ts                    AppTab に 'admin' を追加
src/components/layout/TopNavigation.tsx  管理タブを admin ロール条件付きで追加
src/components/layout/AppShell.tsx    AdminTab の条件レンダリングを追加
src/components/tabs/AdminTab.tsx      新規: 管理タブのレイアウト
src/components/admin/
  UserManagement.tsx                  新規: ユーザー一覧・CRUD
  ServerSettings.tsx                  新規: サーバー設定（ServerSettingsModal から移植）
  TenantSettings.tsx                  新規: テナント情報
  TemplateAdmin.tsx                   新規: バックエンドテンプレート管理
src/api/adminApi.ts                   新規: admin API クライアント
src/components/toolbar/Toolbar.tsx    サーバー設定ボタンを削除（管理タブに移行）
```

### 不要になるもの

- `ServerSettingsModal.tsx` のモーダルラッパー（内部コンテンツは `ServerSettings.tsx` に移植）
- ツールバーの「サーバー設定」ボタン（既に削除済み or 確認要）

---

## Open Questions

*なし（会話で解決済み）*

---

## Resolved Questions

- **どの機能を含めるか** → ユーザー管理、サーバー設定、テナント情報管理、テンプレート管理の4セクション
- **アクセス制御** → admin ロールのみ表示
- **配置場所** → トップナビ第4タブ
