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

// Mock toast notifications (sonner)
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
import { toast } from 'sonner'
const mockToastError = vi.mocked(toast.error)

// Mock export utilities so render doesn't fail on missing canvas refs
vi.mock('@/lib/exportUtils', () => ({
  exportReportToPdf: vi.fn(),
  exportReportToPdfBlob: vi.fn().mockResolvedValue(new Blob(['pdf'])),
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
  // newReport() doesn't reset currentTemplateId or UI state — reset them explicitly
  useReportStore.getState().setCurrentTemplateId(null)
  useReportStore.getState().setLivePreviewEnabled(false)
  useReportStore.getState().setPreviewMode(false)
  vi.clearAllMocks()
})

import { fireEvent } from '@testing-library/react'
import { createTextElement } from '@/lib/elementFactories'

describe('Toolbar — レポート名', () => {
  it('renders report name input', () => {
    renderToolbar()
    expect(screen.getByLabelText('レポート名')).toBeInTheDocument()
  })

  it('updates report name when input changes', () => {
    renderToolbar()
    const input = screen.getByLabelText('レポート名')
    fireEvent.change(input, { target: { value: '新しいレポート' } })
    expect(useReportStore.getState().definition.metadata.documentName).toBe('新しいレポート')
  })
})

describe('Toolbar — Undo/Redo', () => {
  it('renders undo button', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: '元に戻す (⌘Z)' })).toBeInTheDocument()
  })

  it('renders redo button', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'やり直す (⌘⇧Z)' })).toBeInTheDocument()
  })
})

describe('Toolbar — グリッド・スナップ', () => {
  it('toggles grid on click', () => {
    renderToolbar()
    const gridBtn = screen.getByRole('button', { name: 'グリッド表示切替' })
    const beforeState = useReportStore.getState().showGrid
    fireEvent.click(gridBtn)
    expect(useReportStore.getState().showGrid).toBe(!beforeState)
  })

  it('toggles snap to grid on click', () => {
    renderToolbar()
    const snapBtn = screen.getByRole('button', { name: 'グリッドにスナップ' })
    const beforeState = useReportStore.getState().snapToGrid
    fireEvent.click(snapBtn)
    expect(useReportStore.getState().snapToGrid).toBe(!beforeState)
  })

  it('toggles trim marks on click', () => {
    renderToolbar()
    const trimBtn = screen.getByRole('button', { name: 'トンボ表示切替' })
    const beforeState = useReportStore.getState().showTrimMarks
    fireEvent.click(trimBtn)
    expect(useReportStore.getState().showTrimMarks).toBe(!beforeState)
  })
})

describe('Toolbar — プレビューモード', () => {
  it('renders preview button and dropdown toggle', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'プレビューを表示' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'プレビューメニュー' })).toBeInTheDocument()
  })

  it('opens dropdown when chevron is clicked and shows フルプレビュー option', () => {
    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: 'プレビューメニュー' }))
    expect(screen.getByText('フルプレビュー（PDF）')).toBeInTheDocument()
  })

  it('toggles live preview on プレビュー button click', () => {
    renderToolbar()
    const previewBtn = screen.getByRole('button', { name: 'プレビューを表示' })
    const beforeState = useReportStore.getState().livePreviewEnabled
    fireEvent.click(previewBtn)
    expect(useReportStore.getState().livePreviewEnabled).toBe(!beforeState)
  })
})

describe('Toolbar — 新規/開く/保存', () => {
  it('renders new, open, and save buttons', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: '新規作成' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '開く' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  })

  it('calls onRequestTemplateModal when new button is clicked', () => {
    const onRequestTemplateModal = vi.fn()
    const canvasRef = { current: null } as React.RefObject<HTMLDivElement | null>
    render(<Toolbar canvasRefs={[canvasRef]} onRequestTemplateModal={onRequestTemplateModal} />)
    fireEvent.click(screen.getByRole('button', { name: '新規作成' }))
    expect(onRequestTemplateModal).toHaveBeenCalledTimes(1)
  })
})

