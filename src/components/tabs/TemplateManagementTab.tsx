import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import { cn } from '@/lib/utils'
// TemplateManagerContent and VariantList are pure content components (no modal chrome).
// They live in modals/ for historical reasons; planned migration to features/ directory.
import { TemplateManagerContent } from '@/components/modals/TemplateManagerModal'
import { VariantList } from '@/components/modals/VariantsModal'
import { useReportStore } from '@/store/reportStore'
import type { TemplateSection } from '@/store/types'

const SECTIONS: { id: TemplateSection; labelKey: ParseKeys<'components'> }[] = [
  { id: 'templates', labelKey: 'tabs.templateManagementTab.sectionTemplates' },
  { id: 'variants', labelKey: 'tabs.templateManagementTab.sectionVariants' },
]

export function TemplateManagementTab() {
  const { t } = useTranslation('components')
  const activeSection = useReportStore((s) => s.templateActiveSection)
  const setActiveSection = useReportStore((s) => s.setTemplateActiveSection)

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左サイドナビ */}
      <nav
        aria-label={t('tabs.templateManagementTab.navLabel')}
        className="w-44 shrink-0 border-r bg-card flex flex-col py-2 overflow-y-auto"
      >
        {SECTIONS.map(({ id, labelKey }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id)}
            className={cn(
              'w-full text-left px-4 py-2 text-sm transition-colors border-l-2',
              activeSection === id
                ? 'border-primary text-primary bg-primary/5 font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            {t(labelKey)}
          </button>
        ))}
      </nav>

      {/* 右コンテンツエリア */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === 'templates' && <TemplateManagerContent />}
        {activeSection === 'variants' && (
          <div className="p-5">
            <h2 className="text-sm font-semibold mb-4 text-foreground">{t('tabs.templateManagementTab.variantsHeading')}</h2>
            <VariantList />
          </div>
        )}
      </div>
    </div>
  )
}
