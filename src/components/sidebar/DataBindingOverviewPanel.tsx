import { useCallback, useRef, useState } from 'react'
import { useReportStore } from '@/store'
import { useBindingAnalysis } from '@/hooks/useBindingAnalysis'
import { DataSourcePanel } from './DataSourcePanel'
import { BindingPanel } from './BindingPanel'
import { resolveBindings } from '@/api/reportApi'
import { buildFlatDataFromResolved } from '@/lib/previewDataTransform'
import type { ElementBinding } from '@/hooks/useBindingAnalysis'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  count?: number
  icon?: string
  className?: string
  children: React.ReactNode
}

function Section({ title, count, icon, className = '', children }: SectionProps) {
  return (
    <div className={`border-b last:border-b-0 ${className}`}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40">
        {icon && <span className="text-xs">{icon}</span>}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-auto text-[10px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

interface ElementRowProps {
  binding: ElementBinding
  onSelect: (elementId: string, pageId: string) => void
  suffix?: string
}

function ElementRow({ binding, onSelect, suffix }: ElementRowProps) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left border-b last:border-b-0"
      onClick={() => onSelect(binding.elementId, binding.pageId)}
    >
      <span className="flex-1 truncate">{binding.elementLabel}</span>
      {binding.fieldKey && (
        <span className="font-mono text-[10px] text-muted-foreground truncate shrink-0 max-w-[40%]">
          {binding.fieldKey}
        </span>
      )}
      {suffix && <span className="text-[10px] text-muted-foreground shrink-0">{suffix}</span>}
    </button>
  )
}

interface MappingRowProps {
  binding: ElementBinding
  onSelect: (elementId: string, pageId: string) => void
}

function MappingRow({ binding, onSelect }: MappingRowProps) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left border-b last:border-b-0"
      onClick={() => onSelect(binding.elementId, binding.pageId)}
    >
      <span className="font-mono text-[10px] text-primary truncate shrink-0 max-w-[45%]">
        {binding.fieldKey}
      </span>
      <span className="text-muted-foreground mx-0.5">→</span>
      <span className="flex-1 truncate text-foreground">{binding.elementLabel}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Collapsible wrapper for DataSourcePanel / BindingPanel
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  return (
    <details open={defaultOpen} className="border-b last:border-b-0">
      <summary className="flex items-center px-3 py-1.5 cursor-pointer select-none bg-muted/40 hover:bg-muted/60 list-none">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">▾</span>
      </summary>
      {children}
    </details>
  )
}

// ---------------------------------------------------------------------------
// Phase 2: Partition key input + preview refresh
// ---------------------------------------------------------------------------

type PreviewState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' }

