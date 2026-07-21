/**
 * BindingPanel — lets users edit DataSource field values for live preview.
 * Single values: text input (immediate update)
 * Array values: expandable JSON textarea (validates before committing)
 */

import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'

function ArrayFieldRow({
  fieldKey,
  value,
  onCommit,
}: {
  fieldKey: string
  value: unknown
  onCommit: (fieldKey: string, value: unknown) => void
}) {
  const { t } = useTranslation('components')
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState(JSON.stringify(value, null, 2))
  const [hasError, setHasError] = useState(false)

  const handleChange = useCallback((raw: string) => {
    setText(raw)
    try {
      const parsed = JSON.parse(raw)
      setHasError(false)
      onCommit(fieldKey, parsed)
    } catch {
      setHasError(true)
      // Don't update store — keep last valid value
    }
  }, [fieldKey, onCommit])

  const preview = Array.isArray(value)
    ? t('sidebar.bindingPanel.arrayPreview', { n: (value as unknown[]).length })
    : JSON.stringify(value).slice(0, 20)

  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-accent text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-mono text-primary truncate mr-2">{fieldKey}</span>
        <span className="text-muted-foreground shrink-0">{preview}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          <textarea
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            rows={4}
            className={`w-full border rounded px-2 py-1 text-xs font-mono resize-y bg-background ${hasError ? 'border-destructive' : ''}`}
          />
          {hasError && (
            <p className="text-xs text-destructive mt-1">{t('sidebar.bindingPanel.jsonSyntaxError')}</p>
          )}
        </div>
      )}
    </div>
  )
}

function ScalarFieldRow({
  fieldKey,
  value,
  onCommit,
}: {
  fieldKey: string
  value: unknown
  onCommit: (fieldKey: string, value: unknown) => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1 border-b last:border-b-0">
      <span className="font-mono text-xs text-primary shrink-0 w-20 truncate" title={fieldKey}>
        {fieldKey}
      </span>
      <input
        type="text"
        value={String(value ?? '')}
        onChange={(e) => onCommit(fieldKey, e.target.value)}
        className="flex-1 border rounded px-2 py-0.5 text-xs bg-background"
      />
    </div>
  )
}

export function BindingPanel() {
  const { t } = useTranslation('components')
  const dataSources = useReportStore((s) => s.definition.dataSources)
  const updateTestData = useReportStore((s) => s.updateTestData)

  if (dataSources.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        {t('sidebar.bindingPanel.noDataSource')}
      </div>
    )
  }

  return (
    <div className="divide-y">
      {dataSources.map((ds) => {
        const fields = (ds.fields ?? {}) as Record<string, unknown>
        const fieldEntries = Object.entries(fields)

        return (
          <div key={ds.id}>
            <div className="px-3 py-1.5 bg-muted/40">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                {ds.name}
              </p>
            </div>
            {fieldEntries.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t('sidebar.bindingPanel.noFields')}</p>
            ) : (
              fieldEntries.map(([key, val]) =>
                Array.isArray(val) || (typeof val === 'object' && val !== null) ? (
                  <ArrayFieldRow
                    key={key}
                    fieldKey={key}
                    value={val}
                    onCommit={(fieldKey, value) => updateTestData(ds.id, fieldKey, value)}
                  />
                ) : (
                  <ScalarFieldRow
                    key={key}
                    fieldKey={key}
                    value={val}
                    onCommit={(fieldKey, value) => updateTestData(ds.id, fieldKey, value)}
                  />
                ),
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
