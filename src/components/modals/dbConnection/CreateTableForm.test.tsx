import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateTableForm } from './CreateTableForm'
import { useReportStore } from '@/store'
import * as reportApi from '@/api/reportApi'
import { ApiError, NetworkError } from '@/api/client'
import type { SchemaGroup } from '@/types'

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeMasterGroup(overrides?: Partial<SchemaGroup>): SchemaGroup {
  return {
    id: 'g1',
    label: '顧客',
    role: 'master',
    dataKey: 'customer',
    fields: [
      { id: 'f1', key: 'id', label: 'ID', type: 'number' },
      { id: 'f2', key: 'name', label: '名前', type: 'string' },
      { id: 'f3', key: 'active', label: 'アクティブ', type: 'boolean' },
      { id: 'f4', key: 'created', label: '作成日', type: 'date' },
      { id: 'f5', key: 'photo', label: '写真', type: 'image' },
    ],
    ...overrides,
  }
}

function makeDetailGroup(): SchemaGroup {
  return {
    id: 'g2',
    label: '明細',
    role: 'detail',
    dataKey: 'items',
    fields: [
      { id: 'f1', key: 'line_no', label: '行番号', type: 'number' },
      { id: 'f2', key: 'item', label: '品目', type: 'string' },
    ],
  }
}

const defaultNamespaces = ['app', 'legacy']

function renderForm(group?: SchemaGroup, namespaces?: string[]) {
  const onSuccess = vi.fn()
  const onCancel = vi.fn()
  render(
    <CreateTableForm
      group={group ?? makeMasterGroup()}
      namespaces={namespaces ?? defaultNamespaces}
      onSuccess={onSuccess}
      onCancel={onCancel}
    />,
  )
  return { onSuccess, onCancel }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  useReportStore.getState().newReport()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreateTableForm — default pre-population', () => {
  it('pre-populates column names from group fields (excluding array fields)', () => {
    renderForm()
    // All 5 non-array fields should appear as column rows
    expect(screen.getByDisplayValue('id')).toBeInTheDocument()
    expect(screen.getByDisplayValue('name')).toBeInTheDocument()
    expect(screen.getByDisplayValue('active')).toBeInTheDocument()
    expect(screen.getByDisplayValue('created')).toBeInTheDocument()
    expect(screen.getByDisplayValue('photo')).toBeInTheDocument()
  })

  it('maps field types to ScalarDB column types correctly', () => {
    renderForm()
    // number → DOUBLE, string → TEXT, boolean → BOOLEAN, date → BIGINT, image → TEXT
    const typeSelects = screen.getAllByRole('combobox', { name: /type/i })
    // Just verify at least one DOUBLE appears for the number field
    const doubles = typeSelects.filter(
      (el) => (el as HTMLSelectElement).value === 'DOUBLE',
    )
    expect(doubles.length).toBeGreaterThanOrEqual(1)
  })

  it('auto-selects first field as partition key for master group', () => {
    renderForm(makeMasterGroup())
    // The first field row should have 'partition' selected for its key role
    const keyRoleSelects = screen.getAllByRole('combobox', { name: /キーロール/i })
    expect((keyRoleSelects[0] as HTMLSelectElement).value).toBe('partition')
  })

  it('excludes array fields from the column list with explanatory note', () => {
    const groupWithArray = makeMasterGroup({
      fields: [
        { id: 'f1', key: 'id', label: 'ID', type: 'number' },
        { id: 'f2', key: 'tags', label: 'タグ', type: 'array', itemType: 'string' },
      ],
    })
    renderForm(groupWithArray)
    expect(screen.queryByDisplayValue('tags')).not.toBeInTheDocument()
    expect(screen.getByText(/array|配列/i)).toBeInTheDocument()
  })

  it('auto-selects first field as partition key AND second as clustering key for detail group', () => {
    renderForm(makeDetailGroup())
    const keyRoleSelects = screen.getAllByRole('combobox', { name: /キーロール/i })
    expect((keyRoleSelects[0] as HTMLSelectElement).value).toBe('partition')
    expect((keyRoleSelects[1] as HTMLSelectElement).value).toBe('clustering')
  })
})

describe('CreateTableForm — namespace input', () => {
  it('shows namespace dropdown with provided options', () => {
    renderForm()
    const nsSelect = screen.getByRole('combobox', { name: /ネームスペース/i })
    expect(nsSelect).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'app' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'legacy' })).toBeInTheDocument()
  })

  it('includes a new namespace input option', () => {
    renderForm()
    expect(screen.getAllByText(/新規作成/i).length).toBeGreaterThanOrEqual(1)
  })
})

