---
title: 管理タブの追加（ユーザー管理・サーバー設定・テナント情報・テンプレート管理）
type: feat
status: active
date: 2026-04-14
origin: docs/brainstorms/2026-04-14-admin-tab-brainstorm.md
---

# 管理タブの追加

## Enhancement Summary

**Deepened on:** 2026-04-14
**Research agents used:** architecture-strategist, security-sentinel, kieran-typescript-reviewer, best-practices-researcher, code-simplicity-reviewer

### 元プランからの主要変更点

1. **adminActiveSection はストアに入れない** → `AdminTab` 内のローカル `useState` のみ
2. **AppShell に二重ガードを追加** → `activeTab === 'admin' && isAdmin && ...`
3. **TopNavigation は `tabs` prop を外部注入で受け取る** → `isAdmin` prop は不使用
4. **`mountedRef` → `AbortController`** → レースコンディション対応
5. **`UserRole` 型の厳格化** → `z.enum(['user', 'admin'])` で型安全に
6. **`TemplateAdmin.tsx` は新規作成しない** → `TemplateManagementTab` を直接再利用
7. **`AccessDenied.tsx` は独立ファイルにしない** → インライン実装
8. **[CRITICAL] バックエンドのセキュリティ修正が必要** → 詳細は Security セクション参照

---

## Overview

トップナビゲーションに「管理」タブを追加する。`admin` ロールを持つユーザーにのみ表示され、ユーザー管理・サーバー設定・テナント情報・テンプレート管理の4セクションを提供する。バックエンド API はすべて実装済みで、フロントエンドが主な作業。ただしバックエンドにセキュリティ修正が必要（後述）。

---

## Problem Statement / Motivation

- ユーザー管理・サーバー設定は `ServerSettingsModal`（ツールバー起動のモーダル）にあるが、モーダルは深い設定作業に不向き
- テナント情報の編集 UI が存在しない（`tenantSlice` に API 呼び出しはあるが UI なし）
- バックエンドテンプレートの一覧・削除が管理者から操作できない
- 管理機能が散在しており、一元管理できる場所がない

---

## Proposed Solution

既存の「データ管理」「テンプレート管理」タブと同じ**左ナビ + 右コンテンツの2カラムレイアウト**でトップナビに第4タブを追加する（see brainstorm: docs/brainstorms/2026-04-14-admin-tab-brainstorm.md）。

```
[デザイン] [データ管理] [テンプレート管理] [管理]  ← admin ロール時のみ表示
```

管理タブ内の左ナビ:
```
ユーザー管理    ← 全ユーザー一覧・追加・編集・削除・ロール設定
サーバー設定    ← ScalarDB接続・メール設定・再起動
テナント情報    ← 会社名・住所・電話・ロゴ
テンプレート    ← TemplateManagementTab を再利用
```

---

## Technical Approach

### 確定した設計原則

#### 1. 認証ガードは AppShell と AdminTab 両方に配置（二重ガード）

`TopNavigation` での非表示はUI上のヒントにすぎない。React DevTools やストア操作でバイパス可能なため、`AppShell` にも必ずガードを入れる。

```tsx
// AppShell.tsx — 二重ガード（これが正しいパターン）
const isAdmin = currentUser?.roles.includes('admin') ?? false

{activeTab === 'admin' && isAdmin && (  // ← && isAdmin が必須
  <div role="tabpanel" id="top-panel-admin" aria-labelledby="top-tab-admin"
       className="flex flex-1 overflow-hidden">
    <AdminTab />
  </div>
)}
```

#### 2. AdminSection はローカル state（ストアに追加しない）

`dataActiveSection` / `templateActiveSection` のストア管理は他スライスとのクロスタブ連携のためだが、AdminTab にそのユースケースはない。`StoreState` の肥大化を防ぐためローカル `useState` のみ使用する。

```tsx
// AdminTab.tsx
type AdminSection = 'users' | 'server' | 'tenant' | 'templates'

export function AdminTab() {
  const [activeSection, setActiveSection] = useState<AdminSection>('users')
  // ...
}
```

