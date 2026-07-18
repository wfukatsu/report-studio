import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import * as bindingAnalysis from '@/hooks/useBindingAnalysis'
import * as reportApi from '@/api/reportApi'
import { DataBindingOverviewPanel } from './DataBindingOverviewPanel'
import type { BindingAnalysis } from '@/hooks/useBindingAnalysis'

// ---------------------------------------------------------------------------
// Mock helper
// ---------------------------------------------------------------------------

function mockAnalysis(partial: Partial<BindingAnalysis>) {
  vi.spyOn(bindingAnalysis, 'useBindingAnalysis').mockReturnValue({
    hasDataSource: true,
    unboundElements: [],
    fieldMappings: [],
    missingInSampleElements: [],
    ...partial,
  })
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setDataSource(null)
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Empty state (no DataSource)
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — DataSource 未設定', () => {
  it('shows empty state message when no datasource', () => {
    mockAnalysis({ hasDataSource: false })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/データソースが未設定/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Unbound section
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — 未バインドセクション', () => {
  it('shows unbound section when there are unbound elements', () => {
    mockAnalysis({
      unboundElements: [
        { elementId: 'el1', elementLabel: 'テキスト要素', pageId: 'p1', fieldKey: undefined },
      ],
    })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/未バインド/)).toBeInTheDocument()
    expect(screen.getByText('テキスト要素')).toBeInTheDocument()
  })

  it('hides unbound section when there are no unbound elements', () => {
    mockAnalysis({ unboundElements: [] })
    render(<DataBindingOverviewPanel />)
    expect(screen.queryByText(/未バインド/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Field mapping section
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — フィールドマッピング', () => {
  it('shows mapping section when there are mappings', () => {
    mockAnalysis({
      fieldMappings: [
        { elementId: 'el2', elementLabel: '氏名フィールド', pageId: 'p1', fieldKey: 'customer.name' },
      ],
    })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/マッピング/)).toBeInTheDocument()
    expect(screen.getByText('customer.name')).toBeInTheDocument()
    expect(screen.getByText('氏名フィールド')).toBeInTheDocument()
  })

  it('hides mapping section when there are no mappings', () => {
    mockAnalysis({ fieldMappings: [] })
    render(<DataBindingOverviewPanel />)
    expect(screen.queryByText(/マッピング/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Error section
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — エラーセクション', () => {
  it('shows error section when there are error elements', () => {
    mockAnalysis({
      missingInSampleElements: [
        { elementId: 'el3', elementLabel: '単価テキスト', pageId: 'p1', fieldKey: 'price' },
      ],
    })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/サンプル値なし/)).toBeInTheDocument()
    expect(screen.getByText('単価テキスト')).toBeInTheDocument()
  })

  it('hides error section when there are no error elements', () => {
    mockAnalysis({ missingInSampleElements: [] })
    render(<DataBindingOverviewPanel />)
    expect(screen.queryByText(/エラー/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Click interaction
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Phase 3.5: LivePreviewSection with linkedMasterGroupId
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — Phase 3.5: 親グループリンク自動入力', () => {
  function setupLinkedGroups() {
    mockAnalysis({ hasDataSource: true })
    useReportStore.getState().setCurrentTemplateId('tmpl-1')

    // Add master group with tableMeta
    useReportStore.getState().addSchemaGroup('master')
    const masterGroupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(masterGroupId, { key: 'customerId', label: '顧客ID', type: 'string', dbColumnName: 'customer_id' } as import('@/types').SchemaField)
    useReportStore.getState().bindGroupToTable(masterGroupId, { namespace: 'app', tableName: 'customers' })

    // Add detail group with tableMeta and linked to master
    useReportStore.getState().addSchemaGroup('detail')
    const detailGroupId = useReportStore.getState().definition.schema!.groups[1].id
    useReportStore.getState().addSchemaField(detailGroupId, { key: 'orderId', label: '注文ID', type: 'string', dbColumnName: 'customer_id' } as import('@/types').SchemaField)
    useReportStore.getState().bindGroupToTable(detailGroupId, { namespace: 'app', tableName: 'orders' })
    useReportStore.getState().updateSchemaGroup(detailGroupId, { label: '注文', linkedMasterGroupId: masterGroupId })

    return { masterGroupId, detailGroupId }
  }

  it('linkedMasterGroupId が設定された detail グループに "(自動: ...)" ラベルが表示される', () => {
    setupLinkedGroups()
    render(<DataBindingOverviewPanel />)

    expect(screen.getByText(/自動: マスター/)).toBeInTheDocument()
  })

  it('linked detail グループの手動入力フィールドが非表示になる', () => {
    setupLinkedGroups()
    render(<DataBindingOverviewPanel />)

    // The detail group's key field input should NOT be present
    const inputs = screen.queryAllByPlaceholderText('値を入力...')
    // Only master group input should remain, not detail group's
    expect(inputs).toHaveLength(1)
  })

  it('resolveBindings 呼び出し時に detail グループへ master のキー値が自動コピーされる', async () => {
    const { detailGroupId, masterGroupId } = setupLinkedGroups()
    const mockResolveBindings = vi.spyOn(reportApi, 'resolveBindings').mockResolvedValue({
      resolved: {},
      errors: {},
    })

    render(<DataBindingOverviewPanel />)

    // Enter partition key value for master group
    const input = screen.getByPlaceholderText('値を入力...')
    fireEvent.change(input, { target: { value: 'C001' } })

    // Trigger preview refresh
    const refreshBtn = screen.getByText('プレビュー更新')
    fireEvent.click(refreshBtn)

    await vi.waitFor(() => {
      expect(mockResolveBindings).toHaveBeenCalledTimes(1)
    })

    const callArgs = mockResolveBindings.mock.calls[0]
    const request = callArgs[1] as import('@/api/reportApi').ResolveBindingsRequest
    // Master group partition key should be present
    expect(request.partitionKeys[masterGroupId]).toEqual({ customer_id: 'C001' })
    // Detail group should have auto-filled values from master
    expect(request.partitionKeys[detailGroupId]).toEqual({ customer_id: 'C001' })
  })
})

// ---------------------------------------------------------------------------
// Partition-key pre-fill from sample data (connected built-in templates)
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — サンプルデータからのパーティションキー自動入力', () => {
  it('DBバインド済みテンプレート読込時に doc_no がサンプル値で自動入力される', async () => {
    mockAnalysis({ hasDataSource: true })
    const store = useReportStore.getState()
    store.addSchemaGroup('master')
    const gid = useReportStore.getState().definition.schema!.groups[0].id
    store.updateSchemaGroup(gid, { dataKey: 'document' })
    store.addSchemaField(gid, { key: 'number', label: '番号', type: 'string', dbColumnName: 'doc_no' } as import('@/types').SchemaField)
    store.bindGroupToTable(gid, { namespace: 'demo', tableName: 'invmod_header' })
    useReportStore.setState((s) => {
      s.definition.dataSources = [{ id: 'ds1', name: 's', fields: { document: { number: 'INV-2026-0031' } } }]
    })
    store.setCurrentTemplateId('tmpl-connected')

    render(<DataBindingOverviewPanel />)

    await vi.waitFor(() => {
      const input = screen.getByPlaceholderText('値を入力...') as HTMLInputElement
      expect(input.value).toBe('INV-2026-0031')
    })
  })
})

describe('DataBindingOverviewPanel — クリックで要素選択', () => {
  it('calls selectElement and setActivePage when unbound element row is clicked', () => {
    const selectElement = vi.spyOn(useReportStore.getState(), 'selectElement')
    const setActivePage = vi.spyOn(useReportStore.getState(), 'setActivePage')

    mockAnalysis({
      unboundElements: [
        { elementId: 'el-click', elementLabel: 'クリック要素', pageId: 'page-abc', fieldKey: undefined },
      ],
    })
    render(<DataBindingOverviewPanel />)
    fireEvent.click(screen.getByText('クリック要素'))
    expect(setActivePage).toHaveBeenCalledWith('page-abc')
    expect(selectElement).toHaveBeenCalledWith('el-click')
  })

  it('calls selectElement and setActivePage when error element row is clicked', () => {
    const selectElement = vi.spyOn(useReportStore.getState(), 'selectElement')
    const setActivePage = vi.spyOn(useReportStore.getState(), 'setActivePage')

    mockAnalysis({
      missingInSampleElements: [
        { elementId: 'el-err', elementLabel: 'エラー要素', pageId: 'page-xyz', fieldKey: 'bad.key' },
      ],
    })
    render(<DataBindingOverviewPanel />)
    fireEvent.click(screen.getByText('エラー要素'))
    expect(setActivePage).toHaveBeenCalledWith('page-xyz')
    expect(selectElement).toHaveBeenCalledWith('el-err')
  })
})
