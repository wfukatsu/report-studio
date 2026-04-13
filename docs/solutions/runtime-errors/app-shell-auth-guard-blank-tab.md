---
title: AppShell — 認証ガードによりデータ管理・テンプレート管理タブが空白
problem_type: runtime_error
component: layout/AppShell
symptom: 「データ管理」「テンプレート管理」タブをクリックすると空白ページが表示される
root_cause: activeTab === 'data' に && currentUser の認証ガードが付いており、未ログイン時にコンテンツが非レンダリングになっていた
tags: [auth-guard, tab, AppShell, conditional-render, currentUser]
severity: high
solved_date: 2026-04-14
---

## 症状

「データ管理」または「テンプレート管理」タブをクリックすると、ページ全体が空白になる。バックエンドが起動していない環境（フロントエンド単体起動）や未ログイン状態で常に発生する。

コンソールには `[tenantSlice] fetchTenantInfo failed: HTTP 500` などのバックエンドエラーが出ていたが、タブの空白とは無関係。

---

## 根本原因

`AppShell.tsx` でタブコンテンツのレンダリングに `currentUser` の存在チェックが付いていた:

```tsx
// ❌ 修正前
{activeTab === 'data' && currentUser && (
  <div role="tabpanel" ...>
    <DataManagementTab />
  </div>
)}

{activeTab === 'templates' && currentUser && (
  <div role="tabpanel" ...>
    <TemplateManagementTab />
  </div>
)}
```

`currentUser` は認証 API (`/api/v1/auth/me`) の応答が成功した場合にのみ設定される。バックエンド未起動・500 エラー・未ログイン時はすべて `null` のため、条件が満たされずタブコンテンツが一切レンダリングされない。

**問題は「認証が必要かどうか」の判断が間違っていた点:**

| タブ | バックエンド API 利用 | 認証が必要か |
|------|---------------------|------------|
| デザイン | ✗（ローカル Zustand） | 不要 |
| データ管理 | ✗（ローカル Zustand） | **不要** |
| テンプレート管理 | ✗（ローカル Zustand） | **不要** |

`DataManagementTab` と `TemplateManagementTab` はどちらもローカル状態（Zustand ストア）のみを扱い、認証済みユーザーだけが利用できる API を呼ばない。

---

## 解決方法

`&& currentUser` を削除し、不要になった `currentUser` セレクターも削除する。

```tsx
// ✅ 修正後
const activeTab = useReportStore((s) => s.activeTab)
const setActiveTab = useReportStore((s) => s.setActiveTab)
// currentUser セレクターを削除

{activeTab === 'data' && (
  <div role="tabpanel" id="top-panel-data" aria-labelledby="top-tab-data"
       className="flex flex-1 overflow-hidden">
    <DataManagementTab />
  </div>
)}

{activeTab === 'templates' && (
  <div role="tabpanel" id="top-panel-templates" aria-labelledby="top-tab-templates"
       className="flex flex-1 overflow-hidden">
    <TemplateManagementTab />
  </div>
)}
```

---

## 動作確認

```
1. バックエンド未起動（npm run dev のみ）の状態でアプリを開く
2. 「データ管理」タブをクリック → データソース設定画面が表示される ✓
3. 「テンプレート管理」タブをクリック → テンプレート一覧が表示される ✓
4. バックエンド起動・ログイン済みでも同様に表示される ✓
```

---

## 再発防止

### トップナビにタブを追加する際の判断フロー

```
新しいタブを追加する
      ↓
このタブはバックエンド認証 API を呼ぶか？
      ↓ No
認証ガードは不要 → activeTab === 'xxx' だけでレンダリング
      ↓ Yes
認証が必要な機能はタブを隠すのではなく
タブ内部でログインプロンプトを表示する:

  if (!currentUser) {
    return <LoginPrompt message="この機能はログインが必要です" />
  }
  return <ActualContent />
```

**やってはいけないパターン:**

```tsx
// ❌ タブ全体を認証で隠す → 空白ページになる
{activeTab === 'foo' && currentUser && <FooTab />}

// ✅ タブは常に表示し、内部で制御する
{activeTab === 'foo' && <FooTab />}
// FooTab 内部:
// if (!currentUser) return <LoginPrompt />;
// return <ActualContent />;
```

### 類似リスクのある箇所

- `AppShell.tsx` で今後タブを追加するたびに同じミスが起こりやすい
- モーダル・ドロワー: `open && currentUser && <Content />` のようなパターンも同様に空白になる
- ルートレベルの認証チェックとコンポーネントレベルのガードが重複している場合

---

## 関連

- `todos/271-pending-p1-tab-auth-guard-missing.md` — 本問題のタスクチケット（今回修正で complete）
- `todos/243-complete-p2-auth-flash-databrowserpage.md` — 認証ローディング中フラッシュ問題（関連する認証系バグ）
- `src/components/layout/AppShell.tsx` — 修正対象ファイル
- `src/components/tabs/DataManagementTab.tsx` — ローカル状態のみ使用
- `src/components/tabs/TemplateManagementTab.tsx` — ローカル状態のみ使用
