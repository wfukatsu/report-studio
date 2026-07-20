import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextRenderer } from './Renderer'
import type { TextElement } from '@/types'

// Base element shared across stories
function makeEl(overrides?: Partial<TextElement>): TextElement {
  return {
    id: 'story-text-1',
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 15 },
    zIndex: 1,
    visible: true,
    locked: false,
    content: 'サンプルテキスト',
    style: {},
    ...overrides,
  } as TextElement
}

const meta: Meta<typeof TextRenderer> = {
  title: 'Elements/Text/Renderer',
  component: TextRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 200, height: 80, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TextRenderer>

export const Default: Story = {
  args: {
    element: makeEl({ content: 'サンプルテキスト', style: { fontSize: 4 } }),
    data: {},
  },
}

export const WithBinding: Story = {
  args: {
    element: makeEl({ content: 'こんにちは、{{name}} さん', style: { fontSize: 4 } }),
    data: { name: '山田太郎' },
  },
}

export const Bold: Story = {
  args: {
    element: makeEl({ style: { fontSize: 5, fontWeight: 'bold', color: '#1f2937' } }),
    data: {},
  },
}

export const Multiline: Story = {
  args: {
    element: makeEl({
      content: '1行目のテキスト\n2行目のテキスト\n3行目のテキスト',
      style: { fontSize: 3.5, lineHeight: 1.8 },
      size: { width: 60, height: 25 },
    }),
    data: {},
  },
}

export const WithBackground: Story = {
  args: {
    element: makeEl({
      content: '背景色付きテキスト',
      style: { fontSize: 4, color: '#1e3a5f', backgroundColor: '#dbeafe' },
    }),
    data: {},
  },
}

export const Vertical: Story = {
  name: '縦書き',
  args: {
    element: makeEl({
      content: '縦書きテキスト',
      style: { fontSize: 4, writingMode: 'vertical-rl' },
      size: { width: 15, height: 50 },
    }),
    data: {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 80, height: 140, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
}

export const CenterAligned: Story = {
  name: '中央揃え',
  args: {
    element: makeEl({
      content: '中央揃えテキスト',
      style: { fontSize: 4, textAlign: 'center', verticalAlign: 'middle' },
    }),
    data: {},
  },
}

export const Italic: Story = {
  name: '斜体',
  args: {
    element: makeEl({
      style: { fontSize: 4, fontStyle: 'italic', textDecoration: 'underline' },
    }),
    data: {},
  },
}

export const WithFurigana: Story = {
  name: 'ふりがな付き',
  args: {
    element: makeEl({
      content: '山田太郎',
      furigana: 'やまだたろう',
      style: { fontSize: 4 },
    }),
    data: {},
  },
}
