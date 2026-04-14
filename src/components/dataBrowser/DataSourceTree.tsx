import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Database, Package, FileText, AlertCircle } from 'lucide-react'
import { fetchScalarDbCatalogCached, listReports } from '@/api/reportApi'
import type { DataSourceNode } from '@/store/dataBrowserStore'
import { cn } from '@/lib/utils'

interface Props {
  onSelect: (node: DataSourceNode) => void
  selected: DataSourceNode | null
}

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; namespaces: { name: string; tables: { name: string }[] }[] }

type TemplatesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ok'; items: { id: string; name: string }[] }

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

  useEffect(() => {
    fetchScalarDbCatalogCached()
      .then((data) => setCatalog({ status: 'ok', namespaces: data.namespaces }))
      .catch(() => setCatalog({ status: 'error', message: 'ScalarDB に接続できません' }))
  }, [])

  useEffect(() => {
    listReports()
      .then((data) => setTemplates({ status: 'ok', items: data.items }))
      .catch(() => setTemplates({ status: 'error' }))
  }, [])

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
          <div className="flex items-start gap-1.5 mx-2 my-1 px-2 py-1.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs">
            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
            <span>{catalog.message}</span>
          </div>
        )}
        {catalog.status === 'ok' && catalog.namespaces.length === 0 && (
          <TreeLeaf
            label="テーブルが設定されていません"
            disabled
            hint="データ連携タブで設定"
          />
        )}
        {catalog.status === 'ok' && catalog.namespaces.map((ns) =>
          ns.tables.map((tbl) => {
            const node: DataSourceNode = { kind: 'scalardb-table', namespace: ns.name, table: tbl.name }
            return (
              <TreeLeaf
                key={nodeKey(node)}
                label={`${ns.name}.${tbl.name}`}
                active={isSameNode(selected, node)}
                onClick={() => onSelect(node)}
                icon={<Database className="w-3 h-3 opacity-60" />}
              />
            )
          })
        )}
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
        {templates.status === 'error' && <TreeLeaf label="テンプレートの読み込みに失敗" disabled />}
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
