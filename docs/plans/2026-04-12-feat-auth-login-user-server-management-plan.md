---
title: "feat: ログイン・ユーザー管理・サーバー設定（認証フルスタック）"
type: feat
status: active
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-auth-server-management-brainstorm.md
---

# feat: ログイン・ユーザー管理・サーバー設定

## Overview

認証フロー・ユーザー管理・ScalarDB接続設定のUIを一括実装する。
対象は小規模チーム（10人以下）。主な変更は:

1. **ログインモーダル** — 未認証時に表示、userId/password 認証
2. **ツールバーユーザー表示** — 右端にユーザー名 + ログアウト/設定ドロップダウン
3. **統合設定モーダル（3タブ）** — アカウント / ユーザー管理 / サーバー設定
4. **バックエンドAPI追加** — 認証情報変更・ユーザーCRUD・ScalarDB設定

(see brainstorm: docs/brainstorms/2026-04-12-auth-server-management-brainstorm.md)

---

## Problem Statement

- フロントエンドにログインUIが存在しない。認証なしで全機能にアクセスできる
- `login()` API関数のバグ: `{ email, password }` を送信するが、バックエンドは `{ userId, password }` を期待する（`reportApi.ts:140`）
- `MeSchema` も不整合: `id`, `email`, `name` フィールドを定義するが、サーバーは `userId`, `displayName`, `roles`, `anonymous` を返す
- パスワード変更・ユーザー管理・ScalarDB設定変更のAPIが存在しない

---

## Technical Approach

### 既存パターン参照

| 実装 | 参照先 |
|------|--------|
| バックエンドコントローラー | `V2TemplateController.java`, `AuthController.java` |
| AppWiring への追加 | `AppWiring.java:127`（authCtrl追加パターン） |
| ルート登録 | `ApiRoutes.java:111-116`（auth routes パターン） |
| Zustand スライス | `src/store/rulesSlice.ts`, `src/store/tenantSlice.ts` |
| モーダルUI | `src/components/modals/DataBindingModal.tsx`（タブ付きモーダル） |
| ドロップダウン | `Toolbar.tsx:599-628`（保存ボタンドロップダウンパターン） |

### ScalarDB 設定のキープロパティ

`server/scalardb.properties` の変更対象:
```properties
scalar.db.storage=jdbc
scalar.db.contact_points=jdbc:sqlite:data/report-studio.db
scalar.db.username=
scalar.db.password=
scalar.db.jdbc.connection_pool.min_idle=1
scalar.db.jdbc.connection_pool.max_idle=5
scalar.db.jdbc.connection_pool.max_total=10
```

---

## Implementation Phases

### Phase 1: バックエンド API 追加

**ゴール:** 必要な全エンドポイントが動作し、テストが通る。

#### 1-A: 認証情報変更 (`POST /api/v1/auth/change-profile`)

`server/src/main/java/com/report/server/auth/AuthController.java` に追加:

```java
/** POST /api/v1/auth/change-profile — ログイン中ユーザーの displayName と password を変更 */
public void changeProfile(Context ctx) {
    Principal principal = ctx.attribute("principal");
    if (principal == null || principal.isAnonymous()) {
        ctx.status(401); return;
    }
    var body = ctx.bodyAsClass(Map.class);
    // displayName の変更（任意）
    // currentPassword + newPassword によるパスワード変更（任意）
    // UserRepository で save()
}
```

ルート登録（`ApiRoutes.java`）:
```java
app.post("/api/v1/auth/change-profile", w.authCtrl::changeProfile);
```

#### 1-B: ユーザー管理 (`AdminUserController.java` — 新規作成)

`server/src/main/java/com/report/server/auth/AdminUserController.java`:

```java
public final class AdminUserController {
    private final UserRepository userRepo;

    public void list(Context ctx)          { /* GET /api/v1/admin/users */ }
    public void create(Context ctx)        { /* POST /api/v1/admin/users */ }
    public void update(Context ctx)        { /* PUT /api/v1/admin/users/{id} */ }
    public void delete(Context ctx)        { /* DELETE /api/v1/admin/users/{id} */ }
}
```

全エンドポイントで `principal.roles().contains("admin")` を確認（403 otherwise）。