#### 3. TopNavigation は `tabs` prop を外部注入で受け取る

`isAdmin: boolean` を渡すのではなく、タブのリスト自体を `AppShell` が構築して渡す。`TopNavigation` はビジネスロジックを知らない純粋な表示コンポーネントのまま維持する。

```tsx
// AppShell.tsx でタブリストを構築
const tabs = useMemo(() => [
  { id: 'design' as AppTab, label: 'デザイン' },
  { id: 'data' as AppTab, label: 'データ管理' },
  { id: 'templates' as AppTab, label: 'テンプレート管理' },
  ...(isAdmin ? [{ id: 'admin' as AppTab, label: '管理' }] : []),
], [isAdmin])

<TopNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

// TopNavigation.tsx — tabs prop を受け取る
interface TopNavigationProps {
  readonly activeTab: AppTab
  readonly onTabChange: (tab: AppTab) => void
  readonly tabs: { id: AppTab; label: string }[]  // 追加
}
```

#### 4. AbortController で非同期をクリーンアップ

`mountedRef` ではレースコンディションを防げない。2回目のリクエストが1回目より早く返ったとき古いデータで上書きされる。`AbortController` を使う。

```tsx
// UserManagement.tsx — 推奨パターン
useEffect(() => {
  const controller = new AbortController()
  async function loadUsers() {
    setLoading(true)
    try {
      const list = await listUsers(controller.signal)
      setUsers(list)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError('ユーザー一覧の取得に失敗しました')
    } finally {
      // AbortError の場合は setLoading を呼ばない
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  void loadUsers()
  return () => controller.abort()
}, [])
```

`listUsers` 側でも `signal` を受け取るよう拡張する:
```ts
// src/api/reportApi.ts に追加
export async function listUsers(signal?: AbortSignal): Promise<UserSummary[]> {
  const res = await apiFetch('/api/v1/admin/users', UserListSchema, { signal })
  return res.users
}
```

#### 5. UserRole 型の厳格化

```ts
// src/api/reportApi.ts
export const UserRoleSchema = z.enum(['user', 'admin'])
export type UserRole = z.infer<typeof UserRoleSchema>

// UserSummary の roles を string[] から UserRole[] に変更
const UserSummarySchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(UserRoleSchema),
})
```

---

### Implementation Phases

#### Phase 1: 型・ナビゲーション基盤

**`src/store/types.ts`**
```ts
export type AppTab = 'design' | 'data' | 'templates' | 'admin'
// AdminSection は types.ts に追加しない → AdminTab.tsx 内でローカル型定義
// adminActiveSection / setAdminActiveSection は uiSlice.ts に追加しない
```

**`src/api/reportApi.ts`**
```ts
// 追加: UserRoleSchema, UserRole
// 変更: UserSummarySchema.roles を UserRoleSchema[] に
// 変更: listUsers/createUser/updateUser に signal?: AbortSignal 引数を追加
```

**`src/components/layout/AppShell.tsx`**
```tsx
const currentUser = useReportStore((s) => s.currentUser)
const isAdmin = currentUser?.roles.includes('admin') ?? false

const tabs = useMemo(() => [
  { id: 'design' as AppTab, label: 'デザイン' },
  { id: 'data' as AppTab, label: 'データ管理' },
  { id: 'templates' as AppTab, label: 'テンプレート管理' },
  ...(isAdmin ? [{ id: 'admin' as AppTab, label: '管理' }] : []),
], [isAdmin])

<TopNavigation activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

{activeTab === 'admin' && isAdmin && (  // 二重ガード
  <div role="tabpanel" id="top-panel-admin" aria-labelledby="top-tab-admin"
       className="flex flex-1 overflow-hidden">
    <AdminTab />
  </div>
)}
```

**`src/components/layout/TopNavigation.tsx`**
- Props に `tabs: { id: AppTab; label: string }[]` を追加
- 内部の `TABS` 定数と `TAB_IDS` を props の `tabs` で置き換え
- キーボードナビゲーション (`ArrowLeft`/`ArrowRight`) も `tabs` から動的生成

---

