---
title: "feat: LayersPanel全面強化 — DnD並び替え・グループ・検索・右クリックメニュー"
type: feat
status: completed
date: 2026-04-06
deepened: 2026-04-06
origin:
  - docs/brainstorms/2026-04-06-layers-panel-improvements-brainstorm.md
  - docs/brainstorms/2026-04-06-context-menu-layer-operations-brainstorm.md
---

# feat: LayersPanel全面強化 — DnD並び替え・グループ・検索・右クリックメニュー

## Enhancement Summary

**Deepened on:** 2026-04-06  
**Research agents:** TypeScript reviewer, Performance Oracle, Race Condition reviewer, Architecture Strategist, Simplicity reviewer, Security Sentinel, @dnd-kit best practices, Pattern Recognition, Learnings researcher

### ⚠️ Critical Issues Found — 元のプランから変更が必要

| # | 問題 | 影響 | 変更内容 |
|---|------|------|---------|
| 1 | **グループを`uiSlice`に保存** | データロス (save/load で消える) | `PageDef.groups`に移動し`layoutSlice`で管理 |
| 2 | **`pushHistory()` を `set()` 内で呼ぶ** | 未定義動作・二重レンダリング | `set()` の外から呼ぶ |
| 3 | **`reorderElements` vs `setZOrder` の意味論的競合** | z-order が壊れる | `reorderElements`もグローバルzIndex再採番を行う |
| 4 | **`group.visible` と `el.visible` の undo split-brain** | undo後に要素が消えたまま | グループのvisible/lockedを`definition`に含める |
| 5 | **`effectiveVisible/Locked` の O(n×m) ルックアップ** | DnD中 60fps でパフォーマンス劣化 | `useMemo` で Map を構築、O(1) ルックアップへ |
| 6 | **`?? []` をストア購読内で使う** | すべてのstore変更でLayersPanelが再レンダリング | モジュールスコープの `EMPTY_GROUPS` 定数を使う |

### Key Improvements
1. グループ定義を `PageDef.groups` に移動し、undo/save/loadに対応
2. `ContextMenuItemDef` を discriminated union に変更（型安全性向上）
3. `@dnd-kit/sortable` のセンサー・DragOverlay・アクセシビリティのベストプラクティス適用
4. `resolveVisible/resolveLocked` を `src/lib/groupUtils.ts` にMap-basedで実装
5. YAGNI違反を除去: `assignToGroup`/`removeFromGroup`廃止、`sectionId`/`pageId`フィールド削除

---

## Overview

LayersPanelの全面的なUX強化。上下ボタンによる並び替えを廃止してドラッグ＆ドロップへ刷新し、グループレイヤー（表示管理専用フォルダ）・検索フィルター・セクション区切り・右クリックコンテキストメニューを追加する。

**スコープ外:** グループのネスト、要素タイプ別アイコン、仮想スクロール（300要素超の場合は別途検討）。

---

## Problem Statement

現在のLayersPanelの課題：

1. **並び替えが面倒** — 上下ボタンを何度も押す必要がある
2. **要素が多くて見つけにくい** — 検索・フィルター機能がない
3. **セクション境界が不明** — header/body/footerの区別がパネル上で視覚化されていない
4. **一括操作できない** — 複数要素をまとめて表示/ロック切り替えできない
5. **LayersPanelから削除できない** — パネル内に削除ボタンがない
6. **グループ化機能がない** — 関連要素をまとめて管理できない
7. **右クリックメニューがない** — LayersPanelにコンテキストメニューが存在しない

---

## Proposed Solution

6つのフェーズで段階的に実装する。各フェーズは独立してリリース可能。

---

## Technical Approach

### Architecture

```
src/
├── types/index.ts                    # LayerGroup インターフェース追加、PageDef.groups 追加
├── store/
│   ├── layoutSlice.ts                # groups CRUD + reorderElements + batch actions
│   └── types.ts                      # StoreState 型拡張
├── lib/
│   └── groupUtils.ts                 # resolveVisible / resolveLocked（Map-based, 純粋関数）
├── components/
│   ├── canvas/
│   │   └── ContextMenu.tsx           # ContextMenuItemDef discriminated union + items prop
│   └── sidebar/
│       ├── LayersPanel.tsx           # 全面リファクタリング
│       ├── SortableLayerRow.tsx      # 新規（@dnd-kit/sortable）
│       └── LayerGroupRow.tsx         # 新規
└── hooks/
    └── useDropdownDismiss.ts         # Toolbar.tsx から抽出（既存パターン再利用）
```

### ⚠️ 設計変更: グループの保存先

**元のプラン（問題あり）:** `uiSlice.layerGroups` → save/loadで消える  
**修正後:** `PageDef.groups: LayerGroup[]` → `layoutSlice` で管理、undo対象

