import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SUPPORTED_LANGUAGES, type AppLanguage } from './config'

interface LanguageSwitcherProps {
  readonly className?: string
}

/**
 * Compact display-language switcher (#329, Phase 1). Uses a native `<select>`
 * for zero-cost accessibility and keyboard support. The choice is persisted to
 * localStorage by i18next's LanguageDetector (`caches: ['localStorage']`), and
 * `document.documentElement.lang` is updated via the `languageChanged` listener
 * wired in `config.ts`.
 */
export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  // Normalize region variants (en-US) to our language-only options (en).
  const current = (i18n.resolvedLanguage ?? i18n.language) as AppLanguage

  return (
    <label
      className={cn(
        'inline-flex items-center gap-1.5 text-sm text-muted-foreground',
        className,
      )}
    >
      <Languages className="size-4 shrink-0" aria-hidden="true" />
      <span className="sr-only">{t('language.label')}</span>
      <select
        aria-label={t('language.switchAriaLabel')}
        value={SUPPORTED_LANGUAGES.includes(current) ? current : 'ja'}
        onChange={(e) => {
          void i18n.changeLanguage(e.target.value)
        }}
        className="bg-transparent text-foreground text-sm py-1 pr-1 rounded outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng}>
            {t(`language.${lng}`)}
          </option>
        ))}
      </select>
    </label>
  )
}
