import { Eye, EyeOff, Lock, Unlock, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReportElement } from '@/types'
import { elementIcon, defaultName } from './layerUtils'

export interface LayerRowProps {
  el: ReportElement
  pageId: string
  isSelected: boolean
  isRenaming: boolean
  renameValue: string
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

export function LayerRow({
  el,
  pageId,
  isSelected,
  isRenaming,
  renameValue,
  onRowClick,
  onStartRename,
  onCommitRename,
  onRenameChange,
  onCancelRename,
  onToggleVisible,
  onToggleLock,
  onDelete,
  onContextMenu,
}: LayerRowProps) {
  return (
    <div
      onContextMenu={onContextMenu}
      className={cn(
        'flex flex-1 items-center gap-1.5 px-1.5 py-1 rounded text-xs cursor-pointer group min-w-0',
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'hover:bg-accent text-foreground',
      )}
      onClick={(e) => onRowClick(el.id, e)}
    >
      {/* Icon */}
      <span className="text-muted-foreground shrink-0">{elementIcon(el.type)}</span>

      {/* Name / rename input */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            className="w-full bg-background border rounded px-1 py-0.5 text-xs outline-none"
            value={renameValue}
            maxLength={200}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={() => onCommitRename(el, pageId)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') onCommitRename(el, pageId)
              if (e.key === 'Escape') onCancelRename()
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="block truncate"
            onDoubleClick={(e) => { e.stopPropagation(); onStartRename(el) }}
            title="ダブルクリックでリネーム"
          >
            {defaultName(el)}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className={cn(
        'flex items-center gap-0.5 shrink-0',
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}>
        <button
          title={el.visible ? '非表示にする' : '表示する'}
          className="p-0.5 rounded hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
        >
          {el.visible
            ? <Eye className="w-3 h-3" />
            : <EyeOff className="w-3 h-3 text-muted-foreground" />
          }
        </button>
        <button
          title={el.locked ? 'ロック解除' : 'ロック'}
          className="p-0.5 rounded hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); onToggleLock() }}
        >
          {el.locked
            ? <Lock className="w-3 h-3 text-amber-500" />
            : <Unlock className="w-3 h-3" />
          }
        </button>
        <button
          title="削除"
          className="p-0.5 rounded hover:bg-accent text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete() }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