```typescript
// src/types/index.ts に追加
export interface LayerGroup {
  id: string
  name: string
  elementIds: readonly string[]  // readonlyで誤った変異を防止
  collapsed: boolean
  visible: boolean               // グループ全体のvisible override
  locked: boolean                // グループ全体のlocked override
  // ※ sectionId/pageId はフィールドに含めない（冗長）
  // pageIdはstoreのRecord<pageId, ...>でスコープ化
  // sectionIdはrender時に要素プロパティから導出
}

// PageDef に追加
export interface PageDef {
  // ... 既存フィールド
  groups?: LayerGroup[]          // optional, 後方互換
}
```

**理由:**
- `groups` は `visible`/`locked`/`collapsed` を持ち、どれも save/load後に復元すべき情報
- `uiSlice` はzoom・gridなどの真のエフェメラル設定のみ
- `layoutSlice` の `pushHistory()` でundo対象になる → split-brain解消

### ContextMenu 拡張 — Discriminated Union

```typescript
// 変更前（問題あり）: 分離できない2つの概念が混在
export interface ContextMenuItemDef {
  icon: React.ReactNode  // separator には不要
  label: string          // separator には不要
  onClick: () => void    // separator では不要
  separator?: boolean    // flag で分岐
}

// 変更後: discriminated union
export interface ContextMenuAction {
  kind: 'action'
  icon: React.ReactElement | null   // React.ReactNode ではなく ReactElement
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export interface ContextMenuSeparator {
  kind: 'separator'
}

export type ContextMenuItemDef = ContextMenuAction | ContextMenuSeparator
```

### ⚠️ pushHistory の正しい呼び方

**元のプラン（問題あり）:**
```typescript
// WRONG — set()内でpushHistory呼び出し
reorderElements: (pageId, sectionId, orderedIds) => set((s) => {
  // ...mutations...
  get().pushHistory()  // immer draftが開いている間に呼ぶ → 未定義動作
}),
```

**修正後:**
```typescript
// CORRECT — set()の外からpushHistory呼び出し（既存パターン通り）
reorderElements: (pageId, sectionId, orderedIds) => {
  set((s) => {
    // ...mutations のみ
  })
  get().pushHistory()  // set()完了後に呼ぶ
},
```

### ⚠️ Z-order の統一: `reorderElements` は全体再採番必須

**元のプラン（問題あり）:** `reorderElements` がセクション内のみ再採番 → `setZOrder` の cross-section z-order と競合

**修正後:** `reorderElements` は `setZOrder` と同じ `reassign` ヘルパーを使い、page全体でzIndexを再採番する。

```typescript
// layoutSlice.ts に追加（setZOrder の reassign ロジックを再利用）
reorderElements: (pageId: string, sectionId: string, orderedIds: string[]) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    
    // 1. ページ全要素を現在のzIndexでソート
    const allElements = flattenPageElements(page).sort((a, b) => a.zIndex - b.zIndex)
    
    // 2. 対象セクションの要素を orderedIds の順に置き換え
    //    ※ セクション要素を末尾に移動しないよう、最初の登場位置に in-place 挿入する
    const sectionElementIdSet = new Set(
      page.sections.find((s) => s.id === sectionId)?.elements.map((e) => e.id) ?? []
    )
    const reorderedSection = orderedIds
      .map((id) => allElements.find((e) => e.id === id)!)
      .filter(Boolean)
    
    // セクション要素の先頭が元々あった位置を特定し、そこに差し込む
    const firstSectionIdx = allElements.findIndex((e) => sectionElementIdSet.has(e.id))
    const reorderedAll = [
      ...allElements.slice(0, firstSectionIdx).filter((e) => !sectionElementIdSet.has(e.id)),
      ...reorderedSection,
      ...allElements.slice(firstSectionIdx).filter((e) => !sectionElementIdSet.has(e.id)),
    ]
    
    // 3. setZOrder と同じ reassign: 全要素にzIndex = i + 1 を割り当て
    reorderedAll.forEach((el, i) => {
      for (const section of page.sections) {
        const found = section.elements.find((e) => e.id === el.id)
        if (found) found.zIndex = i + 1
      }
    })
  })
  get().pushHistory()
},
```

### `resolveVisible` / `resolveLocked` — Map-based O(1) ルックアップ

```typescript
// src/lib/groupUtils.ts (新規)

/** elementId → LayerGroup のMap。useMemoで1回だけ構築する */
export function buildGroupMap(groups: LayerGroup[]): Map<string, LayerGroup> {
  const map = new Map<string, LayerGroup>()
  for (const group of groups) {
    for (const id of group.elementIds) {
      map.set(id, group)
    }
  }
  return map
}

/** グループのvisibleオーバーライドを考慮した実効visible */
export function resolveVisible(
  el: { id: string; visible: boolean },
  groupMap: Map<string, LayerGroup>
): boolean {
  const group = groupMap.get(el.id)
  if (group && !group.visible) return false
  return el.visible
}

/** グループのlockedオーバーライドを考慮した実効locked */
export function resolveLocked(
  el: { id: string; locked: boolean },
  groupMap: Map<string, LayerGroup>
): boolean {
  const group = groupMap.get(el.id)
  if (group && group.locked) return true
  return el.locked
}
```

