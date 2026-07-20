import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { TenantCompanyNameRenderer } from './Renderer'
import { useReportStore } from '@/store/reportStore'
import type { TenantCompanyNameElement, TenantInfo } from '@/types'

const SAMPLE_TENANT: TenantInfo = { companyName: '株式会社スカラー商事' }

function TenantSeeder({ info }: { info: TenantInfo | null }) {
  useEffect(() => {
    useReportStore.setState({ tenantInfo: info })
  }, [info])
  return null
}

function makeEl(overrides?: Partial<TenantCompanyNameElement>): TenantCompanyNameElement {
  return {
    id: 'story-tenant-company-1',
    type: 'tenantCompanyName',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    style: { fontSize: 14, color: '#000000', textAlign: 'left', fontWeight: 'bold' },
    ...overrides,
  } as TenantCompanyNameElement
}

const meta: Meta<typeof TenantCompanyNameRenderer> = {
  title: 'Elements/TenantCompanyName/Renderer',
  component: TenantCompanyNameRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 300, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TenantCompanyNameRenderer>

/** Design mode — literal token placeholder */
export const Design: Story = {
  name: 'デザインモード（トークン表示）',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantCompanyNameRenderer element={makeEl()} />
    </>
  ),
}

export const Preview: Story = {
  name: 'プレビュー（解決済み）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantCompanyNameRenderer element={makeEl()} resolveValues />
    </>
  ),
}

export const PreviewUnset: Story = {
  name: 'プレビュー（未設定フォールバック）',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantCompanyNameRenderer element={makeEl()} resolveValues />
    </>
  ),
}
