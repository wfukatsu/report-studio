/**
 * CodeMirror 6 autocomplete source for formula-v1 expressions.
 *
 * Pre-builds completions at creation time (not per-keystroke).
 * Supports Japanese label search for function name boosting.
 */

import type { CompletionContext, CompletionResult, Completion, CompletionSection } from '@codemirror/autocomplete'
import type { SchemaGroup } from '@/types'
import { FORMULA_FUNCTIONS, CATEGORY_LABELS_JA } from '../functionCatalog'

const fieldSection: CompletionSection = { name: 'フィールド', rank: 0 }
const computedSection: CompletionSection = { name: '計算値', rank: 1 }
const functionSection: CompletionSection = { name: '関数', rank: 2 }

function buildFunctionCompletions(): readonly Completion[] {
  return FORMULA_FUNCTIONS.map((def): Completion => {
    const argsHint = def.args.map((a) => a.name).join(', ')
    const category = CATEGORY_LABELS_JA[def.category]

    return {
      label: def.name,
      displayLabel: `${def.name}  ${def.labelJa}`,
      detail: category,
      type: 'function',
      section: functionSection,
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
        desc.textContent = def.descriptionJa
        dom.appendChild(desc)

        return { dom }
      },
    }
  })
}

function buildFieldCompletions(groups: readonly SchemaGroup[]): readonly Completion[] {
  const completions: Completion[] = []

  for (const group of groups) {
    if (group.role === ('print_queue' as string)) continue

    for (const field of group.fields) {
      const isComputed = !!field.computed
      const section = isComputed ? computedSection : fieldSection
      const typeLabel = isComputed ? `${field.type} (計算)` : field.type
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
          typeLine.textContent = `型: ${field.type}${isComputed ? ' (計算フィールド)' : ''} — ${group.label}`
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
  const functionCompletions = buildFunctionCompletions()
  const fieldCompletions = buildFieldCompletions(groups)
  const allCompletions = [...fieldCompletions, ...functionCompletions]

  // Japanese search index: jpLabel → function label
  const jpSearchIndex = new Map<string, string>()
  for (const def of FORMULA_FUNCTIONS) {
    jpSearchIndex.set(def.labelJa, def.name)
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
