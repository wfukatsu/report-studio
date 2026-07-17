import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RowEditModal } from './RowEditModal'
import type { ScalarDbColumnMeta } from '@/api/reportApi'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    insertScalarDbRow: vi.fn(),
    updateScalarDbRow: vi.fn(),
  }
})

import { insertScalarDbRow, updateScalarDbRow } from '@/api/reportApi'
const mockInsert = vi.mocked(insertScalarDbRow)
const mockUpdate = vi.mocked(updateScalarDbRow)

const COLUMNS: ScalarDbColumnMeta[] = [
  { name: 'id', type: 'INT', keyType: 'partition' },
  { name: 'name', type: 'TEXT' },
  { name: 'price', type: 'DOUBLE' },
  { name: 'active', type: 'BOOLEAN' },
]

function renderModal(overrides: Partial<Parameters<typeof RowEditModal>[0]> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <RowEditModal
      open
      mode="create"
      namespace="ns1"
      table="items"
      columns={COLUMNS}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  )
  return { onSave, onClose }
}

/** Text/number inputs are label-associated via <label> wrapping */
function inputFor(colName: string): HTMLInputElement {
  return screen.getByLabelText(new RegExp(colName)) as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockInsert.mockResolvedValue({ row: {} })
  mockUpdate.mockResolvedValue({ row: {} })
})

describe('RowEditModal — visibility', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <RowEditModal
        open={false}
        mode="create"
        namespace="ns1"
        table="items"
        columns={COLUMNS}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the namespace and table in the title', () => {
    renderModal()
    expect(screen.getByText('行を追加 — ns1.items')).toBeInTheDocument()
  })
})

describe('RowEditModal — create mode', () => {
  it('inserts with type-parsed values and omits empty non-key columns', async () => {
    const { onSave, onClose } = renderModal()
    fireEvent.change(inputFor('id'), { target: { value: '7' } })
    fireEvent.change(inputFor('name'), { target: { value: 'Alpha' } })
    fireEvent.change(inputFor('price'), { target: { value: '12.5' } })
    // 'active' checkbox left unchecked → form value '' → omitted (null, non-key)
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1))
    expect(mockInsert).toHaveBeenCalledWith('ns1', 'items', {
      id: 7,
      name: 'Alpha',
      price: 12.5,
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('sends boolean true when the checkbox is checked', async () => {
    renderModal()
    fireEvent.change(inputFor('id'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(mockInsert).toHaveBeenCalledTimes(1))
    expect(mockInsert.mock.calls[0][2]).toMatchObject({ active: true })
  })

  it('blocks save and shows an error when a key column is empty', async () => {
    const { onSave } = renderModal()
    fireEvent.change(inputFor('name'), { target: { value: 'no key' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('キーカラム「id」は必須です')).toBeInTheDocument()
    expect(mockInsert).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('shows the API error message and keeps the modal open on failure', async () => {
    mockInsert.mockRejectedValueOnce(new Error('duplicate key'))
    const { onSave, onClose } = renderModal()
    fireEvent.change(inputFor('id'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    expect(await screen.findByText('duplicate key')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('RowEditModal — edit mode', () => {
  it('pre-fills fields from the row and makes key columns readonly', () => {
    renderModal({ mode: 'edit', row: { id: 3, name: 'Beta', price: 5, active: false } })
    expect(inputFor('id').value).toBe('3')
    expect(inputFor('id')).toHaveAttribute('readonly')
    expect(inputFor('name').value).toBe('Beta')
    expect(inputFor('name')).not.toHaveAttribute('readonly')
  })

  it('updates via updateScalarDbRow with the edited values', async () => {
    const { onSave } = renderModal({ mode: 'edit', row: { id: 3, name: 'Beta', price: 5, active: true } })
    fireEvent.change(inputFor('name'), { target: { value: 'Gamma' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate).toHaveBeenCalledWith('ns1', 'items', {
      id: 3,
      name: 'Gamma',
      price: 5,
      active: true,
    })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

describe('RowEditModal — dismissal', () => {
  it('closes when the backdrop is clicked but not when the dialog body is clicked', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByText('行を追加 — ns1.items'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('行を追加 — ns1.items').closest('.fixed')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes via the cancel button', () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
