import type { Meta, StoryObj } from '@storybook/react-vite'
import { FormTableRenderer } from './Renderer'
import type { FormTableElement } from '@/types'

function makeEl(overrides?: Partial<FormTableElement>): FormTableElement {
  return {
    id: 'story-formtable-1',
    type: 'formTable',
    position: { x: 0, y: 0 },
    size: { width: 120, height: 24 },
    zIndex: 1,
    visible: true,
    locked: false,
    columns: [
      { id: 'col-1', width: 40, align: 'left' },
      { id: 'col-2', width: 40, align: 'left' },
      { id: 'col-3', width: 40, align: 'right' },
    ],
    rows: [
      {
        id: 'row-header',
        role: 'header',
        height: 8,
        cells: [
          { id: 'cell-h1', type: 'label', text: '品目' },
          { id: 'cell-h2', type: 'label', text: '数量' },
          { id: 'cell-h3', type: 'label', text: '金額' },
        ],
      },
      {
        id: 'row-body',
        role: 'body',
        height: 8,
        cells: [
          { id: 'cell-b1', type: 'input', placeholder: '（記入）' },
          { id: 'cell-b2', type: 'input', placeholder: '' },
          { id: 'cell-b3', type: 'input', placeholder: '' },
        ],
      },
    ],
    borderColor: '#000000',
    borderWidth: 0.3,
    headerStyle: { fontSize: 9, fontWeight: 'bold', backgroundColor: '#f3f4f6' },
    ...overrides,
  } as FormTableElement
}

const meta: Meta<typeof FormTableRenderer> = {
  title: 'Elements/FormTable/Renderer',
  component: FormTableRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 160, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof FormTableRenderer>

/** Design mode — static layout, no records */
export const DesignPreview: Story = {
  name: 'デザインプレビュー（静的レイアウト）',
  args: {
    element: makeEl(),
  },
}

/** Preview mode — body rows expanded from bound records */
export const PreviewWithRecords: Story = {
  name: 'データバインド展開（records あり）',
  args: {
    element: makeEl({
      dataSource: 'items',
      rows: [
        {
          id: 'row-header',
          role: 'header',
          height: 8,
          cells: [
            { id: 'cell-h1', type: 'label', text: '品目' },
            { id: 'cell-h2', type: 'label', text: '数量' },
            { id: 'cell-h3', type: 'label', text: '金額' },
          ],
        },
        {
          id: 'row-body',
          role: 'body',
          height: 8,
          cells: [
            { id: 'cell-b1', type: 'dataField', fieldKey: 'name' },
            { id: 'cell-b2', type: 'dataField', fieldKey: 'quantity' },
            { id: 'cell-b3', type: 'dataField', fieldKey: 'amount', format: { type: 'comma' } },
          ],
        },
      ],
    }),
    records: [
      { name: 'ノートパソコン', quantity: 2, amount: 256000 },
      { name: 'ディスプレイ', quantity: 4, amount: 168000 },
      { name: 'キーボード', quantity: 6, amount: 54000 },
    ],
  },
}

export const CheckboxAndMergedCells: Story = {
  name: 'チェックボックスセル',
  args: {
    element: makeEl({
      rows: [
        {
          id: 'row-header',
          role: 'header',
          height: 8,
          cells: [
            { id: 'cell-h1', type: 'label', text: '確認項目' },
            { id: 'cell-h2', type: 'label', text: '済' },
            { id: 'cell-h3', type: 'label', text: '備考' },
          ],
        },
        {
          id: 'row-body',
          role: 'body',
          height: 8,
          cells: [
            { id: 'cell-b1', type: 'label', text: '本人確認書類' },
            { id: 'cell-b2', type: 'checkbox', checked: true, checkmark: '✓' },
            { id: 'cell-b3', type: 'input', placeholder: '' },
          ],
        },
      ],
    }),
  },
}
