---
title: "feat: 保存ボタンにドロップダウン追加 — サーバー保存 + JSON ファイルダウンロード"
type: feat
status: completed
date: 2026-04-08
origin: docs/brainstorms/2026-04-08-dual-save-method-brainstorm.md
---

# feat: 保存ボタンにドロップダウン追加 — サーバー保存 + JSON ファイルダウンロード

ツールバーの「保存」ボタンを SplitButton 化し、サーバー保存と JSON ファイルダウンロードの両方に対応する。

(see brainstorm: docs/brainstorms/2026-04-08-dual-save-method-brainstorm.md)

## Acceptance Criteria

- [ ] 「保存」ボタン本体クリック → サーバー保存（既存動作そのまま）
- [ ] 「保存」ボタン横の ▼ クリック → ドロップダウンメニュー表示
- [ ] メニュー項目「サーバーに保存」→ サーバー保存を実行
- [ ] メニュー項目「JSON ファイルとしてダウンロード」→ `reportName.rds.json` をダウンロード
- [ ] メニュー外クリックでドロップダウンが閉じる（既存 `useDropdownDismiss` パターン）
- [ ] 全テスト通過 + ビルドエラーなし

## Implementation

**変更ファイル:** `src/components/toolbar/Toolbar.tsx` のみ

### Step 1: state + ref 追加

```typescript
const [showSaveMenu, setShowSaveMenu] = useState(false)
const saveMenuRef = useRef<HTMLDivElement>(null)
const closeSaveMenu = useCallback(() => setShowSaveMenu(false), [])
useDropdownDismiss(saveMenuRef, showSaveMenu, closeSaveMenu)
```

### Step 2: handleDownloadJson 関数を追加

`handleSave` の旧 JSON ダウンロードコード（バックエンド未接続フォールバック内）を分離:

```typescript
const handleDownloadJson = () => {
  const definition = useReportStore.getState().definition
  const json = JSON.stringify(definition, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${reportName}.rds.json`
  a.click()
  URL.revokeObjectURL(url)
  setShowSaveMenu(false)
}
```

### Step 3: 保存ボタンを SplitButton に変更

現在 (Toolbar.tsx:439):
```tsx
<ToolbarButton onClick={handleSave} title="保存" active={hasUnsavedChanges}>
  <Save className="w-4 h-4" />
</ToolbarButton>
```

変更後:
```tsx
<div className="relative" ref={saveMenuRef}>
  <div className="flex items-center">
    <ToolbarButton onClick={handleSave} title="保存" active={hasUnsavedChanges}>
      <Save className="w-4 h-4" />
    </ToolbarButton>
    <button
      onClick={() => setShowSaveMenu((v) => !v)}
      className="h-7 px-0.5 rounded hover:bg-accent"
      aria-expanded={showSaveMenu}
      aria-label="保存メニュー"
    >
      <ChevronDown className="w-3 h-3" />
    </button>
  </div>
  {showSaveMenu && (
    <div className="absolute top-full left-0 mt-1 bg-popover border rounded-md shadow-lg z-50 min-w-[200px]">
      <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent" onClick={() => { handleSave(); setShowSaveMenu(false) }}>
        サーバーに保存
      </button>
      <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent" onClick={handleDownloadJson}>
        JSON ファイルとしてダウンロード
      </button>
    </div>
  )}
</div>
```

### Step 4: handleSave のフォールバック整理

現在の `handleSave` のバックエンド未接続時フォールバック（JSON blob 生成 + ダウンロード）を
`handleDownloadJson()` 呼び出しに置換:

```typescript
// Before (inline JSON download):
if (!backendConnected) {
  try {
    const json = JSON.stringify(definition, null, 2)
    // ... blob creation and download ...
  } catch (err) { ... }
  return
}

// After (delegate to handleDownloadJson):
if (!backendConnected) {
  handleDownloadJson()
  return
}
```

## Sources

- **Origin brainstorm:** [docs/brainstorms/2026-04-08-dual-save-method-brainstorm.md](../brainstorms/2026-04-08-dual-save-method-brainstorm.md)
- **既存ドロップダウンパターン:** `Toolbar.tsx:115-136` — `showZOrderMenu` / `useDropdownDismiss` / `zOrderMenuRef`
- **既存 handleSave:** `Toolbar.tsx:334-390`
- **ChevronDown import:** `Toolbar.tsx:9` — 既にインポート済み
