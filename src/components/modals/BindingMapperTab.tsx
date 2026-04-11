/**
 * Phase 3A: Visual Mapper tab for DataBindingModal.
 *
 * Provides a click-to-connect UI for setting element.schemaBinding.fieldId.
 * Left panel: schema fields grouped by SchemaGroup.
 * Right panel: bindable elements from all pages.
 * Interaction: click a field chip → select it, then click an element → connect.
 */
import { useCallback, useState } from 'react'
import { useReportStore } from '@/store'
import { flattenPageElements } from '@/store/selectors'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldItem {
  fieldId: string
  fieldKey: string
  fieldLabel: string
  groupId: string
  groupLabel: string
  dbColumnName?: string
}

interface ElementItem {
  pageId: string
  elementId: string
  elementLabel: string
  elementType: string
  /** Currently bound fieldId (from schemaBinding) */
  boundFieldId?: string
}

// Element types that support schemaBinding
const BINDABLE_TYPES = new Set(['dataField', 'text', 'checkbox', 'eraSelect'])

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FieldChipProps {
  field: FieldItem
  isSelected: boolean
  boundElementCount: number
  onSelect: (fieldId: string) => void
}

function FieldChip({ field, isSelected, boundElementCount, onSelect }: FieldChipProps) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b last:border-b-0 transition-colors',
        isSelected
          ? 'bg-primary/10 border-l-2 border-l-primary'
          : 'hover:bg-accent',
      )}
      onClick={() => onSelect(field.fieldId)}
      title={field.dbColumnName ? `DB: ${field.dbColumnName}` : undefined}
    >
      <span className="flex-1 truncate font-medium">{field.fieldLabel}</span>
      <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[35%]">
        {field.fieldKey}
      </span>
      {boundElementCount > 0 && (
        <span className="text-[10px] bg-primary text-primary-foreground rounded-full px-1.5 shrink-0">
          {boundElementCount}
        </span>
      )}
    </button>
  )
}

interface ElementRowProps {
  element: ElementItem
  selectedFieldId: string | null
  allFields: FieldItem[]
  onConnect: (pageId: string, elementId: string) => void
  onDisconnect: (pageId: string, elementId: string) => void
}

