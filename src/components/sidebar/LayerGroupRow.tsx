import React, { useState } from 'react'
import { ChevronRight, ChevronDown, Folder, Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LayerGroup } from '@/types'

interface LayerGroupRowProps {
  group: LayerGroup
  isAnyMemberSelected: boolean
  onToggleCollapse: () => void
  onToggleVisible: () => void
  onToggleLock: () => void
  onRename: (name: string) => void
  onContextMenu: (e: React.MouseEvent) => void
}

export const LayerGroupRow = React.memo(function LayerGroupRow({
  group,
  isAnyMemberSelected,
  onToggleCollapse,
  onToggleVisible,
  onToggleLock,
  onRename,
  onContextMenu,
}: LayerGroupRowProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  const startRename = () => {
    setRenameValue(group.name)
    setIsRenaming(true)
  }

  const commitRename = () => {
    onRename(renameValue.trim() || group.name)
    setIsRenaming(false)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 px-1 py-1 rounded text-xs group',
        isAnyMemberSelected ? 'bg-primary/5' : 'hover:bg-accent/50',
      )}
      onContextMenu={onContextMenu}
    >
      {/* Collapse toggle */}
      <button
        aria-label={group.collapsed ? 'グループを展開' : 'グループを折りたたむ'}
        className="p-0.5 rounded hover:bg-accent shrink-0 text-muted-foreground"
        onClick={onToggleCollapse}
      >
        {group.collapsed
          ? <ChevronRight className="w-3 h-3" />
          : <ChevronDown className="w-3 h-3" />
        }
      </button>

      {/* Folder icon */}
      <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />

      {/* Group name / rename input */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            autoFocus
            className="w-full bg-background border rounded px-1 py-0.5 text-xs outline-none"
            value={renameValue}
            maxLength={200}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsRenaming(false)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="block truncate font-medium cursor-default"
            onDoubleClick={(e) => { e.stopPropagation(); startRename() }}
            title="ダブルクリックでリネーム"
          >
            {group.name}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className={cn(
        'flex items-center gap-0.5 shrink-0',
        'opacity-0 group-hover:opacity-100',
      )}>
        <button
          title={group.visible ? 'グループを非表示' : 'グループを表示'}
          aria-pressed={!group.visible}
          className="p-0.5 rounded hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); onToggleVisible() }}
        >
          {group.visible
            ? <Eye className="w-3 h-3" />
            : <EyeOff className="w-3 h-3 text-muted-foreground" />
          }
        </button>
        <button
          title={group.locked ? 'グループのロックを解除' : 'グループをロック'}
          aria-pressed={group.locked}
          className="p-0.5 rounded hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); onToggleLock() }}
        >
          {group.locked
            ? <Lock className="w-3 h-3 text-amber-500" />
            : <Unlock className="w-3 h-3" />
          }
        </button>
      </div>
    </div>
  )
})
