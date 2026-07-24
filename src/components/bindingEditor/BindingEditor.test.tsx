/**
 * BindingEditor — store integration: field⇔element connect/disconnect,
 * empty state, summary bar, computed-field wiring, schema library save.
 *
 * ComputedFieldDialog is mocked (CodeMirror-heavy; tested separately in
 * internals/ComputedFieldDialog.test.tsx) — here we verify the wiring:
 * fx button → dialog props → addSchemaField(computed).
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { BindingEditor } from './BindingEditor'
import { useReportStore } from '@/store'
import type { ReportElement } from '@/types'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    saveToSchemaLibrary: vi.fn(),
    listSchemas: vi.fn().mockResolvedValue({ items: [] }),
  }
})

vi.mock('./internals/ComputedFieldDialog', () => ({
  ComputedFieldDialog: ({ groupId, onSave, onClose }: {
    groupId: string
    onSave: (name: string, expression: string) => void
    onClose: () => void
  }) => (
    <div data-testid="computed-dialog" data-group-id={groupId}>
      <button onClick={() => onSave('total_calc', 'price * qty')}>mock-save</button>
      <button onClick={onClose}>mock-close</button>
    </div>
  ),
}))

import { saveToSchemaLibrary } from '@/api/reportApi'

beforeAll(() => {
  // jsdom has no layout — connection-line code needs bounding rects
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0, toJSON: () => ({}) }),
  })
})

beforeEach(() => {
  vi.clearAllMocks()
  useReportStore.getState().newReport()
})

function setupSchemaAndElements() {
  const store = useReportStore.getState()
  store.addSchemaGroup('master')
  const groupId = useReportStore.getState().definition.schema!.groups[0].id
  useReportStore.getState().addSchemaField(groupId, { key: 'customerName', label: '顧客名', type: 'string' })
  const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id

  const pageId = useReportStore.getState().definition.pages[0].id
  const addEl = (id: string, name: string) => {
    useReportStore.getState().addElement(pageId, {
      id, type: 'dataField', name,
      position: { x: 0, y: 0 }, size: { width: 50, height: 10 },
      zIndex: 1, visible: true, locked: false, fieldKey: '', style: {},
    } as unknown as ReportElement)
  }
  addEl('el-1', '顧客名欄')
  addEl('el-2', '備考欄')
  return { groupId, fieldId, pageId }
}

function getBinding(pageId: string, elementId: string) {
  return useReportStore.getState().definition.pages
    .find((p) => p.id === pageId)!.sections!
    .flatMap((s) => s.elements)
    .find((e) => e.id === elementId)?.schemaBinding
}

describe('BindingEditor — 空状態', () => {
  it('shows the no-schema empty state and creates the first master group from it', () => {
    render(<BindingEditor />)
    expect(screen.getByText('スキーマが未定義です')).toBeInTheDocument()

    fireEvent.click(screen.getByText('最初のグループを追加'))

    const groups = useReportStore.getState().definition.schema!.groups
    expect(groups).toHaveLength(1)
    expect(groups[0].role).toBe('master')
  })

  it('disables ライブラリに保存 while no schema exists', () => {
    render(<BindingEditor />)
    expect(screen.getByText('ライブラリに保存').closest('button')).toBeDisabled()
  })
})

describe('BindingEditor — クリック接続/解除', () => {
  it('binds an element by clicking a field then the element', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    render(<BindingEditor />)

    fireEvent.click(screen.getByText('顧客名'))
    // Selection status bar appears in the left panel
    expect(screen.getByText(/選択中:/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('顧客名欄'))
    expect(getBinding(pageId, 'el-1')?.fieldId).toBe(fieldId)
  })

  it('clicking a bound element while its field is selected disconnects it', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-1', fieldId)
    render(<BindingEditor />)

    fireEvent.click(screen.getByText('顧客名'))
    fireEvent.click(screen.getByText('顧客名欄'))

    expect(getBinding(pageId, 'el-1')).toBeUndefined()
  })

  it('clicking a bound element without a selection disconnects it', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-1', fieldId)
    render(<BindingEditor />)

    fireEvent.click(screen.getByText('顧客名欄'))
    expect(getBinding(pageId, 'el-1')).toBeUndefined()
  })

  it('shows binding statistics in the summary bar', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-1', fieldId)
    render(<BindingEditor />)

    expect(screen.getByText('1/2 解決済み')).toBeInTheDocument()
    expect(screen.getByText('1 未バインド')).toBeInTheDocument()
  })
})

describe('BindingEditor — 一括生成（フィールド→要素）', () => {
  function pageElements(pageId: string) {
    return useReportStore.getState().definition.pages
      .find((p) => p.id === pageId)!.sections!.flatMap((s) => s.elements)
  }

  it('ヘッダーの一括生成ボタンから未配置フィールドの要素を生成する', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    render(<BindingEditor />)

    // Trigger is exposed in the group header (previously wired but never rendered)
    fireEvent.click(screen.getByLabelText('フィールドから要素を一括生成'))

    // Bar appears with the field that has no matching element yet (顧客名)
    expect(screen.getByText('未配置フィールドから要素を生成')).toBeInTheDocument()
    const before = pageElements(pageId).length

    fireEvent.click(screen.getByText('生成する'))

    const after = pageElements(pageId)
    expect(after.length).toBe(before + 1)
    // The generated element is pre-bound to the source field
    expect(after.some((e) => e.schemaBinding?.fieldId === fieldId)).toBe(true)
  })

  it('生成対象が無い場合はフィードバックを出す（サイレントな無反応にしない）', () => {
    const { pageId } = setupSchemaAndElements()
    // Rename an element so the field (顧客名) already has a matching element label
    useReportStore.getState().updateElement(pageId, 'el-1', { name: '顧客名' })
    render(<BindingEditor />)

    fireEvent.click(screen.getByLabelText('フィールドから要素を一括生成'))
    expect(screen.getByText(/生成できる項目はありません/)).toBeInTheDocument()
  })
})

describe('BindingEditor — fieldKey 結線の認識', () => {
  it('schemaBinding が無くても fieldKey がスキーマのパスと一致する要素をバインド済みと認識する', () => {
    const store = useReportStore.getState()
    store.addSchemaGroup('master')
    const gid = useReportStore.getState().definition.schema!.groups[0].id
    store.updateSchemaGroup(gid, { dataKey: 'customer' })
    store.addSchemaField(gid, { key: 'name', label: '氏名', type: 'string' })

    const pageId = useReportStore.getState().definition.pages[0].id
    store.addElement(pageId, {
      id: 'el-fk', type: 'dataField', name: '氏名欄',
      position: { x: 0, y: 0 }, size: { width: 50, height: 10 },
      zIndex: 1, visible: true, locked: false,
      fieldKey: 'customer.name', // template-style binding, no schemaBinding
      style: {},
    } as unknown as ReportElement)

    render(<BindingEditor />)

    // The element is recognised as bound → 1/1 解決済み, no 未バインド badge
    expect(screen.getByText('1/1 解決済み')).toBeInTheDocument()
    expect(screen.queryByText(/未バインド/)).not.toBeInTheDocument()
  })
})

describe('BindingEditor — 列未割当の警告（#130）', () => {
  it('DB接続済みグループで列未割当のフィールドに警告を表示する', () => {
    const { groupId } = setupSchemaAndElements()
    useReportStore.getState().bindGroupToTable(groupId, { namespace: 'app', tableName: 'users' })
    render(<BindingEditor />)
    expect(screen.getByLabelText('DBカラム未割当')).toBeInTheDocument()
  })

  it('列を割り当てると警告が消える', () => {
    const { groupId, fieldId } = setupSchemaAndElements()
    useReportStore.getState().bindGroupToTable(groupId, { namespace: 'app', tableName: 'users' })
    useReportStore.getState().updateSchemaField(groupId, fieldId, { dbColumnName: 'name' })
    render(<BindingEditor />)
    expect(screen.queryByLabelText('DBカラム未割当')).not.toBeInTheDocument()
  })

  it('DB未接続のグループでは警告を出さない', () => {
    setupSchemaAndElements()
    render(<BindingEditor />)
    expect(screen.queryByLabelText('DBカラム未割当')).not.toBeInTheDocument()
  })
})

describe('BindingEditor — フィールド削除の確認（#431）', () => {
  it('未接続フィールドは確認なしで即削除される', () => {
    setupSchemaAndElements()
    render(<BindingEditor />)

    fireEvent.click(screen.getByTitle('削除'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(0)
  })

  it('接続済みフィールドは確認ダイアログを経て削除され、要素のバインドが解除される', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-1', fieldId)
    render(<BindingEditor />)

    fireEvent.click(screen.getByTitle('削除'))

    // Dialog shown; the field survives until confirmed
    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(1)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: '削除' }))

    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(0)
    expect(getBinding(pageId, 'el-1')).toBeUndefined()
  })

  it('キャンセルするとフィールドもバインドも残る', () => {
    const { fieldId, pageId } = setupSchemaAndElements()
    useReportStore.getState().setElementSchemaBinding(pageId, 'el-1', fieldId)
    render(<BindingEditor />)

    fireEvent.click(screen.getByTitle('削除'))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useReportStore.getState().definition.schema!.groups[0].fields).toHaveLength(1)
    expect(getBinding(pageId, 'el-1')?.fieldId).toBe(fieldId)
  })
})

describe('BindingEditor — フィールド追加時の型選択', () => {
  it('追加フォームで選んだ型で新しいフィールドが作られる', () => {
    const { groupId } = setupSchemaAndElements()
    render(<BindingEditor />)

    fireEvent.click(screen.getByText('フィールド追加'))
    fireEvent.change(screen.getByPlaceholderText('フィールド名'), { target: { value: 'quantity' } })
    fireEvent.change(screen.getByLabelText('フィールドの型'), { target: { value: 'number' } })
    fireEvent.click(screen.getByText('追加'))

    const group = useReportStore.getState().definition.schema!.groups.find((g) => g.id === groupId)!
    const added = group.fields.find((f) => f.key === 'quantity')
    expect(added).toMatchObject({ key: 'quantity', label: 'quantity', type: 'number' })
  })
})

describe('BindingEditor — 計算フィールドダイアログ連携', () => {
  it('opens the dialog for the group and adds a computed number field on save', async () => {
    const { groupId } = setupSchemaAndElements()
    render(<BindingEditor />)

    fireEvent.click(screen.getByTitle('計算フィールドを追加'))

    const dialog = await screen.findByTestId('computed-dialog')
    expect(dialog).toHaveAttribute('data-group-id', groupId)

    fireEvent.click(screen.getByText('mock-save'))

    const group = useReportStore.getState().definition.schema!.groups.find((g) => g.id === groupId)!
    const computed = group.fields.find((f) => f.key === 'total_calc')
    expect(computed).toMatchObject({
      key: 'total_calc', label: 'total_calc', type: 'number',
      computed: true, expression: 'price * qty',
    })
    await waitFor(() => {
      expect(screen.queryByTestId('computed-dialog')).not.toBeInTheDocument()
    })
  })

  it('closes the dialog without saving on cancel', async () => {
    const { groupId } = setupSchemaAndElements()
    render(<BindingEditor />)

    fireEvent.click(screen.getByTitle('計算フィールドを追加'))
    fireEvent.click(await screen.findByText('mock-close'))

    await waitFor(() => {
      expect(screen.queryByTestId('computed-dialog')).not.toBeInTheDocument()
    })
    const group = useReportStore.getState().definition.schema!.groups.find((g) => g.id === groupId)!
    expect(group.fields).toHaveLength(1) // only customerName
  })
})

describe('BindingEditor — スキーマライブラリ保存', () => {
  it('saves the current schema under the prompted name', async () => {
    setupSchemaAndElements()
    vi.mocked(saveToSchemaLibrary).mockResolvedValueOnce({} as never)

    render(<BindingEditor />)
    fireEvent.click(screen.getByText('ライブラリに保存'))

    // Name dialog opens (#269 — PromptDialog replaces window.prompt)
    const input = screen.getByPlaceholderText('スキーマ名')
    fireEvent.change(input, { target: { value: '  請求書スキーマ  ' } })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => {
      expect(saveToSchemaLibrary).toHaveBeenCalledTimes(1)
    })
    const [name, payload] = vi.mocked(saveToSchemaLibrary).mock.calls[0]
    expect(name).toBe('請求書スキーマ') // trimmed
    const { schema } = payload as { schema: { groups: unknown[] } }
    expect(schema.groups).toHaveLength(1)
  })

  it('does not call the API when the name dialog is cancelled', () => {
    setupSchemaAndElements()

    render(<BindingEditor />)
    fireEvent.click(screen.getByText('ライブラリに保存'))
    fireEvent.click(screen.getByText('キャンセル'))

    expect(saveToSchemaLibrary).not.toHaveBeenCalled()
  })
})