**UserRepository にメソッド追加:**
- `list()` → `List<UserRecord>` を返す。UserRepository は ScalarDB 直接操作のため `Scan` API を使用:
  ```java
  public List<UserRecord> list() throws Exception {
      try (DistributedTransaction tx = factory.start()) {
          Scan scan = Scan.newBuilder().namespace(NAMESPACE).table(TABLE).build();
          return tx.scan(scan).stream().map(this::fromResult).collect(Collectors.toList());
      }
  }
  ```

ルート登録（`ApiRoutes.java` に `registerAdminRoutes()` を追加）:
```java
app.get("/api/v1/admin/users",        w.adminUserCtrl::list);
app.post("/api/v1/admin/users",       w.adminUserCtrl::create);
app.put("/api/v1/admin/users/{id}",   w.adminUserCtrl::update);
app.delete("/api/v1/admin/users/{id}", w.adminUserCtrl::delete);
```

`AppWiring.java` に追加:
```java
final AdminUserController adminUserCtrl;
// constructor:
adminUserCtrl = new AdminUserController(userRepo);
```

#### 1-C: サーバー設定 (`AdminServerController.java` — 新規作成)

```java
public final class AdminServerController {
    private final Path propsPath;  // server/scalardb.properties のパス

    public void getConfig(Context ctx)    { /* GET /api/v1/admin/server-config — プロパティ読み取り */ }
    public void putConfig(Context ctx)    { /* PUT /api/v1/admin/server-config — プロパティ書き込み */ }
    public void testConfig(Context ctx)   { /* POST /api/v1/admin/server-config/test — 新設定で接続テスト */ }
    public void restart(Context ctx)      { /* POST /api/v1/admin/server/restart — 2秒後に JVM 終了 */ }
}
```

**restart の実装:**
```java
public void restart(Context ctx) {
    // admin のみ許可
    ctx.status(200);
    ctx.json(Map.of("message", "再起動中..."));
    ctx.future(() -> CompletableFuture.runAsync(() -> {
        try { Thread.sleep(2000); } catch (InterruptedException ignored) {}
        Runtime.getRuntime().halt(0);  // プロセスマネージャーが再起動
    }));
}
```

ルート登録:
```java
app.get("/api/v1/admin/server-config",         w.adminServerCtrl::getConfig);
app.put("/api/v1/admin/server-config",         w.adminServerCtrl::putConfig);
app.post("/api/v1/admin/server-config/test",   w.adminServerCtrl::testConfig);
app.post("/api/v1/admin/server/restart",       w.adminServerCtrl::restart);
```

**テスト:**
- `AdminUserControllerTest.java` — CRUD + admin権限チェック
- `AdminServerControllerTest.java` — config read/write, 403 for non-admin

---

### Phase 2: フロントエンド基盤（バグ修正 + Auth スライス）

#### 2-A: `reportApi.ts` のバグ修正（`src/api/reportApi.ts`）

```typescript
// 修正後の MeSchema
const MeSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  anonymous: z.boolean(),
})
export type Me = z.infer<typeof MeSchema>

// login: email → userId に修正
export async function login(userId: string, password: string): Promise<Me> {
  return apiFetch('/api/v1/auth/login', MeSchema, jsonBody({ userId, password }))
}

// 新規追加
export async function getMe(): Promise<Me> {
  return apiFetch('/api/v1/auth/me', MeSchema)
}

export async function logout(): Promise<void> {
  return apiFetch('/api/v1/auth/logout', z.undefined(), { method: 'POST' })
}

export async function changeProfile(patch: { displayName?: string; currentPassword?: string; newPassword?: string }): Promise<Me> {
  return apiFetch('/api/v1/auth/change-profile', MeSchema, jsonBody(patch))
}
```

#### 2-B: `authSlice.ts` 新規作成（`src/store/authSlice.ts`）

```typescript
export type AuthSlice = {
  currentUser: Me | null
  authLoading: boolean
  checkAuth: () => Promise<void>   // 起動時 GET /api/v1/auth/me
  loginUser: (userId: string, password: string) => Promise<void>
  logoutUser: () => Promise<void>
}
```

- `checkAuth()`: 成功 → `currentUser` をセット、401 → `currentUser = null`（ログインモーダルトリガー）
- `logoutUser()`: API 成功後に `currentUser = null`。ログアウト後のテンプレートクリアは App.tsx 側で `currentUser` の変化を useEffect で監視して `newReport()` を呼ぶ（スライス間依存を避けるため `authSlice` 内から `layoutSlice` を直接呼ばない）
- `StoreState` に `currentUser: Me | null`, `authLoading: boolean` を追加（`src/store/types.ts`）
- `src/store/index.ts` に `createAuthSlice` を追加

