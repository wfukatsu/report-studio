import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSwitcher } from './LanguageSwitcher'
import i18n from './config'

afterEach(async () => {
  // Restore the test-default language so this suite doesn't leak into others.
  await i18n.changeLanguage('ja')
})

describe('LanguageSwitcher', () => {
  it('renders an accessible language select reflecting the active language', () => {
    render(<LanguageSwitcher />)
    const select = screen.getByRole('combobox', { name: '表示言語を切り替え' })
    expect(select).toHaveValue('ja')
    expect(screen.getByRole('option', { name: '日本語' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument()
  })

  it('changes the i18n language when a new option is selected', () => {
    render(<LanguageSwitcher />)
    const select = screen.getByRole('combobox', { name: '表示言語を切り替え' })
    fireEvent.change(select, { target: { value: 'en' } })
    expect(i18n.resolvedLanguage).toBe('en')
  })

  it('re-renders its own labels in the selected language', () => {
    const { rerender } = render(<LanguageSwitcher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } })
    rerender(<LanguageSwitcher />)
    expect(screen.getByRole('combobox', { name: 'Switch display language' })).toBeInTheDocument()
  })
})
