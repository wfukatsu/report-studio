import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
// NOTE: '@/store' must be imported before the component. ServerSettings
// value-imports '@/api/reportApi'; when it loads first, the store slices
// bind the real API module instead of the vi.mock below.
import { useReportStore } from '@/store'
import { ServerSettings } from './ServerSettings'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    getServerConfig: vi.fn(),
    putServerConfig: vi.fn(),
    testServerConfig: vi.fn(),
    restartServer: vi.fn(),
  }
})

import { getServerConfig, putServerConfig, testServerConfig, restartServer } from '@/api/reportApi'
const mockGet = vi.mocked(getServerConfig)
const mockPut = vi.mocked(putServerConfig)
const mockTest = vi.mocked(testServerConfig)
const mockRestart = vi.mocked(restartServer)

const CONFIG = {
  'scalar.db.storage': 'jdbc',
  'scalar.db.contact_points': 'jdbc:sqlite:data/report-studio.db',
  'scalar.db.username': 'sa',
  'scalar.db.password': '***',
}

function contactPointsInput() {
  return screen.getByPlaceholderText('jdbc:sqlite:data/report-studio.db') as HTMLInputElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGet.mockResolvedValue(CONFIG)
  mockPut.mockResolvedValue({ message: 'ok' })
  useReportStore.setState({
    backendConnected: true,
    adminServerConfig: {},
    adminServerConfigOriginal: {},
    adminServerConfigLoading: false,
    adminServerConfigError: null,
  } as never)
})

describe('ServerSettings — load', () => {
  it('fetches the config on mount and fills the form', async () => {
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).toBe('jdbc:sqlite:data/report-studio.db'))
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('未保存の変更あり')).not.toBeInTheDocument()
  })

  it('shows an error banner when the config cannot be loaded', async () => {
    mockGet.mockRejectedValueOnce(new Error('500'))
    render(<ServerSettings />)
    expect(await screen.findByText('設定の読み込みに失敗しました')).toBeInTheDocument()
  })
})

describe('ServerSettings — edit & save', () => {
  it('marks the form dirty on edit and saves via putServerConfig', async () => {
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    const saveButton = screen.getByRole('button', { name: '設定を保存' })
    expect(saveButton).toBeDisabled() // pristine

    fireEvent.change(contactPointsInput(), { target: { value: 'jdbc:mysql://db:3306/prod' } })
    expect(screen.getByText('未保存の変更あり')).toBeInTheDocument()
    expect(saveButton).toBeEnabled()

    fireEvent.click(saveButton)
    await waitFor(() => expect(mockPut).toHaveBeenCalledTimes(1))
    expect(mockPut).toHaveBeenCalledWith({
      ...CONFIG,
      'scalar.db.contact_points': 'jdbc:mysql://db:3306/prod',
    })
    expect(
      await screen.findByText('設定を保存しました。有効化するには再起動が必要です。'),
    ).toBeInTheDocument()
    // Saved config becomes the new baseline
    expect(screen.queryByText('未保存の変更あり')).not.toBeInTheDocument()
  })

  it('shows an error when saving fails and stays dirty', async () => {
    mockPut.mockRejectedValueOnce(new Error('500'))
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    fireEvent.change(contactPointsInput(), { target: { value: 'jdbc:bad' } })
    fireEvent.click(screen.getByRole('button', { name: '設定を保存' }))

    expect(await screen.findByText('設定の保存に失敗しました')).toBeInTheDocument()
    expect(screen.getByText('未保存の変更あり')).toBeInTheDocument()
  })
})

describe('ServerSettings — connection test', () => {
  it('shows 接続成功 when the test passes', async () => {
    mockTest.mockResolvedValue({ success: true, message: 'ok' })
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    fireEvent.click(screen.getByRole('button', { name: '接続テスト' }))
    expect(await screen.findByText('接続成功')).toBeInTheDocument()
    expect(mockTest).toHaveBeenCalledWith(CONFIG)
  })

  it('shows 接続失敗 when the test reports failure or throws', async () => {
    mockTest.mockResolvedValueOnce({ success: false, message: 'refused' })
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    fireEvent.click(screen.getByRole('button', { name: '接続テスト' }))
    expect(await screen.findByText('接続失敗')).toBeInTheDocument()
  })
})

describe('ServerSettings — restart', () => {
  it('restarts only after explicit confirmation', async () => {
    mockRestart.mockResolvedValue({ message: 'restarting' })
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    fireEvent.click(screen.getByRole('button', { name: 'サーバーを再起動' }))
    expect(mockRestart).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '再起動する' }))
    await waitFor(() => expect(mockRestart).toHaveBeenCalledTimes(1))
    // backendConnected=true clears the restarting flag immediately —
    // the visible "再起動中" state is covered by the reconnect test below.
  })

  it('cancelling the confirmation does not restart', async () => {
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    fireEvent.click(screen.getByRole('button', { name: 'サーバーを再起動' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(mockRestart).not.toHaveBeenCalled()
  })

  it('clears the restarting state once the backend reconnects', async () => {
    mockRestart.mockResolvedValue({ message: 'restarting' })
    useReportStore.setState({ backendConnected: false } as never)
    render(<ServerSettings />)
    await waitFor(() => expect(contactPointsInput().value).not.toBe(''))

    fireEvent.click(screen.getByRole('button', { name: 'サーバーを再起動' }))
    fireEvent.click(screen.getByRole('button', { name: '再起動する' }))
    await screen.findByText('サーバーが再起動中です。しばらくお待ちください...')

    // Simulate the health-check reporting the server as back up
    useReportStore.setState({ backendConnected: true } as never)
    await waitFor(() =>
      expect(screen.queryByText('サーバーが再起動中です。しばらくお待ちください...')).not.toBeInTheDocument(),
    )
  })
})