#### 2-C: `src/App.tsx` に起動時認証チェックを追加

```typescript
const checkAuth = useReportStore((s) => s.checkAuth)
useEffect(() => {
  checkAuth()
}, [checkAuth])
```

**テスト:** `src/store/authSlice.test.ts`
- `checkAuth` が 200 → `currentUser` セット
- `checkAuth` が 401 → `currentUser = null`
- `loginUser` 成功 → `currentUser` セット
- `logoutUser` → `currentUser = null`

---

### Phase 3: ログインモーダル

**新規作成:** `src/components/modals/LoginModal.tsx`

```tsx
// 表示条件: currentUser === null && !authLoading && backendConnected
// フォーム: userId (text input) + password (password input) + ログイン button
// エラー表示: 401 → "ユーザー名またはパスワードが正しくありません"
// 成功: loginUser() → モーダルが自動的に閉じる（currentUser が null でなくなる）
```

`src/App.tsx` に追加:
```tsx
const currentUser = useReportStore((s) => s.currentUser)
const authLoading = useReportStore((s) => s.authLoading)
// ...
{!currentUser && !authLoading && backendConnected && <LoginModal />}
```

**テスト:** `src/components/modals/LoginModal.test.tsx`
- 未認証時に表示される
- ログイン成功で閉じる
- エラーメッセージが表示される

---

### Phase 4: ツールバーユーザー表示

**変更:** `src/components/toolbar/Toolbar.tsx`

ツールバー右端（既存のプレビュー/エクスポートボタンの右側）に追加:

```tsx
// ユーザーアイコン + 名前のボタン（保存メニューと同パターン）
<div className="relative flex items-center" ref={userMenuRef}>
  <button onClick={() => setShowUserMenu(v => !v)} className="...">
    <User className="w-4 h-4" />
    <span>{currentUser?.displayName}</span>
    <ChevronDown className="w-3 h-3" />
  </button>
  {showUserMenu && (
    <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[150px] py-1">
      <button onClick={() => { setShowServerSettings(true); setShowUserMenu(false) }}>
        設定
      </button>
      <button onClick={() => { void logoutUser(); setShowUserMenu(false) }}>
        ログアウト
      </button>
    </div>
  )}
</div>
```

State/Ref追加:
- `showUserMenu`, `userMenuRef`, `closeUserMenu`
- `showServerSettings`, `setShowServerSettings`
- `useDropdownDismiss(userMenuRef, showUserMenu, closeUserMenu)`

**テスト:** 既存 Toolbar テストを拡張

---

### Phase 5: 統合設定モーダル（3タブ）

**新規作成:** `src/components/modals/ServerSettingsModal.tsx`

DataBindingModal と同パターンのタブ付きモーダル:

```typescript
type TabId = 'account' | 'users' | 'server'

const TABS = [
  { id: 'account', label: 'アカウント' },
  { id: 'users',   label: 'ユーザー管理' },  // admin のみ表示
  { id: 'server',  label: 'サーバー設定' },  // admin のみ表示
]
```

#### タブ 1: アカウント（`AccountTab.tsx`）

フォームフィールド:
- 表示名（displayName）— 現在の値を初期表示
- 現在のパスワード（変更する場合のみ必須）
- 新しいパスワード + 確認

「保存」 → `changeProfile()` → 成功でトースト通知

#### タブ 2: ユーザー管理（`AdminUsersTab.tsx`、admin ロールのみ）

- ユーザー一覧テーブル: `userId` / `displayName` / `roles` / 操作ボタン
- 「ユーザーを追加」フォーム: `userId`, `displayName`, `password`, `role` (admin/user)
- 削除: `currentUser.userId` と同じなら削除ボタンを disabled
- 編集: 表示名・パスワード・ロールの変更

API クライアント（`src/api/reportApi.ts` に追加）:
```typescript
export async function listUsers(): Promise<UserSummary[]>
export async function createUser(user: CreateUserRequest): Promise<UserSummary>
export async function updateUser(userId: string, patch: UpdateUserRequest): Promise<UserSummary>
export async function deleteUser(userId: string): Promise<void>
```

#### タブ 3: サーバー設定（`AdminServerTab.tsx`、admin ロールのみ）

