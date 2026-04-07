import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReportStore } from '@/store'
import { Toolbar } from './Toolbar'

// Mock evaluateValidate — the actual API call
vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    evaluateValidate: vi.fn(),
  }
})

// Mock export utilities so render doesn't fail on missing canvas refs
vi.mock('@/lib/exportUtils', () => ({
  exportReportToPdf: vi.fn(),
  exportPageToPng: vi.fn(),
  exportToJSON: vi.fn(() => '{}'),
}))

import { evaluateValidate } from '@/api/reportApi'
const mockEvaluateValidate = vi.mocked(evaluateValidate)

function renderToolbar() {
  const canvasRef = { current: null } as React.RefObject<HTMLDivElement | null>
  return render(<Toolbar canvasRefs={[canvasRef]} />)
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().invalidateComputed()
  // newReport() doesn't reset currentTemplateId (uiSlice) — reset it explicitly
  useReportStore.getState().setCurrentTemplateId(null)
  vi.clearAllMocks()
})

describe('Toolbar — バリデートボタン', () => {
  it('renders the validate button', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'バリデーション実行' })).toBeInTheDocument()
  })

  it('shows success violations in store on successful validate', async () => {
    useReportStore.getState().setCurrentTemplateId('tpl-1')
    mockEvaluateValidate.mockResolvedValue({
      violations: [{ ruleKey: 'required', message: '必須です', elementId: 'el-1' }],
    })

    renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: 'バリデーション実行' }))

    await waitFor(() => {
      expect(useReportStore.getState().computedViolations).toHaveLength(1)
      expect(useReportStore.getState().computedViolations[0].ruleKey).toBe('required')
    })
  })

  it('clears violations at validate start', async () => {
    useReportStore.getState().setCurrentTemplateId('tpl-1')
    // Pre-populate violations
    useReportStore.getState().setComputedViolations([
      { ruleKey: 'old-rule', message: '旧エラー' },
    ])

    let resolveValidate!: (v: { violations: [] }) => void
    mockEvaluateValidate.mockReturnValue(
      new Promise((res) => { resolveValidate = res }),
    )

    renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: 'バリデーション実行' }))

    // Before resolving: violations should be cleared (start-of-validate clear)
    await waitFor(() => {
      expect(useReportStore.getState().computedViolations).toHaveLength(0)
    })

    // Resolve to avoid dangling promises
    resolveValidate({ violations: [] })
  })

  it('is disabled when currentTemplateId is null', () => {
    // currentTemplateId is null by default after newReport()
    renderToolbar()

    const btn = screen.getByRole('button', { name: 'バリデーション実行' })
    expect(btn).toBeDisabled()
  })

  it('shows validateError on API failure', async () => {
    useReportStore.getState().setCurrentTemplateId('tpl-1')
    mockEvaluateValidate.mockRejectedValue(new Error('Network error'))

    renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: 'バリデーション実行' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('バリデーションに失敗しました')
    })
  })

  it('captures AbortSignal from AbortController on validate start', async () => {
    useReportStore.getState().setCurrentTemplateId('tpl-1')

    let capturedSignal: AbortSignal | undefined

    mockEvaluateValidate.mockImplementation((_id, _def, _data, signal) => {
      capturedSignal = signal
      return Promise.resolve({ violations: [] })
    })

    renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: 'バリデーション実行' }))

    await waitFor(() => {
      expect(mockEvaluateValidate).toHaveBeenCalled()
    })

    expect(capturedSignal).toBeInstanceOf(AbortSignal)
  })

  it('shows violation count badge when violations exist', async () => {
    useReportStore.getState().setCurrentTemplateId('tpl-1')
    mockEvaluateValidate.mockResolvedValue({
      violations: [
        { ruleKey: 'r1', message: 'e1', elementId: 'el-1' },
        { ruleKey: 'r2', message: 'e2', elementId: 'el-2' },
      ],
    })

    renderToolbar()
    await userEvent.click(screen.getByRole('button', { name: 'バリデーション実行' }))

    await waitFor(() => {
      expect(useReportStore.getState().computedViolations).toHaveLength(2)
    })

    // Badge should appear inside the validate button
    const btn = screen.getByRole('button', { name: 'バリデーション実行' })
    expect(btn.textContent).toContain('2')
  })
})