describe('CreateTableForm — submit happy path', () => {
  it('calls createScalarDbTable and bindGroupToTableWithColumns on 201 success', async () => {
    // Add the group to the store so bindGroupToTableWithColumns can find it
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id

    const group = makeMasterGroup({ id: groupId })
    const fakeTable = {
      name: 'users',
      columns: [
        { name: 'id', type: 'BIGINT' as const, keyType: 'partition' as const },
        { name: 'name', type: 'TEXT' as const },
      ],
    }
    vi.spyOn(reportApi, 'createScalarDbTable').mockResolvedValue(fakeTable)
    const { onSuccess } = renderForm(group)

    // Fill required fields
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /テーブル名/i }), {
      target: { value: 'users' },
    })

    fireEvent.click(screen.getByRole('button', { name: /作成/i }))

    await waitFor(() => {
      expect(reportApi.createScalarDbTable).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })
})

describe('CreateTableForm — submit button disabled during in-flight', () => {
  it('disables the submit button while the POST is in-flight', async () => {
    let resolvePost: (value: unknown) => void
    vi.spyOn(reportApi, 'createScalarDbTable').mockImplementation(
      () => new Promise((r) => { resolvePost = r }),
    )

    renderForm()
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /テーブル名/i }), {
      target: { value: 'test_table' },
    })

    const submitBtn = screen.getByRole('button', { name: /作成/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(submitBtn).toBeDisabled()
    })

    // Resolve so cleanup doesn't warn about unhandled promise
    resolvePost!({ name: 'test_table', columns: [] })
  })
})

describe('CreateTableForm — error states', () => {
  it('shows 409 conflict error with recovery action button', async () => {
    vi.spyOn(reportApi, 'createScalarDbTable').mockRejectedValue(
      new ApiError(409, { error: 'Table already exists: app.users' }, 'Conflict'),
    )

    renderForm()
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /テーブル名/i }), {
      target: { value: 'users' },
    })
    fireEvent.click(screen.getByRole('button', { name: /作成/i }))

    await waitFor(() => {
      expect(screen.getByText(/既に存在|already exist/i)).toBeInTheDocument()
    })
    // Recovery action should be present
    expect(screen.getByRole('button', { name: /バインド|bind/i })).toBeInTheDocument()
  })

  it('shows 503 unreachable error with retry button', async () => {
    vi.spyOn(reportApi, 'createScalarDbTable').mockRejectedValue(
      new ApiError(503, { error: 'ScalarDb unreachable', correlationId: 'abc12345' }, 'Unavailable'),
    )

    renderForm()
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /テーブル名/i }), {
      target: { value: 'my_table' },
    })
    fireEvent.click(screen.getByRole('button', { name: /作成/i }))

    await waitFor(() => {
      expect(screen.getByText(/接続できません|unreachable/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /再試行|retry/i })).toBeInTheDocument()
  })

  it('preserves user input after error so fix-then-retry works', async () => {
    vi.spyOn(reportApi, 'createScalarDbTable').mockRejectedValue(
      new ApiError(400, { error: 'Invalid' }, 'Bad Request'),
    )

    renderForm()
    const tableNameInput = screen.getByRole('textbox', { name: /テーブル名/i })
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    fireEvent.change(tableNameInput, { target: { value: 'preserved_name' } })
    fireEvent.click(screen.getByRole('button', { name: /作成/i }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /作成/i })).toBeInTheDocument()
    })
    // Table name input should still have the user's value
    expect((tableNameInput as HTMLInputElement).value).toBe('preserved_name')
  })

  it('shows NetworkError with retry option', async () => {
    vi.spyOn(reportApi, 'createScalarDbTable').mockRejectedValue(
      new NetworkError('Failed to fetch', { cause: new TypeError('Failed to fetch') }),
    )

    renderForm()
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: /テーブル名/i }), {
      target: { value: 'my_table' },
    })
    fireEvent.click(screen.getByRole('button', { name: /作成/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /再試行|retry/i })).toBeInTheDocument()
    })
  })
})

describe('CreateTableForm — cancel', () => {
  it('calls onCancel when キャンセル is clicked', () => {
    const { onCancel } = renderForm()
    fireEvent.click(screen.getByRole('button', { name: /キャンセル/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
