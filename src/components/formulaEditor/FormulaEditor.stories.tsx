import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef, useState } from 'react'
import FormulaEditor from './FormulaEditor'
import { FormulaStatusBar } from './FormulaStatusBar'
import { FormulaToolbar } from './FormulaToolbar'
import { FieldTreePanel } from './FieldTreePanel'
import type { UseFormulaEditorReturn } from './useFormulaEditor'
import type { SchemaGroup } from '@/types'
import './formulaEditor.css'

const meta = {
  title: 'Components/FormulaEditor',
  component: FormulaEditor,
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof FormulaEditor>

export default meta
type Story = StoryObj<typeof meta>

// ── Default: bare editor ──────────────────────────────────────────────────

export const Default: Story = {
  args: {
    initialValue: 'SUM(price * qty)',
    placeholderText: '式を入力...',
  },
}

// ── Empty editor ──────────────────────────────────────────────────────────

export const Empty: Story = {
  args: {
    initialValue: '',
    placeholderText: '式を入力...',
  },
}

// ── With toolbar and status bar ──────────────────────────────────────────

const SAMPLE_GROUPS: SchemaGroup[] = [
  {
    id: 'g1',
    label: '受注情報',
    role: 'master',
    dataKey: 'order',
    fields: [
      { id: 'f1', key: 'total', label: '合計', type: 'number' },
      { id: 'f2', key: 'customer_name', label: '顧客名', type: 'string' },
      { id: 'f3', key: 'order_date', label: '受注日', type: 'date' },
    ],
  },
  {
    id: 'g2',
    label: '明細',
    role: 'detail',
    dataKey: 'items',
    fields: [
      { id: 'f4', key: 'price', label: '単価', type: 'number' },
      { id: 'f5', key: 'qty', label: '数量', type: 'number' },
      { id: 'f6', key: 'subtotal', label: '小計', type: 'number', computed: true, expression: 'price * qty' },
    ],
  },
]

function FullEditorDemo() {
  const editorRef = useRef<UseFormulaEditorReturn | null>(null)
  const [value, setValue] = useState('ROUND(SUM(items.price * items.qty), 2)')

  const handleInsert = (text: string) => {
    editorRef.current?.insertAtCursor(text)
  }

  return (
    <div className="flex gap-0 border rounded-lg overflow-hidden" style={{ height: 400, width: 700 }}>
      <FieldTreePanel groups={SAMPLE_GROUPS} onInsert={handleInsert} />
      <div className="flex-1 flex flex-col">
        <div className="p-3 flex-1">
          <FormulaEditor
            initialValue={value}
            onChange={setValue}
            editorRef={editorRef}
          />
          <FormulaToolbar onInsertFunction={handleInsert} />
          <FormulaStatusBar />
        </div>
        <div className="p-3 border-t text-xs text-muted-foreground">
          現在の値: <code className="font-mono">{value}</code>
        </div>
      </div>
    </div>
  )
}

export const WithFullUI: Story = {
  render: () => <FullEditorDemo />,
}
