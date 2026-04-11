---
title: "feat: 「開く」ボタンにドロップダウンを追加しサーバーからの開封に対応"
type: feat
status: completed
date: 2026-04-12
---

# feat: 「開く」ボタンにドロップダウンを追加しサーバーからの開封に対応

## Problem Statement

「開く」ボタン（`Toolbar.tsx:578`）はローカルファイルのみ対応。
バックエンドが起動していても、サーバー上のテンプレートを開く手段が
「テンプレート管理」ボタン経由しかなく分かりにくい。

---

## Proposed Solution

「保存」ボタンと同パターンで「開く」ボタンにドロップダウンを追加する。

```
[開く ▾]
 ┌─────────────────────────────────┐
 │ ローカルファイルを開く           │  → 既存の fileInputRef.current?.click()
 │ サーバーから開く                 │  → setShowManagerModal(true) ← 既存モーダル流用
 └─────────────────────────────────┘
```

- `backendConnected=false` のとき「サーバーから開く」を disabled + グレーアウト
- ドロップダウン外クリックで閉じる（`useDropdownDismiss` を流用）
- 新規 state: `showOpenMenu`, `openMenuRef`

---

## Implementation

変更ファイルは `src/components/toolbar/Toolbar.tsx` のみ。

### 1. State / Ref 追加（line 129 付近）

```typescript
const [showOpenMenu, setShowOpenMenu] = useState(false)
const openMenuRef = useRef<HTMLDivElement>(null)
const closeOpenMenu = useCallback(() => setShowOpenMenu(false), [])
useDropdownDismiss(openMenuRef, showOpenMenu, closeOpenMenu)
```

### 2. `handleOpen` を `handleOpenLocal` にリネーム

```typescript
const handleOpenLocal = () => {
  if (hasUnsavedChanges && !confirm('未保存の変更があります。破棄してファイルを開きますか？')) return
  fileInputRef.current?.click()
}

const handleOpenServer = () => {
  if (hasUnsavedChanges && !confirm('未保存の変更があります。破棄してテンプレートを開きますか？')) return
  setShowManagerModal(true)
}
```

### 3. JSX — 「開く」ボタンを保存ボタンと同パターンに置換（line 578）

```tsx
{/* 変更前 */}
<ToolbarButton onClick={handleOpen} title="開く">
  <FolderOpen className="w-4 h-4" />
</ToolbarButton>

{/* 変更後 */}
<div className="relative flex items-center" ref={openMenuRef}>
  <ToolbarButton onClick={handleOpenLocal} title="開く">
    <FolderOpen className="w-4 h-4" />
  </ToolbarButton>
  <button
    onClick={() => setShowOpenMenu((v) => !v)}
    className="h-7 px-0.5 rounded hover:bg-accent -ml-1"
    aria-expanded={showOpenMenu}
    aria-haspopup="menu"
    aria-label="開くメニュー"
  >
    <ChevronDown className="w-3 h-3" />
  </button>
  {showOpenMenu && (
    <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[210px] py-1">
      <button
        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
        onClick={() => { handleOpenLocal(); setShowOpenMenu(false) }}
      >
        ローカルファイルを開く
      </button>
      <button
        className={cn(
          'w-full text-left px-3 py-1.5 text-sm',
          backendConnected ? 'hover:bg-accent' : 'opacity-40 cursor-not-allowed',
        )}
        disabled={!backendConnected}
        onClick={() => { if (backendConnected) { handleOpenServer(); setShowOpenMenu(false) } }}
      >
        サーバーから開く
      </button>
    </div>
  )}
</div>
```

---

## Acceptance Criteria

- [x] 「開く」ボタン横に ▾ が表示される
- [x] ドロップダウンに「ローカルファイルを開く」「サーバーから開く」の2項目が表示される
- [x] 「ローカルファイルを開く」でファイルピッカーが開く（既存動作変わらず）
- [x] `backendConnected=true` のとき「サーバーから開く」でテンプレート管理モーダルが開く
- [x] `backendConnected=false` のとき「サーバーから開く」がグレーアウトかつ disabled
- [x] ドロップダウン外クリックで自動的に閉じる
- [x] 未保存変更がある場合、確認ダイアログを表示する（両方の経路で）

---

## Sources & References

- 保存ボタンのドロップダウン実装（テンプレート）: `src/components/toolbar/Toolbar.tsx:599-628`
- `handleOpen` 現在の実装: `src/components/toolbar/Toolbar.tsx:409-412`
- `useDropdownDismiss` の使用例: `src/components/toolbar/Toolbar.tsx:157-162`
- TemplateSelectionModal（サーバーテンプレート一覧）: `src/components/modals/TemplateSelectionModal.tsx`
- `showManagerModal` / `setShowManagerModal`: `src/components/toolbar/Toolbar.tsx:137,581`
