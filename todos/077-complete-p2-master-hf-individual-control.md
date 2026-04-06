---
status: complete
priority: p2
issue_id: "077"
tags: [ux-review, ux, master-layout]
dependencies: []
---

## Problem

The "マスターH/F作成" button always creates both header AND footer simultaneously. A 帳票作成者 who only wants a footer with page numbers must also deal with an unwanted header reducing the usable page area.

## Findings

- `src/components/toolbar/Toolbar.tsx:181-185` — `handleCreateMasterHF` calls both `setMasterHeader()` and `setMasterFooter()` unconditionally

## Solutions

Replace single button with dropdown offering "ヘッダーのみ作成", "フッターのみ作成", "両方作成":

```tsx
<ToolbarButton onClick={() => setShowHFMenu(v => !v)} ...>
  <PanelTop /> <span>H/F</span> <ChevronDown />
</ToolbarButton>
{showHFMenu && (
  <div ...>
    <MenuButton onClick={() => { setMasterHeader(createMasterSection('header')); ... }} label="ヘッダーのみ作成" />
    <MenuButton onClick={() => { setMasterFooter(createMasterSection('footer')); ... }} label="フッターのみ作成" />
    <MenuButton onClick={() => { setMasterHeader(...); setMasterFooter(...); ... }} label="両方作成" />
  </div>
)}
```

## Files

- `src/components/toolbar/Toolbar.tsx:181-194`

## Acceptance Criteria

- [ ] Can create header only, footer only, or both separately
