/**
 * CodeMirror 6 autocomplete source for formula-v1 expressions.
 *
 * Pre-builds completions at creation time (not per-keystroke). Labels are
 * resolved with `i18n.t()` when the source is created (#410) — the source is
 * rebuilt per editor mount, so a language switch is picked up on the next
 * editor open.
 * Supports localized label search for function name boosting.
 */

import type { CompletionContext, CompletionResult, Completion, CompletionSection } from '@codemirror/autocomplete'
import type { SchemaGroup } from '@/types'
import i18n from '@/i18n/config'
import { FORMULA_FUNCTIONS, CATEGORY_LABEL_KEYS } from '../functionCatalog'

function buildFunctionCompletions(section: CompletionSection): readonly Completion[] {
  const t = i18n.getFixedT(null, 'components')

  return FORMULA_FUNCTIONS.map((def): Completion => {
    const argsHint = def.args.map((a) => a.name).join(', ')
    const category = t(CATEGORY_LABEL_KEYS[def.category])

    return {
      label: def.name,
      displayLabel: `${def.name}  ${t(def.labelKey)}`,
      detail: category,
      type: 'function',
      section,
      apply: `${def.name}()`,
      boost: -1,
      info: () => {
        const dom = document.createElement('div')
        dom.className = 'cm-completion-info-rich'

        const sigLine = document.createElement('div')
        sigLine.className = 'cm-completion-info-sig'
        sigLine.textContent = `${def.name}(${argsHint}) → ${def.returnType}`
        dom.appendChild(sigLine)

        const badge = document.createElement('span')
        badge.className = 'cm-completion-info-badge'
        badge.textContent = category
        dom.appendChild(badge)

        const desc = document.createElement('div')
        desc.className = 'cm-completion-info-desc'
        desc.textContent = t(def.descriptionKey)
        dom.appendChild(desc)

        return { dom }
      },
    }
  })
}

function buildFieldCompletions(
  groups: readonly SchemaGroup[],
  sections: { readonly field: CompletionSection; readonly computed: CompletionSection },
): readonly Completion[] {
  const t = i18n.getFixedT(null, 'components')
  const completions: Completion[] = []

  for (const group of groups) {
    if (group.role === ('print_queue' as string)) continue

    for (const field of group.fields) {
      const isComputed = !!field.computed
      const section = isComputed ? sections.computed : sections.field
      const typeLabel = isComputed
        ? t('formulaEditor.completions.computedTypeLabel', { type: field.type })
        : field.type
      const path = `${group.dataKey}.${field.key}`

      completions.push({
        label: field.key,
        apply: path,
        displayLabel: field.label || field.key,
        detail: `${group.label} · ${typeLabel}`,
        type: isComputed ? 'variable' : 'property',
        section,
        boost: 1,
        info: () => {
          const dom = document.createElement('div')
          dom.className = 'cm-completion-info-field'

          const pathLine = document.createElement('div')
          pathLine.className = 'cm-completion-info-path'
          pathLine.textContent = path
          dom.appendChild(pathLine)

          const typeLine = document.createElement('div')
          typeLine.textContent = isComputed
            ? t('formulaEditor.completions.computedFieldType', { type: field.type, group: group.label })
            : t('formulaEditor.completions.fieldType', { type: field.type, group: group.label })
          dom.appendChild(typeLine)

          return { dom }
        },
      })
    }
  }

  return completions
}

/**
 * Create a formula completion source for a given set of schema groups.
 * The returned function is used as a CompletionSource for CodeMirror's autocompletion.
 */
export function createFormulaCompletionSource(
  groups: readonly SchemaGroup[],
): (context: CompletionContext) => CompletionResult | null {
  const t = i18n.getFixedT(null, 'components')
  const fieldSection: CompletionSection = { name: t('formulaEditor.completions.sectionFields'), rank: 0 }
  const computedSection: CompletionSection = { name: t('formulaEditor.completions.sectionComputed'), rank: 1 }
  const functionSection: CompletionSection = { name: t('formulaEditor.completions.sectionFunctions'), rank: 2 }

  const functionCompletions = buildFunctionCompletions(functionSection)
  const fieldCompletions = buildFieldCompletions(groups, { field: fieldSection, computed: computedSection })
  const allCompletions = [...fieldCompletions, ...functionCompletions]

  // Localized-label search index: label → function label
  const jpSearchIndex = new Map<string, string>()
  for (const def of FORMULA_FUNCTIONS) {
    jpSearchIndex.set(t(def.labelKey), def.name)
  }

  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w.[\]\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*/)
    if (!word || (word.from === word.to && !context.explicit)) return null

    const query = word.text.toLowerCase()

    const boostedLabels = new Set<string>()
    for (const [jpLabel, fnLabel] of jpSearchIndex) {
      if (jpLabel.includes(query)) {
        boostedLabels.add(fnLabel)
      }
    }

    const options = boostedLabels.size > 0
      ? allCompletions.map((c) => boostedLabels.has(c.label) ? { ...c, boost: 5 } : c)
      : allCompletions

    return {
      from: word.from,
      options,
      validFor: /^[\w.[\]\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*$/,
    }
  }
}
