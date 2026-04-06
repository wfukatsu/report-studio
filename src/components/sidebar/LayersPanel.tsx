import { useState, useMemo, useCallback, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import {
  Eye, EyeOff, Lock, Unlock, Search, FolderPlus, Plus,
  Copy, Scissors, Clipboard, CopyPlus, Pencil,
  Folder, FolderMinus, BringToFront, ArrowUpToLine, ArrowDownToLine, SendToBack,
  Trash2,
} from 'lucide-react'
import { ContextMenu, type ContextMenuItemDef } from '@/components/canvas/ContextMenu'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  DragOverlay,
  type Announcements,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { useReportStore, selectActivePage } from '@/store/reportStore'
import { useShallow } from 'zustand/shallow'
import type { ReportElement, Section, LayerGroup } from '@/types'
import { buildGroupMap } from '@/lib/groupUtils'
import { SortableLayerRow } from './SortableLayerRow'
import { LayerRow } from './LayerRow'
import { LayerGroupRow } from './LayerGroupRow'
import { defaultName, sectionLabel } from './layerUtils'
import { PALETTE_CATEGORIES } from './ElementPalette'
import { useDropdownDismiss } from '@/hooks/useDropdownDismiss'

// ---------------------------------------------------------------------------
// Stable empty references to avoid ?? [] reference churn
// ---------------------------------------------------------------------------

const EMPTY_SECTIONS: Section[] = []
const EMPTY_GROUPS: LayerGroup[] = []

// ---------------------------------------------------------------------------
// LayersPanel
// ---------------------------------------------------------------------------

export function LayersPanel() {
  const activePage = useReportStore(selectActivePage)
  const selectedIds = useReportStore(useShallow((s) => s.selection.selectedElementIds))
  const selectElement = useReportStore((s) => s.selectElement)
  const updateElement = useReportStore((s) => s.updateElement)
  const updateElements = useReportStore((s) => s.updateElements)
  const removeElement = useReportStore((s) => s.removeElement)
  const reorderElements = useReportStore((s) => s.reorderElements)
  const addLayerGroup = useReportStore((s) => s.addLayerGroup)
  const removeLayerGroup = useReportStore((s) => s.removeLayerGroup)
  const updateLayerGroup = useReportStore((s) => s.updateLayerGroup)
  const groupSelectedElements = useReportStore((s) => s.groupSelectedElements)
  const leaveGroup = useReportStore((s) => s.leaveGroup)
  const copyElements = useReportStore((s) => s.copyElements)
  const cutElements = useReportStore((s) => s.cutElements)
  const pasteElements = useReportStore((s) => s.pasteElements)
  const duplicateElement = useReportStore((s) => s.duplicateElement)
  const setZOrder = useReportStore((s) => s.setZOrder)
  const clipboard = useReportStore((s) => s.clipboard)
  const layerSearchQuery = useReportStore((s) => s.layerSearchQuery)
  const setLayerSearchQuery = useReportStore((s) => s.setLayerSearchQuery)
  const addElement = useReportStore((s) => s.addElement)
  const pageGroups = useReportStore((s) => {
    const page = s.definition.pages.find((p) => p.id === s.selection.activePageId)
    return page?.groups ?? EMPTY_GROUPS
  })

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Add-element dropdown state
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const [addMenuPos, setAddMenuPos] = useState<{ top: number; left: number; width: number } | null>(null)
  useDropdownDismiss(addMenuRef, addMenuOpen, () => setAddMenuOpen(false))

  // Add a new element to the body section (or first section) of the active page
  const handleAddElement = useCallback((createElement: () => ReportElement) => {
    if (!activePage) return
    const el = createElement()
    const bodySection = activePage.sections.find((s) => s.sectionType === 'body')
      ?? activePage.sections[0]
    if (!bodySection) return
    // Place near center of page
    const centerX = Math.max(5, (activePage.width - el.size.width) / 2)
    const centerY = Math.max(5, activePage.height / 3)
    addElement(activePage.id, { ...el, position: { x: centerX, y: centerY } })
    setAddMenuOpen(false)
  }, [activePage, addElement])

  // Context menu state
  type LayerMenuState = { x: number; y: number; kind: 'element'; elementId: string } | { x: number; y: number; kind: 'group'; groupId: string }
  const [layerMenu, setLayerMenu] = useState<LayerMenuState | null>(null)
  const sections = activePage?.sections ?? EMPTY_SECTIONS
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds])

  // Search filter — String.includes() to avoid ReDoS from user-controlled input
  const displaySections = useMemo(() => {
    const q = layerSearchQuery.toLowerCase()
    return sections.map((section) => ({
      ...section,
      elements: [...section.elements]
        .sort((a, b) => b.zIndex - a.zIndex)
        .filter((el) =>
          !q ||
          defaultName(el).toLowerCase().includes(q) ||
          el.type.toLowerCase().includes(q)
        ),
    })).filter((s) => !q || s.elements.length > 0)
  }, [sections, layerSearchQuery])

  const totalElements = useMemo(
    () => sections.reduce((sum, s) => sum + s.elements.length, 0),
    [sections],
  )

  const handleRowClick = useCallback((elementId: string, e: React.MouseEvent) => {
    selectElement(elementId, e.metaKey || e.ctrlKey || e.shiftKey)
  }, [selectElement])

  const startRename = useCallback((el: ReportElement) => {
    setRenamingId(el.id)
    setRenameValue(defaultName(el))
  }, [])

  const commitRename = useCallback((el: ReportElement, pageId: string) => {
    if (renameValue.trim()) {
      updateElement(pageId, el.id, { name: renameValue.trim() } as Partial<ReportElement>)
    }
    setRenamingId(null)
  }, [renameValue, updateElement])

  const bulkSetVisible = useCallback((visible: boolean) => {
    if (!activePage) return
    updateElements(activePage.id, selectedIds, { visible } as Partial<ReportElement>)
  }, [activePage, selectedIds, updateElements])

  const bulkSetLocked = useCallback((locked: boolean) => {
    if (!activePage) return
    updateElements(activePage.id, selectedIds, { locked } as Partial<ReportElement>)
  }, [activePage, selectedIds, updateElements])

  const groupMap = useMemo(() => buildGroupMap(pageGroups), [pageGroups])

  // pageId for use in callbacks below (may be undefined before activePage loads)
  const pageId = activePage?.id ?? ''

  // Build context menu items for an element row
  const buildElementMenuItems = useCallback((el: ReportElement): ContextMenuItemDef[] => [
    { kind: 'action', icon: <Copy className="w-3.5 h-3.5" />, label: 'コピー', shortcut: '⌘C',
      onClick: () => { copyElements(pageId, [el.id]) } },
    { kind: 'action', icon: <Scissors className="w-3.5 h-3.5" />, label: 'カット', shortcut: '⌘X',
      onClick: () => { cutElements(pageId, [el.id]) } },
    { kind: 'action', icon: <Clipboard className="w-3.5 h-3.5" />, label: 'ペースト', shortcut: '⌘V',
      onClick: () => pasteElements(pageId), disabled: !clipboard?.length },
    { kind: 'action', icon: <CopyPlus className="w-3.5 h-3.5" />, label: '複製', shortcut: '⌘D',
      onClick: () => duplicateElement(pageId, el.id) },
    { kind: 'action', icon: <Pencil className="w-3.5 h-3.5" />, label: '名前変更', shortcut: 'F2',
      onClick: () => { setRenamingId(el.id); setRenameValue(defaultName(el)) } },
    { kind: 'separator' },
    { kind: 'action', icon: <Folder className="w-3.5 h-3.5" />, label: 'グループ化', shortcut: '⌘G',
      onClick: () => groupSelectedElements(pageId), disabled: selectedIds.length < 2 },
    ...(groupMap.has(el.id) ? [{
      kind: 'action' as const, icon: <FolderMinus className="w-3.5 h-3.5" />, label: 'グループから外す',
      onClick: () => leaveGroup(pageId, el.id),
    }] : []),
    { kind: 'separator' },
    { kind: 'action', icon: <BringToFront className="w-3.5 h-3.5" />, label: '最前面へ',
      onClick: () => setZOrder(pageId, el.id, 'front') },
    { kind: 'action', icon: <ArrowUpToLine className="w-3.5 h-3.5" />, label: '前面へ',
      onClick: () => setZOrder(pageId, el.id, 'forward') },
    { kind: 'action', icon: <ArrowDownToLine className="w-3.5 h-3.5" />, label: '背面へ',
      onClick: () => setZOrder(pageId, el.id, 'backward') },
    { kind: 'action', icon: <SendToBack className="w-3.5 h-3.5" />, label: '最背面へ',
      onClick: () => setZOrder(pageId, el.id, 'back') },
    { kind: 'separator' },
    { kind: 'action', icon: el.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />,
      label: el.visible ? '非表示' : '表示',
      onClick: () => updateElement(pageId, el.id, { visible: !el.visible } as Partial<ReportElement>) },
    { kind: 'action', icon: el.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />,
      label: el.locked ? 'ロック解除' : 'ロック',
      onClick: () => updateElement(pageId, el.id, { locked: !el.locked } as Partial<ReportElement>) },
    { kind: 'separator' },
    { kind: 'action', icon: <Trash2 className="w-3.5 h-3.5" />, label: '削除', shortcut: '⌫',
      onClick: () => removeElement(pageId, el.id), className: 'text-destructive' },
  ], [pageId, selectedIds, clipboard, groupMap, copyElements, cutElements, pasteElements,
      duplicateElement, groupSelectedElements, leaveGroup, setZOrder, updateElement, removeElement])

  // Build context menu items for a group row
  const buildGroupMenuItems = useCallback((group: LayerGroup): ContextMenuItemDef[] => [
    { kind: 'action', icon: <FolderMinus className="w-3.5 h-3.5" />, label: 'グループ解散',
      onClick: () => removeLayerGroup(pageId, group.id) },
    { kind: 'separator' },
    { kind: 'action', icon: group.visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />,
      label: group.visible ? 'グループを非表示' : 'グループを表示',
      onClick: () => updateLayerGroup(pageId, group.id, { visible: !group.visible }) },
    { kind: 'action', icon: group.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />,
      label: group.locked ? 'グループのロックを解除' : 'グループをロック',
      onClick: () => updateLayerGroup(pageId, group.id, { locked: !group.locked }) },
    { kind: 'separator' },
    { kind: 'action', icon: <Trash2 className="w-3.5 h-3.5" />, label: 'グループを削除',
      onClick: () => removeLayerGroup(pageId, group.id), className: 'text-destructive' },
  ], [pageId, removeLayerGroup, updateLayerGroup])

  // Build ContextMenuState-compatible object for the shared ContextMenu component
  const contextMenuState = layerMenu ? { x: layerMenu.x, y: layerMenu.y, elementId: '', isLocked: false, isVisible: true } : null
  const contextMenuItems: ContextMenuItemDef[] | undefined = useMemo(() => {
    if (!layerMenu || !activePage) return undefined
    if (layerMenu.kind === 'element') {
      const el = activePage.sections.flatMap((s) => s.elements).find((e) => e.id === layerMenu.elementId)
      return el ? buildElementMenuItems(el) : undefined
    }
    const group = pageGroups.find((g) => g.id === layerMenu.groupId)
    return group ? buildGroupMenuItems(group) : undefined
  }, [layerMenu, activePage, pageGroups, buildElementMenuItems, buildGroupMenuItems])

  if (!activePage) {
    return <div className="p-4 text-xs text-muted-foreground">ページがありません</div>
  }

  return (
    <div className="flex flex-col h-full relative">
      {/* Search + new layer/group buttons */}
      <div className="p-2 border-b flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            className="w-full pl-7 pr-2 py-1 text-xs bg-muted/50 border rounded outline-none focus:ring-1 focus:ring-primary"
            placeholder="レイヤーを検索..."
            value={layerSearchQuery}
            onChange={(e) => setLayerSearchQuery(e.target.value)}
            aria-label="レイヤーを検索"
            maxLength={100}
          />
        </div>

        {/* Add new element dropdown */}
        <div className="shrink-0" ref={addMenuRef}>
          <button
            ref={addButtonRef}
            title="新規レイヤーを追加"
            aria-label="新規レイヤーを追加"
            aria-expanded={addMenuOpen}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (!addMenuOpen && addButtonRef.current) {
                const btnRect = addButtonRef.current.getBoundingClientRect()
                const sidebar = addButtonRef.current.closest('aside')
                const sidebarRect = sidebar?.getBoundingClientRect()
                setAddMenuPos({
                  top: btnRect.bottom + 4,
                  left: sidebarRect?.left ?? 0,
                  width: sidebarRect?.width ?? 208,
                })
              }
              setAddMenuOpen((v) => !v)
            }}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {addMenuOpen && addMenuPos && (
            <div
              style={{ position: 'fixed', top: addMenuPos.top, left: addMenuPos.left, width: addMenuPos.width, zIndex: 9999 }}
              className="bg-popover border rounded-md shadow-lg overflow-hidden"
            >
              <div className="max-h-72 overflow-y-auto py-1">
                {PALETTE_CATEGORIES.map((cat) => (
                  <div key={cat.category}>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {cat.label}
                    </div>
                    {cat.items.map((item) => (
                      <button
                        key={item.label}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground text-left"
                        onClick={() => handleAddElement(item.createElement)}
                        title={item.description}
                      >
                        <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                        {item.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Add empty group */}
        <button
          title="空のグループを追加"
          aria-label="空のグループを追加"
          className="shrink-0 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          onClick={() => {
            if (!activePage) return
            addLayerGroup(activePage.id, {
              id: uuidv4(),
              name: 'グループ',
              elementIds: [],
              collapsed: false,
              visible: true,
              locked: false,
            })
          }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bulk toolbar */}
      {selectedIds.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1 border-b bg-primary/5 text-xs text-primary">
          <span className="flex-1">{selectedIds.length}個選択中</span>
          <button title="選択中を表示" className="p-0.5 rounded hover:bg-accent" onClick={() => bulkSetVisible(true)}>
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button title="選択中を非表示" className="p-0.5 rounded hover:bg-accent" onClick={() => bulkSetVisible(false)}>
            <EyeOff className="w-3.5 h-3.5" />
          </button>
          <button title="選択中をロック" className="p-0.5 rounded hover:bg-accent" onClick={() => bulkSetLocked(true)}>
            <Lock className="w-3.5 h-3.5" />
          </button>
          <button title="選択中のロック解除" className="p-0.5 rounded hover:bg-accent" onClick={() => bulkSetLocked(false)}>
            <Unlock className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Layer list by section */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {totalElements === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-4">
            要素がありません。<br />＋ボタンから追加してください。
          </p>
        )}
        {displaySections.map((section) => (
          <SectionDndContainer
            key={section.id}
            section={section}
            pageId={activePage.id}
            groups={pageGroups}
            renamingId={renamingId}
            selectedIdSet={selectedIdSet}
            renameValue={renameValue}
            onStartRename={startRename}
            onCommitRename={commitRename}
            onRenameChange={setRenameValue}
            onCancelRename={() => setRenamingId(null)}
            onToggleVisible={(el) =>
              updateElement(activePage.id, el.id, { visible: !el.visible } as Partial<ReportElement>)
            }
            onToggleLock={(el) =>
              updateElement(activePage.id, el.id, { locked: !el.locked } as Partial<ReportElement>)
            }
            onDelete={(el) => removeElement(activePage.id, el.id)}
            onReorder={(orderedIds) => reorderElements(activePage.id, section.id, orderedIds)}
            onRowClick={handleRowClick}
            onToggleGroupCollapse={(groupId) => {
              const g = pageGroups.find((g) => g.id === groupId)
              if (g) updateLayerGroup(activePage.id, groupId, { collapsed: !g.collapsed })
            }}
            onToggleGroupVisible={(groupId) => {
              const g = pageGroups.find((g) => g.id === groupId)
              if (g) updateLayerGroup(activePage.id, groupId, { visible: !g.visible })
            }}
            onToggleGroupLock={(groupId) => {
              const g = pageGroups.find((g) => g.id === groupId)
              if (g) updateLayerGroup(activePage.id, groupId, { locked: !g.locked })
            }}
            onRenameGroup={(groupId, name) => updateLayerGroup(activePage.id, groupId, { name })}
            onElementContextMenu={(elementId, e) => {
              e.preventDefault()
              setLayerMenu({ kind: 'element', elementId, x: e.clientX, y: e.clientY })
            }}
            onGroupContextMenu={(groupId, e) => {
              e.preventDefault()
              setLayerMenu({ kind: 'group', groupId, x: e.clientX, y: e.clientY })
            }}
          />
        ))}

        {layerSearchQuery && displaySections.length === 0 && (
          <div className="p-4 text-xs text-muted-foreground text-center">
            「{layerSearchQuery}」に一致する要素が見つかりません
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-2 py-1 border-t text-[10px] text-muted-foreground text-right">
        {totalElements}個の要素
      </div>

      {/* Context menu (shared ContextMenu component in items mode) */}
      <ContextMenu
        menu={contextMenuState}
        pageId={activePage.id}
        onClose={() => setLayerMenu(null)}
        items={contextMenuItems}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// SectionDndContainer — one DndContext per section (Strategy A)
// ---------------------------------------------------------------------------

interface SectionDndContainerProps {
  section: Section & { elements: ReportElement[] }
  pageId: string
  groups: LayerGroup[]
  renamingId: string | null
  selectedIdSet: Set<string>
  renameValue: string
  onStartRename: (el: ReportElement) => void
  onCommitRename: (el: ReportElement, pageId: string) => void
  onRenameChange: (value: string) => void
  onCancelRename: () => void
  onToggleVisible: (el: ReportElement) => void
  onToggleLock: (el: ReportElement) => void
  onDelete: (el: ReportElement) => void
  onReorder: (orderedIds: string[]) => void
  onRowClick: (id: string, e: React.MouseEvent) => void
  onToggleGroupCollapse: (groupId: string) => void
  onToggleGroupVisible: (groupId: string) => void
  onToggleGroupLock: (groupId: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onElementContextMenu: (elementId: string, e: React.MouseEvent) => void
  onGroupContextMenu: (groupId: string, e: React.MouseEvent) => void
}

function SectionDndContainer({
  section,
  pageId,
  groups,
  renamingId,
  selectedIdSet,
  renameValue,
  onStartRename,
  onCommitRename,
  onRenameChange,
  onCancelRename,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onReorder,
  onRowClick,
  onToggleGroupCollapse,
  onToggleGroupVisible,
  onToggleGroupLock,
  onRenameGroup,
  onElementContextMenu,
  onGroupContextMenu,
}: SectionDndContainerProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [localOrder, setLocalOrder] = useState<string[] | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const announcements: Announcements = {
    onDragStart({ active }) {
      const el = section.elements.find((e) => e.id === active.id)
      return `レイヤー「${el ? defaultName(el) : active.id}」を選択しました。`
    },
    onDragOver({ active, over }) {
      const activeEl = section.elements.find((e) => e.id === active.id)
      const overEl = section.elements.find((e) => e.id === over?.id)
      if (over && overEl) return `「${defaultName(activeEl!)}」が「${defaultName(overEl)}」の上にあります。`
      return `「${defaultName(activeEl!)}」はドロップ可能エリアの外にあります。`
    },
    onDragEnd({ active, over }) {
      const activeEl = section.elements.find((e) => e.id === active.id)
      const overEl = section.elements.find((e) => e.id === over?.id)
      if (over && overEl) return `「${defaultName(activeEl!)}」を「${defaultName(overEl)}」の位置にドロップしました。`
      return `「${defaultName(activeEl!)}」を元の位置に戻しました。`
    },
    onDragCancel({ active }) {
      const el = section.elements.find((e) => e.id === active.id)
      return `並び替えをキャンセルしました。「${el ? defaultName(el) : active.id}」を元の位置に戻しました。`
    },
  }

  // Use localOrder for optimistic UI during drag, fall back to store order
  const orderedElements = useMemo(() => {
    if (!localOrder) return section.elements
    return localOrder
      .map((id) => section.elements.find((e) => e.id === id))
      .filter((e): e is ReportElement => e !== undefined)
  }, [section.elements, localOrder])

  const activeEl = activeId ? section.elements.find((e) => e.id === activeId) : null

  // Groups that contain elements in this section
  const groupMap = useMemo(() => buildGroupMap(groups), [groups])

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-1 px-1 mb-1">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1">
          {sectionLabel(section.sectionType)}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        announcements={announcements}
        onDragStart={({ active }) => {
          setActiveId(String(active.id))
          setLocalOrder(section.elements.map((e) => e.id))
        }}
        onDragOver={({ active, over }) => {
          if (!over || active.id === over.id) return
          setLocalOrder((prev) => {
            const ids = prev ?? section.elements.map((e) => e.id)
            const oldIdx = ids.indexOf(String(active.id))
            const newIdx = ids.indexOf(String(over.id))
            if (oldIdx === -1 || newIdx === -1) return prev
            return arrayMove(ids, oldIdx, newIdx)
          })
        }}
        onDragEnd={({ active, over }) => {
          if (over && active.id !== over.id && localOrder) {
            onReorder(localOrder)
          }
          setActiveId(null)
          setLocalOrder(null)
        }}
        onDragCancel={() => {
          setActiveId(null)
          setLocalOrder(null)
        }}
      >
        <SortableContext
          items={orderedElements.map((e) => e.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5">
            {renderGroupedElements(
              orderedElements,
              groupMap,
              pageId,
              renamingId,
              renameValue,
              selectedIdSet,
              activeId,
              onRowClick,
              onStartRename,
              onCommitRename,
              onRenameChange,
              onCancelRename,
              onToggleVisible,
              onToggleLock,
              onDelete,
              onToggleGroupCollapse,
              onToggleGroupVisible,
              onToggleGroupLock,
              onRenameGroup,
              onElementContextMenu,
              onGroupContextMenu,
            )}
            {orderedElements.length === 0 && (
              <div className="px-1 py-1 text-xs text-muted-foreground italic">要素なし</div>
            )}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeEl ? (
            <div className="flex items-center shadow-lg rounded bg-popover border px-2 py-1 text-xs opacity-90">
              <LayerRow
                el={activeEl}
                pageId={pageId}
                isSelected={false}
                isRenaming={false}
                renameValue=""
                onRowClick={() => {}}
                onStartRename={() => {}}
                onCommitRename={() => {}}
                onRenameChange={() => {}}
                onCancelRename={() => {}}
                onToggleVisible={() => {}}
                onToggleLock={() => {}}
                onDelete={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grouped element rendering helper
// Renders elements in order, inserting group header rows before group members.
// ---------------------------------------------------------------------------

function renderGroupedElements(
  elements: ReportElement[],
  groupMap: Map<string, LayerGroup>,
  pageId: string,
  renamingId: string | null,
  renameValue: string,
  selectedIdSet: Set<string>,
  activeId: string | null,
  onRowClick: (id: string, e: React.MouseEvent) => void,
  onStartRename: (el: ReportElement) => void,
  onCommitRename: (el: ReportElement, pageId: string) => void,
  onRenameChange: (value: string) => void,
  onCancelRename: () => void,
  onToggleVisible: (el: ReportElement) => void,
  onToggleLock: (el: ReportElement) => void,
  onDelete: (el: ReportElement) => void,
  onToggleGroupCollapse: (groupId: string) => void,
  onToggleGroupVisible: (groupId: string) => void,
  onToggleGroupLock: (groupId: string) => void,
  onRenameGroup: (groupId: string, name: string) => void,
  onElementContextMenu: (elementId: string, e: React.MouseEvent) => void,
  onGroupContextMenu: (groupId: string, e: React.MouseEvent) => void,
): React.ReactNode[] {
  const rendered: React.ReactNode[] = []
  const renderedGroupIds = new Set<string>()

  for (const el of elements) {
    const group = groupMap.get(el.id)

    if (group) {
      // Render group header once, before its first member
      if (!renderedGroupIds.has(group.id)) {
        renderedGroupIds.add(group.id)
        const isAnyMemberSelected = group.elementIds.some((id) => selectedIdSet.has(id))
        rendered.push(
          <LayerGroupRow
            key={`group-${group.id}`}
            group={group}
            isAnyMemberSelected={isAnyMemberSelected}
            onToggleCollapse={() => onToggleGroupCollapse(group.id)}
            onToggleVisible={() => onToggleGroupVisible(group.id)}
            onToggleLock={() => onToggleGroupLock(group.id)}
            onRename={(name) => onRenameGroup(group.id, name)}
            onContextMenu={(e) => onGroupContextMenu(group.id, e)}
          />
        )
      }

      // Skip member elements when group is collapsed
      if (group.collapsed) continue
    }

    rendered.push(
      <SortableLayerRow
        key={el.id}
        el={el}
        pageId={pageId}
        isSelected={selectedIdSet.has(el.id)}
        isRenaming={renamingId === el.id}
        renameValue={renameValue}
        isDraggingActive={activeId !== null}
        onRowClick={onRowClick}
        onStartRename={onStartRename}
        onCommitRename={onCommitRename}
        onRenameChange={onRenameChange}
        onCancelRename={onCancelRename}
        onToggleVisible={() => onToggleVisible(el)}
        onToggleLock={() => onToggleLock(el)}
        onDelete={() => onDelete(el)}
        onContextMenu={(e) => onElementContextMenu(el.id, e)}
      />
    )
  }

  return rendered
}
