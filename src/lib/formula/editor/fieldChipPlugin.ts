/**
 * CodeMirror 6 plugin that renders FieldRef nodes as colored chip decorations.
 *
 * - master fields: muted background
 * - detail fields: blue background
 * - computed fields: violet background
 *
 * Uses Decoration.replace + WidgetType.eq() for efficient DOM reuse.
 * Skips during IME composition and incomplete parse (Race #8).
 */

import { WidgetType, Decoration, ViewPlugin } from '@codemirror/view'
import type { EditorView, ViewUpdate, DecorationSet } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import type { SchemaGroup } from '@/types'

export type ChipScope = 'master' | 'detail' | 'computed'

const SCOPE_CLASS: Readonly<Record<ChipScope, string>> = {
  master: 'cm-field-chip--master',
  detail: 'cm-field-chip--detail',
  computed: 'cm-field-chip--computed',
}

class FieldChipWidget extends WidgetType {
  constructor(
    readonly displayLabel: string,
    readonly scope: ChipScope,
  ) {
    super()
  }

  eq(other: FieldChipWidget): boolean {
    return this.displayLabel === other.displayLabel && this.scope === other.scope
  }

  toDOM(): HTMLElement {
    const chip = document.createElement('span')
    chip.className = `cm-field-chip ${SCOPE_CLASS[this.scope]}`
    chip.textContent = this.displayLabel
    chip.setAttribute('aria-label', `フィールド: ${this.displayLabel}`)
    return chip
  }

  ignoreEvent(): boolean {
    return false
  }
}

function buildFieldChipDecorations(
  view: EditorView,
  fieldIndex: ReadonlyMap<string, { readonly scope: ChipScope; readonly label: string }>,
): DecorationSet {
  const tree = syntaxTree(view.state)

  // Race #8: skip if parse is incomplete (composition just ended, incremental parse in progress)
  if (tree.length < view.state.doc.length) return Decoration.none

  const widgets: Range<Decoration>[] = []

  tree.cursor().iterate((node) => {
    if (node.name === 'FieldRef') {
      const text = view.state.sliceDoc(node.from, node.to)
      const info = fieldIndex.get(text) ?? { scope: 'master' as const, label: text }
      widgets.push(
        Decoration.replace({
          widget: new FieldChipWidget(info.label, info.scope),
        }).range(node.from, node.to),
      )
    }
  })

  return Decoration.set(widgets, true)
}

export function buildFieldIndex(
  groups: readonly SchemaGroup[],
): ReadonlyMap<string, { readonly scope: ChipScope; readonly label: string }> {
  const index = new Map<string, { readonly scope: ChipScope; readonly label: string }>()

  for (const group of groups) {
    for (const field of group.fields) {
      const scope: ChipScope =
        field.computed
          ? 'computed'
          : group.role === 'detail'
            ? 'detail'
            : 'master'

      const entry = { scope, label: field.label || field.key }
      index.set(`${group.dataKey}.${field.key}`, entry)
      index.set(field.key, entry)
    }
  }

  return index
}

export function createFieldChipPlugin(
  fieldIndex: ReadonlyMap<string, { readonly scope: ChipScope; readonly label: string }>,
) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildFieldChipDecorations(view, fieldIndex)
      }

      update(update: ViewUpdate) {
        if (update.view.composing) return
        if (!update.docChanged) return
        this.decorations = buildFieldChipDecorations(update.view, fieldIndex)
      }
    },
    { decorations: (v) => v.decorations },
  )
}
