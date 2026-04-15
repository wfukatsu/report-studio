/**
 * SchemaFieldsTab — Left sidebar tab showing schema fields grouped by schema group.
 *
 * Each field is draggable to the canvas using SCHEMA_FIELD_MIME.
 * Supports both master and detail groups with visual distinction.
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Database, GripVertical } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { isSystemGroup } from '@/store/schemaSlice'
import { SCHEMA_FIELD_MIME, SCHEMA_GROUP_MIME } from '@/components/bindingEditor/types'
import type { SchemaFieldDragPayload, SchemaGroupDragPayload } from '@/components/bindingEditor/types'
import { cn } from '@/lib/utils'

export function SchemaFieldsTab() {
  const schema = useReportStore((s) => s.definition.schema)

  const userGroups = useMemo(
    () => (schema?.groups ?? []).filter((g) => !isSystemGroup(g.id)),
    [schema?.groups],
  )

  if (userGroups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3 px-4 text-center">
        <Database className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground">
          スキーマが未定義です。
          <br />
          バインドタブでグループとフィールドを定義してください。
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 overflow-y-auto">
      <p className="text-[10px] text-muted-foreground mb-2 px-1">
        フィールドをキャンバスにドラッグして配置
      </p>
      {userGroups.map((group) => (
        <SchemaGroupSection key={group.id} group={group} />
      ))}
    </div>
  )
}

function SchemaGroupSection({ group }: { group: { id: string; label: string; role: 'master' | 'detail'; dataKey: string; fields: readonly { id: string; key: string; label: string; type: string; computed?: true }[] } }) {
  const [expanded, setExpanded] = useState(true)

  const groupPayload: SchemaGroupDragPayload = {
    groupId: group.id,
    groupLabel: group.label,
    groupRole: group.role,
    groupDataKey: group.dataKey,
    fields: group.fields.map((f) => ({
      fieldId: f.id,
      fieldKey: f.key,
      fieldLabel: f.label || f.key,
      fieldType: f.type,
    })),
  }

  return (
    <div className="mb-2">
      <button
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(SCHEMA_GROUP_MIME, JSON.stringify(groupPayload))
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 rounded transition-colors cursor-grab active:cursor-grabbing"
        style={{ borderLeft: `3px solid ${group.role === 'master' ? '#3b82f6' : '#f59e0b'}` }}
        title={`${group.label} — グループごとドラッグして繰り返しバンドにドロップ`}
      >
        <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        {expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
        <span className="truncate">{group.label}</span>
        <span className="text-[9px] text-muted-foreground ml-auto mr-1">{group.fields.length}件</span>
        <span className={cn(
          'text-[9px] px-1 py-px rounded font-medium shrink-0',
          group.role === 'master' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600',
        )}>
          {group.role === 'master' ? 'マスター' : '↻ 明細'}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1 mt-1">
          {group.fields.length === 0 ? (
            <p className="text-[10px] text-muted-foreground italic px-3 py-1">フィールドなし</p>
          ) : (
            group.fields.map((field) => {
              const payload: SchemaFieldDragPayload = {
                fieldId: field.id,
                groupId: group.id,
                fieldKey: field.key,
                fieldLabel: field.label || field.key,
                groupRole: group.role,
                groupDataKey: group.dataKey,
              }
              return (
                <button
                  key={field.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SCHEMA_FIELD_MIME, JSON.stringify(payload))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-dashed border-[#6366f1]/30 bg-[#6366f1]/5 hover:bg-[#6366f1]/10 hover:border-[#6366f1]/50 transition-colors text-xs cursor-grab active:cursor-grabbing group"
                >
                  <GripVertical className="w-3 h-3 text-muted-foreground/40 group-hover:text-[#6366f1] shrink-0" />
                  <span className="font-mono font-medium text-[#6366f1] truncate flex-1 text-left">
                    {field.label || field.key}
                  </span>
                  <span className="text-[9px] text-muted-foreground font-mono shrink-0">
                    {field.type}
                  </span>
                  {field.computed && (
                    <span className="text-[8px] font-bold italic bg-[#6366f1] text-white rounded px-0.5">fx</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