function LivePreviewSection() {
  const schema = useReportStore((s) => s.definition.schema)
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)
  const setLivePreviewData = useReportStore((s) => s.setLivePreviewData)
  const livePreviewData = useReportStore((s) => s.livePreviewData)

  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' })
  // partitionKeys: { [groupId]: { [columnName]: value } }
  const [partitionKeys, setPartitionKeys] = useState<Record<string, Record<string, string>>>({})
  const abortRef = useRef<AbortController | null>(null)

  // Only show master groups with tableMeta bound
  const boundMasterGroups = schema?.groups.filter(
    (g) => g.role === 'master' && g.tableMeta && g.fields.some((f) => f.dbColumnName),
  ) ?? []

  if (!currentTemplateId || boundMasterGroups.length === 0) {
    return null
  }

  function handleKeyChange(groupId: string, colName: string, value: string) {
    setPartitionKeys((prev) => ({
      ...prev,
      [groupId]: { ...prev[groupId], [colName]: value },
    }))
  }

  async function handleRefreshPreview() {
    if (!currentTemplateId || !schema) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPreviewState({ status: 'loading' })

    try {
      const response = await resolveBindings(
        currentTemplateId,
        {
          schema: {
            groups: schema.groups.map((g) => ({
              id: g.id,
              role: g.role,
              tableMeta: g.tableMeta,
              fields: g.fields.map((f) => ({ id: f.id, key: f.key, dbColumnName: f.dbColumnName })),
            })),
          },
          partitionKeys,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return

      const flatData = buildFlatDataFromResolved(response.resolved, schema)
      setLivePreviewData(flatData)
      setPreviewState({ status: 'ready' })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      const msg = e instanceof Error ? e.message : 'エラーが発生しました'
      setPreviewState({ status: 'error', message: msg })
    }
  }

  function handleClearPreview() {
    abortRef.current?.abort()
    setLivePreviewData(null)
    setPreviewState({ status: 'idle' })
  }

  return (
    <Section title="ライブプレビュー" icon="⚡">
      <div className="px-3 py-2 space-y-3">
        <p className="text-[10px] text-muted-foreground">
          ScalarDB から実データを取得してプレビューします。各グループのパーティションキー値を入力してください。
        </p>

        {boundMasterGroups.map((group) => {
          // Show fields that have dbColumnName as partition key candidates
          const keyFields = group.fields.filter((f) => f.dbColumnName)
          if (keyFields.length === 0) return null
          return (
            <div key={group.id} className="space-y-1">
              <div className="text-[10px] font-medium text-foreground">
                {group.label || group.id}
                {group.tableMeta && (
                  <span className="ml-1 text-muted-foreground font-normal">
                    ({group.tableMeta.namespace}.{group.tableMeta.tableName})
                  </span>
                )}
              </div>
              {keyFields.map((field) => (
                <div key={field.id} className="flex items-center gap-1.5">
                  <label className="text-[10px] text-muted-foreground w-24 truncate shrink-0" title={field.dbColumnName}>
                    {field.dbColumnName}
                  </label>
                  <input
                    type="text"
                    className="flex-1 text-[10px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="値を入力..."
                    value={partitionKeys[group.id]?.[field.dbColumnName!] ?? ''}
                    onChange={(e) => handleKeyChange(group.id, field.dbColumnName!, e.target.value)}
                  />
                </div>
              ))}
            </div>
          )
        })}

        {/* Status feedback */}
        {previewState.status === 'error' && (
          <p className="text-[10px] text-destructive">{previewState.message}</p>
        )}
        {previewState.status === 'ready' && livePreviewData && (
          <p className="text-[10px] text-green-600">実データを取得しました</p>
        )}

        <div className="flex gap-2">
          <button
            className="flex-1 text-[10px] bg-primary text-primary-foreground rounded px-2 py-1 hover:bg-primary/90 disabled:opacity-50"
            disabled={previewState.status === 'loading'}
            onClick={() => void handleRefreshPreview()}
          >
            {previewState.status === 'loading' ? '取得中...' : 'プレビュー更新'}
          </button>
          {livePreviewData && (
            <button
              className="text-[10px] text-muted-foreground border rounded px-2 py-1 hover:bg-accent"
              onClick={handleClearPreview}
            >
              クリア
            </button>
          )}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function DataBindingOverviewPanel() {
  const selectElement = useReportStore((s) => s.selectElement)
  const setActivePage = useReportStore((s) => s.setActivePage)
  const { hasDataSource, unboundElements, fieldMappings, missingInSampleElements } = useBindingAnalysis()

  const handleSelect = useCallback((elementId: string, pageId: string) => {
    setActivePage(pageId)
    selectElement(elementId)
  }, [setActivePage, selectElement])

  return (
    <div className="divide-y text-xs">
      {/* DataSource definition (always visible) */}
      <CollapsibleSection title="データソース" defaultOpen={!hasDataSource}>
        <DataSourcePanel />
      </CollapsibleSection>

      {/* Empty state when no DataSource */}
      {!hasDataSource && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          データソースが未設定です。上のセクションでデータを追加してください。
        </div>
      )}

      {hasDataSource && (
        <>
          {/* Field value editor */}
          <CollapsibleSection title="フィールド値">
            <BindingPanel />
          </CollapsibleSection>

          {/* Phase 2: Live preview from ScalarDB */}
          <LivePreviewSection />

          {/* Unbound elements — hidden when 0 */}
          {unboundElements.length > 0 && (
            <Section title="未バインド要素" count={unboundElements.length} icon="⚠">
              {unboundElements.map((b) => (
                <ElementRow key={b.elementId} binding={b} onSelect={handleSelect} />
              ))}
            </Section>
          )}

          {/* Field mappings — hidden when 0 */}
          {fieldMappings.length > 0 && (
            <Section title="マッピング" count={fieldMappings.length} icon="✓">
              {fieldMappings.map((b, i) => (
                <MappingRow key={`${b.elementId}_${b.fieldKey}_${i}`} binding={b} onSelect={handleSelect} />
              ))}
            </Section>
          )}

          {/* Fields bound but not present in sample data — hidden when 0 */}
          {missingInSampleElements.length > 0 && (
            <Section title="サンプル値なし" count={missingInSampleElements.length} icon="⚠">
              {missingInSampleElements.map((b) => (
                <ElementRow
                  key={`${b.elementId}_${b.fieldKey}`}
                  binding={b}
                  onSelect={handleSelect}
                  suffix="未設定"
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
