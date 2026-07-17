import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateUserForm } from './CreateUserForm'

// Note: the form's <label> elements are not programmatically associated with
// their inputs (no htmlFor / nesting), so fields are located by placeholder
// and input type here.
function userIdInput() {
  return screen.getByPlaceholderText('user2') as HTMLInputElement
}
function displayNameInput() {
  return screen.getByPlaceholderText('ユーザー2') as HTMLInputElement
}
function passwordInput(container: HTMLElement) {
  return container.querySelector('input[type="password"]') as HTMLInputElement
}

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const utils = render(<CreateUserForm onSubmit={onSubmit} />)
  return { onSubmit, container: utils.container }
}

describe('CreateUserForm — validation', () => {
  it('requires a user id', async () => {
    const { onSubmit, container } = renderForm()
    fireEvent.change(passwordInput(container), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    expect(await screen.findByText('ユーザーIDは必須です')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a password of at least 8 characters', async () => {
    const { onSubmit, container } = renderForm()
    fireEvent.change(userIdInput(), { target: { value: 'user2' } })
    fireEvent.change(passwordInput(container), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    expect(await screen.findByText('8文字以上で入力してください')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears a field error while typing in that field', async () => {
    renderForm()
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))
    await screen.findByText('ユーザーIDは必須です')
    fireEvent.change(userIdInput(), { target: { value: 'u' } })
    expect(screen.queryByText('ユーザーIDは必須です')).not.toBeInTheDocument()
  })
})

describe('CreateUserForm — submission', () => {
  it('submits trimmed values and defaults displayName to the user id', async () => {
    const { onSubmit, container } = renderForm()
    fireEvent.change(userIdInput(), { target: { value: '  user2  ' } })
    fireEvent.change(passwordInput(container), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      userId: 'user2',
      displayName: 'user2',
      password: 'password123',
      roles: ['user'],
    })
  })

  it('adds the user role automatically when admin is selected', async () => {
    const { onSubmit, container } = renderForm()
    fireEvent.change(userIdInput(), { target: { value: 'boss' } })
    fireEvent.change(displayNameInput(), { target: { value: '部長' } })
    fireEvent.change(passwordInput(container), { target: { value: 'password123' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'admin' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit).toHaveBeenCalledWith({
      userId: 'boss',
      displayName: '部長',
      password: 'password123',
      roles: ['admin', 'user'],
    })
  })

  it('ignores invalid role values from the select', async () => {
    renderForm()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'superuser' } })
    // Zod-guarded: unknown role is discarded, selection stays on 'user'
    expect(select.value).toBe('user')
  })

  it('resets the form after a successful submit', async () => {
    const { container } = renderForm()
    fireEvent.change(userIdInput(), { target: { value: 'user2' } })
    fireEvent.change(passwordInput(container), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    await waitFor(() => expect(userIdInput().value).toBe(''))
    expect(passwordInput(container).value).toBe('')
  })

  it('keeps entered values and does not throw when onSubmit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('server down'))
    const { container } = renderForm(onSubmit)
    fireEvent.change(userIdInput(), { target: { value: 'user2' } })
    fireEvent.change(passwordInput(container), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: '+ 追加' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Rejection is swallowed by handleCreate; the button re-enables and values persist for retry
    await waitFor(() => expect(screen.getByRole('button', { name: '+ 追加' })).not.toBeDisabled())
    expect(userIdInput().value).toBe('user2')
    expect(passwordInput(container).value).toBe('password123')
  })
})