フォームフィールド（`GET /api/v1/admin/server-config` でロード）:
- ストレージタイプ: `jdbc` / `cassandra` / `cosmos` / `dynamo`（select）
- Contact Points / JDBC URL（text）
- ユーザー名（text）
- パスワード（password）
- 接続プール設定（min_idle, max_idle, max_total）

ボタン:
- 「接続テスト」 → `POST /api/v1/admin/server-config/test` → 結果表示
- 「設定を保存」 → `PUT /api/v1/admin/server-config` → 成功後に再起動警告
- 「サーバーを再起動」（保存後に有効化） → `POST /api/v1/admin/server/restart` → ヘルスチェックポーリングで復帰を検知 → 「接続中」になったらモーダルを閉じる

---

## System-Wide Impact

### Interaction Graph

```
App 起動
  → checkAuth() [authSlice]
    → GET /api/v1/auth/me
      → 200: currentUser セット → 通常UI表示
      → 401: currentUser = null → LoginModal 表示

LoginModal「ログイン」
  → loginUser(userId, password) [authSlice]
    → POST /api/v1/auth/login [AuthController.login]
      → session_id cookie セット
    → currentUser セット → LoginModal 非表示

「ログアウト」ボタン
  → logoutUser() [authSlice]
    → POST /api/v1/auth/logout [AuthController.logout]
      → session_id cookie 削除
    → currentUser = null → LoginModal 表示

「サーバーを再起動」
  → POST /api/v1/admin/server/restart [AdminServerController.restart]
    → 2秒後に JVM 終了
  → フロントエンドが 30 秒間ヘルスチェックポーリング
  → バックエンド復帰 → backendConnected = true → 成功メッセージ
```

### Error & Failure Propagation

- `checkAuth()` ネットワークエラー（バックエンド起動していない）: `authLoading = false`, `currentUser = null` のまま → **LoginModal を表示しない**（`backendConnected = false` で "オフライン" 表示。ログインフォームを出しても意味がない）
- `checkAuth()` 401（バックエンドは起動しているが未認証）: `currentUser = null` → **LoginModal を表示**（ログインすれば解決できる）
- `login()` 401: UI にエラーメッセージ表示
- `login()` 429（rate limit）: "しばらく待ってから再試行してください" を表示
- `changeProfile()` 400（現在のパスワード不一致）: フォームにエラー表示
- `adminServer.restart()` 失敗: UI で "再起動に失敗しました" 表示、手動再起動を促す

### State Lifecycle Risks

- ログアウトは API 呼び出し成功後に `currentUser = null` をセット（API 失敗時はセッションが残るため UI をログアウト状態にしない）
- 再起動中: `backendConnected = false` → ConnectionBadge が "オフライン" 表示（正常）
- `scalardb.properties` 書き込み失敗時: DB に不整合が残らない（ファイルのアトミック書き込みを使用）

### Security Considerations

- パスワード変更: 現在のパスワードの確認を必須（自分のパスワードでも）
- admin 操作: `roles.contains("admin")` をバックエンドで必ず検証（フロントの表示制御だけでは不十分）
- セルフ削除防止: 自分自身の userId を DELETE 不可
- `scalardb.properties` にはパスワードが含まれる → 読み取りAPIはパスワードフィールドをマスク（`***`）して返す
- restart エンドポイント: admin のみ許可

### Integration Test Scenarios

1. 未認証状態でアプリ起動 → LoginModal が表示され、admin/changeme でログイン → 通常UI表示
2. admin でログイン → ユーザー管理タブで新ユーザー作成 → 新ユーザーでログイン → ユーザー管理タブが非表示
3. ユーザーが自分のパスワードを変更 → 旧パスワードでログイン失敗 → 新パスワードでログイン成功
4. admin が ScalarDB 設定を変更 → 接続テスト成功 → 保存 → 再起動 → アプリが再接続
5. ログアウト → LoginModal 表示 → 保存済みテンプレートが残存していないこと（`currentTemplateId = null`）

---

## Acceptance Criteria

### Functional Requirements

- [ ] アプリ起動時に未認証の場合、ログインモーダルが表示される
- [ ] `userId` + `password` でログインできる（デフォルト: admin/changeme）
- [ ] ログイン後、ツールバー右端にユーザー名が表示される
- [ ] ユーザー名クリックで「設定」「ログアウト」のドロップダウンが表示される
- [ ] ログアウトでセッションが破棄され、ログインモーダルに戻る
- [ ] 設定モーダル「アカウント」タブで displayName とパスワードを変更できる
- [ ] 設定モーダル「ユーザー管理」タブは admin のみ表示される
- [ ] ユーザーの追加・削除・編集ができる（admin 専用）
- [ ] 自分自身を削除できない
- [ ] ログアウト時に `currentTemplateId` を null にリセットする（他ユーザーのテンプレートが残存しない）
- [ ] 設定モーダル「サーバー設定」タブは admin のみ表示される
- [ ] ScalarDB 接続設定を UI から変更・テスト・保存できる
- [ ] 「サーバーを再起動」でバックエンドが再起動し、フロントエンドが自動再接続する

