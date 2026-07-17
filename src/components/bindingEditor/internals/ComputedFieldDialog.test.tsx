/**
 * ComputedFieldDialog — field-name validation, save/cancel flow, edit mode.
 *
 * The CodeMirror-based FormulaEditor is mocked with a plain textarea so the
 * dialog's own validation logic is exercised without a real editor instance.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ComputedFieldDialog } from './ComputedFieldDialog'
import type { SchemaGroup } from '@/types'

vi.mock('@/components/formulaEditor/FormulaEditor', () => ({
  default: ({ initialValue, onChange }: { initialValue: string; onChange: (v: string) => void }) => (
    <textarea
      aria-label="formula-editor"
      defaultValue={initialValue}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

const GROUP: SchemaGroup = {
  id: 'g1',
  label: '明細',
  role: 'detail',
  dataKey: 'items',
  fields: [
    { id: 'f-price', key: 'price', label: '単価', type: 'number' },
    { id: 'f-qty', key: 'qty', label: '数量', type: 'number' },
  ],
} as SchemaGroup

function renderDialog(overrides: Partial<React.ComponentProps<typeof ComputedFieldDialog>> = {}) {
  const onSave = vi.fn()
  const onClose = vi.fn()
  render(
    <ComputedFieldDialog
      open
      groupId="g1"
      groups={[GROUP]}
      onClose={onClose}
      onSave={onSave}
      {...overrides}
    />,
  )
  return { onSave, onClose }
}

async function fillName(value: string) {
  fireEvent.change(screen.getByPlaceholderText('net_amount_calc'), { target: { value } })
}

async function fillExpression(value: string) {
  const editor = await screen.findByLabelText('formula-editor')
  fireEvent.change(editor, { target: { value } })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ComputedFieldDialog — バリデーション', () => {
  it('rejects an empty field name', async () => {
    const { onSave } = renderDialog()
    fireEvent.click(screen.getByText('追加'))

    expect(await screen.findByText('フィールド名を入力してください')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('rejects names that are not identifier-like (leading digit / non-ASCII)', async () => {
    const { onSave } = renderDialog()

    await fillName('1total')
    fireEvent.click(screen.getByText('追加'))
    expect(await screen.findByText('フィールド名は英数字とアンダースコアのみ使用可能です')).toBeInTheDocument()

    await fillName('合計')
    fireEvent.click(screen.getByText('追加'))
    expect(await screen.findByText('フィールド名は英数字とアンダースコアのみ使用可能です')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('rejects a name that duplicates an existing field key in the group', async () => {
    const { onSave } = renderDialog()

    await fillName('price')
    fireEvent.click(screen.getByText('追加'))

    expect(await screen.findByText('フィールド名 "price" は既に使用されています')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('rejects an empty expression', async () => {
    const { onSave } = renderDialog()

    await fillName('total_calc')
    fireEvent.click(screen.getByText('追加'))

    expect(await screen.findByText('計算式を入力してください')).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('ComputedFieldDialog — 保存/キャンセル', () => {
  it('saves with trimmed name and expression, then closes', async () => {
    const { onSave, onClose } = renderDialog()

    await fillName('  total_calc  ')
    await fillExpression('  price * qty  ')
    fireEvent.click(screen.getByText('追加'))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('total_calc', 'price * qty')
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('saves via Ctrl+Enter inside the formula editor', async () => {
    const { onSave } = renderDialog()

    await fillName('total_calc')
    await fillExpression('price * qty')
    fireEvent.keyDown(screen.getByLabelText('formula-editor'), { key: 'Enter', ctrlKey: true })

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('total_calc', 'price * qty')
    })
  })

  it('closes without saving via the cancel button', async () => {
    const { onSave, onClose } = renderDialog()

    fireEvent.click(screen.getByText('キャンセル'))

    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('renders nothing when open=false', () => {
    renderDialog({ open: false })
    expect(screen.queryByText('計算フィールドを追加')).not.toBeInTheDocument()
  })
})

describe('ComputedFieldDialog — 編集モード', () => {
  it('locks the field name, allows keeping the same key, and saves the new expression', async () => {
    const editGroup: SchemaGroup = {
      ...GROUP,
      fields: [...GROUP.fields, { id: 'f-calc', key: 'total_calc', label: 'total_calc', type: 'number', computed: true, expression: 'price' }],
    } as SchemaGroup
    const { onSave } = renderDialog({
      groups: [editGroup],
      editingFieldId: 'f-calc',
      initialName: 'total_calc',
      initialExpression: 'price',
    })

    expect(screen.getByText('計算フィールドを編集')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('net_amount_calc')).toBeDisabled()

    await fillExpression('price * qty')
    fireEvent.click(screen.getByText('更新'))

    // Duplicate check must exclude the field being edited
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('total_calc', 'price * qty')
    })
    expect(screen.queryByText(/既に使用されています/)).not.toBeInTheDocument()
  })
})
