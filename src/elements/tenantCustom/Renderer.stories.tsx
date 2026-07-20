import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { TenantCustomRenderer } from './Renderer'
import { useReportStore } from '@/store/reportStore'
import type { TenantCustomElement, TenantInfo } from '@/types'

const SAMPLE_TENANT: TenantInfo = { custom: { branch: '東京支店', fax: '03-1234-9999' } }

function TenantSeeder({ info }: { info: TenantInfo | null }) {
  useEffect(() => {
    useReportStore.setState({ tenantInfo: info })
  }, [info])
  return null
}

function makeEl(overrides?: Partial<TenantCustomElement>): TenantCustomElement {
  return {
    id: 'story-tenant-custom-1',
    type: 'tenantCustom',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: 'branch',
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as TenantCustomElement
}

const meta: Meta<typeof TenantCustomRenderer> = {
  title: 'Elements/TenantCustom/Renderer',
  component: TenantCustomRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TenantCustomRenderer>

/** Design mode — literal token placeholder */
export const Design: Story = {
  name: 'デザインモード（トークン表示）',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantCustomRenderer element={makeEl()} />
    </>
  ),
}

export const Preview: Story = {
  name: 'プレビュー（解決済み）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantCustomRenderer element={makeEl()} resolveValues />
    </>
  ),
}

export const PreviewFallback: Story = {
  name: 'プレビュー（未設定キー・フォールバック）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantCustomRenderer element={makeEl({ fieldKey: 'website', fallback: '（未設定）' })} resolveValues />
    </>
  ),
}