function ElementRow({ element, selectedFieldId, allFields, onConnect, onDisconnect }: ElementRowProps) {
  const boundField = element.boundFieldId
    ? allFields.find((f) => f.fieldId === element.boundFieldId)
    : null

  const isConnectedToSelected = selectedFieldId !== null && element.boundFieldId === selectedFieldId

  function handleClick() {
    if (selectedFieldId !== null) {
      if (element.boundFieldId === selectedFieldId) {
        // Same field clicked → disconnect
        onDisconnect(element.pageId, element.elementId)
      } else {
        // Different (or no) field → connect to selected
        onConnect(element.pageId, element.elementId)
      }
    } else if (element.boundFieldId) {
      // No field selected, element has binding → disconnect on click
      onDisconnect(element.pageId, element.elementId)
    }
  }

  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left border-b last:border-b-0 transition-colors',
        isConnectedToSelected && 'bg-primary/5',
        selectedFieldId !== null && 'hover:bg-primary/10 cursor-pointer',
        selectedFieldId === null && element.boundFieldId && 'hover:bg-destructive/10',
        selectedFieldId === null && !element.boundFieldId && 'hover:bg-accent opacity-60',
      )}
      onClick={handleClick}
    >
      <span className={cn('text-[10px] shrink-0', {
        'text-muted-foreground': element.elementType === 'text',
        'text-blue-500': element.elementType === 'dataField',
        'text-purple-500': element.elementType === 'checkbox' || element.elementType === 'eraSelect',
      })}>
        {element.elementType === 'dataField' ? '⬡' : element.elementType === 'text' ? 'T' : '✓'}
      </span>
      <span className="flex-1 truncate">{element.elementLabel}</span>
      {boundField ? (
        <span className="text-[10px] font-mono text-primary shrink-0 max-w-[40%] truncate">
          ← {boundField.fieldKey}
        </span>
      ) : selectedFieldId !== null ? (
        <span className="text-[10px] text-muted-foreground shrink-0">クリックで接続</span>
      ) : null}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BindingMapperTab() {
  const schema = useReportStore((s) => s.definition.schema)
  const pages = useReportStore((s) => s.definition.pages)
  const setElementSchemaBinding = useReportStore((s) => s.setElementSchemaBinding)
  const setActivePage = useReportStore((s) => s.setActivePage)
  const selectElement = useReportStore((s) => s.selectElement)

  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null)

  // Build flat list of all schema fields
  const allFields: FieldItem[] = (schema?.groups ?? []).flatMap((group) =>
    group.fields.map((field) => ({
      fieldId: field.id,
      fieldKey: field.key,
      fieldLabel: field.label || field.key,
      groupId: group.id,
      groupLabel: group.label || group.id,
      dbColumnName: field.dbColumnName,
    })),
  )

  // Build flat list of all bindable elements across all pages
  const allElements: ElementItem[] = pages.flatMap((page) =>
    flattenPageElements(page)
      .filter((el) => BINDABLE_TYPES.has(el.type))
      .map((el) => ({
        pageId: page.id,
        elementId: el.id,
        elementLabel: el.name?.trim() || el.type,
        elementType: el.type,
        boundFieldId: el.schemaBinding?.fieldId,
      })),
  )

  // Count how many elements each field is bound to
  const fieldBoundCount = new Map<string, number>()
  for (const el of allElements) {
    if (el.boundFieldId) {
      fieldBoundCount.set(el.boundFieldId, (fieldBoundCount.get(el.boundFieldId) ?? 0) + 1)
    }
  }

  const handleFieldSelect = useCallback((fieldId: string) => {
    setSelectedFieldId((prev) => prev === fieldId ? null : fieldId)
  }, [])

  const handleConnect = useCallback((pageId: string, elementId: string) => {
    if (!selectedFieldId) return
    setElementSchemaBinding(pageId, elementId, selectedFieldId)
  }, [selectedFieldId, setElementSchemaBinding])

  const handleDisconnect = useCallback((pageId: string, elementId: string) => {
    setElementSchemaBinding(pageId, elementId, undefined)
  }, [setElementSchemaBinding])

  const handleElementNavigate = useCallback((pageId: string, elementId: string) => {
    setActivePage(pageId)
    selectElement(elementId)
  }, [setActivePage, selectElement])

  if (!schema || schema.groups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-8 text-center">
        スキーマが未定義です。<br />
        「スキーマ」タブでグループとフィールドを追加してください。
      </div>
    )
  }

  const boundElementCount = allElements.filter((e) => e.boundFieldId).length

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: Schema fields */}
      <div className="w-1/2 border-r overflow-y-auto flex flex-col">
        <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            スキーマフィールド
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            フィールドをクリックして選択
          </p>
        </div>

        {(schema.groups ?? []).map((group) => (
          <div key={group.id}>
            <div className="px-3 py-1 bg-muted/20 border-b">
              <span className="text-[10px] font-medium text-muted-foreground">
                {group.label || group.id}
                <span className="ml-1 opacity-60">({group.role})</span>
              </span>
            </div>
            {group.fields.length === 0 ? (
              <div className="px-3 py-1.5 text-[10px] text-muted-foreground italic border-b">
                フィールドなし
              </div>
            ) : (
              group.fields.map((field) => (
                <FieldChip
                  key={field.id}
                  field={{
                    fieldId: field.id,
                    fieldKey: field.key,
                    fieldLabel: field.label || field.key,
                    groupId: group.id,
                    groupLabel: group.label || group.id,
                    dbColumnName: field.dbColumnName,
                  }}
                  isSelected={selectedFieldId === field.id}
                  boundElementCount={fieldBoundCount.get(field.id) ?? 0}
                  onSelect={handleFieldSelect}
                />
              ))
            )}
          </div>
        ))}
      </div>

      {/* Right panel: Bindable elements */}
      <div className="w-1/2 overflow-y-auto flex flex-col">
        <div className="px-3 py-2 border-b bg-muted/30 shrink-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            レポート要素
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {selectedFieldId
              ? '要素をクリックして接続'
              : `${boundElementCount}/${allElements.length} 要素がバインド済み`}
          </p>
        </div>

        {allElements.length === 0 ? (
          <div className="px-3 py-3 text-[10px] text-muted-foreground italic">
            バインド可能な要素がありません
          </div>
        ) : (
          pages.map((page) => {
            const pageElements = allElements.filter((e) => e.pageId === page.id)
            if (pageElements.length === 0) return null
            return (
              <div key={page.id}>
                <div className="px-3 py-1 bg-muted/20 border-b flex items-center gap-2">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {page.name || 'ページ'}
                  </span>
                  <button
                    className="text-[10px] text-primary hover:underline ml-auto"
                    onClick={() => setActivePage(page.id)}
                  >
                    移動
                  </button>
                </div>
                {pageElements.map((el) => (
                  <ElementRow
                    key={el.elementId}
                    element={el}
                    selectedFieldId={selectedFieldId}
                    allFields={allFields}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                  />
                ))}
              </div>
            )
          })
        )}
      </div>

      {/* Status bar */}
      {selectedFieldId && (
        <div className="absolute bottom-0 left-0 right-0 bg-primary/10 border-t px-4 py-2 text-[10px] text-primary flex items-center gap-2">
          <span className="font-medium">
            選択中: {allFields.find((f) => f.fieldId === selectedFieldId)?.fieldKey ?? selectedFieldId}
          </span>
          <span>— 右パネルの要素をクリックして接続</span>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedFieldId(null)}
          >
            ✕ 選択解除
          </button>
        </div>
      )}
    </div>
  )
}
