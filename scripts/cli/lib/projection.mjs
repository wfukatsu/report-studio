/**
 * Template projections — summary and outline.
 *
 * A real template runs 25–65 KB of JSON (invoice.json: 62.6 KB / 61 elements /
 * 128 UUID occurrences), roughly 18–20k tokens if dumped whole. Printing that to
 * an agent burns its context in one call, so the default views are:
 *
 *   summary — 300–600 tokens: what this template IS
 *   outline — ~20 tokens/element: TSV + short handles instead of UUID-laden JSON
 *
 * Full JSON stays available behind `templates get --force`.
 */

/** Unwrap the canonical resource envelope from GET /api/v2/templates/{id}. */
export function unwrapEnvelope(res) {
  const definition = res?.definition ?? res
  return {
    definition,
    meta: {
      id: res?.id ?? definition?.id ?? '',
      name: res?.name ?? definition?.metadata?.name ?? definition?.metadata?.documentName ?? '',
      visibility: res?.visibility ?? '',
      createdAt: res?.createdAt ?? '',
      updatedAt: res?.updatedAt ?? '',
      formatVersion: res?.formatVersion ?? '',
    },
  }
}

/**
 * Walk pages → sections → elements in render order.
 *
 * Deliberately ignores the deprecated `page.elements`: the renderer ignores it
 * too, so surfacing it here would describe something the user cannot see. Use
 * `findStrayPageElements` to report it as a defect instead.
 */
export function walkElements(definition) {
  const rows = []
  const pages = definition?.pages ?? []
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const sections = pages[pageIndex]?.sections ?? []
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex]
      for (const element of section?.elements ?? []) {
        rows.push({
          pageIndex,
          sectionIndex,
          sectionId: section.id,
          sectionType: section.sectionType ?? '',
          element,
        })
      }
    }
  }
  return rows
}

/** Pages carrying the deprecated top-level `elements` array (silently unrendered). */
export function findStrayPageElements(definition) {
  const stray = []
  const pages = definition?.pages ?? []
  for (let i = 0; i < pages.length; i++) {
    const n = Array.isArray(pages[i]?.elements) ? pages[i].elements.length : 0
    if (n > 0) stray.push({ pageIndex: i, count: n })
  }
  return stray
}

const TOKEN_RE = /\{\{([^}]+)\}\}/g

/** One-line description of what an element is bound to, or '-' for static content. */
export function bindingOf(el) {
  if (el?.fieldKey) return el.fieldKey
  if (el?.dataSource) return `${el.dataSource}[]`
  if (typeof el?.content === 'string') {
    const tokens = [...el.content.matchAll(TOKEN_RE)].map((m) => m[1].trim())
    if (tokens.length > 0) return tokens.join(',')
  }
  if (typeof el?.type === 'string' && el.type.startsWith('tenant')) return '(tenant)'
  return '-'
}

/** True when the element draws data rather than a fixed literal. */
export function isBound(el) {
  return bindingOf(el) !== '-'
}

function round(n) {
  return Math.round(Number(n ?? 0) * 10) / 10
}

function rectOf(el) {
  return `${round(el?.position?.x)},${round(el?.position?.y)},${round(el?.size?.width)},${round(el?.size?.height)}`
}

function truncate(s, n) {
  const str = String(s ?? '')
  return str.length > n ? str.slice(0, n - 1) + '…' : str
}

// ── summary ────────────────────────────────────────────────────────────────

export function buildSummary(envelope) {
  const { definition: def, meta } = envelope
  const rows = walkElements(def)

  const byType = {}
  let bound = 0
  for (const { element } of rows) {
    byType[element.type] = (byType[element.type] ?? 0) + 1
    if (isBound(element)) bound++
  }

  const ps = def?.pageSettings ?? {}
  const paper = ps.paperSize
    ? `${ps.paperSize}${ps.orientation === 'landscape' ? 'L' : 'P'}`
    : '-'

  return {
    id: meta.id,
    name: meta.name,
    visibility: meta.visibility,
    updatedAt: meta.updatedAt,
    formatVersion: meta.formatVersion,
    paper,
    description: def?.metadata?.description ?? '',
    pages: (def?.pages ?? []).map((p, i) => ({
      index: i,
      name: p.name ?? '',
      size: `${round(p.width)}x${round(p.height)}mm`,
      sections: (p.sections ?? []).map((s) => s.sectionType ?? '?'),
      elements: (p.sections ?? []).reduce((n, s) => n + (s.elements?.length ?? 0), 0),
    })),
    elements: {
      total: rows.length,
      bound,
      unbound: rows.length - bound,
      byType: Object.fromEntries(Object.entries(byType).sort((a, b) => b[1] - a[1])),
    },
    schema: (def?.schema?.groups ?? []).map((g) => ({
      dataKey: g.dataKey,
      role: g.role,
      label: g.label,
      fields: g.fields?.length ?? 0,
      table: g.tableMeta ? `${g.tableMeta.namespace}.${g.tableMeta.tableName}` : '-',
    })),
    relations: (def?.schema?.relations ?? []).length,
    rules: {
      calculation: (def?.calculationRules ?? []).length,
      validation: (def?.validationRules ?? []).length,
    },
    dataSources: (def?.dataSources ?? []).map((d) => d.name ?? d.id),
    outputVariants: (def?.outputVariants ?? []).map((v) => v.name ?? v.id),
    strayPageElements: findStrayPageElements(def),
  }
}

