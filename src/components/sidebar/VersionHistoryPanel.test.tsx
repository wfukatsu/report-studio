import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useReportStore } from '@/store'
import { VersionHistoryPanel } from './VersionHistoryPanel'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    listVersions: vi.fn(),
    createVersion: vi.fn(),
    restoreVersion: vi.fn(),
  }
})

import { listVersions, createVersion, restoreVersion } from '@/api/reportApi'
const mockListVersions = vi.mocked(listVersions)
const mockCreateVersion = vi.mocked(createVersion)
const mockRestoreVersion = vi.mocked(restoreVersion)

const SAMPLE_VERSIONS = [
  { id: 'v2', versionNumber: 2, createdAt: '2026-01-02T10:00:00Z', createdBy: 'user@example.com' },
  { id: 'v1', versionNumber: 1, createdAt: '2026-01-01T09:00:00Z' },
]

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setCurrentTemplateId(null)
  useReportStore.getState().setBackendConnected(false)
  vi.clearAllMocks()
})

describe('VersionHistoryPanel — offline state', () => {
  it('shows connect hint when backend not connected', () => {
    render(<VersionHistoryPanel />)
    expect(screen.getByText(/バックエンドに接続されていません/)).toBeInTheDocument()
  })
})

describe('VersionHistoryPanel — no template', () => {
  it('shows load-template hint when connected but no template', () => {
    useReportStore.getState().setBackendConnected(true)
    render(<VersionHistoryPanel />)
    expect(screen.getByText(/バックエンドからテンプレートを読み込む/)).toBeInTheDocument()
  })
})

describe('VersionHistoryPanel — connected with template', () => {
  beforeEach(() => {
    useReportStore.getState().setBackendConnected(true)
    useReportStore.getState().setCurrentTemplateId('tpl-1')
  })

  it('renders load button and create button', () => {
    render(<VersionHistoryPanel />)
    expect(screen.getByLabelText('バージョン一覧を更新')).toBeInTheDocument()
    expect(screen.getByLabelText('現在の状態をバージョンとして保存')).toBeInTheDocument()
  })

  it('shows empty state before loading versions', () => {
    render(<VersionHistoryPanel />)
    expect(screen.getByText(/バージョンがありません/)).toBeInTheDocument()
  })

  it('loads and displays version list on 更新 click', async () => {
    mockListVersions.mockResolvedValue(SAMPLE_VERSIONS)
    render(<VersionHistoryPanel />)

    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))

    await waitFor(() => {
      expect(screen.getByText('v2')).toBeInTheDocument()
      expect(screen.getByText('v1')).toBeInTheDocument()
    })
    // Sorted descending: v2 first
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('v2')
    expect(items[1]).toHaveTextContent('v1')
  })

  it('shows load error when listVersions rejects', async () => {
    mockListVersions.mockRejectedValue(new Error('Network error'))
    render(<VersionHistoryPanel />)

    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('バージョン一覧の取得に失敗しました')
    })
  })

  it('adds new version to top of list after create', async () => {
    mockListVersions.mockResolvedValue(SAMPLE_VERSIONS)
    const newVersion = { id: 'v3', versionNumber: 3, createdAt: '2026-01-03T12:00:00Z' }
    mockCreateVersion.mockResolvedValue(newVersion)

    render(<VersionHistoryPanel />)

    // Load versions first
    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument())

    // Create new version
    await userEvent.click(screen.getByLabelText('現在の状態をバージョンとして保存'))

    await waitFor(() => {
      expect(screen.getByText('v3')).toBeInTheDocument()
    })
    // v3 should be first
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('v3')
  })

  it('shows create error when createVersion rejects', async () => {
    mockCreateVersion.mockRejectedValue(new Error('Server error'))
    render(<VersionHistoryPanel />)

    await userEvent.click(screen.getByLabelText('現在の状態をバージョンとして保存'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('バージョンの作成に失敗しました')
    })
  })

  it('calls restoreVersion with correct ids when restore button clicked', async () => {
    mockListVersions.mockResolvedValue(SAMPLE_VERSIONS)
    mockRestoreVersion.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<VersionHistoryPanel />)
    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument())

    await userEvent.click(screen.getByLabelText('v2 に復元'))

    await waitFor(() => {
      expect(mockRestoreVersion).toHaveBeenCalledWith('tpl-1', 'v2')
    })
  })

  it('does not restore when user cancels confirm', async () => {
    mockListVersions.mockResolvedValue(SAMPLE_VERSIONS)
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<VersionHistoryPanel />)
    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument())

    await userEvent.click(screen.getByLabelText('v2 に復元'))

    expect(mockRestoreVersion).not.toHaveBeenCalled()
  })

  it('shows restore error when restoreVersion rejects', async () => {
    mockListVersions.mockResolvedValue(SAMPLE_VERSIONS)
    mockRestoreVersion.mockRejectedValue(new Error('Restore failed'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<VersionHistoryPanel />)
    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))
    await waitFor(() => expect(screen.getByText('v2')).toBeInTheDocument())

    await userEvent.click(screen.getByLabelText('v2 に復元'))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('復元に失敗しました')
    })
  })

  it('shows createdBy when present', async () => {
    mockListVersions.mockResolvedValue(SAMPLE_VERSIONS)
    render(<VersionHistoryPanel />)

    await userEvent.click(screen.getByLabelText('バージョン一覧を更新'))

    await waitFor(() => {
      expect(screen.getByText('user@example.com')).toBeInTheDocument()
    })
  })
})
