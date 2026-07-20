import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Database, Package, FileText } from 'lucide-react'
import { fetchScalarDbCatalogCached, listReports } from '@/api/reportApi'
import type { DataSourceNode } from '@/store/dataBrowserStore'
import { cn } from '@/lib/utils'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'

interface Props {
  onSelect: (node: DataSourceNode) => void
  selected: DataSourceNode | null
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | { status: 'ok'; namespaces: { name: string; tables: { name: string }[] }[] }

type TemplatesState =
  | { status: 'loading' }
  | { status: 'error'; error: UserFacingError }
  | { status: 'ok'; items: { id: string; name: string }[] }

/** Namespaces that hold internal app tables, not user business data. */
const SYSTEM_NAMESPACES = new Set(['report_studio', 'scalardb', 'coordinator'])

function nodeKey(node: DataSourceNode): string {
  if (node.kind === 'scalardb-table') return `scalardb:${node.namespace}.${node.table}`
  if (node.kind === 'product-master') return 'product-master'
  return `form-responses:${node.templateId}`
}

function isSameNode(a: DataSourceNode | null, b: DataSourceNode): boolean {
  if (!a) return false
  return nodeKey(a) === nodeKey(b)
}

export function DataSourceTree({ onSelect, selected }: Props) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' })
  const [templates, setTemplates] = useState<TemplatesState>({ status: 'loading' })
  const [scalarDbOpen, setScalarDbOpen] = useState(true)
  const [responsesOpen, setResponsesOpen] = useState(true)
  // System namespaces (report_studio 等) start collapsed so business data isn't
  // buried under internal tables; user namespaces start expanded (#167).
  const [collapsedNs, setCollapsedNs] = useState<Set<string>>(() => new Set())
  const [catalogTick, setCatalogTick] = useState(0)
  const [templatesTick, setTemplatesTick] = useState(0)

  // The 'loading' status is set by the initial state and by the retry event
  // handlers below — the effects only perform async updates in the promise
  // callbacks (no synchronous setState in the effect body).
  useEffect(() => {
    let cancelled = false
    fetchScalarDbCatalogCached()
      .then((data) => { if (!cancelled) setCatalog({ status: 'ok', namespaces: data.namespaces }) })
      .catch((err) => { if (!cancelled) setCatalog({ status: 'error', error: classifyError(err) }) })
    return () => { cancelled = true }
  }, [catalogTick])

  useEffect(() => {
    let cancelled = false
    listReports()
      .then((data) => { if (!cancelled) setTemplates({ status: 'ok', items: data.items }) })
      .catch((err) => { if (!cancelled) setTemplates({ status: 'error', error: classifyError(err) }) })
    return () => { cancelled = true }
  }, [templatesTick])

  const retryCatalog = () => {
    setCatalog({ status: 'loading' })
    setCatalogTick((n) => n + 1)
  }
  const retryTemplates = () => {
    setTemplates({ status: 'loading' })
    setTemplatesTick((n) => n + 1)
  }

  const productMasterNode: DataSourceNode = { kind: 'product-master' }

