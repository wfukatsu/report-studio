/**
 * RelationshipView — #141/#142/#143: a compact model view (Power BI–style) of
 * the schema's entity relationships.
 *
 *   ┌────────┐  1 — ∗   ┌────────┐  ∗ — 1   ┌──────────┐
 *   │ ヘッダ  │─────────▶│ 明細    │- - - - -▶│ 商品マスタ │
 *   │ master │  (solid) │ detail │ (lookup) │ product   │
 *   └────────┘          └────────┘  dashed  └──────────┘
 *
 * - master groups are clustered into one "ヘッダ" node (they share the header row).
 * - detail→master links (#138 linkedMasterGroupId) render as solid 1—∗ lines.
 * - detail→product lookups render as dashed ∗—1 lines (#142 exposes the product
 *   master, normally a hidden system group).
 * - unlinked detail groups get an explicit error state (no silent cartesian product).
 * - shared-key inference (#143) surfaces one-click "承認" suggestions.
 * - double-click a detail node to edit its parent-master link inline.
 */

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Sparkles, Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchemaGroup } from '@/types'
import {
  buildRelationshipEdges,
  detailGroups,
  findPrimaryMaster,
  inferRelationships,
  masterGroups,
  productMasterGroup,
} from './relationshipGraph'

interface RelationshipViewProps {
  /** Full schema groups, INCLUDING the product master system group. */
  readonly groups: readonly SchemaGroup[]
  /** Set/clear a group's parent-master link (linkedMasterGroupId). */
  readonly onSetLinkedMaster: (groupId: string, masterGroupId: string | undefined) => void
}

interface Line {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly kind: 'master-detail' | 'lookup'
  readonly cardinality: string
}

const CLUSTER_NODE = '__cluster__'
const PRODUCT_NODE = '__product__'

