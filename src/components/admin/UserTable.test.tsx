import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { UserTable } from './UserTable'
import type { UserSummary } from '@/api/reportApi'

const USERS: UserSummary[] = [
  { userId: 'admin', displayName: '管理者', roles: ['admin', 'user'] },
  { userId: 'user1', displayName: 'ユーザー1', roles: ['user'] },
]

describe('UserTable', () => {
  it('renders one row per user with id, display name and role badges', () => {
    render(<UserTable users={USERS} currentUserId="admin" onDeleteRequest={vi.fn()} />)
    const adminRow = screen.getByText('admin').closest('tr')!
    expect(within(adminRow).getByText('管理者')).toBeInTheDocument()
    expect(within(adminRow).getByText('Admin')).toBeInTheDocument()
    expect(within(adminRow).getByText('User')).toBeInTheDocument()

    const userRow = screen.getByText('user1').closest('tr')!
    expect(within(userRow).getByText('ユーザー1')).toBeInTheDocument()
    expect(within(userRow).queryByText('Admin')).not.toBeInTheDocument()
  })

  it('requests deletion for other users', () => {
    const onDeleteRequest = vi.fn()
    render(<UserTable users={USERS} currentUserId="admin" onDeleteRequest={onDeleteRequest} />)
    const userRow = screen.getByText('user1').closest('tr')!
    fireEvent.click(within(userRow).getByRole('button', { name: '削除' }))
    expect(onDeleteRequest).toHaveBeenCalledWith('user1')
  })

  it('disables self-deletion', () => {
    const onDeleteRequest = vi.fn()
    render(<UserTable users={USERS} currentUserId="admin" onDeleteRequest={onDeleteRequest} />)
    const adminRow = screen.getByText('admin').closest('tr')!
    const btn = within(adminRow).getByRole('button', { name: '削除' })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', '自分自身は削除できません')
    fireEvent.click(btn)
    expect(onDeleteRequest).not.toHaveBeenCalled()
  })

  it('shows an empty message when there are no users', () => {
    render(<UserTable users={[]} currentUserId={undefined} onDeleteRequest={vi.fn()} />)
    expect(screen.getByText('ユーザーがいません')).toBeInTheDocument()
  })
})