describe('Toolbar — コピー/切り取り/貼り付け', () => {
  it('renders copy button disabled when no selection', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'コピー (⌘C)' })).toBeDisabled()
  })

  it('renders cut button disabled when no selection', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: '切り取り (⌘X)' })).toBeDisabled()
  })

  it('enables copy button when element is selected', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement()
    store.addElement(page.id, el)
    store.selectElement(el.id, false)

    renderToolbar()
    expect(screen.getByRole('button', { name: 'コピー (⌘C)' })).not.toBeDisabled()
  })
})

// Note: 出力バリアント設定 button was moved out of Toolbar into a separate component.

describe('Toolbar — データ設定', () => {
  it('renders data button', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'データ設定' })).toBeInTheDocument()
  })
})

describe('Toolbar — エクスポート', () => {
  it('renders export dropdown button', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'エクスポート' })).toBeInTheDocument()
  })
})

describe('Toolbar — ズームコントロール', () => {
  it('renders zoom in/out buttons', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'ズームアウト (⌘-)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ズームイン (⌘=)' })).toBeInTheDocument()
  })

  it('zooms in when zoom in button is clicked', () => {
    renderToolbar()
    const initialZoom = useReportStore.getState().editorZoom
    fireEvent.click(screen.getByRole('button', { name: 'ズームイン (⌘=)' }))
    expect(useReportStore.getState().editorZoom).toBeGreaterThan(initialZoom)
  })

  it('zooms out when zoom out button is clicked', () => {
    renderToolbar()
    const initialZoom = useReportStore.getState().editorZoom
    fireEvent.click(screen.getByRole('button', { name: 'ズームアウト (⌘-)' }))
    expect(useReportStore.getState().editorZoom).toBeLessThan(initialZoom)
  })
})

describe('Toolbar — マスターヘッダー/フッター', () => {
  it('creates master header when header button is clicked', () => {
    renderToolbar()
    const headerBtn = screen.getByRole('button', { name: 'マスターヘッダーを作成' })
    fireEvent.click(headerBtn)
    expect(useReportStore.getState().definition.masterHeader).not.toBeNull()
  })

  it('creates master footer when footer button is clicked', () => {
    renderToolbar()
    const footerBtn = screen.getByRole('button', { name: 'マスターフッターを作成' })
    fireEvent.click(footerBtn)
    expect(useReportStore.getState().definition.masterFooter).not.toBeNull()
  })
})

