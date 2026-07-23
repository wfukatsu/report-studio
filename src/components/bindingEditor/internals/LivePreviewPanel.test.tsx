import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import * as reportApi from '@/api/reportApi'
import { NetworkError, ResponseValidationError } from '@/api/client'
import { LivePreviewPanel } from './LivePreviewPanel'
import { tk } from '@/test/i18n'
import type { SchemaField } from '@/types'

const PLACEHOLDER = tk('components:bindingEditor.livePreview.valuePlaceholder')
const REFRESH = tk('components:bindingEditor.livePreview.refresh')

/** A saved, DB-bound master group so the panel renders its body + inputs. */
function setupBoundMaster(): void {
  const store = useReportStore.getState()
  store.setCurrentTemplateId('tmpl-1')
  store.addSchemaGroup('master')
  const gid = useReportStore.getState().definition.schema!.groups[0].id
  store.addSchemaField(gid, { key: 'reportId', label: '帳票ID', type: 'string', dbColumnName: 'report_id' } as SchemaField)
  store.bindGroupToTable(gid, { namespace: 'demo', tableName: 'invmod_header' })
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setDataSource(null)
  vi.restoreAllMocks()
  // Default: an empty catalog so the panel can't identify key columns and falls
  // back to showing every mapped column (the pre-#389 behaviour these suites
  // assert). Individual tests override with a real catalog.
  vi.spyOn(reportApi, 'fetchScalarDbCatalogCached').mockResolvedValue({ namespaces: [] })
})

// Partition-key resolve flow (#330 reconnection; formerly DataBindingOverviewPanel)
describe('LivePreviewPanel — linked master/detail auto-fill', () => {
  function setupLinkedGroups() {
    const store = useReportStore.getState()
    store.setCurrentTemplateId('tmpl-1')

    store.addSchemaGroup('master')
    const masterGroupId = useReportStore.getState().definition.schema!.groups[0].id
    store.addSchemaField(masterGroupId, { key: 'customerId', label: '顧客ID', type: 'string', dbColumnName: 'customer_id' } as SchemaField)
    store.bindGroupToTable(masterGroupId, { namespace: 'app', tableName: 'customers' })

    store.addSchemaGroup('detail')
    const detailGroupId = useReportStore.getState().definition.schema!.groups[1].id
    store.addSchemaField(detailGroupId, { key: 'orderId', label: '注文ID', type: 'string', dbColumnName: 'customer_id' } as SchemaField)
    store.bindGroupToTable(detailGroupId, { namespace: 'app', tableName: 'orders' })
    store.updateSchemaGroup(detailGroupId, { label: '注文', linkedMasterGroupId: masterGroupId })

    return { masterGroupId, detailGroupId }
  }

  it('shows a "(auto: …)" label on a detail group linked to a master', () => {
    setupLinkedGroups()
    render(<LivePreviewPanel />)
    expect(screen.getByText(tk('components:bindingEditor.livePreview.autoFill', { name: '新規マスター1' }))).toBeInTheDocument()
  })

  it('hides the manual input for a linked detail group', () => {
    setupLinkedGroups()
    render(<LivePreviewPanel />)
    // Only the (unlinked) master group renders an input.
    expect(screen.queryAllByPlaceholderText(PLACEHOLDER)).toHaveLength(1)
  })

  it("auto-copies the master's key value to the linked detail group on resolve", async () => {
    const { detailGroupId, masterGroupId } = setupLinkedGroups()
    const mockResolveBindings = vi.spyOn(reportApi, 'resolveBindings').mockResolvedValue({ resolved: {}, errors: {} })

    render(<LivePreviewPanel />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'C001' } })
    fireEvent.click(screen.getByText(REFRESH))

    await vi.waitFor(() => expect(mockResolveBindings).toHaveBeenCalledTimes(1))

    const request = mockResolveBindings.mock.calls[0][1] as import('@/api/reportApi').ResolveBindingsRequest
    expect(request.partitionKeys[masterGroupId]).toEqual({ customer_id: 'C001' })
    expect(request.partitionKeys[detailGroupId]).toEqual({ customer_id: 'C001' })
  })

  it('feeds the resolved data into live preview', async () => {
    setupLinkedGroups()
    vi.spyOn(reportApi, 'resolveBindings').mockResolvedValue({
      resolved: { [useReportStore.getState().definition.schema!.groups[0].id]: { customer_id: 'C001', name: 'Acme' } },
      errors: {},
    })

    render(<LivePreviewPanel />)
    fireEvent.change(screen.getByPlaceholderText(PLACEHOLDER), { target: { value: 'C001' } })
    fireEvent.click(screen.getByText(REFRESH))

    await vi.waitFor(() => expect(useReportStore.getState().livePreviewData).not.toBeNull())
  })
})

describe('LivePreviewPanel — sample-data seeding', () => {
  it('pre-fills report_id from the sample data on load', async () => {
    const store = useReportStore.getState()
    store.addSchemaGroup('master')
    const gid = useReportStore.getState().definition.schema!.groups[0].id
    store.updateSchemaGroup(gid, { dataKey: 'document' })
    store.addSchemaField(gid, { key: 'reportId', label: '帳票ID', type: 'string', dbColumnName: 'report_id' } as SchemaField)
    store.bindGroupToTable(gid, { namespace: 'demo', tableName: 'invmod_header' })
    useReportStore.setState((s) => {
      s.definition.dataSources = [{ id: 'ds1', name: 's', fields: { document: { reportId: 'RPT-0001' } } }]
    })
    store.setCurrentTemplateId('tmpl-connected')

    render(<LivePreviewPanel />)
    await vi.waitFor(() => {
      expect((screen.getByPlaceholderText(PLACEHOLDER) as HTMLInputElement).value).toBe('RPT-0001')
    })
  })
})