export function formatSummary(s) {
  const lines = []
  lines.push(`${s.name}  [${s.visibility || '-'}]  ${s.paper}  formatVersion=${s.formatVersion}`)
  lines.push(`id=${s.id}  updatedAt=${s.updatedAt}`)
  if (s.description) lines.push(`説明: ${truncate(s.description, 100)}`)
  lines.push('')

  lines.push(`ページ (${s.pages.length}):`)
  for (const p of s.pages) {
    lines.push(`  [${p.index}] ${p.name}  ${p.size}  sections=${p.sections.join('/')}  elements=${p.elements}`)
  }
  lines.push('')

  const types = Object.entries(s.elements.byType)
    .map(([t, n]) => `${t}=${n}`)
    .join('  ')
  lines.push(`要素 (${s.elements.total}): バインド ${s.elements.bound} / 静的 ${s.elements.unbound}`)
  if (types) lines.push(`  ${types}`)
  lines.push('')

  if (s.schema.length > 0) {
    lines.push(`スキーマ (${s.schema.length} グループ, relations=${s.relations}):`)
    for (const g of s.schema) {
      lines.push(`  ${g.dataKey}  [${g.role}]  fields=${g.fields}  table=${g.table}  — ${g.label}`)
    }
    lines.push('')
  }

  lines.push(`ルール: 計算 ${s.rules.calculation} / 検証 ${s.rules.validation}`)
  if (s.dataSources.length > 0) lines.push(`サンプルデータ: ${s.dataSources.join(', ')}`)
  if (s.outputVariants.length > 0) lines.push(`出力バリアント: ${s.outputVariants.join(', ')}`)

  if (s.strayPageElements.length > 0) {
    lines.push('')
    for (const { pageIndex, count } of s.strayPageElements) {
      lines.push(
        `⚠ page[${pageIndex}].elements に ${count} 件あります（@deprecated・レンダラーに無視されます）。` +
          ' sections[].elements へ移してください。',
      )
    }
  }
  return lines.join('\n')
}

// ── outline ────────────────────────────────────────────────────────────────

/**
 * Assign short handles in render order and group by page/section.
 *
 * @returns {{groups: Array, map: Record<string,string>}}
 */
export function buildOutline(definition, { pageFilter } = {}) {
  const rows = walkElements(definition)
  const map = {}
  const groups = []
  let seq = 0
  let currentKey = null

  for (const row of rows) {
    seq++
    const handle = `e${seq}`
    map[handle] = row.element.id
    if (pageFilter !== undefined && row.pageIndex !== pageFilter) continue

    const key = `${row.pageIndex}/${row.sectionIndex}`
    if (key !== currentKey) {
      currentKey = key
      groups.push({
        pageIndex: row.pageIndex,
        sectionIndex: row.sectionIndex,
        sectionId: row.sectionId,
        sectionType: row.sectionType,
        entries: [],
      })
    }
    groups[groups.length - 1].entries.push({
      handle,
      id: row.element.id,
      type: row.element.type,
      rect: rectOf(row.element),
      bind: bindingOf(row.element),
      name: row.element.name ?? '',
      hidden: row.element.visible === false,
      locked: row.element.locked === true,
    })
  }
  return { groups, map, total: rows.length }
}

export function formatOutline(meta, outline, handleFilePath) {
  const lines = []
  lines.push(
    `template\t${meta.name}\tpages=${meta.pageCount}\telements=${outline.total}\tupdatedAt=${meta.updatedAt}`,
  )
  if (handleFilePath) lines.push(`handles\t${handleFilePath}`)
  for (const g of outline.groups) {
    lines.push('')
    lines.push(`# page ${g.pageIndex} / section ${g.sectionIndex} (${g.sectionType})  ${g.sectionId}`)
    lines.push('id\ttype\trect\tbind\tname')
    for (const e of g.entries) {
      const flags = `${e.hidden ? ' [hidden]' : ''}${e.locked ? ' [locked]' : ''}`
      lines.push(`${e.handle}\t${e.type}\t${e.rect}\t${e.bind}\t${truncate(e.name, 24)}${flags}`)
    }
  }
  lines.push('')
  lines.push('# rect = x,y,width,height (mm)。id はハンドル（templates edit --ops でそのまま使えます）')
  return lines.join('\n')
}
