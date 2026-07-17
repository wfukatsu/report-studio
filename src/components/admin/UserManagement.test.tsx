import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { UserManagement } from './UserManagement'
import { useReportStore } from '@/store'
import type { Me, UserSummary } from '@/api/reportApi'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    listUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
  }
})

import { listUsers, createUser, deleteUser } from '@/api/reportApi'
const mockListUsers = vi.mocked(listUsers)
const mockCreateUser = vi.mocked(createUser)
const mockDeleteUser = vi.mocked(deleteUser)

const ADMIN: Me = { userId: 'admin', displayName: '管理者', roles: ['admin', 'user'], anonymous: false }
const USERS: UserSummary[] = [
  { userId: 'admin', displayName: '管理者', roles: ['admin', 'user'] },
  { userId: 'user1', displayName: 'ユーザー1', roles: ['user'] },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockListUsers.mockResolvedValue(USERS)
  useReportStore.setState({
    currentUser: ADMIN,
    adminUsers: [],
    adminUsersLoading: false,
    adminUsersError: null,
  } as never)
})

describe('UserManagement — list', () => {
  it('fetches users on mount and renders them', async () => {
    render(<UserManagement />)
    expect(await screen.findByText('user1')).toBeInTheDocument()
    expect(screen.getByText('管理者')).toBeInTheDocument()
    expect(mockListUsers).toHaveBeenCalledTimes(1)
  })

  it('shows a spinner while the list is loading', () => {
    mockListUsers.mockReturnValue(new Promise(() => {}))
    render(<UserManagement />)
    expect(screen.getByText('読み込み中...')).toBeInTheDocument()
  })

  it('shows the store error when fetching fails', async () => {
    mockListUsers.mockRejectedValueOnce(new Error('500'))
    render(<UserManagement />)
    expect(await screen.findByText('ユーザー一覧の取得に失敗しました')).toBeInTheDocument()
  })
})

describe('UserManagement — create', () => {
  it('creates a user through the store and appends it to the table', async () => {
    mockCreateUser.mockResolvedValue({ userId: 'user2', displayName: 'ユーザー2', roles: ['user'] })
    const { container } = render(<UserManagement />)
    await screen.findByText('user1')

    fireEvent.change(screen.getByPlaceholderText('user2'), { target: { value: 'user2' } })
    fireEvent.change(container.querySelector('input[type="password"]')!, {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1))
    expect(mockCreateUser).toHaveBeenCalledWith({
      userId: 'user2',
      displayName: 'user2',
      password: 'password123',
      roles: ['user'],
    })
    expect(await screen.findByText('ユーザー2')).toBeInTheDocument()
  })

  it('surfaces a friendly error when creation fails', async () => {
    mockCreateUser.mockRejectedValueOnce(new Error('409'))
    const { container } = render(<UserManagement />)
    await screen.findByText('user1')

    fireEvent.change(screen.getByPlaceholderText('user2'), { target: { value: 'dup' } })
    fireEvent.change(container.querySelector('input[type="password"]')!, {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    expect(
      await screen.findByText('ユーザーの作成に失敗しました（IDが重複している可能性があります）'),
    ).toBeInTheDocument()
  })
})

describe('UserManagement — delete', () => {
  it('asks for confirmation and deletes the user on confirm', async () => {
    mockDeleteUser.mockResolvedValue(undefined as never)
    render(<UserManagement />)
    await screen.findByText('user1')

    const userRow = screen.getByText('user1').closest('tr')!
    fireEvent.click(within(userRow).getByRole('button', { name: '削除' }))
    expect(screen.getByText('ユーザー「user1」を完全に削除します。この操作は元に戻せません。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledWith('user1'))
    await waitFor(() => expect(screen.queryByText('user1')).not.toBeInTheDocument())
  })

  it('does not delete when the confirmation is cancelled', async () => {
    render(<UserManagement />)
    await screen.findByText('user1')

    const userRow = screen.getByText('user1').closest('tr')!
    fireEvent.click(within(userRow).getByRole('button', { name: '削除' }))
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    expect(mockDeleteUser).not.toHaveBeenCalled()
    expect(screen.getByText('user1')).toBeInTheDocument()
  })

  it('shows an error banner when deletion fails', async () => {
    mockDeleteUser.mockRejectedValueOnce(new Error('403'))
    render(<UserManagement />)
    await screen.findByText('user1')

    const userRow = screen.getByText('user1').closest('tr')!
    fireEvent.click(within(userRow).getByRole('button', { name: '削除' }))
    fireEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(await screen.findByText('削除に失敗しました')).toBeInTheDocument()
    expect(screen.getByText('user1')).toBeInTheDocument()
  })
})