```tsx
// SectionContainer.tsx での使用例
const EMPTY_GROUPS: LayerGroup[] = []  // モジュールスコープ（?? []問題を回避）

function SectionContainer({ pageId, section, ... }) {
  const groups = useStore(s => {
    const page = s.definition.pages.find(p => p.id === pageId)
    return page?.groups ?? EMPTY_GROUPS  // EMPTY_GROUPS は安定した参照
  })
  
  const groupMap = useMemo(() => buildGroupMap(groups), [groups])
  
  const getEffectiveVisible = useCallback(
    (el: ReportElement) => resolveVisible(el, groupMap),
    [groupMap]
  )
  const getEffectiveLocked = useCallback(
    (el: ReportElement) => resolveLocked(el, groupMap),
    [groupMap]
  )
  // ...
}
```

---

### Implementation Phases

#### Phase 1: Store & Types 基盤整備

**目的:** 後続フェーズに必要な型定義・ストアアクションを用意する。

**ファイル変更:**

- `src/types/index.ts` — `LayerGroup` インターフェース + `PageDef.groups?: LayerGroup[]` 追加
- `src/lib/groupUtils.ts` — `buildGroupMap` / `resolveVisible` / `resolveLocked` 追加（新規）
- `src/store/types.ts` — `StoreState` にアクション署名追加
- `src/store/layoutSlice.ts` — groups CRUD + `reorderElements` + `updateElements` + `removeElements` 追加

**新アクション詳細:**

```typescript
// layoutSlice.ts に追加
// Groups CRUD
addLayerGroup: (pageId: string, group: LayerGroup) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    if (!page.groups) page.groups = []
    page.groups.push(group)
  })
  get().pushHistory()
},

removeLayerGroup: (pageId: string, groupId: string) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page?.groups) return
    page.groups = page.groups.filter((g) => g.id !== groupId)
  })
  get().pushHistory()
},

updateLayerGroup: (
  pageId: string,
  groupId: string,
  patch: Partial<Omit<LayerGroup, 'id'>>  // idを除外して型安全
) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    const group = page?.groups?.find((g) => g.id === groupId)
    if (group) Object.assign(group, patch)
  })
  get().pushHistory()
},

// Batch element operations
updateElements: (pageId: string, elementIds: string[], patch: Partial<ReportElement>) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    for (const section of page.sections) {
      for (const el of section.elements) {
        if (elementIds.includes(el.id)) Object.assign(el, patch)
      }
    }
  })
  get().pushHistory()
},

removeElements: (pageId: string, elementIds: string[]) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    if (!page) return
    // 要素削除と同時にグループのelementIdsもクリーンアップ
    for (const section of page.sections) {
      section.elements = section.elements.filter((e) => !elementIds.includes(e.id))
    }
    if (page.groups) {
      page.groups = page.groups.map((g) => ({
        ...g,
        elementIds: g.elementIds.filter((id) => !elementIds.includes(id))
      }))
      // 空になったグループは自動削除
      page.groups = page.groups.filter((g) => g.elementIds.length > 0)
    }
  })
  get().pushHistory()
},
```

**マイグレーション:** `src/lib/migration.ts` に `groups: []` の初期化を追加（既存保存データとの互換性）。

**受け入れ基準:**
- [ ] `LayerGroup` 型が `src/types/index.ts` に定義されている
- [ ] `PageDef.groups` が optional フィールドとして追加されている
- [ ] `addLayerGroup` / `removeLayerGroup` / `updateLayerGroup` がストアで呼べる
- [ ] `reorderElements` でzIndexが全体再採番される（`setZOrder` と同じ採番順序）
- [ ] `updateElements` / `removeElements` で複数要素を一括操作できる
- [ ] 要素削除時に関連グループの `elementIds` もクリーンアップされる
- [ ] `buildGroupMap` / `resolveVisible` / `resolveLocked` が `groupUtils.ts` にある
- [ ] migration.ts が `groups: []` で既存データを処理できる
- [ ] 既存テストがすべてパスする

---

#### Phase 2: ContextMenu 拡張（後方互換）

**目的:** 既存のキャンバス用ContextMenuを壊さずに、`items` プロップで汎用利用できるよう拡張する。

**ファイル変更:**

- `src/components/canvas/ContextMenu.tsx` — discriminated union + `items?: ContextMenuItemDef[]` 追加
- `src/components/canvas/ContextMenu.test.tsx` — `items` プロップのテスト追加
- `src/hooks/useDropdownDismiss.ts` — `Toolbar.tsx` から抽出（新規）

**実装方針:**

```tsx
// ContextMenu.tsx のレンダリングロジック
function renderItems(items: ContextMenuItemDef[], onClose: () => void) {
  return items.map((item, i) => {
    if (item.kind === 'separator') {
      return <div key={i} className="border-t my-1" />
    }
    return (
      <MenuItem
        key={i}
        icon={item.icon}
        label={item.label}
        shortcut={item.shortcut}
        onClick={() => { item.onClick(); onClose() }}
        disabled={item.disabled}
        className={item.className}
      />
    )
  })
}
```

**`useDropdownDismiss` hook の抽出:**