#### Phase 2: AdminTab レイアウト

**`src/components/tabs/AdminTab.tsx`（新規）**

```tsx
type AdminSection = 'users' | 'server' | 'tenant' | 'templates'

const SECTIONS: { id: AdminSection; label: string }[] = [
  { id: 'users',     label: 'ユーザー管理' },
  { id: 'server',    label: 'サーバー設定' },
  { id: 'tenant',    label: 'テナント情報' },
  { id: 'templates', label: 'テンプレート' },
]

export function AdminTab() {
  const currentUser = useReportStore((s) => s.currentUser)
  const isAdmin = currentUser?.roles.includes('admin') ?? false
  const [activeSection, setActiveSection] = useState<AdminSection>('users')

  // 自己防衛チェック（AppShell の二重ガードの補完）
  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        管理者権限が必要です。
      </div>
    )
  }

  return (
    <div className="flex w-full h-full overflow-hidden">
      <nav aria-label="管理セクション"
           className="w-44 shrink-0 border-r bg-card flex flex-col py-2 overflow-y-auto">
        {SECTIONS.map(({ id, label }) => (
          <button key={id} onClick={() => setActiveSection(id)}
            className={cn('w-full text-left px-4 py-2 text-sm transition-colors border-l-2',
              activeSection === id
                ? 'border-primary text-primary bg-primary/10 font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            )}>
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl">
          {activeSection === 'users'     && <UserManagement />}
          {activeSection === 'server'    && <ServerSettings />}
          {activeSection === 'tenant'    && <TenantSettings />}
          {activeSection === 'templates' && <TemplateManagementTab />}  {/* 既存を直接再利用 */}
        </div>
      </div>
    </div>
  )
}
```

---

#### Phase 3: 各セクション実装

**`src/components/admin/UserManagement.tsx`（新規 — AdminUsersTab から移植）**

`src/components/modals/AdminUsersTab.tsx` のコードを移動・拡張:
- ユーザー一覧テーブル（userId, displayName, roles バッジ）
- 新規ユーザー追加フォーム（userId, displayName, password, roles）
- ユーザー削除（自分自身は不可、ConfirmDialog 使用）
- AbortController による非同期クリーンアップ
- フィールドレベルのバリデーションエラー表示

**UXパターン（ロールバッジ）:**
```tsx
// src/components/common/RoleBadge.tsx（新規）
const ROLE_CONFIG = {
  admin: { label: 'Admin', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  user:  { label: 'User',  className: 'bg-gray-100 text-gray-600 border-gray-200' },
} as const

export function RoleBadge({ role }: { role: string }) {
  const cfg = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.user
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
```

**`src/components/admin/ServerSettings.tsx`（新規 — AdminServerTab から移植）**

`src/components/modals/AdminServerTab.tsx` のコードを移動:
- ScalarDB 接続設定（カテゴリ別 fieldset レイアウト）
- `isDirty` 追跡 + 「未保存の変更あり」バッジ
- 接続テストボタン（3状態: idle/testing/success/failure）
- サーバー再起動（ConfirmDialog 必須）
- API: `getServerConfig`, `putServerConfig`, `testServerConfig`, `restartServer`

**接続テストボタン（3状態フィードバック）:**
```tsx
type TestState = 'idle' | 'testing' | 'success' | 'failure'

// 成功/失敗を色+アイコンで表示し、3秒後にリセット
```

**`src/components/admin/TenantSettings.tsx`（新規）**

既存 `tenantSlice` の `fetchTenantInfo` / `updateTenantInfo` を活用:
- 会社名・住所・電話・代表者名の編集フォーム
- `isDirty` 追跡 + 未保存変更インジケーター
- 保存ボタン（変更なし時は disabled）
- ロゴ更新はテキストフィールド先行（バックエンドのロゴ対応確認後に拡張）

**テンプレートセクション: 新規コンポーネントなし**
```tsx
// AdminTab.tsx 内
{activeSection === 'templates' && <TemplateManagementTab />}
// TemplateManagementTab をそのまま再利用。テンプレートの一覧・バリアント設定は既に実装済み
```

