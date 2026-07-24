import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { SchemaPanel } from './SchemaPanel'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('SchemaPanel — 初期レンダリング', () => {
  it('renders add group buttons', () => {
    render(<SchemaPanel />)
    expect(screen.getByText(/master グループ/)).toBeInTheDocument()
    expect(screen.getByText(/detail グループ/)).toBeInTheDocument()
  })

  it('shows empty schema message when no groups exist', () => {
    render(<SchemaPanel />)
    expect(screen.getByText(/スキーマ未設定/)).toBeInTheDocument()
  })
})

describe('SchemaPanel — グループ追加', () => {
  it('adds a master group when master button is clicked', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))

    const state = useReportStore.getState()
    const groups = state.definition.schema?.groups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].role).toBe('master')
  })

  it('adds a detail group when detail button is clicked', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/detail グループ/))

    const state = useReportStore.getState()
    const groups = state.definition.schema?.groups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].role).toBe('detail')
  })

  it('renders group section after adding', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    // Should see the role badge
    expect(screen.getByText('master')).toBeInTheDocument()
  })

  it('shows field count after adding a group', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    // 0 fields defined
    expect(screen.getByText(/0 フィールド定義/)).toBeInTheDocument()
  })
})

describe('SchemaPanel — フィールド追加', () => {
  it('adds a field when フィールド追加 is clicked', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText('フィールド追加'))

    const state = useReportStore.getState()
    const groups = state.definition.schema?.groups ?? []
    expect(groups[0].fields).toHaveLength(1)
  })

  it('renders field inputs after adding a field', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText('フィールド追加'))

    expect(screen.getByRole('textbox', { name: 'フィールドキー' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'フィールドラベル' })).toBeInTheDocument()
  })

  it('renders field type selector', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText('フィールド追加'))

    expect(screen.getByRole('combobox', { name: 'フィールド型' })).toBeInTheDocument()
  })
})

describe('SchemaPanel — グループ削除（#431 確認ダイアログ）', () => {
  it('shows a confirm dialog and removes the group only after confirming', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))

    // Click delete button for the group — the group survives until confirmed
    fireEvent.click(screen.getByRole('button', { name: 'グループを削除' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(useReportStore.getState().definition.schema?.groups ?? []).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(useReportStore.getState().definition.schema?.groups ?? []).toHaveLength(0)
  })

  it('keeps the group when the dialog is cancelled', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByRole('button', { name: 'グループを削除' }))

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useReportStore.getState().definition.schema?.groups ?? []).toHaveLength(1)
  })
})

describe('SchemaPanel — フィールド削除', () => {
  it('removes an unbound field immediately without confirmation', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText('フィールド追加'))

    fireEvent.click(screen.getByRole('button', { name: 'フィールドを削除' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const state = useReportStore.getState()
    const groups = state.definition.schema?.groups ?? []
    expect(groups[0].fields).toHaveLength(0)
  })

  it('#431: confirms before removing a field bound to an element', () => {
    // Setup: group + field + a dataField element bound to the field
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '氏名', type: 'string' })
    const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id
    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, {
      id: 'el-bound', type: 'dataField',
      position: { x: 0, y: 0 }, size: { width: 50, height: 10 },
      zIndex: 1, visible: true, locked: false, fieldKey: '', style: {},
    } as unknown as import('@/types').ReportElement)
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-bound', fieldId)

    render(<SchemaPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'フィールドを削除' }))

    // Dialog shown; field survives until confirmed
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '削除' }))
    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(0)
    // The binding cascade also cleared the element's schemaBinding
    const el = useReportStore.getState().definition.pages[0]
      .sections!.flatMap((s) => s.elements).find((e) => e.id === 'el-bound')!
    expect(el.schemaBinding).toBeUndefined()
  })

  it('#431: keeps a bound field when the dialog is cancelled', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, { key: 'name', label: '氏名', type: 'string' })
    const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id
    const pageId = useReportStore.getState().definition.pages[0].id
    useReportStore.getState().addElement(pageId, {
      id: 'el-bound-2', type: 'dataField',
      position: { x: 0, y: 0 }, size: { width: 50, height: 10 },
      zIndex: 1, visible: true, locked: false, fieldKey: '', style: {},
    } as unknown as import('@/types').ReportElement)
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-bound-2', fieldId)

    render(<SchemaPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'フィールドを削除' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(1)
  })
})

describe('SchemaPanel — グループ折り畳み', () => {
  it('collapses group when collapse button is clicked', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText('フィールド追加'))

    // Collapse the group
    const collapseBtn = screen.getByRole('button', { name: 'グループを折り畳む' })
    fireEvent.click(collapseBtn)

    // Field inputs should no longer be visible
    expect(screen.queryByRole('textbox', { name: 'フィールドキー' })).not.toBeInTheDocument()
  })
})

describe('SchemaPanel — detail グループの dataKey', () => {
  it('shows dataKey input for detail group', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/detail グループ/))

    expect(screen.getByRole('textbox', { name: /データキー/ })).toBeInTheDocument()
  })

  it('does not show dataKey input for master group', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))

    expect(screen.queryByRole('textbox', { name: /データキー/ })).not.toBeInTheDocument()
  })

  it('updates group label on blur when changed', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))

    const labelInput = screen.getByRole('textbox', { name: 'グループ名' })
    fireEvent.change(labelInput, { target: { value: '新しいグループ名' } })
    fireEvent.blur(labelInput)

    const groups = useReportStore.getState().definition.schema?.groups ?? []
    expect(groups[0].label).toBe('新しいグループ名')
  })

  it('updates dataKey on blur for detail group', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/detail グループ/))

    const dataKeyInput = screen.getByRole('textbox', { name: /データキー/ })
    fireEvent.change(dataKeyInput, { target: { value: 'orders' } })
    fireEvent.blur(dataKeyInput)

    const groups = useReportStore.getState().definition.schema?.groups ?? []
    expect(groups[0].dataKey).toBe('orders')
  })
})

