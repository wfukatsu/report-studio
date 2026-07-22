import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageSwitcher } from './LanguageSwitcher'
import i18n from './config'
// #329 Phase 6: query by i18n key (via tk) instead of a hard-coded Japanese
// literal, so a copy change to `common:language.*` doesn't break this test.
import { tk } from '@/test/i18n'

afterEach(async () => {
  // Restore the test-default language so this suite doesn't leak into others.
  await i18n.changeLanguage('ja')
})

describe('LanguageSwitcher', () => {
  it('renders an accessible language select reflecting the active language', () => {
    render(<LanguageSwitcher />)
    const select = screen.getByRole('combobox', { name: tk('common:language.switchAriaLabel') })
    expect(select).toHaveValue('ja')
    expect(screen.getByRole('option', { name: tk('common:language.ja') })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: tk('common:language.en') })).toBeInTheDocument()
  })

  it('changes the i18n language when a new option is selected', () => {
    render(<LanguageSwitcher />)
    const select = screen.getByRole('combobox', { name: tk('common:language.switchAriaLabel') })
    fireEvent.change(select, { target: { value: 'en' } })
    expect(i18n.resolvedLanguage).toBe('en')
  })

  it('re-renders its own labels in the selected language', () => {
    const { rerender } = render(<LanguageSwitcher />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'en' } })
    rerender(<LanguageSwitcher />)
    // i18n is now 'en', so tk resolves the English label — the same key, no literal.
    expect(screen.getByRole('combobox', { name: tk('common:language.switchAriaLabel') })).toBeInTheDocument()
  })
})
