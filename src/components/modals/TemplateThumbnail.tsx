import { useMemo } from 'react'
import type { ReportDefinition, ReportElement, ElementType } from '@/types'

/**
 * Lightweight wireframe thumbnail of a template's first page.
 *
 * Renders each element as a simplified, resolution-independent shape positioned
 * by percentage of the page dimensions (no pixel scale, no store dependency).
 * The goal is a recognizable document silhouette — enough for a non-technical
 * user to tell an invoice from a form at a glance (#108) — not a pixel-accurate
 * preview. Backend templates use real server-rendered thumbnails instead.
 */

type Kind = 'title' | 'text' | 'table' | 'line' | 'media' | 'shape'

const TABLE_TYPES = new Set<ElementType>(['formTable', 'repeatingBand', 'repeatingList'])
const LINE_TYPES = new Set<ElementType>(['divider'])
const MEDIA_TYPES = new Set<ElementType>([
  'image', 'tenantLogo', 'barcode', 'chart', 'hanko', 'approvalStampRow', 'revenueStamp',
])
const TEXT_TYPES = new Set<ElementType>([
  'text', 'dataField', 'manualEntry', 'checkbox', 'eraSelect', 'pageNumber', 'currentDate',
  'tenantCompanyName', 'tenantAddress', 'tenantPhone', 'tenantRepresentative', 'tenantCustom',
])

function classify(el: ReportElement): Kind {
  const type = el.type as ElementType
  if (TABLE_TYPES.has(type)) return 'table'
  if (LINE_TYPES.has(type)) return 'line'
  if (MEDIA_TYPES.has(type)) return 'media'
  if (type === 'shape') return 'shape'
  if (TEXT_TYPES.has(type)) {
    // Larger type reads as a heading in the silhouette.
    const fontSize = (el as { fontSize?: number; style?: { fontSize?: number } }).fontSize
      ?? (el as { style?: { fontSize?: number } }).style?.fontSize
    return fontSize !== undefined && fontSize >= 16 ? 'title' : 'text'
  }
  return 'text'
}

interface PlacedElement {
  key: string
  kind: Kind
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  definition: ReportDefinition
  className?: string
}

export function TemplateThumbnail({ definition, className }: Props) {
  const { placed, background } = useMemo(() => {
    const page = definition.pages[0]
    if (!page) return { placed: [] as PlacedElement[], background: '#ffffff' }

    // Absolute Y requires accumulating section heights, since element positions
    // are stored relative to their section (mirrors the drop-handler math).
    let offsetY = 0
    const rows: { el: ReportElement; absY: number }[] = []
    for (const section of page.sections ?? []) {
      for (const el of section.elements) {
        if (el.visible === false) continue
        rows.push({ el, absY: offsetY + el.position.y })
      }
      offsetY += section.height
    }

    const denomW = page.width || 210
    const denomH = page.height || offsetY || 297

    const placed: PlacedElement[] = rows.map(({ el, absY }, i) => ({
      key: el.id ?? `el-${i}`,
      kind: classify(el),
      left: (el.position.x / denomW) * 100,
      top: (absY / denomH) * 100,
      width: Math.max((el.size.width / denomW) * 100, 0.5),
      height: Math.max((el.size.height / denomH) * 100, 0.3),
    }))

    return { placed, background: page.background || '#ffffff' }
  }, [definition])

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', aspectRatio: '210 / 297', background, overflow: 'hidden' }}
      aria-hidden="true"
    >
      {placed.map((p) => (
        <div
          key={p.key}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.width}%`,
            height: `${p.height}%`,
          }}
        >
          {renderKind(p.kind)}
        </div>
      ))}
    </div>
  )
}

function renderKind(kind: Kind) {
  switch (kind) {
    case 'title':
      // Solid dark bar filling ~60% height — reads as a heading.
      return <div style={{ width: '85%', height: '55%', margin: '10% 0', background: 'rgba(30,30,30,0.55)', borderRadius: 1 }} />
    case 'text':
      // Two thin bars simulate a line or two of body text.
      return (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '22%', height: '100%' }}>
          <div style={{ height: 2, background: 'rgba(60,60,60,0.32)', borderRadius: 1 }} />
          <div style={{ height: 2, width: '70%', background: 'rgba(60,60,60,0.22)', borderRadius: 1 }} />
        </div>
      )
    case 'table':
      // Bordered box with a couple of interior rules.
      return (
        <div style={{ width: '100%', height: '100%', border: '1px solid rgba(60,60,60,0.35)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, borderBottom: '1px solid rgba(60,60,60,0.25)' }} />
          <div style={{ flex: 1, borderBottom: '1px solid rgba(60,60,60,0.18)' }} />
          <div style={{ flex: 1 }} />
        </div>
      )
    case 'line':
      return <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center' }}><div style={{ width: '100%', height: 1, background: 'rgba(60,60,60,0.4)' }} /></div>
    case 'media':
      return <div style={{ width: '100%', height: '100%', background: 'rgba(60,60,60,0.12)', border: '1px solid rgba(60,60,60,0.2)', borderRadius: 1 }} />
    case 'shape':
      return <div style={{ width: '100%', height: '100%', border: '1px solid rgba(60,60,60,0.3)', borderRadius: 1 }} />
  }
}
