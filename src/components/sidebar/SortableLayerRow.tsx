import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { ReportElement } from '@/types'
import { LayerRow } from './LayerRow'

interface SortableLayerRowProps {
  el: ReportElement
  pageId: string
  isSelected: boolean
  isRenaming: boolean
  renameValue: string
  isDraggingActive: boolean
  onRowClick: (id: string, e: React.MouseEvent) => void
  onStartRename: (el: ReportElement) => void
  onCommitRename: (el: ReportElement, pageId: string) => void
  onRenameChange: (value: string) => void
  onCancelRename: () => void
  onToggleVisible: () => void
  onToggleLock: () => void
  onDelete: () => void
  onContextMenu?: (e: React.MouseEvent) => void
}

export const SortableLayerRow = React.memo(function SortableLayerRow({
  el,
  isDraggingActive,
  ...rowProps
}: SortableLayerRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: el.id,
    resizeObserverConfig: { disabled: isDraggingActive },
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-center"
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`ドラッグして並び替え: ${el.name ?? el.type}`}
        className="p-0.5 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        tabIndex={0}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <LayerRow el={el} {...rowProps} />
    </div>
  )
})
