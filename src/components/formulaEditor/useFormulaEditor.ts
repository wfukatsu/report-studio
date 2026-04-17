/**
 * React hook for managing a CodeMirror 6 EditorView lifecycle.
 *
 * Creates a single-line formula editor with:
 * - Syntax highlighting via the formula-v1 Lezer grammar
 * - Single-line enforcement (transactionFilter + Enter keymap)
 * - 500 char max length filter
 * - Paste sanitization (NFKC normalize, strip control/zero-width chars)
 * - Stable insertAtCursor callback for external field/function insertion
 *
 * Race condition fixes applied (from v1 port analysis):
 * - Race #1: viewRef nulled BEFORE destroy() to prevent stale reads
 * - Race #3: IME blur/focus trick removed — CM6 handles composing dispatch
 * - Race #7: tooltipParent managed via Compartment (not baked into baseExtensions)
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { EditorView, keymap, placeholder as cmPlaceholder } from '@codemirror/view'
import { EditorState, Compartment, Prec, type Extension } from '@codemirror/state'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { history, historyKeymap } from '@codemirror/commands'
import { closeBrackets } from '@codemirror/autocomplete'
import { tags as t } from '@lezer/highlight'
import { tooltips } from '@codemirror/view'
import { formula } from '@/lib/formula/language/formulaLanguage'

// ── Highlight theme (Tailwind-compatible colors with fallbacks) ──────────

const formulaHighlight = HighlightStyle.define([
  { tag: t.number, color: '#15803d' },             // green-700
  { tag: t.string, color: '#a16207' },             // amber-700
  { tag: t.bool, color: '#a16207' },               // amber-700
  { tag: t.keyword, color: '#1d4ed8' },            // blue-700
  { tag: t.function(t.variableName), color: '#6E5DCF' }, // binder purple
  { tag: t.propertyName, color: '#2563eb' },       // blue-600
  { tag: t.variableName, color: '#1e293b' },       // slate-800
  { tag: t.compareOperator, color: '#596778' },    // muted gray
  { tag: t.arithmeticOperator, color: '#596778' },
  { tag: t.paren, color: '#596778' },
])

// ── Single-line filter ──────────────────────────────────────────────────

const singleLineFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  if (tr.newDoc.lines <= 1) return tr
  // Flatten multi-line content (e.g. from paste) to single space-joined line
  return [tr, {
    changes: { from: 0, to: tr.newDoc.length, insert: tr.newDoc.sliceString(0, undefined, ' ') },
    sequential: true,
  }]
})

// ── Max length filter ───────────────────────────────────────────────────

const MAX_LENGTH = 500

const maxLengthFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  if (tr.newDoc.length <= MAX_LENGTH) return tr
  return [] // reject the transaction
})

// ── Paste sanitizer ─────────────────────────────────────────────────────

const pasteSanitizer = EditorView.inputHandler.of((view, from, to, text) => {
  if (text.length <= 1) return false // normal keystroke — skip
  // NFKC normalize + strip control chars and zero-width chars
  const sanitized = text
    .normalize('NFKC')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
  if (sanitized === text) return false
  view.dispatch({ changes: { from, to, insert: sanitized } })
  return true
})

// ── Hook types ──────────────────────────────────────────────────────────

export interface UseFormulaEditorOptions {
  readonly initialValue?: string
  readonly placeholderText?: string
  readonly tooltipParent?: HTMLElement | null
  readonly dynamicExtensions?: readonly Extension[]
  readonly onChange?: (value: string) => void
  readonly onBlur?: (value: string) => void
  readonly onReady?: () => void
}

export interface UseFormulaEditorReturn {
  readonly containerRef: (node: HTMLDivElement | null) => void
  readonly insertAtCursor: (text: string) => void
  readonly getView: () => EditorView | null
  readonly focus: () => void
}

export function useFormulaEditor(options: UseFormulaEditorOptions): UseFormulaEditorReturn {
  const viewRef = useRef<EditorView | null>(null)
  const insertRafRef = useRef<number | null>(null)

  // Stable callback refs — avoid recreating the EditorView when callbacks change
  const onChangeRef = useRef(options.onChange)
  const onBlurRef = useRef(options.onBlur)
  const onReadyRef = useRef(options.onReady)
  onChangeRef.current = options.onChange
  onBlurRef.current = options.onBlur
  onReadyRef.current = options.onReady

  // ── Compartments for dynamic reconfiguration ────────────────────────

  const tooltipCompartment = useRef(new Compartment())
  const dynamicCompartment = useRef(new Compartment())

  // ── Static base extensions (stable identity — never changes) ────────

  const baseExtensions = useMemo((): Extension[] => [
    formula(),
    syntaxHighlighting(formulaHighlight),
    history(),
    keymap.of(historyKeymap),
    closeBrackets(),
    singleLineFilter,
    maxLengthFilter,
    pasteSanitizer,
    cmPlaceholder(options.placeholderText ?? '式を入力...'),

    // Enter key → fire submit event instead of newline
    Prec.highest(keymap.of([{
      key: 'Enter',
      run: (view) => {
        view.dom.dispatchEvent(new CustomEvent('cm-submit', { bubbles: true }))
        return true
      },
    }])),

    // onChange listener
    EditorView.updateListener.of((update) => {
      if (update.view.composing) return // IME in progress — wait
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString())
      }
    }),

    // onBlur handler
    EditorView.domEventHandlers({
      blur: (_, view) => {
        onBlurRef.current?.(view.state.doc.toString())
      },
    }),

    // Theme: single-line editor look
    EditorView.theme({
      '&': { fontSize: '13px', fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { overflowX: 'auto', overflowY: 'hidden', padding: '0 8px', height: '100%' },
      '.cm-content': { padding: '2px 0', minHeight: 'auto' },
      '.cm-line': { padding: '0' },
      '.cm-placeholder': { color: 'var(--muted-foreground, #94a3b8)', fontStyle: 'italic' },
    }),

    // Tooltip parent — initial value, reconfigured via Compartment (Race #7)
    tooltipCompartment.current.of(tooltips({ parent: document.body })),

    // Dynamic extensions slot — reconfigured when props change
    dynamicCompartment.current.of([]),
  ], []) // eslint-disable-line react-hooks/exhaustive-deps — intentionally stable

  // ── Container ref callback — creates/destroys EditorView ────────────

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous view
    if (viewRef.current) {
      if (insertRafRef.current !== null) {
        cancelAnimationFrame(insertRafRef.current)
        insertRafRef.current = null
      }
      // Race #1: null BEFORE destroy to prevent stale reads from polling/listeners
      const toDestroy = viewRef.current
      viewRef.current = null
      toDestroy.destroy()
    }

    if (!node) return

    const view = new EditorView({
      state: EditorState.create({
        doc: options.initialValue ?? '',
        extensions: baseExtensions,
      }),
      parent: node,
    })

    viewRef.current = view
    onReadyRef.current?.()
  }, [baseExtensions, options.initialValue])

  // ── Reconfigure tooltipParent when it changes (Race #7) ─────────────

  useEffect(() => {
    const view = viewRef.current
    if (!view || options.tooltipParent === undefined) return
    view.dispatch({
      effects: tooltipCompartment.current.reconfigure(
        tooltips({ parent: options.tooltipParent ?? document.body }),
      ),
    })
  }, [options.tooltipParent])

  // ── Reconfigure dynamic extensions ──────────────────────────────────

  useEffect(() => {
    const view = viewRef.current
    if (!view || !options.dynamicExtensions) return
    view.dispatch({
      effects: dynamicCompartment.current.reconfigure(options.dynamicExtensions),
    })
  }, [options.dynamicExtensions])

  // ── insertAtCursor — Race #3 fix: no blur/focus trick ───────────────

  const insertAtCursor = useCallback((text: string) => {
    const view = viewRef.current
    if (!view) return

    // Simply dispatch the insert — CM6 handles composing state correctly
    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    })
    view.focus()
  }, [])

  const getView = useCallback(() => viewRef.current, [])

  const focus = useCallback(() => {
    viewRef.current?.focus()
  }, [])

  return { containerRef, insertAtCursor, getView, focus }
}