  return (
    <nav aria-label="データソースツリー" className="flex flex-col gap-0.5 py-2 text-xs">
      {/* ScalarDB section */}
      <TreeSection
        label="ScalarDB テーブル"
        icon={<Database className="w-3.5 h-3.5" />}
        open={scalarDbOpen}
        onToggle={() => setScalarDbOpen((v) => !v)}
      >
        {catalog.status === 'loading' && (
          <TreeLeaf label="読み込み中..." disabled />
        )}
        {catalog.status === 'error' && (
          <div className="mx-2 my-1">
            <InlineErrorBanner error={catalog.error} onRetry={retryCatalog} />
          </div>
        )}
        {catalog.status === 'ok' && catalog.namespaces.length === 0 && (
          <TreeLeaf
            label="テーブルが設定されていません"
            disabled
            hint="データ連携タブで設定"
          />
        )}
        {catalog.status === 'ok' && [...catalog.namespaces]
          // User business namespaces first, internal ones (report_studio 等) last.
          .sort((a, b) => {
            const sa = SYSTEM_NAMESPACES.has(a.name) ? 1 : 0
            const sb = SYSTEM_NAMESPACES.has(b.name) ? 1 : 0
            return sa - sb || a.name.localeCompare(b.name)
          })
          .map((ns) => {
            const isSystem = SYSTEM_NAMESPACES.has(ns.name)
            const collapsed = collapsedNs.has(ns.name) || (isSystem && !collapsedNs.has(`open:${ns.name}`))
            const toggle = () => setCollapsedNs((prev) => {
              const next = new Set(prev)
              if (isSystem) {
                // System namespaces default-collapsed: track an explicit open marker.
                if (next.has(`open:${ns.name}`)) next.delete(`open:${ns.name}`)
                else next.add(`open:${ns.name}`)
              } else {
                if (next.has(ns.name)) next.delete(ns.name)
                else next.add(ns.name)
              }
              return next
            })
            return (
              <div key={ns.name}>
                <button
                  onClick={toggle}
                  className="flex items-center gap-1.5 w-full px-2 py-1 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                  aria-expanded={!collapsed}
                >
                  {collapsed ? <ChevronRight className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                  <span className="truncate flex-1">{ns.name}</span>
                  {isSystem && (
                    <span className="text-[9px] px-1 py-px rounded bg-muted text-muted-foreground shrink-0" title="内部管理テーブル（通常は編集不要）">
                      システム
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">{ns.tables.length}</span>
                </button>
                {!collapsed && (
                  <div className="pl-2">
                    {ns.tables.map((tbl) => {
                      const node: DataSourceNode = { kind: 'scalardb-table', namespace: ns.name, table: tbl.name }
                      return (
                        <TreeLeaf
                          key={nodeKey(node)}
                          label={tbl.name}
                          active={isSameNode(selected, node)}
                          onClick={() => onSelect(node)}
                          icon={<Database className="w-3 h-3 opacity-60" />}
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
      </TreeSection>

      {/* Product Master — fixed node */}
      <button
        onClick={() => onSelect(productMasterNode)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 w-full text-left rounded-sm transition-colors',
          isSameNode(selected, productMasterNode)
            ? 'bg-primary/10 text-primary font-medium'
            : 'hover:bg-muted/50',
        )}
        aria-current={isSameNode(selected, productMasterNode) ? 'location' : undefined}
      >
        <Package className="w-3.5 h-3.5 shrink-0" />
        <span>商品マスター</span>
      </button>

      {/* Form Responses section */}
      <TreeSection
        label="フォーム回答"
        icon={<FileText className="w-3.5 h-3.5" />}
        open={responsesOpen}
        onToggle={() => setResponsesOpen((v) => !v)}
      >
        {templates.status === 'loading' && <TreeLeaf label="読み込み中..." disabled />}
        {templates.status === 'error' && (
          <div className="mx-2 my-1">
            <InlineErrorBanner error={templates.error} onRetry={retryTemplates} />
          </div>
        )}
        {templates.status === 'ok' && templates.items.length === 0 && (
          <TreeLeaf label="テンプレートがありません" disabled />
        )}
        {templates.status === 'ok' && templates.items.map((tpl) => {
          const node: DataSourceNode = { kind: 'form-responses', templateId: tpl.id, templateName: tpl.name }
          return (
            <TreeLeaf
              key={nodeKey(node)}
              label={tpl.name}
              active={isSameNode(selected, node)}
              onClick={() => onSelect(node)}
              icon={<FileText className="w-3 h-3 opacity-60" />}
            />
          )
        })}
      </TreeSection>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TreeSection({
  label,
  icon,
  open,
  onToggle,
  children,
}: {
  label: string
  icon: React.ReactNode
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full px-2 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {icon}
        {label}
      </button>
      {open && <div className="pl-1">{children}</div>}
    </div>
  )
}

function TreeLeaf({
  label,
  hint,
  active,
  disabled,
  onClick,
  icon,
}: {
  label: string
  hint?: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
  icon?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-2 w-full px-3 py-1 text-left rounded-sm transition-colors',
        active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/50 text-foreground',
        disabled && 'opacity-50 cursor-default text-muted-foreground',
      )}
    >
      {icon}
      <span className="truncate flex-1">{label}</span>
      {hint && <span className="text-[10px] text-muted-foreground shrink-0">{hint}</span>}
    </button>
  )
}