describe('SchemaPanel — Phase 3.5: 親グループリンク', () => {
  it('master グループが存在する場合、detail グループに親グループセレクタが表示される', () => {
    render(<SchemaPanel />)
    // Add master group first
    fireEvent.click(screen.getByText(/master グループ/))
    // Set master group label
    const labelInput = screen.getByRole('textbox', { name: 'グループ名' })
    fireEvent.change(labelInput, { target: { value: '顧客' } })
    fireEvent.blur(labelInput)
    // Add detail group
    fireEvent.click(screen.getByText(/detail グループ/))
    // The detail group should show parent group selector
    expect(screen.getByLabelText('親グループ')).toBeInTheDocument()
  })

  it('master グループが存在しない場合、detail グループに親グループセレクタが表示されない', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/detail グループ/))
    expect(screen.queryByLabelText('親グループ')).not.toBeInTheDocument()
  })

  it('親グループを選択すると linkedMasterGroupId がストアに保存される', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText(/detail グループ/))

    const masterGroupId = useReportStore.getState().definition.schema!.groups[0].id
    const detailGroupId = useReportStore.getState().definition.schema!.groups[1].id

    const select = screen.getByLabelText('親グループ')
    fireEvent.change(select, { target: { value: masterGroupId } })

    const groups = useReportStore.getState().definition.schema?.groups ?? []
    const detail = groups.find((g) => g.id === detailGroupId)!
    expect(detail.linkedMasterGroupId).toBe(masterGroupId)
  })

  it('（手動入力）を選択すると linkedMasterGroupId がクリアされる', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/master グループ/))
    fireEvent.click(screen.getByText(/detail グループ/))

    const masterGroupId = useReportStore.getState().definition.schema!.groups[0].id
    const detailGroupId = useReportStore.getState().definition.schema!.groups[1].id

    const select = screen.getByLabelText('親グループ')
    fireEvent.change(select, { target: { value: masterGroupId } })
    fireEvent.change(select, { target: { value: '' } })

    const groups = useReportStore.getState().definition.schema?.groups ?? []
    const detail = groups.find((g) => g.id === detailGroupId)!
    expect(detail.linkedMasterGroupId).toBeUndefined()
  })
})

describe('SchemaPanel — JSON から推測', () => {
  it('renders "JSON から推測" toggle button', () => {
    render(<SchemaPanel />)
    expect(screen.getByText(/JSON から推測/)).toBeInTheDocument()
  })

  it('expands textarea when toggle is clicked', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))
    expect(screen.getByLabelText('スキーマ推測用JSONサンプル')).toBeInTheDocument()
  })

  it('infer button is disabled when textarea is empty', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))
    expect(screen.getByText('推測して適用')).toBeDisabled()
  })

  it('shows error for invalid JSON', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))

    const textarea = screen.getByLabelText('スキーマ推測用JSONサンプル')
    fireEvent.change(textarea, { target: { value: 'not-json' } })
    fireEvent.click(screen.getByText('推測して適用'))

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows error for non-object JSON', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))

    const textarea = screen.getByLabelText('スキーマ推測用JSONサンプル')
    fireEvent.change(textarea, { target: { value: '["array"]' } })
    fireEvent.click(screen.getByText('推測して適用'))

    expect(screen.getByRole('alert')).toHaveTextContent('JSONオブジェクトを入力してください')
  })

  it('infers master group from flat JSON and loads into store', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))

    const textarea = screen.getByLabelText('スキーマ推測用JSONサンプル')
    fireEvent.change(textarea, { target: { value: '{"name":"Alice","age":30}' } })
    fireEvent.click(screen.getByText('推測して適用'))

    const groups = useReportStore.getState().definition.schema?.groups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].role).toBe('master')
    expect(groups[0].fields).toHaveLength(2)
    const keys = groups[0].fields.map((f) => f.key)
    expect(keys).toContain('name')
    expect(keys).toContain('age')
  })

  it('infers detail group for array-of-objects field', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))

    const textarea = screen.getByLabelText('スキーマ推測用JSONサンプル')
    fireEvent.change(textarea, { target: { value: '{"items":[{"qty":1,"price":9.99}]}' } })
    fireEvent.click(screen.getByText('推測して適用'))

    const groups = useReportStore.getState().definition.schema?.groups ?? []
    expect(groups).toHaveLength(1)
    expect(groups[0].role).toBe('detail')
    expect(groups[0].dataKey).toBe('items')
  })

  it('collapses and clears textarea after successful infer', () => {
    render(<SchemaPanel />)
    fireEvent.click(screen.getByText(/JSON から推測/))

    const textarea = screen.getByLabelText('スキーマ推測用JSONサンプル')
    fireEvent.change(textarea, { target: { value: '{"x":1}' } })
    fireEvent.click(screen.getByText('推測して適用'))

    // Panel should collapse
    expect(screen.queryByLabelText('スキーマ推測用JSONサンプル')).not.toBeInTheDocument()
  })
})