```typescript
// src/hooks/useDropdownDismiss.ts (新規 — Toolbar.tsx の既存ロジックを抽出)
export function useDropdownDismiss(
  ref: React.RefObject<HTMLElement>,
  isOpen: boolean,
  onClose: () => void
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') {
        onClose()
        return
      }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [isOpen, onClose, ref])
}
```

**受け入れ基準:**
- [ ] `ContextMenuItemDef` が `ContextMenuAction | ContextMenuSeparator` の discriminated union である
- [ ] `items` プロップを渡すと汎用モードでレンダリングされる
- [ ] `items` なしで使用するとキャンバス側の動作が変わらない
- [ ] `useDropdownDismiss` フックが `src/hooks/useDropdownDismiss.ts` に存在する
- [ ] キーボードナビゲーションが `items` モードでも動作する（Arrow/Escape/Home/End）
- [ ] 既存の `ContextMenu.test.tsx` が全パスする

---

#### Phase 3: LayersPanel コア改善

**目的:** 検索フィルター・セクション区切り・削除ボタン・Cmd/Ctrl+マルチセレクトを追加する。

**ファイル変更:**

- `src/components/sidebar/LayersPanel.tsx` — 大幅リファクタリング
- `src/store/uiSlice.ts` — `layerSearchQuery` 追加（検索クエリの永続化）

**実装詳細:**

```tsx
// LayersPanel.tsx の新構造
const EMPTY_GROUPS: LayerGroup[] = []  // ← module scope（?? [] の参照不安定問題を回避）

export function LayersPanel() {
  // 検索クエリはuiSliceに保存して tab remount 後も維持
  const layerSearchQuery = useStore(s => s.layerSearchQuery)
  const setLayerSearchQuery = useStore(s => s.setLayerSearchQuery)
  const [lastClickedId, setLastClickedId] = useState<string | null>(null)
  
  const activePage = useStore(selectActivePage)
  const selectedIds = useStore(s => s.selection.selectedElementIds, useShallow)
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])
  
  // セクション直接読み込み（flattenPageElements は使わない）
  const sections = activePage?.sections ?? EMPTY_SECTIONS
  
  // 検索フィルター — String.includes() を使う（RegExpはReDoS危険）
  const filteredSections = useMemo(() => {
    if (!layerSearchQuery) return sections
    const q = layerSearchQuery.toLowerCase()
    return sections.map(section => ({
      ...section,
      elements: section.elements.filter(el =>
        (el.name ?? el.type).toLowerCase().includes(q) ||
        el.type.toLowerCase().includes(q)
      )
    })).filter(s => s.elements.length > 0)
  }, [sections, layerSearchQuery])
  
  const handleRowClick = (elementId: string, e: React.MouseEvent) => {
    const isMulti = e.metaKey || e.ctrlKey
    selectElement(elementId, isMulti)
    setLastClickedId(elementId)
  }
  
  return (
    <div>
      <input
        placeholder="検索..."
        value={layerSearchQuery}
        onChange={e => setLayerSearchQuery(e.target.value)}
        aria-label="レイヤーを検索"
        maxLength={100}  // ReDoS防止
      />
      {filteredSections.map(section => (
        <SectionGroup key={section.id} section={section} ... />
      ))}
    </div>
  )
}
```

**セクション区切りの表示:**

```tsx
// セクションラベルのマッピング（sectionLabel関数ではなくインライン定数）
const SECTION_LABELS: Record<string, string> = {
  header: 'ヘッダー',
  body: 'ボディ',
  footer: 'フッター',
}
```

**受け入れ基準:**
- [ ] 検索ボックスで要素名・タイプ名をフィルタリングできる
- [ ] 検索クエリは `uiSlice.layerSearchQuery` に保存され、panel remount後も維持される
- [ ] `String.includes()` を使用（`new RegExp()` 不使用）
- [ ] `maxLength={100}` が検索inputにある
- [ ] セクション（ヘッダー/ボディ/フッター）の境界が視覚的に分かれている
- [ ] 各レイヤー行にゴミ箱アイコン → クリックで要素削除
- [ ] Cmd/Ctrl+クリックで複数選択できる（既存 `selectElement(id, multi=true)` 使用）
- [ ] `selectedIdSet`（`useMemo`済みのSet）で O(1) 選択状態チェック
- [ ] 複数選択時に一括「表示/非表示」「ロック/解除」ボタンが表示される

---

#### Phase 4: ドラッグ＆ドロップ並び替え

**目的:** `@dnd-kit/sortable` を使い、LayersPanel内でドラッグ&ドロップで zIndex を変更できるようにする。

**ファイル変更:**

- `src/components/sidebar/LayersPanel.tsx` — DndContext + SortableContext 追加
- `src/components/sidebar/SortableLayerRow.tsx` — 新規作成

**センサー設定（ベストプラクティス適用）:**

```tsx
// PointerSensor + KeyboardSensor の組み合わせ（アクセシビリティ必須）
import {
  DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter, DragOverlay
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  sortableKeyboardCoordinates, useSortable, arrayMove
} from '@dnd-kit/sortable'

const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,  // クリックをDnDと区別するための移動距離
    },
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,  // ↑↓キーでソート可能
  }),
)
```

