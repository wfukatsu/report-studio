/**
 * GroupBindingSection — unit tests for per-group binding UI.
 *
 * These tests focus on the non-trivial logic owned by this component:
 * - Non-destructive namespace browsing (pendingNamespace ≠ store state)
 * - Stale namespace / table option rendering
 * - 解除 button visibility
 * - Store write semantics (table selection writes; namespace change does not)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import type { ScalarDbCatalog } from '@/api/reportApi'
import type { SchemaGroup } from '@/types'
import { GroupBindingSection } from './GroupBindingSection'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const catalog: ScalarDbCatalog = {
  namespaces: [
    {
      name: 'app',
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'BIGINT', keyType: 'partition' },
            { name: 'email', type: 'TEXT' },
          ],
        },
        { name: 'orders', columns: [{ name: 'id', type: 'BIGINT', keyType: 'partition' }] },
      ],
    },
    {
      name: 'legacy',
      tables: [{ name: 'old_users', columns: [{ name: 'id', type: 'INT', keyType: 'partition' }] }],
    },
  ],
}

function makeGroup(overrides?: Partial<SchemaGroup>): SchemaGroup {
  return {
    id: 'g1',
    label: '顧客',
    role: 'master',
    dataKey: 'customer',
    fields: [
      { id: 'f1', key: 'id', label: 'ID', type: 'number' },
      { id: 'f2', key: 'name', label: '名前', type: 'string' },
    ],
    ...overrides,
  }
}

function renderSection(group: SchemaGroup, extraProps = {}) {
  const onShowCreate = vi.fn()
  render(
    <GroupBindingSection
      group={group}
      catalog={catalog}
      onShowCreate={onShowCreate}
      {...extraProps}
    />,
  )
  return { onShowCreate }
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().addSchemaGroup('master')
  const groupId = useReportStore.getState().definition.schema!.groups[0].id
  // Replace the auto-created group with our fixture id
  useReportStore.setState((s) => ({
    ...s,
    definition: {
      ...s.definition,
      schema: {
        groups: [{ ...makeGroup(), id: groupId }],
      },
    },
  }))
})

// ---------------------------------------------------------------------------
// Namespace browsing — does NOT write to store
// ---------------------------------------------------------------------------

describe('GroupBindingSection — namespace browsing', () => {
  it('changes namespace dropdown WITHOUT updating tableMeta in the store', () => {
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    const group = makeGroup({ id: groupId })
    renderSection(group)

    const nsSelect = screen.getByRole('combobox', { name: /ネームスペース/i })
    fireEvent.change(nsSelect, { target: { value: 'legacy' } })

    // Browsing namespace alone must NOT write tableMeta to the store
    const stored = useReportStore.getState().definition.schema!.groups[0].tableMeta
    expect(stored).toBeUndefined()
  })

  it('browsing to a different namespace clears effectiveTableValue (no React warning)', () => {
    const group = makeGroup({
      tableMeta: { namespace: 'app', tableName: 'users' },
    })
    renderSection(group)

    // Navigate to a different namespace — the table select should show "(未選択)"
    const nsSelect = screen.getByRole('combobox', { name: /ネームスペース/i })
    fireEvent.change(nsSelect, { target: { value: 'legacy' } })

    const tableSelect = screen.getByRole('combobox', { name: /テーブル/i })
    expect((tableSelect as HTMLSelectElement).value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Table selection — DOES write to store
// ---------------------------------------------------------------------------

describe('GroupBindingSection — table selection writes to store', () => {
  it('selecting a table persists tableMeta to the store', () => {
    // Use the actual store group id so the store write lands correctly
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    const group = makeGroup({ id: groupId })
    renderSection(group)

    // First pick a namespace
    fireEvent.change(screen.getByRole('combobox', { name: /ネームスペース/i }), {
      target: { value: 'app' },
    })
    // Then select a table
    fireEvent.change(screen.getByRole('combobox', { name: /テーブル/i }), {
      target: { value: 'users' },
    })

    const stored = useReportStore.getState().definition.schema!.groups[0].tableMeta
    expect(stored).toEqual({ namespace: 'app', tableName: 'users' })
  })

  it('selecting "(未選択)" clears tableMeta in the store', () => {
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    // Pre-bind the group
    useReportStore.getState().bindGroupToTable(groupId, { namespace: 'app', tableName: 'users' })

    const group = makeGroup({ id: groupId, tableMeta: { namespace: 'app', tableName: 'users' } })
    renderSection(group)

    // Unbind by selecting the empty option on the table select
    const tableSelect = screen.getByRole('combobox', { name: /テーブル/i })
    fireEvent.change(tableSelect, { target: { value: '' } })

    const stored = useReportStore.getState().definition.schema!.groups[0].tableMeta
    expect(stored).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 解除 button visibility
// ---------------------------------------------------------------------------

describe('GroupBindingSection — 解除 button', () => {
  it('is NOT shown when group is unbound', () => {
    renderSection(makeGroup())
    expect(screen.queryByRole('button', { name: /解除/i })).not.toBeInTheDocument()
  })

  it('IS shown when group has tableMeta', () => {
    renderSection(makeGroup({ tableMeta: { namespace: 'app', tableName: 'users' } }))
    expect(screen.getByRole('button', { name: /解除/i })).toBeInTheDocument()
  })

  it('clicking 解除 clears tableMeta in the store and resets namespace dropdown', () => {
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().bindGroupToTable(groupId, { namespace: 'app', tableName: 'users' })

    const group = makeGroup({ id: groupId, tableMeta: { namespace: 'app', tableName: 'users' } })
    renderSection(group)

    fireEvent.click(screen.getByRole('button', { name: /解除/i }))

    // Store must have tableMeta cleared
    const stored = useReportStore.getState().definition.schema!.groups[0].tableMeta
    expect(stored).toBeUndefined()

    // Namespace select should reset to (未選択)
    const nsSelect = screen.getByRole('combobox', { name: /ネームスペース/i })
    expect((nsSelect as HTMLSelectElement).value).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Stale options
// ---------------------------------------------------------------------------

describe('GroupBindingSection — stale bound namespace', () => {
  it('shows a disabled stale option when bound namespace is absent from catalog', () => {
    const group = makeGroup({
      tableMeta: { namespace: 'gone_ns', tableName: 'gone_table' },
    })
    renderSection(group)

    // The namespace select must show a synthetic disabled option for the stale value
    const nsSelect = screen.getByRole('combobox', { name: /ネームスペース/i })
    const options = Array.from((nsSelect as HTMLSelectElement).options)
    const staleOption = options.find((o) => o.value === 'gone_ns')
    expect(staleOption).toBeDefined()
    expect(staleOption?.disabled).toBe(true)
    expect(staleOption?.text).toContain('存在しません')
  })

  it('shows a disabled stale option when bound table is absent from the namespace', () => {
    const group = makeGroup({
      tableMeta: { namespace: 'app', tableName: 'vanished_table' },
    })
    renderSection(group)

    const tableSelect = screen.getByRole('combobox', { name: /テーブル/i })
    const options = Array.from((tableSelect as HTMLSelectElement).options)
    const staleOption = options.find((o) => o.value === 'vanished_table')
    expect(staleOption).toBeDefined()
    expect(staleOption?.disabled).toBe(true)
    expect(staleOption?.text).toContain('存在しません')
  })
})

// ---------------------------------------------------------------------------
// "このスキーマからテーブルを作成" toggle
// ---------------------------------------------------------------------------

describe('GroupBindingSection — create form toggle', () => {
  it('shows the create button for an unbound group and calls onShowCreate', () => {
    const { onShowCreate } = renderSection(makeGroup())

    const btn = screen.getByRole('button', { name: /このスキーマからテーブルを作成/i })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onShowCreate).toHaveBeenCalled()
  })

  it('does NOT show the create button when group is already bound', () => {
    renderSection(makeGroup({ tableMeta: { namespace: 'app', tableName: 'users' } }))

    expect(
      screen.queryByRole('button', { name: /このスキーマからテーブルを作成/i }),
    ).not.toBeInTheDocument()
  })

  it('renders createFormSlot when showCreateForm is true', () => {
    renderSection(makeGroup(), {
      showCreateForm: true,
      createFormSlot: <p data-testid="slot">slot content</p>,
    })

    expect(screen.getByTestId('slot')).toBeInTheDocument()
    // The toggle button should not be visible when the form is open
    expect(
      screen.queryByRole('button', { name: /このスキーマからテーブルを作成/i }),
    ).not.toBeInTheDocument()
  })
})
