---
title: Sidebar & Panel UX — Master H/F, Confirmations, Localization & Discoverability
problem_type: ui_bug
component: Toolbar, PagePanel, LayersPanel, DataSourcePanel, PageSettingsPanel
severity: p2
tags:
  - master-header-footer
  - confirmation-dialog
  - localization
  - japanese
  - undo
  - discoverability
  - system-variables
  - keyboard-shortcuts
date: 2026-04-06
resolved_todos:
  - 017 (layer panel callbacks noop)
  - 036 (master header/footer no store actions)
  - 058 (master header/footer workflow)
  - 077 (master H/F individual control)
  - 087 (H/F toggle deletes with no confirmation)
  - 088 (page delete no confirmation)
  - 073 (PagePanel English labels)
  - 075 (DataSource form row delete)
  - 076 (system variables not discoverable)
  - 086 (keyboard shortcuts not discoverable)
  - 094 (no new document button)
  - 096 (align dropdown enabled with single element)
---

## Issue 1: Master Header/Footer Store Actions Missing

### Problem
`ReportDefinition` declared `masterHeader?` and `masterFooter?` but no store actions
existed to set them. The fields were unreachable from any UI.

### Fix
```typescript
// src/store/layoutSlice.ts
setMasterHeader: (section: Section | null) => {
  set((s) => {
    s.definition.masterHeader = section ?? undefined
    if (section) {
      // Sync master to all existing pages
      s.definition.pages.forEach((page) => {
        const idx = page.sections.findIndex((sec) => sec.sectionType === 'header')
        if (idx !== -1) {
          page.sections[idx] = cloneSectionForPage(section)
        }
      })
    }
  })
  get().pushHistory()
},
```

`setMasterFooter` follows the same pattern. `addPage()` was also updated to clone
masters when creating new pages.

---

## Issue 2: H/F Toggle Was All-or-Nothing

### Problem
A single "H/F" toolbar button toggled both header AND footer simultaneously.
A user wanting only a footer had to accept an unwanted header reducing usable space.

### Fix — Separate H and F buttons
```tsx
// src/components/toolbar/Toolbar.tsx
<ToolbarButton
  onClick={handleToggleMasterHeader}
  active={!!masterHeader}
  title={masterHeader ? 'マスターヘッダーを削除' : 'マスターヘッダーを作成'}
>
  <ArrowUpToLine className="w-4 h-4" />
  <span className="text-xs ml-1">H</span>
</ToolbarButton>

<ToolbarButton
  onClick={handleToggleMasterFooter}
  active={!!masterFooter}
  title={masterFooter ? 'マスターフッターを削除' : 'マスターフッターを作成'}
>
  <ArrowDownToLine className="w-4 h-4" />
  <span className="text-xs ml-1">F</span>
</ToolbarButton>
```

---

## Issue 3: H/F Toggle Deleted Content Without Confirmation

### Problem
Clicking the active H or F button immediately destroyed the master section and all
its content. A single misclick caused irreversible data loss — no undo across
`setMasterHeader(null)` calls.

### Fix
```typescript
// src/components/toolbar/Toolbar.tsx
const handleToggleMasterHeader = () => {
  if (masterHeader) {
    if (!confirm('ヘッダーとその内容を削除しますか？')) return
    setMasterHeader(null)
  } else {
    setMasterHeader(createMasterSection('header'))
    if (!headerEditMode) toggleHeaderEditMode()
  }
}

const handleToggleMasterFooter = () => {
  if (masterFooter) {
    if (!confirm('フッターとその内容を削除しますか？')) return
    setMasterFooter(null)
  } else {
    setMasterFooter(createMasterSection('footer'))
    if (!headerEditMode) toggleHeaderEditMode()
  }
}
```

---

## Issue 4: Page Delete Had No Confirmation

### Problem
The trash button in PagePanel deleted pages instantly. A page can contain dozens of
elements; losing it with a misclick was a critical UX problem.

### Fix
```tsx
// src/components/sidebar/PagePanel.tsx
<button
  onClick={(e) => {
    e.stopPropagation()
    if (confirm(`「${page.name}」を削除しますか？この操作は元に戻せません。`)) {
      removePage(page.id)
    }
  }}
>
  <Trash2 className="w-3 h-3" />
</button>
```

---

## Issue 5: PagePanel Had English Labels

### Problem
PagePanel used English labels ("Pages", "Add page", "Remove page") while all other
panels were already in Japanese.

### Fix — String replacement
```tsx
// src/components/sidebar/PagePanel.tsx
<p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
  ページ一覧
</p>
// title="ページを追加"  |  title="ページを削除"
```

---

## Issue 6: DataSource Form Rows Not Deletable

### Problem
DataSourcePanel form mode had no way to delete individual rows. Entering an extra row
by mistake required clearing all data and starting over.

### Fix — Delete button per row
```tsx
// src/components/sidebar/DataSourcePanel.tsx
<button
  onClick={() => setFormRows((rows) => rows.filter((_, j) => j !== i))}
  aria-label="この行を削除"
  disabled={formRows.length === 1}    // always keep at least one row
>
  <X className="w-3 h-3" />
</button>
```