### Non-Functional Requirements

- [ ] ログインAPI: `{ userId, password }` を送信（`email` バグを修正）
- [ ] `MeSchema`: `userId`, `displayName`, `roles`, `anonymous` に修正
- [ ] パスワードはバックエンドで bcrypt ハッシュ（既存実装維持）
- [ ] `scalardb.properties` のパスワード読み取り時はマスク表示
- [ ] admin チェックはバックエンドで行う（フロントのみに依存しない）
- [ ] rate limit 429 時にユーザーフレンドリーなメッセージを表示

### Quality Gates

- [ ] `V2TenantControllerTest.java` と同パターンのバックエンドテスト作成
- [ ] `authSlice.test.ts` 作成（checkAuth / login / logout シナリオ）
- [ ] `LoginModal.test.tsx` 作成
- [ ] `npm test -- --run` で全テスト PASS
- [ ] TypeScript コンパイルエラーなし (`npm run build`)

---

## File Change Summary

### 新規作成（バックエンド）
- `server/.../auth/AdminUserController.java`
- `server/.../AdminServerController.java`
- `server/.../auth/AdminUserControllerTest.java`
- `server/.../AdminServerControllerTest.java`

### 変更（バックエンド）
- `server/.../auth/AuthController.java` — `changeProfile` 追加
- `server/.../auth/UserRepository.java` — `list()` 追加
- `server/.../AppWiring.java` — `adminUserCtrl`, `adminServerCtrl` 追加
- `server/.../ApiRoutes.java` — admin ルート追加

### 新規作成（フロントエンド）
- `src/store/authSlice.ts`
- `src/components/modals/LoginModal.tsx`
- `src/components/modals/ServerSettingsModal.tsx`
- `src/components/modals/AccountTab.tsx`
- `src/components/modals/AdminUsersTab.tsx`
- `src/components/modals/AdminServerTab.tsx`
- テストファイル各種

### 変更（フロントエンド）
- `src/api/reportApi.ts` — MeSchema修正・login バグ修正・admin API 追加
- `src/store/types.ts` — `currentUser`, `authLoading` 追加
- `src/store/index.ts` — `createAuthSlice` 追加
- `src/App.tsx` — `checkAuth()` on mount・`LoginModal` レンダリング・`ServerSettingsModal` レンダリング
- `src/components/toolbar/Toolbar.tsx` — ユーザー表示ドロップダウン追加

---

## Out of Scope

(see brainstorm: docs/brainstorms/2026-04-12-auth-server-management-brainstorm.md)

- マルチテナント、SSO、OAuth、2FA
- 操作ログ・監査ログ
- パスワードリセットメール
- ScalarDB 全プロパティのUI化（主要項目のみ）

---

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-12-auth-server-management-brainstorm.md](../brainstorms/2026-04-12-auth-server-management-brainstorm.md)
  - 統合設定モーダル（案A）を採用
  - admin/user 2ロールのみ
  - ScalarDB設定はUI変更 + 自動再起動ボタン
  - displayName 変更もアカウントタブで可能

### Internal References

- `AuthController.java`: `server/src/main/java/com/report/server/auth/AuthController.java`
- `UserRepository.java`: `server/src/main/java/com/report/server/auth/UserRepository.java`
- `AppWiring.java` controller 追加パターン: line 127
- `ApiRoutes.java` auth ルート登録パターン: lines 111-116
- `reportApi.ts` login バグ: `src/api/reportApi.ts:139-141`
- 保存ドロップダウンUI パターン: `src/components/toolbar/Toolbar.tsx:599-628`
- タブ付きモーダルパターン: `src/components/modals/DataBindingModal.tsx`
- `rulesSlice.ts` (Zustand スライスパターン): `src/store/rulesSlice.ts`
- `tenantSlice.ts` (async スライスパターン): `src/store/tenantSlice.ts`
- `scalardb.properties`: `server/scalardb.properties`
