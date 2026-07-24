/**
 * ElementDef — per-element-type metadata + adapters (#414).
 *
 * Each element directory exports one `ElementDef` from its `index.tsx`
 * (e.g. `src/elements/text/index.tsx` exports `textDef`). The full set is
 * aggregated in `src/elements/registry.ts` as a
 * `Record<ReportElement['type'], ElementDef>` — the single registration point
 * that replaces the former per-type switches in ElementRenderer /
 * PropertiesPanel / layerUtils / previewUtils / BINDABLE_TYPES.
 *
 * Renderers take type-specific props (`resolveValues`, `records`,
 * `sampleHint`, …). That variance is absorbed here: `renderElement` receives
 * the common `RendererContext` and each def's thin adapter maps it onto its
 * Renderer's props — including the design-vs-preview differences driven by
 * `readonly` (see "Design vs Preview rendering" in CLAUDE.md).
 */
import type { ComponentType, ReactElement } from 'react'
import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import type { ReportElement, RepeatingBandField, TextStyle } from '@/types'

/**
 * Common context passed by ElementRenderer to every def's `renderElement`.
 * Adapters pick what they need and derive type-specific props
 * (e.g. `sampleHint = !readonly`, `records = readonly ? data[dataSource] : undefined`).
 */
export interface RendererContext<T extends ReportElement = ReportElement> {
  element: T
  /** Merged data (sample/live data + computedValues). */
  data: Record<string, unknown>
  /** `true` = preview/export, `false` = design canvas. */
  readonly: boolean
  /** Default text style from the store (threaded from SectionContainer). */
  defaultStyle: TextStyle
  /** 1-based page index (pageNumber elements). */
  pageIndex?: number
  /** Total page count (pageNumber elements). */
  totalPages?: number
  /** repeatingBand inline column-editing callback (design mode only). */
  onBandFieldsChange?: (fields: RepeatingBandField[]) => void
}

export interface ElementDef<T extends ReportElement = ReportElement> {
  type: T['type']
  /**
   * Thin adapter: common context → type-specific Renderer JSX.
   * Must stay a plain function (no hooks) — it is invoked as a function,
   * not rendered as a component.
   */
  renderElement: (ctx: RendererContext<T>) => ReactElement | null
  /** Sidebar properties panel for this type. */
  PropertiesPanel: ComponentType<{ el: T; onChange: (patch: Partial<T>) => void }>
  /** Layer-panel icon (lucide component). */
  layerIcon: LucideIcon
  /** Layer-panel default display name (used when `el.name` is unset). */
  layerName: (el: T, t: TFunction<'components'>) => string
  /** Whether the element supports schemaBinding (binding editor / schema drop). */
  bindable: boolean
  /**
   * readonly-mode empty-binding suppression: return `true` when the element is
   * bound but its data resolved empty, so preview/export hides the placeholder.
   * Unset = the element never counts as empty (static / handled elsewhere).
   */
  isEmptyInPreview?: (
    el: T,
    data: Record<string, unknown>,
    calculationOutputKeys?: Set<string>,
  ) => boolean
}