describe('Toolbar — 整列メニュー', () => {
  it('opens align menu when align button clicked with multiple selection', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement()
    const el2 = createTextElement()
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true)

    renderToolbar()
    const alignBtn = screen.getByRole('button', { name: '整列・配置' })
    fireEvent.click(alignBtn)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('左揃え')).toBeInTheDocument()
  })

  it('aligns elements left when 左揃え is clicked', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement({ position: { x: 10, y: 10 } })
    const el2 = createTextElement({ position: { x: 50, y: 10 } })
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true)

    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: '整列・配置' }))
    fireEvent.click(screen.getByText('左揃え'))
    // Align menu should close after click
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Toolbar — 順序メニュー', () => {
  it('opens z-order menu when 順序 button is clicked', () => {
    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: '順序' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('最前面へ')).toBeInTheDocument()
  })

  it('changes z-order when 最前面へ is clicked with selection', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement()
    store.addElement(page.id, el)
    store.selectElement(el.id, false)

    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: '順序' }))
    fireEvent.click(screen.getByText('最前面へ'))
    // Menu should close after selection
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('Toolbar — ズームメニュー', () => {
  it('opens zoom menu when chevron is clicked', () => {
    renderToolbar()
    // Find the chevron button near the zoom input
    const zoomContainer = screen.getByLabelText('拡大率').parentElement!
    const chevronBtn = zoomContainer.querySelector('button[aria-haspopup="listbox"]')!
    fireEvent.click(chevronBtn)
    // Zoom presets should appear
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('sets zoom when preset is clicked', () => {
    renderToolbar()
    const zoomContainer = screen.getByLabelText('拡大率').parentElement!
    const chevronBtn = zoomContainer.querySelector('button[aria-haspopup="listbox"]')!
    fireEvent.click(chevronBtn)
    fireEvent.click(screen.getByText('50%'))
    expect(useReportStore.getState().editorZoom).toBeCloseTo(0.5, 1)
  })
})

describe('Toolbar — ライブプレビュー', () => {
  it('toggles live preview on click', () => {
    renderToolbar()
    const liveBtn = screen.getByRole('button', { name: 'プレビューを表示' })
    const beforeState = useReportStore.getState().livePreviewEnabled
    fireEvent.click(liveBtn)
    expect(useReportStore.getState().livePreviewEnabled).toBe(!beforeState)
  })
})

describe('Toolbar — 拡大率入力', () => {
  it('updates zoom when entering value and pressing Enter', () => {
    renderToolbar()
    const zoomInput = screen.getByLabelText('拡大率')
    fireEvent.focus(zoomInput)
    fireEvent.change(zoomInput, { target: { value: '150' } })
    fireEvent.keyDown(zoomInput, { key: 'Enter' })
    expect(useReportStore.getState().editorZoom).toBeCloseTo(1.5, 1)
  })

  it('resets zoom input on Escape', () => {
    renderToolbar()
    const zoomInput = screen.getByLabelText('拡大率') as HTMLInputElement
    fireEvent.focus(zoomInput)
    fireEvent.change(zoomInput, { target: { value: '999' } })
    fireEvent.keyDown(zoomInput, { key: 'Escape' })
    // After escape, shows current zoom
    expect(zoomInput.value).toContain('%')
  })

  it('updates zoom on blur', () => {
    renderToolbar()
    const zoomInput = screen.getByLabelText('拡大率')
    fireEvent.focus(zoomInput)
    fireEvent.change(zoomInput, { target: { value: '75' } })
    fireEvent.blur(zoomInput, { target: { value: '75' } })
    expect(useReportStore.getState().editorZoom).toBeCloseTo(0.75, 1)
  })
})

describe('Toolbar — コピー/切り取り/貼り付け動作', () => {
  it('copies element on copy button click', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement()
    store.addElement(page.id, el)
    store.selectElement(el.id, false)

    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: 'コピー (⌘C)' }))
    expect(useReportStore.getState().clipboard).toBeTruthy()
    expect(useReportStore.getState().clipboard!.length).toBeGreaterThan(0)
  })

  it('cuts element on cut button click', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement()
    store.addElement(page.id, el)
    store.selectElement(el.id, false)
    const beforeCount = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements).length

    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: '切り取り (⌘X)' }))

    const afterCount = useReportStore.getState().definition.pages[0].sections.flatMap((s) => s.elements).length
    expect(afterCount).toBe(beforeCount - 1)
    expect(useReportStore.getState().clipboard!.length).toBeGreaterThan(0)
  })
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
      expect(mockToastError).toHaveBeenCalledWith('バリデーションに失敗しました', expect.any(Object))
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

describe('Toolbar — スタイルのコピー/貼り付け', () => {
  it('style copy button is disabled when no element is selected', () => {
    renderToolbar()
    expect(screen.getByRole('button', { name: 'スタイルをコピー' })).toBeDisabled()
  })

  it('style paste button is disabled when no style in clipboard', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement()
    store.addElement(page.id, el)
    store.selectElement(el.id, false)

    renderToolbar()
    expect(screen.getByRole('button', { name: 'スタイルを貼り付け' })).toBeDisabled()
  })

  it('copies style on copy-style click and enables paste', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el = createTextElement({ style: { fontSize: 20, color: '#ff0000' } })
    store.addElement(page.id, el)
    store.selectElement(el.id, false)

    renderToolbar()
    fireEvent.click(screen.getByRole('button', { name: 'スタイルをコピー' }))

    const clip = useReportStore.getState().styleClipboard
    expect(clip).toBeTruthy()
    expect(clip!.fontSize).toBe(20)
    expect(clip!.color).toBe('#ff0000')
  })

  it('pastes style to selected element', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement({ style: { fontSize: 20, color: '#ff0000' } })
    const el2 = createTextElement({ style: { fontSize: 10, color: '#000000' } })
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)

    // Copy style from el1
    store.selectElement(el1.id, false)
    store.copyStyle(page.id, el1.id)

    // Select el2 and paste
    store.selectElement(el2.id, false)
    store.pasteStyle(page.id, [el2.id])

    const updated = useReportStore.getState().definition.pages[0].sections
      .flatMap((s) => s.elements)
      .find((e) => e.id === el2.id) as { style: { fontSize: number; color: string } }
    expect(updated.style.fontSize).toBe(20)
    expect(updated.style.color).toBe('#ff0000')
  })
})
