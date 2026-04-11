import { useReportStore } from '@/store'
import { useBindingAnalysis } from '@/hooks/useBindingAnalysis'
import { DataSourcePanel } from './DataSourcePanel'
import { BindingPanel } from './BindingPanel'
import type { ElementBinding } from '@/hooks/useBindingAnalysis'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  count?: number
  icon?: string
  className?: string
  children: React.ReactNode
}

function Section({ title, count, icon, className = '', children }: SectionProps) {
  return (
    <div className={`border-b last:border-b-0 ${className}`}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40">
        {icon && <span className="text-xs">{icon}</span>}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-auto text-[10px] font-medium text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

interface ElementRowProps {
  binding: ElementBinding
  onSelect: (elementId: string, pageId: string) => void
  suffix?: string
}

function ElementRow({ binding, onSelect, suffix }: ElementRowProps) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left border-b last:border-b-0"
      onClick={() => onSelect(binding.elementId, binding.pageId)}
    >
      <span className="flex-1 truncate">{binding.elementLabel}</span>
      {binding.fieldKey && (
        <span className="font-mono text-[10px] text-muted-foreground truncate shrink-0 max-w-[40%]">
          {binding.fieldKey}
        </span>
      )}
      {suffix && <span className="text-[10px] text-muted-foreground shrink-0">{suffix}</span>}
    </button>
  )
}

interface MappingRowProps {
  binding: ElementBinding
  onSelect: (elementId: string, pageId: string) => void
}

function MappingRow({ binding, onSelect }: MappingRowProps) {
  return (
    <button
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left border-b last:border-b-0"
      onClick={() => onSelect(binding.elementId, binding.pageId)}
    >
      <span className="font-mono text-[10px] text-primary truncate shrink-0 max-w-[45%]">
        {binding.fieldKey}
      </span>
      <span className="text-muted-foreground mx-0.5">→</span>
      <span className="flex-1 truncate text-foreground">{binding.elementLabel}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Collapsible wrapper for DataSourcePanel / BindingPanel
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, defaultOpen = false, children }: CollapsibleSectionProps) {
  return (
    <details open={defaultOpen} className="border-b last:border-b-0">
      <summary className="flex items-center px-3 py-1.5 cursor-pointer select-none bg-muted/40 hover:bg-muted/60 list-none">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground">▾</span>
      </summary>
      {children}
    </details>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function DataBindingOverviewPanel() {
  const selectElement = useReportStore((s) => s.selectElement)
  const setActivePage = useReportStore((s) => s.setActivePage)
  const { hasDataSource, unboundElements, fieldMappings, missingInSampleElements } = useBindingAnalysis()

  function handleSelect(elementId: string, pageId: string) {
    setActivePage(pageId)
    selectElement(elementId)
  }

  return (
    <div className="divide-y text-xs">
      {/* DataSource definition (always visible) */}
      <CollapsibleSection title="データソース" defaultOpen={!hasDataSource}>
        <DataSourcePanel />
      </CollapsibleSection>

      {/* Empty state when no DataSource */}
      {!hasDataSource && (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          データソースが未設定です。上のセクションでデータを追加してください。
        </div>
      )}

      {hasDataSource && (
        <>
          {/* Field value editor */}
          <CollapsibleSection title="フィールド値">
            <BindingPanel />
          </CollapsibleSection>

          {/* Unbound elements — hidden when 0 */}
          {unboundElements.length > 0 && (
            <Section title="未バインド要素" count={unboundElements.length} icon="⚠">
              {unboundElements.map((b) => (
                <ElementRow key={b.elementId} binding={b} onSelect={handleSelect} />
              ))}
            </Section>
          )}

          {/* Field mappings — hidden when 0 */}
          {fieldMappings.length > 0 && (
            <Section title="マッピング" count={fieldMappings.length} icon="✓">
              {fieldMappings.map((b, i) => (
                <MappingRow key={`${b.elementId}_${b.fieldKey}_${i}`} binding={b} onSelect={handleSelect} />
              ))}
            </Section>
          )}

          {/* Fields bound but not present in sample data — hidden when 0 */}
          {missingInSampleElements.length > 0 && (
            <Section title="サンプル値なし" count={missingInSampleElements.length} icon="⚠">
              {missingInSampleElements.map((b) => (
                <ElementRow
                  key={`${b.elementId}_${b.fieldKey}`}
                  binding={b}
                  onSelect={handleSelect}
                  suffix="未設定"
                />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  )
}