**DragOverlay（パフォーマンス上必須）:**

DragOverlay を使うことでドラッグ中の再レンダリングをポータル内のオーバーレイのみに限定し、リスト全体の再描画を回避する。

```tsx
// Strategy A: セクションごとに独立したDndContext（外側のラッパーは不要）
// activeId と DragOverlay は各セクションのコンテキスト内に閉じ込める
function SectionDndContainer({ section, pageId, sensors, announcements }) {
  const [activeId, setActiveId] = useState<string | null>(null)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragEnd={(e) => {
        handleSectionDragEnd(e, section.id, pageId)
        setActiveId(null)
      }}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ announcements }}
    >
      <SortableContext
        items={section.elements.map(e => e.id)}
        strategy={verticalListSortingStrategy}
      >
        {section.elements.map(el => (
          <SortableLayerRow key={el.id} element={el} isDraggingActive={activeId !== null} ... />
        ))}
      </SortableContext>
      <DragOverlay>
        {activeId ? <LayerRowGhost elementId={activeId} /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function LayerPanel() {
  return (
    <>
      {sections.map(section => (
        <SectionDndContainer
          key={section.id}
          section={section}
          pageId={pageId}
          sensors={sensors}
          announcements={announcements}
        />
      ))}
    </>
  )
}
```

**アクセシビリティアナウンス（必須）:**

```tsx
const announcements: Announcements = {
  onDragStart({ active }) {
    return `レイヤー「${getLayerLabel(active.id)}」を選択しました。`
  },
  onDragOver({ active, over }) {
    if (over) return `「${getLayerLabel(active.id)}」が「${getLayerLabel(over.id)}」の上にあります。`
    return `「${getLayerLabel(active.id)}」はドロップ可能エリアの外にあります。`
  },
  onDragEnd({ active, over }) {
    if (over) return `「${getLayerLabel(active.id)}」を「${getLayerLabel(over.id)}」の位置にドロップしました。`
    return `「${getLayerLabel(active.id)}」を元の位置に戻しました。`
  },
  onDragCancel({ active }) {
    return `並び替えをキャンセルしました。「${getLayerLabel(active.id)}」を元の位置に戻しました。`
  },
}
```

**SortableLayerRow（React.memo必須）:**

```tsx
// SortableLayerRow.tsx (新規) — React.memo でラップして DnD中の再レンダリング抑制
export const SortableLayerRow = React.memo(function SortableLayerRow({ element, isDraggingActive, ... }) {
  // isDraggingActive は親の SectionDndContainer から prop で受け取る（外部DndContext不要）
  
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging
  } = useSortable({
    id: element.id,
    resizeObserverConfig: { disabled: isDraggingActive },  // ドラッグ中はObserver停止
  })
  
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      {/* ドラッグハンドル — キーボードフォーカス可能 */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`ドラッグして並び替え: ${element.name ?? element.type}`}
        tabIndex={0}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
      {/* 要素情報 */}
      ...
    </div>
  )
})
```

**受け入れ基準:**
- [ ] ドラッグハンドルをドラッグで zIndex 順が変わる
- [ ] 別セクションへのドラッグはキャンセルされる（セクションごとに独立した DndContext）
- [ ] 上下ボタン（ChevronUp/Down）は削除される
- [ ] ドラッグ完了後のみ `pushHistory()`（ドラッグ中は呼ばない）
- [ ] 検索フィルター中はDnD無効
- [ ] スクリーンリーダー対応: 日本語アナウンスが流れる
- [ ] キーボード（↑↓キー）でも並び替え可能
- [ ] `resizeObserverConfig.disabled` でドラッグ中のObserverを停止

---

#### Phase 5: グループレイヤー機能

**目的:** フォルダ型グループで複数要素を表示管理でまとめ、一括表示/ロックを実現する。

**ファイル変更:**

- `src/components/sidebar/LayerGroupRow.tsx` — 新規作成
- `src/components/sidebar/LayersPanel.tsx` — グループ行レンダリング追加
- `src/components/canvas/SectionContainer.tsx` — `resolveVisible/resolveLocked` 適用

**グループ行の表示:**

```tsx
// LayerGroupRow.tsx (新規)
export const LayerGroupRow = React.memo(function LayerGroupRow({
  group, onToggleCollapse, onContextMenu, selectedIds
}: LayerGroupRowProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  
  return (
    <div role="treeitem" aria-expanded={!group.collapsed}>
      <button onClick={onToggleCollapse} aria-label="グループの折りたたみを切り替え">
        {group.collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      <Folder className="w-3.5 h-3.5 text-muted-foreground" />
      {isRenaming ? (
        <input
          autoFocus
          defaultValue={group.name}
          onBlur={(e) => { updateGroupName(e.target.value.trim() || group.name); setIsRenaming(false) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setIsRenaming(false) }
          }}
        />
      ) : (
        <span onDoubleClick={() => setIsRenaming(true)}>{group.name}</span>
      )}
      <button
        role="button"
        aria-pressed={!group.visible}  // ← aria-pressed（aria-selected ではない）
        onClick={() => updateLayerGroup(pageId, group.id, { visible: !group.visible })}
      >
        {group.visible ? <Eye /> : <EyeOff />}
      </button>
      <button
        role="button"
        aria-pressed={group.locked}
        onClick={() => updateLayerGroup(pageId, group.id, { locked: !group.locked })}
      >
        {group.locked ? <Lock /> : <Unlock />}
      </button>
    </div>
  )
})
```

