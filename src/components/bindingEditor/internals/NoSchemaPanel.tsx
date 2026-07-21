/**
 * NoSchemaPanel — Empty state shown when no schema groups exist.
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Database, Plus } from 'lucide-react'

interface NoSchemaPanelProps {
  readonly onAddGroup: () => void
}

export const NoSchemaPanel = memo(function NoSchemaPanel({
  onAddGroup,
}: NoSchemaPanelProps) {
  const { t } = useTranslation('components')
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
      <Database className="w-10 h-10 text-muted-foreground/30" />
      <div>
        <p className="text-sm font-medium text-foreground">
          {t('bindingEditor.noSchemaPanel.title')}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('bindingEditor.noSchemaPanel.descLine1')}
          <br />
          {t('bindingEditor.noSchemaPanel.descLine2')}
        </p>
      </div>
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
        onClick={onAddGroup}
      >
        <Plus className="w-3.5 h-3.5" />
        {t('bindingEditor.noSchemaPanel.addFirstGroup')}
      </button>
    </div>
  )
})
