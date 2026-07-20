/**
 * DbConnectionTab — Phase 1 ScalarDB schema binding tab.
 *
 * These tests drive the component design. The backend catalog fetch is
 * mocked at the module level so tests never touch a real fetch.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useReportStore } from '@/store'
import type { ScalarDbCatalog } from '@/api/reportApi'

// ---------------------------------------------------------------------------
// Module mocks — replace only fetchScalarDbCatalog, keep everything else real
// ---------------------------------------------------------------------------

const fetchScalarDbCatalogMock = vi.fn<(signal?: AbortSignal) => Promise<ScalarDbCatalog>>()

vi.mock('@/api/reportApi', async () => {
  const actual = await vi.importActual<typeof import('@/api/reportApi')>('@/api/reportApi')
  return {
    ...actual,
    // DbConnectionTab now uses the cached variant — mock that instead
    fetchScalarDbCatalogCached: (signal?: AbortSignal) => fetchScalarDbCatalogMock(signal),
    invalidateScalarDbCatalogCache: () => {},
  }
})

// Import AFTER the mock so DbConnectionTab sees the mocked function.
import { DbConnectionTab } from './DbConnectionTab'
import { ApiError } from '@/api/client'

// ---------------------------------------------------------------------------
// Fixture catalogs
// ---------------------------------------------------------------------------

const usersCatalog: ScalarDbCatalog = {
  namespaces: [
    {
      name: 'app',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'BIGINT', keyType: 'partition' },
            { name: 'full_name', type: 'TEXT' },
            { name: 'email', type: 'TEXT', keyType: 'index' },
            { name: 'age', type: 'INT' },
          ],
        },
        {
          name: 'orders',
          columns: [
            { name: 'order_id', type: 'BIGINT', keyType: 'partition' },
            { name: 'total', type: 'DOUBLE' },
          ],
        },
      ],
    },
    {
      name: 'audit',
      tables: [
        {
          name: 'events',
          columns: [
            { name: 'id', type: 'BIGINT', keyType: 'partition' },
          ],
        },
      ],
    },
  ],
}

const emptyCatalog: ScalarDbCatalog = { namespaces: [] }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedMasterGroupWithFields(): { groupId: string; fieldIds: string[] } {
  useReportStore.getState().addSchemaGroup('master')
  const groupId = useReportStore.getState().definition.schema!.groups[0].id
  useReportStore.getState().addSchemaField(groupId, {
    key: 'name', label: '氏名', type: 'string',
  } as never)
  useReportStore.getState().addSchemaField(groupId, {
    key: 'age', label: '年齢', type: 'number',
  } as never)
  const fieldIds = useReportStore.getState().definition.schema!.groups[0].fields.map((f) => f.id)
  return { groupId, fieldIds }
}

function getGroup(groupId: string) {
  return useReportStore.getState().definition.schema!.groups.find((g) => g.id === groupId)!
}

/**
 * Generous timeout for CI runners — the default 1s waitFor/findBy budget has
 * proven flaky under load (options populate asynchronously after a
 * namespace/table change).
 */
const WAIT = { timeout: 5000 }

/**
 * Wait until the table <select> options include `value`, then return the
 * select. Table options load asynchronously after a namespace change —
 * selecting a table before its option exists races the catalog fetch.
 */
async function waitForTableOption(value: string): Promise<HTMLSelectElement> {
  await waitFor(() => {
    const sel = screen.getByLabelText(/テーブル/) as HTMLSelectElement
    expect(Array.from(sel.options).map((o) => o.value)).toContain(value)
  }, WAIT)
  return screen.getByLabelText(/テーブル/) as HTMLSelectElement
}

// ---------------------------------------------------------------------------
// Suites
// ---------------------------------------------------------------------------