export const RelationshipView = memo(function RelationshipView({
  groups,
  onSetLinkedMaster,
}: RelationshipViewProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [lines, setLines] = useState<readonly Line[]>([])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Memoize derived graph data so the measure() effect below doesn't re-run on
  // every render (which would loop: setLines → render → measure → setLines …).
  const masters = useMemo(() => masterGroups(groups), [groups])
  const details = useMemo(() => detailGroups(groups), [groups])
  const primary = useMemo(() => findPrimaryMaster(groups), [groups])
  const product = useMemo(() => productMasterGroup(groups), [groups])
  const edges = useMemo(() => buildRelationshipEdges(groups), [groups])
  const suggestions = useMemo(() => inferRelationships(groups), [groups])

  const setNodeRef = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nodeRefs.current.set(id, el)
    else nodeRefs.current.delete(id)
  }, [])

  // Measure node rects → line endpoints, relative to the container.
  const measure = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const base = container.getBoundingClientRect()
    const rectOf = (id: string) => nodeRefs.current.get(id)?.getBoundingClientRect()

    const next: Line[] = []
    for (const e of edges) {
      // from is always a detail node; to is the cluster (master-detail) or product (lookup).
      const fromRect = rectOf(e.fromId)
      const toId = e.kind === 'lookup' ? PRODUCT_NODE : CLUSTER_NODE
      const toRect = rectOf(toId)
      if (!fromRect || !toRect) continue

      if (e.kind === 'master-detail') {
        // cluster (left) → detail (right): cluster.right → detail.left
        next.push({
          x1: toRect.right - base.left,
          y1: toRect.top + toRect.height / 2 - base.top,
          x2: fromRect.left - base.left,
          y2: fromRect.top + fromRect.height / 2 - base.top,
          kind: e.kind,
          cardinality: e.cardinality,
        })
      } else {
        // detail (middle) → product (right): detail.right → product.left
        next.push({
          x1: fromRect.right - base.left,
          y1: fromRect.top + fromRect.height / 2 - base.top,
          x2: toRect.left - base.left,
          y2: toRect.top + toRect.height / 2 - base.top,
          kind: e.kind,
          cardinality: e.cardinality,
        })
      }
    }
    setLines(next)
  }, [edges])

  useLayoutEffect(() => {
    if (collapsed) return
    measure()
  }, [collapsed, measure, editingId, groups])

  useEffect(() => {
    if (collapsed) return
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(container)
    return () => ro.disconnect()
  }, [collapsed, measure])

  const handleApprove = useCallback(
    (groupId: string, masterId: string) => onSetLinkedMaster(groupId, masterId),
    [onSetLinkedMaster],
  )
  const handleApproveAll = useCallback(() => {
    for (const s of suggestions) onSetLinkedMaster(s.groupId, s.suggestedMasterId)
  }, [suggestions, onSetLinkedMaster])

  // Nothing to show without at least a master or detail group.
  if (masters.length === 0 && details.length === 0) return null

  return (
    <div className="border-b bg-muted/5 shrink-0">
      {/* Header / toggle */}
      <button
        className="flex items-center gap-1.5 w-full px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 transition-colors"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <Boxes className="w-3.5 h-3.5 text-[#6366f1]" />
        関係ビュー
        <span className="text-[10px] text-muted-foreground font-normal">
          ヘッダ・明細・商品マスターの 1—∗ 関係
        </span>
        {suggestions.length > 0 && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
            {suggestions.length} 件の関係を自動検出
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-2.5">
          {/* #143: inferred-relationship approval bar */}
          {suggestions.length > 0 && (
            <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3 text-amber-600 shrink-0" />
                <span className="text-[10px] font-medium text-amber-700">
                  共有キーから関係を推定しました。承認するとリンクを設定します。
                </span>
                <button
                  className="ml-auto text-[10px] font-medium text-white bg-amber-600 hover:bg-amber-700 rounded px-2 py-0.5"
                  onClick={handleApproveAll}
                >
                  すべて承認
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {suggestions.map((s) => (
                  <button
                    key={s.groupId}
                    className="flex items-center gap-1 text-[10px] rounded border border-amber-300 bg-white hover:bg-amber-100 px-1.5 py-0.5 text-amber-700"
                    onClick={() => handleApprove(s.groupId, s.suggestedMasterId)}
                    title={`${s.via} が一致`}
                  >
                    {s.groupLabel} → {s.suggestedMasterLabel}
                    <span className="font-mono text-amber-500">（{s.via}）</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Diagram */}
          <div ref={containerRef} className="relative">
            {/* SVG line overlay */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: 'visible' }}>
              {lines.map((l, i) => {
                const midX = (l.x1 + l.x2) / 2
                const midY = (l.y1 + l.y2) / 2
                const color = l.kind === 'lookup' ? '#f59e0b' : '#6366f1'
                return (
                  <g key={i}>
                    <path
                      d={`M ${l.x1} ${l.y1} C ${midX} ${l.y1}, ${midX} ${l.y2}, ${l.x2} ${l.y2}`}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      strokeDasharray={l.kind === 'lookup' ? '4 3' : undefined}
                    />
                    <rect
                      x={midX - 20}
                      y={midY - 7}
                      width={40}
                      height={14}
                      rx={7}
                      fill="white"
                      stroke={color}
                      strokeWidth={0.5}
                      opacity={0.95}
                    />
                    <text x={midX} y={midY + 3} textAnchor="middle" fontSize={9} fill={color} fontFamily="monospace">
                      {l.cardinality}
                    </text>
                  </g>
                )
              })}
            </svg>

            {/* Node columns */}
            <div className="relative grid items-center gap-8" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              {/* Column 1: master cluster (header) */}
              <div className="flex flex-col gap-1">
                {masters.length > 0 && (
                  <div
                    ref={(el) => setNodeRef(CLUSTER_NODE, el)}
                    className="rounded-md border-2 border-blue-300 bg-blue-50 px-2 py-1.5"
                  >
                    <div className="text-[10px] font-semibold text-blue-700 flex items-center gap-1">
                      ヘッダ
                      <span className="text-[9px] font-normal text-blue-500">master</span>
                    </div>
                    <div className="mt-0.5 flex flex-col gap-0.5">
                      {masters.map((m) => (
                        <div key={m.id} className="text-[10px] text-blue-600 flex items-center gap-1 truncate">
                          {primary?.id === m.id && <span title="主キー保持グループ">★</span>}
                          <span className="truncate">{m.label || m.id}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Column 2: detail groups */}
              <div className="flex flex-col gap-1.5">
                {details.map((d) => {
                  const linked = !!d.linkedMasterGroupId && masters.some((m) => m.id === d.linkedMasterGroupId)
                  const isEditing = editingId === d.id
                  return (
                    <div
                      key={d.id}
                      ref={(el) => setNodeRef(d.id, el)}
                      className={cn(
                        'rounded-md border-2 px-2 py-1.5 cursor-pointer transition-colors',
                        linked ? 'border-amber-300 bg-amber-50' : 'border-red-300 bg-red-50',
                      )}
                      onDoubleClick={() => setEditingId(isEditing ? null : d.id)}
                      title="ダブルクリックで親マスターを編集"
                    >
                      <div className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                        <span className="truncate">{d.label || d.id}</span>
                        <span className="text-[9px] font-normal text-amber-500">detail</span>
                        {!linked && <AlertTriangle className="w-3 h-3 text-red-500 ml-auto shrink-0" />}
                      </div>
                      {isEditing ? (
                        <select
                          autoFocus
                          className="mt-1 w-full text-[10px] border rounded px-1 py-0.5 bg-background"
                          value={linked ? d.linkedMasterGroupId : ''}
                          onChange={(e) => {
                            onSetLinkedMaster(d.id, e.target.value || undefined)
                            setEditingId(null)
                          }}
                          onBlur={() => setEditingId(null)}
                          aria-label={`${d.label || d.id} の親マスター`}
                        >
                          <option value="">未設定…</option>
                          {masters.map((m) => (
                            <option key={m.id} value={m.id}>{m.label || m.id}</option>
                          ))}
                        </select>
                      ) : (
                        !linked && (
                          <div className="mt-0.5 text-[9px] text-red-500 leading-tight">
                            親マスター未設定（Wクリックで設定）
                          </div>
                        )
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Column 3: product master (lookup source) */}
              <div className="flex flex-col gap-1">
                {product && (
                  <div
                    ref={(el) => setNodeRef(PRODUCT_NODE, el)}
                    className="rounded-md border-2 border-dashed border-amber-400 bg-white px-2 py-1.5"
                  >
                    <div className="text-[10px] font-semibold text-amber-700 flex items-center gap-1">
                      <Boxes className="w-3 h-3" />
                      {product.label || '商品マスター'}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      lookup 元（product_code で参照）
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