**SectionContainer での resolveVisible/resolveLocked 適用:**

```tsx
// SectionContainer.tsx の修正（groupUtils.ts を使用）
import { buildGroupMap, resolveVisible, resolveLocked } from '../../lib/groupUtils'

const EMPTY_GROUPS: LayerGroup[] = []  // モジュールスコープの安定した参照

const pageGroups = useStore(s => {
  const page = s.definition.pages.find(p => p.id === pageId)
  return page?.groups ?? EMPTY_GROUPS
})

const groupMap = useMemo(() => buildGroupMap(pageGroups), [pageGroups])

// 既存の sortedElements の render で:
// element.visible → resolveVisible(element, groupMap)
// element.locked  → resolveLocked(element, groupMap)
```

**受け入れ基準:**
- [ ] LayersPanelにグループ行が表示される（フォルダアイコン + 折りたたみ可）
- [ ] グループの表示/非表示でグループ内要素が一括で見えなくなる（要素個別フラグは変えない）
- [ ] グループのロックでグループ内要素が一括ロックされる
- [ ] グループを折りたたむと配下の要素行が非表示になる
- [ ] ダブルクリックでグループ名を変更できる（空文字は元の名前に戻す）
- [ ] グループがsave/load後も保持される（`PageDef.groups` に保存）
- [ ] undo後にグループ状態が正しく復元される（`layoutSlice`管理）
- [ ] `resolveVisible/resolveLocked` が `groupUtils.ts` の O(1) Map-based実装を使っている
- [ ] `EMPTY_GROUPS` がモジュールスコープ定数であり、`?? []` を使っていない

---

#### Phase 6: LayersPanel 右クリックコンテキストメニュー + ⌘G

**目的:** LayersPanelに右クリックメニューを追加し、グループ操作・要素操作をメニューから実行できるようにする。

**ファイル変更:**

- `src/components/sidebar/LayersPanel.tsx` — 右クリックイベント追加、メニュー状態管理
- `src/components/canvas/ReportCanvas.tsx` — ⌘G ショートカット追加

**要素行の右クリックメニュー（discriminated union使用）:**

```typescript
const elementContextMenuItems = (el: ReportElement): ContextMenuItemDef[] => [
  { kind: 'action', icon: <Copy />, label: 'コピー',     shortcut: '⌘C', onClick: () => copy(el.id) },
  { kind: 'action', icon: <Scissors />, label: 'カット', shortcut: '⌘X', onClick: () => cut(el.id) },
  { kind: 'action', icon: <Clipboard />, label: 'ペースト', shortcut: '⌘V', onClick: paste, disabled: !hasClipboard },
  { kind: 'action', icon: <CopyPlus />, label: '複製',   shortcut: '⌘D', onClick: () => duplicate(el.id) },
  { kind: 'action', icon: <Pencil />, label: '名前変更', shortcut: 'F2', onClick: () => startRename(el.id) },
  { kind: 'separator' },
  { kind: 'action', icon: <Folder />, label: 'グループ化', shortcut: '⌘G',
    onClick: groupSelected, disabled: selectedIds.length < 2 },
  ...(isInGroup(el.id) ? [
    { kind: 'action' as const, icon: <FolderMinus />, label: 'グループから外す',
      onClick: () => leaveGroup(el.id) }
  ] : []),
  { kind: 'separator' },
  { kind: 'action', icon: <BringToFront />, label: '最前面へ', onClick: () => setZOrder(el.id, 'front') },
  { kind: 'action', icon: <ArrowUpToLine />, label: '前面へ',  onClick: () => setZOrder(el.id, 'forward') },
  { kind: 'action', icon: <ArrowDownToLine />, label: '背面へ', onClick: () => setZOrder(el.id, 'backward') },
  { kind: 'action', icon: <SendToBack />, label: '最背面へ',   onClick: () => setZOrder(el.id, 'back') },
  { kind: 'separator' },
  { kind: 'action', icon: el.visible ? <EyeOff /> : <Eye />,
    label: el.visible ? '非表示' : '表示', onClick: () => toggleVisible(el.id) },
  { kind: 'action', icon: el.locked ? <Unlock /> : <Lock />,
    label: el.locked ? 'ロック解除' : 'ロック', onClick: () => toggleLock(el.id) },
  { kind: 'separator' },
  { kind: 'action', icon: <Trash2 />, label: '削除', shortcut: '⌫',
    onClick: () => removeElement(pageId, el.id), className: 'text-destructive' },
]
```

**⌘G ショートカット — テキスト入力フォーカス中は無視:**