beforeEach(() => {
  useReportStore.getState().newReport()
  fetchScalarDbCatalogMock.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('DbConnectionTab — initial state', () => {
  it('renders an empty state when no schema groups exist', async () => {
    fetchScalarDbCatalogMock.mockResolvedValue(emptyCatalog)

    render(<DbConnectionTab />)

    await waitFor(() => {
      expect(
        screen.getByText(/スキーマグループがありません|グループを追加してください/),
      ).toBeInTheDocument()
    })
  })

  it('shows a loading indicator while the catalog fetch is in flight', async () => {
    // Never-resolving promise — component stays in loading state.
    fetchScalarDbCatalogMock.mockReturnValue(new Promise(() => {}))
    seedMasterGroupWithFields()

    render(<DbConnectionTab />)

    expect(screen.getByText(/取得中|読み込み/)).toBeInTheDocument()
  })

  it('shows the populated-namespace-caveat copy when catalog.namespaces is empty', async () => {
    fetchScalarDbCatalogMock.mockResolvedValue(emptyCatalog)
    seedMasterGroupWithFields()

    render(<DbConnectionTab />)

    await waitFor(() => {
      expect(
        screen.getByText(/テーブルが見つかりません/),
      ).toBeInTheDocument()
    })
  })
})

describe('DbConnectionTab — happy path binding flow', () => {
  beforeEach(() => {
    fetchScalarDbCatalogMock.mockResolvedValue(usersCatalog)
  })

  it('dispatches bindGroupToTable when the user selects a namespace and table', async () => {
    const { groupId } = seedMasterGroupWithFields()
    render(<DbConnectionTab />)

    // Wait for the catalog to load.
    const nsSelect = await screen.findByLabelText(/ネームスペース/)

    fireEvent.change(nsSelect, { target: { value: 'app' } })
    const tableSelect = await waitForTableOption('users')
    fireEvent.change(tableSelect, { target: { value: 'users' } })

    await waitFor(() => {
      expect(getGroup(groupId).tableMeta).toEqual({
        namespace: 'app',
        tableName: 'users',
      })
    })
  })

  it('populates the field column select with the chosen table columns and dispatches updateSchemaField', async () => {
    const { groupId, fieldIds } = seedMasterGroupWithFields()
    render(<DbConnectionTab />)

    const nsSelect = await screen.findByLabelText(/ネームスペース/)
    fireEvent.change(nsSelect, { target: { value: 'app' } })
    const tableSelect = await waitForTableOption('users')
    fireEvent.change(tableSelect, { target: { value: 'users' } })

    // Field column selects: one per field, labelled by the field's display name.
    // Use role="combobox" + name to find them unambiguously.
    const nameColSelect = await screen.findByLabelText(/氏名.*DB カラム|DB カラム.*氏名/, {}, WAIT)
    fireEvent.change(nameColSelect, { target: { value: 'full_name' } })

    await waitFor(() => {
      const field = getGroup(groupId).fields.find((f) => f.id === fieldIds[0])!
      expect(field.dbColumnName).toBe('full_name')
    })
  })

  it('disables the table select until a namespace is selected', async () => {
    seedMasterGroupWithFields()
    render(<DbConnectionTab />)

    const tableSelect = await screen.findByLabelText(/テーブル/)
    expect(tableSelect).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/ネームスペース/), {
      target: { value: 'app' },
    })

    // Re-query inside waitFor: enabling follows the namespace state update, which under CI
    // load can flush after this synchronous point (the whole file uses this pattern; see
    // waitForTableOption / the WAIT-timeout comment above).
    await waitFor(() => {
      expect(screen.getByLabelText(/テーブル/)).not.toBeDisabled()
    }, WAIT)
  })
})

describe('DbConnectionTab — non-destructive namespace browsing', () => {
  beforeEach(() => {
    fetchScalarDbCatalogMock.mockResolvedValue(usersCatalog)
  })

  it('switching the namespace dropdown alone does NOT touch the bound group (no store write)', async () => {
    const { groupId } = seedMasterGroupWithFields()
    // Pre-bind to app.users with field hints.
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'users',
    })
    const fields = getGroup(groupId).fields
    useReportStore.getState().updateSchemaField(groupId, fields[0].id, {
      dbColumnName: 'full_name',
    })

    render(<DbConnectionTab />)
    const nsSelect = await screen.findByLabelText(/ネームスペース/)

    // User browses a different namespace, but hasn't picked a table yet.
    fireEvent.change(nsSelect, { target: { value: 'audit' } })

    // The store binding must be preserved — no destructive unbind happened.
    const group = getGroup(groupId)
    expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'users' })
    expect(group.fields[0].dbColumnName).toBe('full_name')

    // But the table select should now show the audit namespace's tables.
    // Audit has one table "events" — which should now be selectable.
    await waitForTableOption('events')
  })

  it('only writes to the store when a table is actually picked', async () => {
    const { groupId } = seedMasterGroupWithFields()
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'users',
    })

    render(<DbConnectionTab />)
    const nsSelect = await screen.findByLabelText(/ネームスペース/)

    // Browse audit…
    fireEvent.change(nsSelect, { target: { value: 'audit' } })
    expect(getGroup(groupId).tableMeta).toEqual({ namespace: 'app', tableName: 'users' })

    // …then pick its table. NOW the store is written.
    const tableSelect = await waitForTableOption('events')
    fireEvent.change(tableSelect, { target: { value: 'events' } })
    await waitFor(() => {
      expect(getGroup(groupId).tableMeta).toEqual({
        namespace: 'audit', tableName: 'events',
      })
    })
  })
})

