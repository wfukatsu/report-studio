import { useState } from 'react'
import { cn } from '@/lib/utils'
import { TemplateManagerContent } from '@/components/modals/TemplateManagerModal'
import { VariantList } from '@/components/modals/VariantsModal'

type TemplateSection = 'templates' | 'variants'

const SECTIONS: { id: TemplateSection; label: string }[] = [
  { id: 'templates', label: 'テンプレート一覧' },
  { id: 'variants', label: 'バリアント設定' },
]

export function TemplateManagementTab() {
  const [activeSection, setActiveSection] = useState<TemplateSection>('templates')

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左サイドナビ */}
      <nav
        aria-label="テンプレート管理セクション"
        className="w-44 shrink-0 border-r bg-card flex flex-col py-2 overflow-y-auto"
      >
        {SECTIONS.map(({ id, label }) => (
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
            {label}
          </button>
        ))}
      </nav>

      {/* 右コンテンツエリア */}
      <div className="flex-1 overflow-y-auto">
        {activeSection === 'templates' && <TemplateManagerContent />}
        {activeSection === 'variants' && (
          <div className="p-5">
            <h2 className="text-sm font-semibold mb-4 text-foreground">バリアント設定</h2>
            <VariantList />
          </div>
        )}
      </div>
    </div>
  )
}
