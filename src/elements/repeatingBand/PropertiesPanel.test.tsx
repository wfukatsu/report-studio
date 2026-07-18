/**
 * RepeatingBandPropertiesPanel — #140: data-source picker.
 * The dataSource is a dropdown of real detail (array) schema groups, with an
 * explicit error when unselected or pointing at a non-existent group.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { createRepeatingBandElement } from '@/lib/elementFactories'
import { RepeatingBandPropertiesPanel } from './PropertiesPanel'
import type { RepeatingBandElement, SchemaGroup } from '@/types'

function group(patch: Partial<SchemaGroup>): SchemaGroup {
  return { id: patch.dataKey ?? 'g', label: '', role: 'detail', dataKey: '', fields: [], ...patch }
}

/** Seed the store schema with the given groups. */
function seedGroups(groups: SchemaGroup[]) {
  useReportStore.setState((s) => ({
    definition: { ...s.definition, schema: { groups } },
  }))
}

function band(patch: Partial<RepeatingBandElement> = {}): RepeatingBandElement {
  return createRepeatingBandElement(patch) as RepeatingBandElement
}

beforeEach(() => {
  useReportStore.getState().newReport()
  vi.restoreAllMocks()
})

const DETAIL_GROUPS: SchemaGroup[] = [
  group({ id: 'items', dataKey: 'items', label: '明細', role: 'detail' }),
  group({ id: 'lines', dataKey: 'lines', label: '行', role: 'detail' }),
  group({ id: 'header', dataKey: 'header', label: 'ヘッダ', role: 'master' }),
]

describe('RepeatingBandPropertiesPanel — data source picker (#140)', () => {
  it('lists only detail groups (not master groups) as options', () => {
    seedGroups(DETAIL_GROUPS)
    render(<RepeatingBandPropertiesPanel el={band({ dataSource: 'items' })} onChange={vi.fn()} />)
    const select = screen.getByLabelText('データソース (明細グループ)') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('items')
    expect(values).toContain('lines')
    expect(values).not.toContain('header') // master group excluded
  })

  it('sets dataSource when a detail group is chosen', () => {
    seedGroups(DETAIL_GROUPS)
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={band({ dataSource: '' })} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('データソース (明細グループ)'), {
      target: { value: 'lines' },
    })
    expect(onChange).toHaveBeenCalledWith({ dataSource: 'lines' })
  })

  it('shows an error when nothing is selected', () => {
    seedGroups(DETAIL_GROUPS)
    render(<RepeatingBandPropertiesPanel el={band({ dataSource: '' })} onChange={vi.fn()} />)
    expect(screen.getByText(/データソースが未選択です/)).toBeInTheDocument()
  })

  it('shows an error and preserves an unknown/legacy dataSource', () => {
    seedGroups(DETAIL_GROUPS)
    render(<RepeatingBandPropertiesPanel el={band({ dataSource: 'ghost' })} onChange={vi.fn()} />)
    expect(screen.getByText(/「ghost」に一致する明細グループがありません/)).toBeInTheDocument()
    const select = screen.getByLabelText('データソース (明細グループ)') as HTMLSelectElement
    expect(select.value).toBe('ghost') // legacy value kept, not silently dropped
  })

  it('does not show an error when a valid detail group is selected', () => {
    seedGroups(DETAIL_GROUPS)
    render(<RepeatingBandPropertiesPanel el={band({ dataSource: 'items' })} onChange={vi.fn()} />)
    expect(screen.queryByText(/一致する明細グループがありません/)).not.toBeInTheDocument()
    expect(screen.queryByText(/データソースが未選択です/)).not.toBeInTheDocument()
  })

  it('prompts to add a detail group when none exist', () => {
    seedGroups([group({ id: 'header', dataKey: 'header', label: 'ヘッダ', role: 'master' })])
    render(<RepeatingBandPropertiesPanel el={band({ dataSource: '' })} onChange={vi.fn()} />)
    expect(screen.getByText(/明細グループがありません/)).toBeInTheDocument()
  })
})