describe('DbConnectionTab — stale binding preservation', () => {
  it('renders a synthetic disabled option when the bound namespace is not in the catalog', async () => {
    // Catalog without the bound namespace.
    fetchScalarDbCatalogMock.mockResolvedValue({
      namespaces: [{ name: 'other', tables: [{ name: 't1', columns: [] }] }],
    })

    const { groupId } = seedMasterGroupWithFields()
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'deleted_ns', tableName: 'archived',
    })

    render(<DbConnectionTab />)
    const nsSelect = await screen.findByLabelText(/ネームスペース/)

    const options = Array.from((nsSelect as HTMLSelectElement).options)
    const stale = options.find((o) => o.value === 'deleted_ns')
    expect(stale).toBeDefined()
    expect(stale!.disabled).toBe(true)
    expect(stale!.textContent).toMatch(/ネームスペースが存在しません/)
    // Store still holds the stale binding — nothing was destructively cleared.
    expect(getGroup(groupId).tableMeta).toEqual({
      namespace: 'deleted_ns', tableName: 'archived',
    })
  })

  it('renders a synthetic disabled option when the bound tableName is missing from the catalog', async () => {
    // Catalog contains the bound namespace but NOT the bound table.
    fetchScalarDbCatalogMock.mockResolvedValue({
      namespaces: [{
        name: 'app',
        tables: [{ name: 'something_else', columns: [] }],
      }],
    })

    const { groupId } = seedMasterGroupWithFields()
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'renamed_away',
    })

    render(<DbConnectionTab />)
    await screen.findByLabelText(/ネームスペース/)

    const tableSelect = await waitForTableOption('renamed_away')
    const stale = Array.from(tableSelect.options).find((o) => o.value === 'renamed_away')
    expect(stale).toBeDefined()
    expect(stale!.disabled).toBe(true)
    expect(stale!.textContent).toMatch(/テーブルが存在しません/)
    expect(getGroup(groupId).tableMeta).toEqual({
      namespace: 'app', tableName: 'renamed_away',
    })
  })
})

describe('DbConnectionTab — rebind semantics', () => {
  beforeEach(() => {
    fetchScalarDbCatalogMock.mockResolvedValue(usersCatalog)
  })

  it('clears all field dbColumnName values when rebinding to a different table', async () => {
    const { groupId } = seedMasterGroupWithFields()
    // Pre-seed a bound group with field column hints.
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'users',
    })
    const fields = getGroup(groupId).fields
    useReportStore.getState().updateSchemaField(groupId, fields[0].id, {
      dbColumnName: 'full_name',
    })
    useReportStore.getState().updateSchemaField(groupId, fields[1].id, {
      dbColumnName: 'age',
    })

    render(<DbConnectionTab />)

    // Wait for the catalog.
    await screen.findByLabelText(/ネームスペース/)

    // Rebind to a different table in the same namespace.
    const tableSelect = await waitForTableOption('orders')
    fireEvent.change(tableSelect, { target: { value: 'orders' } })

    await waitFor(() => {
      const group = getGroup(groupId)
      expect(group.tableMeta).toEqual({ namespace: 'app', tableName: 'orders' })
      expect(group.fields[0].dbColumnName).toBeUndefined()
      expect(group.fields[1].dbColumnName).toBeUndefined()
    })
  })
})