```typescript
// ReportCanvas.tsx の useEffect
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // テキスト入力中はショートカットを無視（rename input など）
    const target = e.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) return
    
    if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
      e.preventDefault()
      groupSelectedElements()
    }
  }
  document.addEventListener('keydown', handleKeyDown)
  return () => document.removeEventListener('keydown', handleKeyDown)
}, [groupSelectedElements])
```

**グループ削除 — stale ID 問題の修正:**

```tsx
// 削除確認ダイアログ — elementIDをrefで管理して stale closure を防ぐ
const pendingDeleteGroupId = useRef<string | null>(null)

// 右クリックメニュー「グループを削除」:
onClick: () => {
  pendingDeleteGroupId.current = group.id
  setDeleteGroupDialogOpen(true)
  closeContextMenu()  // ← メニューを即座に閉じる（stale ID問題防止）
}

// ダイアログ確認:
onConfirm={(deleteElements) => {
  if (!pendingDeleteGroupId.current) return
  if (deleteElements) {
    removeElements(pageId, getGroupElements(pendingDeleteGroupId.current))
  }
  removeLayerGroup(pageId, pendingDeleteGroupId.current)
  pendingDeleteGroupId.current = null
  setDeleteGroupDialogOpen(false)
}}
```

**受け入れ基準:**
- [ ] 要素行を右クリックでコンテキストメニューが表示される
- [ ] グループ行を右クリックでグループ用コンテキストメニューが表示される
- [ ] グループ化は複数選択時のみ有効（1要素選択時はdisabled）
- [ ] 「グループから外す」はグループ内要素の場合のみ表示される
- [ ] ⌘G でキャンバス・LayersPanel両方からグループ化できる
- [ ] ⌘G はテキスト入力フォーカス中には発火しない
- [ ] F2でリネームモードに入れる
- [ ] コンテキストメニューのキーボードナビゲーションが動作する
- [ ] グループ削除時の確認ダイアログが表示される
- [ ] 確認ダイアログは `pendingDeleteGroupId` ref でstale ID問題を回避している

---

## System-Wide Impact

### Interaction Graph

```
LayersPanel (DnD onDragEnd)
  → store.reorderElements(pageId, sectionId, orderedIds)
    → page全体のzIndexを再採番（setZOrderのreassignロジックを再利用）
    → pushHistory() ← set()の外から呼ぶ
      → history[]に新スナップショット追加

LayersPanel (グループのvisible変更)
  → store.updateLayerGroup(pageId, groupId, { visible: false })
    → page.groups[i].visible を更新（history対象、pushHistory呼び出し）
      → SectionContainer が resolveVisible(el, groupMap) を再計算
        → CanvasElement が再レンダリング
        → undo後は groups.visible も definition から復元される（split-brain解消）

要素削除
  → store.removeElement(pageId, elementId) または removeElements(pageId, ids)
    → section.elements からフィルタ
    → page.groups の elementIds からもクリーンアップ（孤立ID防止）
    → 空になったグループは自動削除
```

### State Lifecycle Risks

| リスク | 対策 |
|------|------|
| グループが参照する elementId が削除された場合 | `removeElement`/`removeElements` 実行時に `page.groups` の elementIds もクリーンアップ |
| ページが削除された場合 | `PageDef` ごと削除されるため自動的にクリーンアップ |
| DnD ドロップが中断された場合 | `onDragCancel` で `activeId` を null に、`reorderElements` を呼ばない |
| グループのvisible変更後のundo | `page.groups` が `definition` に含まれるため、undo でグループvisibleも復元される |
| `?? []` による参照不安定 | モジュールスコープの `EMPTY_GROUPS: LayerGroup[]` 定数を使用 |

### Integration Test Scenarios

1. 要素をドラッグで並び替え → undo → 元の順序に戻ることを確認
2. グループ作成 → `group.visible=false` → キャンバスで非表示 → undo → グループが復元されてvisible=true に戻る
3. 要素を削除 → グループの `elementIds` に残骸IDが残らないことを確認
4. 検索でフィルター中にDnDを試みる → DnDが無効であることを確認
5. ⌘G でグループ化 → ContextMenu「グループから外す」 → グループが空になったら自動削除
6. save → load → グループ構造が保持されていることを確認（`PageDef.groups`）

---

## Acceptance Criteria

### Functional

- [ ] LayersPanelのドラッグ&ドロップで要素の重なり順を変更できる
- [ ] 検索ボックスで要素名/タイプ名をフィルタリングできる（`String.includes()` 使用）
- [ ] セクション区切り（ヘッダー/ボディ/フッター）がパネル上に表示される
- [ ] グループを作成し、要素をグループに追加/削除できる
- [ ] グループのvisible/lockedがグループ内要素に一括適用される（個別フラグは変えない）
- [ ] グループがsave/load後も保持される
- [ ] Cmd/Ctrl+クリックで複数選択 → 一括visible/locked操作ができる
- [ ] LayersPanelの各行にゴミ箱アイコンで削除できる
- [ ] 要素行・グループ行に右クリックメニューが表示される
- [ ] ⌘G でキャンバス・LayersPanelどちらからでもグループ化できる（テキスト入力中は無視）