The button is disabled when only one row remains to prevent an empty form state.

---

## Issue 7: System Variables Not Discoverable

### Problem
System variables (`{{$page}}`, `{{$totalPages}}`, `{{$printDate}}`) were implemented
but invisible from the UI. Users had no way to find them without reading source code.

### Fix — Visible chip section in DataSourcePanel
```tsx
// src/components/sidebar/DataSourcePanel.tsx
<div className="rounded-lg border bg-muted/50 p-2 text-xs space-y-1">
  <p className="font-medium text-muted-foreground">システム変数</p>
  <p className="text-muted-foreground">テキスト要素で以下の変数が使用できます:</p>
  <ul className="space-y-0.5 font-mono text-muted-foreground">
    <li><code className="bg-muted px-1 rounded">{'{{$page}}'}</code> — 現在のページ番号</li>
    <li><code className="bg-muted px-1 rounded">{'{{$totalPages}}'}</code> — 総ページ数</li>
    <li><code className="bg-muted px-1 rounded">{'{{$printDate}}'}</code> — 印刷日</li>
  </ul>
</div>
```

---

## Issue 8: Keyboard Shortcuts Not Discoverable

### Problem
~15 keyboard shortcuts existed but were undocumented in the UI. New users could not
find them without reading source code.

### Fix — Shortcut hints in toolbar `title` attributes
```tsx
title="元に戻す (⌘Z)"
title="やり直す (⌘⇧Z)"
title="コピー (⌘C)"
title="切り取り (⌘X)"
title="貼り付け (⌘V)"
title="ズームアウト (⌘-)"
title="ズームイン (⌘=)"
```

**Note:** A dedicated keyboard shortcuts modal (`/086`) was listed as a future
enhancement. The toolbar hints cover the most common actions; arrow key shortcuts,
Delete, and other non-button bindings are documented in `App.tsx` comments.

---

## Issue 9: No "New Document" Button

### Problem
Toolbar had "Open" and "Save" but no "New" button. Creating a fresh document
required reloading the page or navigating via templates.

### Fix
```tsx
// src/components/toolbar/Toolbar.tsx
<ToolbarButton onClick={handleNew} title="新規作成">
  <FilePlus className="w-4 h-4" />
</ToolbarButton>

const handleNew = () => onRequestTemplateModal?.()
```

Clicking "New" opens the `TemplateSelectionModal`, consistent with the flow for
changing templates mid-project. The unsaved-changes confirmation is shown by the
modal's `onSelect` handler if `historyIndex > 0`.

---

## Issue 10: Alignment Dropdown Enabled with Single Element

### Problem
The alignment dropdown trigger was always enabled. When opened with 0 or 1 elements
selected, all menu items were greyed out — a wasted click.

### Fix
```tsx
// src/components/toolbar/Toolbar.tsx
<ToolbarButton
  onClick={() => setShowAlignMenu((v) => !v)}
  disabled={selectedIds.length < 2}
  title={
    selectedIds.length < 2
      ? '整列・配置（2つ以上の要素を選択）'
      : '整列・配置'
  }
>
  <AlignLeft className="w-4 h-4" />
</ToolbarButton>
```

Tooltip explains the requirement when disabled, so users understand why the button
is grayed out.

---

## Issue 11: LayersPanel Visibility/Lock Callbacks Were No-ops

### Problem
`onToggleVisible` and `onToggleLock` in LayersPanel were wired to empty functions.
The eye and lock icons in the layers panel had no effect.

### Fix — Wired to `updateElement` store action
```tsx
// src/components/sidebar/LayersPanel.tsx
const { updateElement } = useReportStore(...)

onToggleVisible={(id) =>
  updateElement(activePageId, id, { visible: !element.visible })
}
onToggleLock={(id) =>
  updateElement(activePageId, id, { locked: !element.locked })
}
```

---

## Confirmation Dialog Pattern

All destructive actions now follow a consistent pattern:

| Action | Guard condition | Dialog text |
|--------|----------------|-------------|
| Delete master header | `masterHeader` exists | "ヘッダーとその内容を削除しますか？" |
| Delete master footer | `masterFooter` exists | "フッターとその内容を削除しますか？" |
| Delete page | always | "「{name}」を削除しますか？この操作は元に戻せません。" |
| Load file | `hasUnsavedChanges` | "未保存の変更があります。破棄してファイルを開きますか？" |
| Change template | `historyIndex > 0` | "未保存の変更があります。テンプレートを変更しますか？" |

---

## Prevention Checklist

- [ ] All destructive toolbar/panel actions check for unsaved content before executing
- [ ] Master H/F are toggled independently via separate H and F buttons
- [ ] New element types with "delete" UI include confirmation when content exists
- [ ] New sidebar panels use Japanese labels from the start
- [ ] Features with discoverable tokens/syntax expose them in the relevant panel
- [ ] Dropdown triggers disabled when the action would be a no-op (explain why in title)