describe('DbConnectionTab — stale column handling', () => {
  beforeEach(() => {
    fetchScalarDbCatalogMock.mockResolvedValue(usersCatalog)
  })

  it('preserves a stale dbColumnName via a synthetic disabled option labelled "(列が存在しません)"', async () => {
    const { groupId } = seedMasterGroupWithFields()
    // Bind to a table, then point the first field at a column that does
    // NOT exist in the fetched catalog — simulates an external rename.
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'users',
    })
    const firstFieldId = getGroup(groupId).fields[0].id
    useReportStore.getState().updateSchemaField(groupId, firstFieldId, {
      dbColumnName: 'renamed_away',
    })

    render(<DbConnectionTab />)

    // Wait for the catalog fetch to complete and the field select to mount.
    const nameColSelect = await screen.findByLabelText(/氏名.*DB カラム|DB カラム.*氏名/, {}, WAIT)

    // A synthetic disabled <option> with the stale value must exist.
    const staleOption = Array.from(
      nameColSelect.querySelectorAll('option'),
    ).find((o) => o.value === 'renamed_away')
    expect(staleOption).toBeDefined()
    expect(staleOption!.disabled).toBe(true)
    expect(staleOption!.textContent).toMatch(/列が存在しません|renamed_away/)

    // The controlled select value must round-trip — no silent reset.
    expect((nameColSelect as HTMLSelectElement).value).toBe('renamed_away')
    // And the store must still hold the stale value.
    expect(getGroup(groupId).fields[0].dbColumnName).toBe('renamed_away')
  })
})

describe('DbConnectionTab — unbind (解除)', () => {
  beforeEach(() => {
    fetchScalarDbCatalogMock.mockResolvedValue(usersCatalog)
  })

  it('clears tableMeta and every field dbColumnName atomically when 解除 is clicked', async () => {
    const { groupId } = seedMasterGroupWithFields()
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'users',
    })
    const fields = getGroup(groupId).fields
    useReportStore.getState().updateSchemaField(groupId, fields[0].id, {
      dbColumnName: 'full_name',
    })

    render(<DbConnectionTab />)
    await screen.findByLabelText(/ネームスペース/)

    // 解除は即時実行（確認ダイアログ無し・undo トーストが安全網）
    fireEvent.click(screen.getByRole('button', { name: /解除/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await waitFor(() => {
      const group = getGroup(groupId)
      expect(group.tableMeta).toBeUndefined()
      expect(group.fields[0].dbColumnName).toBeUndefined()
    })
  })
})

describe('DbConnectionTab — refresh (再取得)', () => {
  it('re-runs fetchScalarDbCatalog when 再取得 is clicked', async () => {
    fetchScalarDbCatalogMock.mockResolvedValue(usersCatalog)
    seedMasterGroupWithFields()

    render(<DbConnectionTab />)
    await screen.findByLabelText(/ネームスペース/)

    expect(fetchScalarDbCatalogMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /再取得/ }))

    await waitFor(() => {
      expect(fetchScalarDbCatalogMock).toHaveBeenCalledTimes(2)
    })
  })
})

describe('DbConnectionTab — error states', () => {
  it('shows a 503 connection error message and does not corrupt existing tableMeta', async () => {
    const { groupId } = seedMasterGroupWithFields()
    useReportStore.getState().bindGroupToTable(groupId, {
      namespace: 'app', tableName: 'users',
    })

    fetchScalarDbCatalogMock.mockRejectedValue(
      new ApiError(503, { error: 'ScalarDb unreachable' }, 'HTTP 503: Service Unavailable'),
    )

    render(<DbConnectionTab />)

    await waitFor(() => {
      expect(
        screen.getByText(/ScalarDB に接続できません|接続できません/),
      ).toBeInTheDocument()
    })

    // Existing binding must be preserved on error.
    expect(getGroup(groupId).tableMeta).toEqual({
      namespace: 'app', tableName: 'users',
    })
  })

  it('retries the fetch when the error-state 再取得 button is clicked', async () => {
    seedMasterGroupWithFields()
    fetchScalarDbCatalogMock
      .mockRejectedValueOnce(new ApiError(503, null, 'boom'))
      .mockResolvedValueOnce(usersCatalog)

    render(<DbConnectionTab />)

    await waitFor(() => {
      expect(
        screen.getByText(/ScalarDB に接続できません|接続できません/),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /再取得/ }))

    await waitFor(() => {
      expect(fetchScalarDbCatalogMock).toHaveBeenCalledTimes(2)
    })
    await screen.findByLabelText(/ネームスペース/)
  })
})

describe('DbConnectionTab — lifecycle', () => {
  it('aborts the in-flight fetch on unmount', async () => {
    // Resolve-never: the fetch is in flight when we unmount.
    let capturedSignal: AbortSignal | undefined
    fetchScalarDbCatalogMock.mockImplementation((signal) => {
      capturedSignal = signal
      return new Promise(() => {})
    })
    seedMasterGroupWithFields()

    const { unmount } = render(<DbConnectionTab />)
    expect(capturedSignal).toBeDefined()
    expect(capturedSignal!.aborted).toBe(false)

    unmount()

    expect(capturedSignal!.aborted).toBe(true)
  })
})
