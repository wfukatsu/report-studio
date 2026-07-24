/**
 * CodeMirror 6 plugin that shows a tooltip with function signature and argument
 * descriptions when the cursor is inside a function's argument list.
 *
 * Uses StateField (not ViewPlugin) — purely reactive, no side effects.
 * Suppresses tooltip when autocomplete is active.
 */

import { StateField } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import { type Tooltip, type TooltipView, showTooltip } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { completionStatus } from '@codemirror/autocomplete'
import type { SyntaxNode } from '@lezer/common'
import i18n from '@/i18n/config'
import { FORMULA_FUNCTIONS, type FunctionDef } from '../functionCatalog'

const FUNCTION_MAP = new Map<string, FunctionDef>(
  FORMULA_FUNCTIONS.map((f) => [f.name, f]),
)

interface CalltipContext {
  readonly functionName: string
  readonly argumentIndex: number
}

function resolveCalltipContext(
  doc: { sliceString: (from: number, to: number) => string },
  pos: number,
  tree: ReturnType<typeof syntaxTree>,
): CalltipContext | null {
  let node: SyntaxNode | null = tree.resolveInner(pos, -1)

  while (node && node.name !== 'ArgList') {
    node = node.parent
  }
  if (!node) return null

  const callExpr = node.parent
  if (!callExpr || callExpr.name !== 'FunctionCall') return null

  const fnNameNode = callExpr.getChild('FunctionName')
  if (!fnNameNode) return null
  const functionName = doc.sliceString(fnNameNode.from, fnNameNode.to).toUpperCase()

  let argumentIndex = 0
  let child = node.firstChild
  while (child) {
    if (child.from >= pos) break
    const text = doc.sliceString(child.from, child.to)
    if (text === ',') argumentIndex++
    child = child.nextSibling
  }

  return { functionName, argumentIndex }
}

function buildCalltipContent(functionName: string, activeIndex: number): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-calltip'
  dom.setAttribute('role', 'tooltip')

  const def = FUNCTION_MAP.get(functionName)
  if (!def) return dom

  // Line 1: Signature
  const sigLine = document.createElement('div')
  sigLine.className = 'cm-calltip-sig'

  const nameSpan = document.createElement('span')
  nameSpan.className = 'cm-calltip-fn-name'
  nameSpan.textContent = functionName + '('
  sigLine.appendChild(nameSpan)

  def.args.forEach((arg, i) => {
    if (i > 0) sigLine.appendChild(document.createTextNode(', '))
    const span = document.createElement('span')
    span.textContent = arg.name
    if (i === activeIndex) {
      span.className = 'cm-calltip-param--active'
    }
    sigLine.appendChild(span)
  })

  sigLine.appendChild(document.createTextNode(')'))
  dom.appendChild(sigLine)

  // Line 2: Active argument description
  if (def.args.length > 0) {
    const activeArg = def.args[activeIndex] ?? def.args[def.args.length - 1]
    if (activeArg) {
      const descLine = document.createElement('div')
      descLine.className = 'cm-calltip-desc'
      const argDescription = i18n.getFixedT(null, 'components')(activeArg.descriptionKey)
      descLine.textContent = `${activeArg.name}: ${activeArg.type} — ${argDescription}`
      dom.appendChild(descLine)
    }
  }

  // Line 3: Example
  const firstExample = def.examples[0]
  if (firstExample) {
    const exLine = document.createElement('div')
    exLine.className = 'cm-calltip-example'
    const exCode = document.createElement('code')
    exCode.textContent = firstExample.formula
    exLine.appendChild(exCode)
    if (firstExample.result) {
      exLine.appendChild(document.createTextNode(` → ${firstExample.result}`))
    }
    dom.appendChild(exLine)
  }

  return dom
}

interface CalltipState {
  readonly tooltip: Tooltip | null
  readonly ctx: CalltipContext | null
}

const calltipField = StateField.define<CalltipState>({
  create: () => ({ tooltip: null, ctx: null }),
  update({ tooltip, ctx: prevCtx }, tr) {
    if (!tr.docChanged && !tr.selection) return { tooltip, ctx: prevCtx }

    const { state } = tr
    const { main } = state.selection

    if (!main.empty) return { tooltip: null, ctx: null }
    if (completionStatus(state) === 'active') return { tooltip: null, ctx: null }

    const tree = syntaxTree(state)
    const ctx = resolveCalltipContext(state.doc, main.from, tree)

    if (!ctx || !FUNCTION_MAP.has(ctx.functionName)) {
      return { tooltip: null, ctx: null }
    }

    // DOM reuse if context unchanged
    if (
      prevCtx &&
      tooltip &&
      prevCtx.functionName === ctx.functionName &&
      prevCtx.argumentIndex === ctx.argumentIndex
    ) {
      return {
        tooltip: {
          ...tooltip,
          pos: main.from,
          create: (): TooltipView => ({
            dom: buildCalltipContent(ctx.functionName, ctx.argumentIndex),
          }),
        },
        ctx,
      }
    }

    return {
      tooltip: {
        pos: main.from,
        create: (): TooltipView => ({
          dom: buildCalltipContent(ctx.functionName, ctx.argumentIndex),
        }),
        above: true,
      },
      ctx,
    }
  },
  provide: (f) => showTooltip.from(f, (v) => v.tooltip),
})

export function calltips(): Extension {
  return calltipField
}
