/**
 * Left panel for formula editing — two tabs: Fields and Functions.
 *
 * Fields tab: Schema groups as a collapsible tree with field items.
 * Functions tab: FunctionList component with search and category filter.
 */

import { useCallback, useId, useState, useRef } from 'react'
import type { SchemaGroup, SchemaField } from '@/types'
import { FunctionList } from './FunctionList'

type PanelTab = 'fields' | 'functions'

const TYPE_ICONS: Readonly<Record<string, string>> = {
  number: '#',
  string: 'Aa',
  date: '日',
  boolean: '✓',
  array: '[]',
  image: '🖼',
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  master: 'マスター',
  detail: '明細',
}

interface FieldTreePanelProps {
  readonly groups: readonly SchemaGroup[]
  readonly onInsert: (path: string) => void
}

export function FieldTreePanel({ groups, onInsert }: FieldTreePanelProps) {
  const searchId = useId()
  const [filter, setFilter] = useState('')
  const [activeTab, setActiveTab] = useState<PanelTab>('fields')

  const normalizedFilter = filter.toLowerCase()

  const handleFieldClick = useCallback(
    (field: SchemaField, group: SchemaGroup) => {
      onInsert(`${group.dataKey}.${field.key}`)
    },
    [onInsert],
  )

  return (
    <div className="flex flex-col h-full border-r border-border bg-muted/30 w-[220px] shrink-0">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        <button
          type="button"
          className={`flex-1 py-1.5 text-[11px] font-medium ${
            activeTab === 'fields'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('fields')}
        >
          フィールド
        </button>
        <button
          type="button"
          className={`flex-1 py-1.5 text-[11px] font-medium ${
            activeTab === 'functions'
              ? 'text-foreground border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('functions')}
        >
          関数
        </button>
      </div>

      {activeTab === 'functions' ? (
        <FunctionList onInsert={onInsert} />
      ) : (
        <div className="flex-1 overflow-y-auto" role="tree" aria-label="フィールドツリー">
          {/* Search */}
          <div className="px-2 pt-2 pb-1">
            <input
              id={searchId}
              type="search"
              className="w-full px-2 py-1 text-xs border border-border rounded bg-background placeholder:text-muted-foreground"
              placeholder="フィールド検索..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              aria-label="フィールド検索"
            />
          </div>

          {/* Groups */}
          {groups.map((group) => (
            <FieldGroupNode
              key={group.id}
              group={group}
              filter={normalizedFilter}
              onFieldClick={handleFieldClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Group node ──────────────────────────────────────────────────────────

interface FieldGroupNodeProps {
  readonly group: SchemaGroup
  readonly filter: string
  readonly onFieldClick: (field: SchemaField, group: SchemaGroup) => void
}

function FieldGroupNode({ group, filter, onFieldClick }: FieldGroupNodeProps) {
  const [expanded, setExpanded] = useState(true)

  const filteredFields = filter
    ? group.fields.filter(
        (f) =>
          f.key.toLowerCase().includes(filter) ||
          (f.label ?? '').toLowerCase().includes(filter),
      )
    : group.fields

  if (filter && filteredFields.length === 0) return null

  return (
    <div role="treeitem" aria-expanded={expanded}>
      <button
        type="button"
        className="w-full flex items-center gap-1 px-2 py-1 text-[11px] hover:bg-muted/60 transition-colors"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={`${group.label} (${filteredFields.length}件)`}
      >
        <span className="text-muted-foreground text-[10px]">{expanded ? '▾' : '▸'}</span>
        <span className="font-medium text-foreground truncate">{group.label}</span>
        <span className="text-[10px] text-muted-foreground">
          {ROLE_LABELS[group.role] ?? group.role}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">{filteredFields.length}</span>
      </button>

      {expanded && (
        <ul className="ml-3" role="group">
          {filteredFields.map((field) => (
            <FieldItem
              key={field.id}
              field={field}
              group={group}
              onClick={onFieldClick}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Field item ──────────────────────────────────────────────────────────

interface FieldItemProps {
  readonly field: SchemaField
  readonly group: SchemaGroup
  readonly onClick: (field: SchemaField, group: SchemaGroup) => void
}

function FieldItem({ field, group, onClick }: FieldItemProps) {
  const isComputed = !!field.computed

  return (
    <li role="treeitem">
      <button
        type="button"
        className="w-full flex items-center gap-1 px-2 py-0.5 text-[11px] hover:bg-muted/60 rounded transition-colors"
        onClick={() => onClick(field, group)}
        title={`${group.dataKey}.${field.key} (${field.type})`}
      >
        <span className="text-[10px] text-muted-foreground w-4 text-center shrink-0">
          {isComputed ? 'fx' : TYPE_ICONS[field.type] ?? '?'}
        </span>
        <span className="truncate">{field.label || field.key}</span>
        {isComputed && (
          <span className="ml-auto text-[9px] px-1 py-px bg-violet-100 text-violet-700 rounded">計算</span>
        )}
      </button>
    </li>
  )
}