---

#### Phase 4: ServerSettingsModal のクリーンアップ

- `AdminUsersTab.tsx` → `src/components/admin/UserManagement.tsx` に移動
- `AdminServerTab.tsx` → `src/components/admin/ServerSettings.tsx` に移動
- `ServerSettingsModal.tsx` は `AccountTab`（アカウント設定）のみ残すか、削除
- ツールバーの「サーバー設定」ボタンが残っていれば削除

---

## Security Fixes Required（バックエンド）

**⚠️ 実装前にバックエンドの以下を修正すること:**

### CRITICAL: 接続テスト失敗時の例外メッセージ漏洩

```java
// AdminServerController.java — 修正前
ctx.json(Map.of("success", false, "message", "接続テスト失敗: " + e.getMessage()));

// 修正後
log.warn("Admin server-config test failed for user {}: {}", principal.userId(), e.getMessage());
ctx.json(Map.of("success", false, "message", "接続テストに失敗しました。サーバーログを確認してください。"));
```

### HIGH: PUT /api/v2/tenant に admin ロールチェックがない

```java
// V2TenantController.java PUT メソッドに追加
if (!principal.roles().contains("admin")) {
    ctx.status(HttpStatus.FORBIDDEN);
    ctx.json(Map.of("error", "Admin role required"));
    return;
}
```

### MEDIUM: パスワード強度バリデーション不足

```java
// AdminUserController.java に追加
if (password.length() < 8 || password.length() > 128) {
    ctx.status(HttpStatus.BAD_REQUEST);
    ctx.json(Map.of("error", "パスワードは8〜128文字で入力してください"));
    return;
}
```

### MEDIUM: サーバー再起動の監査ログに userId がない

```java
// 修正前
log.warn("Admin requested server restart — halting JVM in 2 seconds");
// 修正後
log.warn("Admin [{}] requested server restart — halting JVM in 2 seconds", principal.userId());
```

---

## System-Wide Impact

### Interaction Graph

```
AppShell (isAdmin 評価)
  → tabs 配列を構築 → TopNavigation に渡す
  → TopNavigation がタブをレンダリング
  → ユーザーが「管理」タブをクリック
  → AppShell.setActiveTab('admin')
  → {activeTab === 'admin' && isAdmin} が真の場合のみ AdminTab をレンダリング
  → AdminTab が内部 isAdmin チェック（二重ガード）
  → useState<AdminSection> でセクション切り替え
  → 各コンポーネントが AbortController 付き useEffect でデータフェッチ
  → reportApi.ts → /api/v1/admin/* または /api/v2/tenant, /api/v2/templates
```

### Error Propagation

- API 呼び出し失敗は各コンポーネントの `error` state でインライン表示
- AbortError は silent に処理（unmount 後の setState を防止）
- 削除・再起動操作は `ConfirmDialog` で確認
- サーバー設定の接続テスト失敗は3状態ボタンで即時フィードバック

### State Lifecycle Risks

- AdminSection はローカル state のため、タブを離れると 'users' にリセットされる（意図的）
- 各セクションは再マウント時にデータを再フェッチ（AbortController で安全）
- CRUD 操作後はリストを再フェッチ（楽観的更新なし）

---

## Acceptance Criteria

### Phase 1 — 基盤

- [ ] `AppTab` 型に `'admin'` が追加されている
- [ ] `UserRole = z.enum(['user', 'admin'])` が定義されている
- [ ] `UserSummary.roles` が `UserRole[]` 型になっている
- [ ] admin ロールを持つユーザーのみトップナビに「管理」タブが表示される
- [ ] 非 admin ユーザーには「管理」タブが一切表示されない（ナビにもパネルにも）
- [ ] 未ログイン時には「管理」タブが一切表示されない
- [ ] `activeTab === 'admin' && isAdmin` の二重ガードが AppShell にある

### Phase 2 — AdminTab レイアウト

