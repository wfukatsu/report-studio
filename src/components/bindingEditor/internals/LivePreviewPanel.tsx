import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useReportStore } from '@/store'
import { usePreviewData } from '@/hooks/usePreviewData'
import { resolveBindings, fetchScalarDbCatalogCached } from '@/api/reportApi'
import { isNetworkError, isResponseValidationError } from '@/api/client'
import type { ScalarDbCatalog } from '@/api/reportApi'
import { buildFlatDataFromResolved } from '@/lib/previewDataTransform'
import { resolveField } from '@/lib/dataBinding'
import type { SchemaDefinition } from '@/types'

/**
 * LivePreviewPanel — reconnects the resolve-bindings → live-preview path (#330).
 *
 * Takes the partition-key value(s) for each DB-bound schema group, calls
 * `POST /resolve-bindings` (which does the master resolution + per-row product
 * lookup enrichment, #144), and feeds the flattened result into
 * `setLivePreviewData` so the canvas live preview renders real data. Extracted
 * from the orphaned `DataBindingOverviewPanel` and mounted inside the
 * BindingEditor, next to the relationship view that defines those links.
 */

/**
 * Seed the partition-key inputs from the template's sample data so a freshly
 * loaded DB-bound template resolves with a single click. Business templates
 * share one partition-key column (`report_id`, the surrogate key): the primary
 * master group holds its real value; linked groups reach it via
 * `linkedMasterGroupId` and are auto-filled at refresh. Templates that don't
 * follow this pattern get no defaults.
 */
const SHARED_PK_COLUMN = 'report_id'
function computeDefaultPartitionKeys(
  schema: SchemaDefinition,
  sampleData: Record<string, unknown>,
): Record<string, Record<string, string>> {
  const primary = schema.groups.find(
    (g) => g.role === 'master' && g.tableMeta && !g.linkedMasterGroupId
      && g.fields.some((f) => f.dbColumnName === SHARED_PK_COLUMN),
  )
  const pkField = primary?.fields.find((f) => f.dbColumnName === SHARED_PK_COLUMN)
  if (!primary || !pkField) return {}
  const value = resolveField(sampleData, `${primary.dataKey}.${pkField.key}`)
  if (!value) return {}
  return { [primary.id]: { [SHARED_PK_COLUMN]: value } }
}

/**
 * Primary-key column names (partition + clustering) for a group's bound table,
 * from the ScalarDB catalog. A row is fetched by its full primary key, so only
 * these columns are meaningful partition-key inputs — regular columns are not.
 *
 * Returns `null` when the table can't be located in the catalog (not yet
 * fetched, fetch failed, or table removed) OR the table exposes no key columns.
 * Callers fall back to showing every mapped column in that case, so a missing
 * catalog never hides an input the user might need. (#389)
 */
function primaryKeyColumns(
  tableMeta: { namespace: string; tableName: string } | undefined,
  catalog: ScalarDbCatalog | null,
): ReadonlySet<string> | null {
  if (!tableMeta || !catalog) return null
  const ns = catalog.namespaces.find((n) => n.name === tableMeta.namespace)
  const table = ns?.tables.find((tb) => tb.name === tableMeta.tableName)
  if (!table) return null
  const keys = table.columns
    .filter((c) => c.keyType === 'partition' || c.keyType === 'clustering')
    .map((c) => c.name)
  return keys.length > 0 ? new Set(keys) : null
}

interface SectionProps {
  title: string
  icon?: string
  /** When provided, the header becomes a collapse toggle (#390). */
  collapsed?: boolean
  onToggle?: () => void
  children: React.ReactNode
}

const SECTION_LABEL = 'text-[10px] font-semibold text-muted-foreground uppercase tracking-wide'