### Non-Functional

- [ ] 100要素以上でもDnDが滑らかに動作する（`React.memo` + `DragOverlay` + `resizeObserverConfig.disabled`）
- [ ] `layerGroups` の購読が `EMPTY_GROUPS` 定数で参照安定している
- [ ] `resolveVisible/resolveLocked` が O(1) Map-based（O(n*m) ではない）
- [ ] キーボードのみでコンテキストメニューを操作できる（Arrow/Escape/Enter）
- [ ] スクリーンリーダー対応: DnDアナウンス・`role="menu"`/`role="menuitem"`/`aria-expanded`/`aria-pressed`
- [ ] 既存テストが全パス

### Quality Gates

- [ ] `groupUtils.ts` のユニットテスト（`buildGroupMap`, `resolveVisible`, `resolveLocked`）
- [ ] `ContextMenu.test.tsx` に `items` discriminated union モードのテスト追加
- [ ] `LayersPanel` の検索フィルターテスト（特殊文字を含む検索クエリ）
- [ ] `reorderElements` のテスト（cross-section zIndex 一貫性確認）
- [ ] `removeElements` のテスト（グループの elementIds クリーンアップ確認）
- [ ] グループ save/load ラウンドトリップテスト

---

## Dependencies & Prerequisites

| 依存 | 状態 |
|-----|------|
| `@dnd-kit/sortable` | ✅ インストール済み (`^10.0.0`)、未使用 |
| `@dnd-kit/core` | ✅ 既に使用中（キャンバスDnD） |
| Store分割（layoutSlice） | ✅ groups は layoutSlice に統合 |
| ContextMenu コンポーネント | ✅ 既存、Phase 2で拡張 |
| `src/lib/migration.ts` | ✅ 既存、`groups: []` 初期化を追加 |

---

## Risk Analysis

| リスク | 影響 | 対策 |
|------|------|------|
| `layoutSlice.ts` が591行と大きい | 中 | groups CRUD を末尾に追加するだけ。`reorderElements` は既存 `setZOrder` の `reassign` ロジックを再利用 |
| SectionContainer.tsx の変更 | 中 | `groupUtils.ts` の純粋関数に委譲。`useMemo` で Map を構築 |
| ContextMenu の Props 変更 | 中 | discriminated union への移行は一回限り。既存テストを全維持 |
| DnD と キャンバスDnD の干渉 | 低 | セクションごとに独立した `DndContext`（Strategy A） |
| migration で既存 groups フィールドなし | 低 | `groups` は `optional`、`migration.ts` で `groups: []` を付与 |

---

## Sources & References

### Origin Brainstorms

- **LayersPanel改善:** [docs/brainstorms/2026-04-06-layers-panel-improvements-brainstorm.md](../brainstorms/2026-04-06-layers-panel-improvements-brainstorm.md)
- **右クリックメニュー:** [docs/brainstorms/2026-04-06-context-menu-layer-operations-brainstorm.md](../brainstorms/2026-04-06-context-menu-layer-operations-brainstorm.md)

### Internal References

- LayersPanel: `src/components/sidebar/LayersPanel.tsx` (212行)
- ContextMenu: `src/components/canvas/ContextMenu.tsx` (200行)
- Z-order ロジック（reassign参照）: `src/store/layoutSlice.ts:555-589`
- Multi-select ロジック: `src/store/layoutSlice.ts:390-409`
- DnD使用例（センサー・モディファイアー）: `src/components/canvas/ReportCanvas.tsx:68-89`
- SectionContainer: `src/components/canvas/SectionContainer.tsx`
- Migration: `src/lib/migration.ts`

### Research Findings

- **@dnd-kit ベストプラクティス:** PointerSensor+KeyboardSensor、DragOverlay必須、closestCenter+verticalListSortingStrategy、セクションごと独立DndContext
- **パフォーマンス:** `React.memo` + `DragOverlay` + `resizeObserverConfig.disabled` + `EMPTY_GROUPS`定数
- **セキュリティ:** `String.includes()` 使用（ReDoS回避）、`maxLength={100}`
- **アクセシビリティ:** 日本語アナウンス、`aria-pressed`（toggleボタン）、`aria-expanded`（グループ）

### Learnings Applied

- `docs/solutions/performance-issues/react-canvas-rerender-optimization.md` — React.memo + useShallow + EMPTY定数パターン
- `docs/solutions/ui-bugs/accessibility-aria-keyboard-navigation.md` — role="menu" + 自動フォーカスパターン
- `docs/solutions/logic-errors/runtime-errors-aggregation-store-type-safety.md` — `assertNever` / `ALLOWED_KEYS_BY_TYPE` 拡張
- `docs/solutions/logic-errors/component-quality-code-cleanup.md` — `useDropdownDismiss` hook パターン / `key={element.id}` / O(1) Set
- `docs/solutions/ui-bugs/sidebar-panel-ux-master-hf-localization.md` — 検索クエリを uiSlice に保存して永続化