// #389: partition-key inputs must be restricted to actual key columns, not
// every mapped column, when the catalog identifies the table's keys.
describe('LivePreviewPanel — partition-key column filtering', () => {
  function setupMasterWithMixedColumns() {
    const store = useReportStore.getState()
    store.setCurrentTemplateId('tmpl-1')
    store.addSchemaGroup('master')
    const gid = useReportStore.getState().definition.schema!.groups[0].id
    // report_id is the partition key; doc_no is a regular mapped column.
    store.addSchemaField(gid, { key: 'reportId', label: '帳票ID', type: 'string', dbColumnName: 'report_id' } as SchemaField)
    store.addSchemaField(gid, { key: 'docNo', label: '請求番号', type: 'string', dbColumnName: 'doc_no' } as SchemaField)
    store.bindGroupToTable(gid, { namespace: 'demo', tableName: 'invmod_header' })
    return gid
  }

  it('shows an input for the partition-key column only, not regular columns', async () => {
    setupMasterWithMixedColumns()
    vi.spyOn(reportApi, 'fetchScalarDbCatalogCached').mockResolvedValue({
      namespaces: [{
        name: 'demo',
        tables: [{
          name: 'invmod_header',
          columns: [
            { name: 'report_id', type: 'TEXT', keyType: 'partition' },
            { name: 'doc_no', type: 'TEXT' }, // regular column — no keyType
          ],
        }],
      }],
    })

    render(<LivePreviewPanel />)

    // Once the catalog loads, only report_id remains an input.
    await vi.waitFor(() => expect(screen.queryAllByPlaceholderText(PLACEHOLDER)).toHaveLength(1))
    expect(screen.getByText('report_id')).toBeInTheDocument()
    expect(screen.queryByText('doc_no')).not.toBeInTheDocument()
  })

  it('falls back to all mapped columns when the catalog lacks the table', async () => {
    setupMasterWithMixedColumns()
    // Default empty-catalog mock from beforeEach → no key info → show both.
    render(<LivePreviewPanel />)
    await vi.waitFor(() => expect(screen.queryAllByPlaceholderText(PLACEHOLDER)).toHaveLength(2))
  })
})

// #390: the panel header collapses so it doesn't push the binding canvas below the fold.
describe('LivePreviewPanel — collapse toggle', () => {
  it('collapses and expands the body via the header toggle', async () => {
    setupBoundMaster()
    render(<LivePreviewPanel />)
    await vi.waitFor(() => expect(screen.queryAllByPlaceholderText(PLACEHOLDER)).toHaveLength(1))

    // The collapsible header is the expanded button; clicking it hides the body.
    const header = screen.getByRole('button', { expanded: true })
    fireEvent.click(header)
    expect(screen.queryAllByPlaceholderText(PLACEHOLDER)).toHaveLength(0)
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { expanded: false }))
    expect(screen.queryAllByPlaceholderText(PLACEHOLDER)).toHaveLength(1)
  })
})

// #388: errors surface as friendly messages, never a raw error string.
describe('LivePreviewPanel — error messages', () => {
  it('maps a ResponseValidationError to the invalid-response message', async () => {
    setupBoundMaster()
    vi.spyOn(reportApi, 'resolveBindings').mockRejectedValue(
      new ResponseValidationError('/api/v2/templates/tmpl-1/resolve-bindings', { cause: new Error('[{"code":"invalid_type"}]') }),
    )
    render(<LivePreviewPanel />)
    await vi.waitFor(() => expect(screen.getByText(REFRESH)).toBeInTheDocument())
    fireEvent.click(screen.getByText(REFRESH))

    await vi.waitFor(() =>
      expect(screen.getByText(tk('components:bindingEditor.livePreview.errorInvalidResponse'))).toBeInTheDocument(),
    )
    // The raw cause string must not leak into the UI.
    expect(screen.queryByText(/invalid_type/)).not.toBeInTheDocument()
  })

  it('maps a NetworkError to the network message', async () => {
    setupBoundMaster()
    vi.spyOn(reportApi, 'resolveBindings').mockRejectedValue(new NetworkError('Network request failed'))
    render(<LivePreviewPanel />)
    await vi.waitFor(() => expect(screen.getByText(REFRESH)).toBeInTheDocument())
    fireEvent.click(screen.getByText(REFRESH))

    await vi.waitFor(() =>
      expect(screen.getByText(tk('components:bindingEditor.livePreview.errorNetwork'))).toBeInTheDocument(),
    )
  })
})

describe('LivePreviewPanel — gating', () => {
  it('renders nothing when no group has DB bindings', () => {
    useReportStore.getState().setCurrentTemplateId('tmpl-1')
    const { container } = render(<LivePreviewPanel />)
    expect(container).toBeEmptyDOMElement()
  })
})