function Section({ title, icon, collapsed, onToggle, children }: SectionProps) {
  return (
    <div className="border-b">
      {onToggle ? (
        <button
          type="button"
          className="flex items-center gap-1.5 w-full px-3 py-1.5 bg-muted/40 hover:bg-muted/60 transition-colors"
          onClick={onToggle}
          aria-expanded={!collapsed}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          {icon && <span className="text-xs">{icon}</span>}
          <span className={SECTION_LABEL}>{title}</span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40">
          {icon && <span className="text-xs">{icon}</span>}
          <span className={SECTION_LABEL}>{title}</span>
        </div>
      )}
      {!collapsed && children}
    </div>
  )
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

export function LivePreviewPanel() {
  const { t } = useTranslation('components')
  const schema = useReportStore((s) => s.definition.schema)
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)
  const setLivePreviewData = useReportStore((s) => s.setLivePreviewData)
  const livePreviewData = useReportStore((s) => s.livePreviewData)

  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' })
  // Collapse the panel so the core binding canvas isn't pushed below the fold
  // (#390). Default expanded; collapse is per-mount local state.
  const [collapsed, setCollapsed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const sampleData = usePreviewData()

  // ScalarDB catalog — used to restrict partition-key inputs to actual key
  // columns (#389). Cached at the module level (shared with DbPanel's fetch), so
  // this is a cache hit in normal use. A failed/absent fetch leaves it null and
  // the render falls back to showing every mapped column.
  const [catalog, setCatalog] = useState<ScalarDbCatalog | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false
    fetchScalarDbCatalogCached(controller.signal)
      .then((c) => { if (!cancelled) setCatalog(c) })
      .catch(() => { /* fall back to showing all mapped columns */ })
    return () => { cancelled = true; controller.abort() }
  }, [])

  // Seed partition-key inputs from sample data when a new template loads. Defaults
  // are memoized per loaded template id; user edits are stored alongside the id so
  // a template switch naturally falls back to fresh defaults (no reset effect).
  const seededPartitionKeys = useMemo(
    () => (currentTemplateId && schema ? computeDefaultPartitionKeys(schema, sampleData) : {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per loaded template (user edits within a template are preserved)
    [currentTemplateId],
  )
  const [editedPartitionKeys, setEditedPartitionKeys] = useState<{
    templateId: string | null
    keys: Record<string, Record<string, string>>
  } | null>(null)
  const partitionKeys =
    editedPartitionKeys !== null && editedPartitionKeys.templateId === currentTemplateId
      ? editedPartitionKeys.keys
      : seededPartitionKeys

  const boundMasterGroups = schema?.groups.filter(
    (g) => g.role === 'master' && g.tableMeta && g.fields.some((f) => f.dbColumnName),
  ) ?? []
  const boundDetailGroups = schema?.groups.filter(
    (g) => g.role === 'detail' && g.tableMeta && g.fields.some((f) => f.dbColumnName),
  ) ?? []

  const hasBoundGroups = boundMasterGroups.length > 0 || boundDetailGroups.length > 0
  // No DB bindings at all → nothing to preview.
  if (!hasBoundGroups) return null

  // DB-bound but not yet persisted (resolve-bindings needs a saved template id).
  if (!currentTemplateId) {
    return (
      <Section title={t('bindingEditor.livePreview.title')} icon="⚡">
        <div className="px-3 py-2 text-[10px] text-muted-foreground leading-relaxed">
          {t('bindingEditor.livePreview.notSavedHint')}
        </div>
      </Section>
    )
  }

  function handleKeyChange(groupId: string, colName: string, value: string) {
    setEditedPartitionKeys({
      templateId: currentTemplateId,
      keys: {
        ...partitionKeys,
        [groupId]: { ...partitionKeys[groupId], [colName]: value },
      },
    })
  }

  async function handleRefreshPreview() {
    if (!currentTemplateId || !schema) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPreviewState({ status: 'loading' })

    try {
      // Auto-fill partition keys from the linked master group — for detail groups
      // and aux master groups that share the header's key via linkedMasterGroupId,
      // so only the primary group needs a value.
      const autoFilledPartitionKeys = { ...partitionKeys }
      for (const group of schema.groups) {
        if (group.linkedMasterGroupId) {
          const masterPk = partitionKeys[group.linkedMasterGroupId]
          if (masterPk) {
            autoFilledPartitionKeys[group.id] = { ...masterPk, ...autoFilledPartitionKeys[group.id] }
          }
        }
      }

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
            // #144: forward named relations so the backend enriches detail rows
            // with per-row product lookups.
            relations: schema.relations,
          },
          partitionKeys: autoFilledPartitionKeys,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return

      const flatData = buildFlatDataFromResolved(response.resolved, schema)
      setLivePreviewData(flatData)
      setPreviewState({ status: 'ready' })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      // Map to a friendly message — never surface a raw error string (e.g. the
      // ZodError issue array from a response-shape mismatch) to the user (#388).
      const msg = isResponseValidationError(e)
        ? t('bindingEditor.livePreview.errorInvalidResponse')
        : isNetworkError(e)
          ? t('bindingEditor.livePreview.errorNetwork')
          : t('bindingEditor.livePreview.genericError')
      setPreviewState({ status: 'error', message: msg })
    }
  }

  function handleClearPreview() {
    abortRef.current?.abort()
    setLivePreviewData(null)
    setPreviewState({ status: 'idle' })
  }

  const renderGroup = (group: (typeof boundMasterGroups)[number]) => {
    // Only partition/clustering-key columns are meaningful lookup inputs. When
    // the catalog can't identify them, fall back to every mapped column so we
    // never hide an input the resolve might need. (#389)
    const keyCols = primaryKeyColumns(group.tableMeta, catalog)
    const keyFields = group.fields.filter(
      (f) => f.dbColumnName && (keyCols === null || keyCols.has(f.dbColumnName)),
    )
    if (keyFields.length === 0) return null
    const linkedMaster = group.linkedMasterGroupId
      ? schema?.groups.find((g) => g.id === group.linkedMasterGroupId)
      : null
    return (
      <div key={group.id} className="space-y-1">
        <div className="text-[10px] font-medium text-foreground">
          {group.label || group.id}
          {group.tableMeta && (
            <span className="ml-1 text-muted-foreground font-normal">
              ({group.tableMeta.namespace}.{group.tableMeta.tableName})
            </span>
          )}
          {linkedMaster && (
            <span className="ml-1 text-[9px] text-blue-600 font-normal" aria-label={t('bindingEditor.livePreview.autoFillAria')}>
              {t('bindingEditor.livePreview.autoFill', { name: linkedMaster.label || linkedMaster.id })}
            </span>
          )}
        </div>
        {!linkedMaster && keyFields.map((field) => (
          <div key={field.id} className="flex items-center gap-1.5">
            <label className="text-[10px] text-muted-foreground w-24 truncate shrink-0" title={field.dbColumnName}>
              {field.dbColumnName}
            </label>
            <input
              type="text"
              className="flex-1 text-[10px] border rounded px-1.5 py-0.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder={t('bindingEditor.livePreview.valuePlaceholder')}
              value={partitionKeys[group.id]?.[field.dbColumnName!] ?? ''}
              onChange={(e) => handleKeyChange(group.id, field.dbColumnName!, e.target.value)}
            />
          </div>
        ))}
      </div>
    )
  }

  return (
    <Section
      title={t('bindingEditor.livePreview.title')}
      icon="⚡"
      collapsed={collapsed}
      onToggle={() => setCollapsed((v) => !v)}
    >
      <div className="px-3 py-2 space-y-3">
        <p className="text-[10px] text-muted-foreground">
          {t('bindingEditor.livePreview.description')}
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boundMasterGroups.map(renderGroup)}
          {boundDetailGroups.map(renderGroup)}
        </div>

        {previewState.status === 'error' && (
          <p className="text-[10px] text-destructive">{previewState.message}</p>
        )}
        {previewState.status === 'ready' && livePreviewData && (
          <p className="text-[10px] text-green-600">{t('bindingEditor.livePreview.dataFetched')}</p>
        )}

        <div className="flex gap-2">
          <button
            className="text-[10px] bg-primary text-primary-foreground rounded px-3 py-1 hover:bg-primary/90 disabled:opacity-50"
            disabled={previewState.status === 'loading'}
            onClick={() => void handleRefreshPreview()}
          >
            {previewState.status === 'loading' ? t('bindingEditor.livePreview.loading') : t('bindingEditor.livePreview.refresh')}
          </button>
          {livePreviewData && (
            <button
              className="text-[10px] text-muted-foreground border rounded px-3 py-1 hover:bg-accent"
              onClick={handleClearPreview}
            >
              {t('bindingEditor.livePreview.clear')}
            </button>
          )}
        </div>
      </div>
    </Section>
  )
}