- [ ] `AdminTab` が4セクション（ユーザー管理・サーバー設定・テナント情報・テンプレート）を持つ
- [ ] 左ナビのアクティブセクションがハイライト表示される
- [ ] 非 admin が AdminTab にアクセスした場合「管理者権限が必要です」と表示される
- [ ] `adminActiveSection` / `setAdminActiveSection` が Zustand ストアに追加されていない

### Phase 3 — 各セクション

- [ ] **ユーザー管理**: 一覧表示・追加・削除・ロール変更が動作する
- [ ] **ユーザー管理**: ロールがバッジ（色+テキスト）で表示される
- [ ] **ユーザー管理**: 自分自身は削除できない
- [ ] **サーバー設定**: 設定の読み込み・保存・接続テスト・再起動が動作する
- [ ] **サーバー設定**: 接続テストボタンが3状態（idle/testing/success/failure）を示す
- [ ] **サーバー設定**: `isDirty` 追跡と「未保存の変更あり」インジケーターがある
- [ ] **サーバー再起動**: ConfirmDialog で確認後に実行される
- [ ] **テナント情報**: 編集・保存が動作する
- [ ] **テンプレート**: `TemplateManagementTab` が正常表示される

### Phase 4 — クリーンアップ

- [ ] `AdminUsersTab` / `AdminServerTab` が `admin/` ディレクトリに移動済み
- [ ] `ServerSettingsModal` に管理者専用タブの重複がない
- [ ] バックエンドのセキュリティ修正（CRITICAL/HIGH 2件）が完了している

### 非機能要件

- [ ] ARIA roles: `role="tablist"` / `role="tab"` / `aria-selected` が設定されている
- [ ] キーボードナビゲーション（矢印キー）が左ナビで動作する
- [ ] ローディング中はスピナー表示・ボタン disabled
- [ ] AbortController が全 useEffect の非同期フェッチで使われている

---

## Dependencies & Risks

| リスク | 深刻度 | 対策 |
|--------|--------|------|
| バックエンドの `PUT /api/v2/tenant` 権限不備 | High | Phase 1 前にバックエンド修正を先行 |
| `AdminServerController.testConfig` の例外漏洩 | Critical | バックエンド修正をリリース前に完了 |
| TopNavigation の `TAB_IDS` ハードコードが tabs prop 変更で壊れる | Medium | TopNavigation を tabs prop 受け取り型に変更して解消 |
| ServerSettingsModal の既存利用箇所が残る | Low | Phase 4 で全参照を確認・削除 |

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-14-admin-tab-brainstorm.md](../brainstorms/2026-04-14-admin-tab-brainstorm.md)
  - 採用した主要決定: トップナビ第4タブ、admin ロールのみ表示、DataManagementTab と同じレイアウト

### Internal References

- `src/components/tabs/DataManagementTab.tsx` — レイアウトパターンの雛形
- `src/store/types.ts:69` — AppTab 定義（'admin' を追加）
- `src/api/reportApi.ts:155-228` — admin API 関数（すべて実装済み）
- `src/components/modals/ServerSettingsModal.tsx` — 移植元 (AdminUsersTab, AdminServerTab)
- `src/components/modals/ConfirmDialog.tsx` — 確認ダイアログ（フォーカストラップ・ARIA 実装済み）
- `src/components/tabs/TemplateManagementTab.tsx` — テンプレートセクションで直接再利用

### Learnings Applied

- `docs/solutions/runtime-errors/app-shell-auth-guard-blank-tab.md` — AppShell での `&&currentUser` ガード禁止（今回は isAdmin 二重ガードで対応）
- `docs/solutions/feature-implementation/sidebar-ui-reorganization-databinding-modal-templates.md` — 非同期 cleanup パターン
- `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md` — ARIA roles / キーボードナビ

### External References

- [Smashing Magazine: How To Manage Dangerous Actions In User Interfaces](https://www.smashingmagazine.com/2024/09/how-manage-dangerous-actions-user-interfaces/)
- [NN/Group: Confirmation Dialogs Can Prevent User Errors](https://www.nngroup.com/articles/confirmation-dialog/)
- [React: Using AbortController with useEffect](https://react.dev/reference/react/useEffect#fetching-data-with-effects)
