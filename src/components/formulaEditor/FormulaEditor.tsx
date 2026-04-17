/**
 * CodeMirror 6 formula editor component.
 *
 * A single-line expression editor with syntax highlighting, an "fx" label prefix,
 * and support for dynamic extensions (autocomplete, linting, field chips, etc.)
 *
 * Use React.lazy to load this component to keep CM6 out of the main bundle:
 *   const FormulaEditor = React.lazy(() => import('@/components/formulaEditor/FormulaEditor'))
 */

import { useEffect, useMemo, useRef } from 'react'
import type { Extension } from '@codemirror/state'
import { useFormulaEditor, type UseFormulaEditorReturn } from './useFormulaEditor'

export interface FormulaEditorProps {
  readonly initialValue?: string
  readonly dynamicExtensions?: readonly Extension[]
  readonly tooltipParent?: HTMLElement | null
  readonly placeholderText?: string
  readonly onChange?: (value: string) => void
  readonly onBlur?: (value: string) => void
  readonly onReady?: () => void
  /** Imperative handle for parent components (insertAtCursor, getView, focus) */
  readonly editorRef?: React.MutableRefObject<UseFormulaEditorReturn | null>
}

function FormulaEditorInner({
  initialValue,
  dynamicExtensions,
  tooltipParent,
  placeholderText,
  onChange,
  onBlur,
  onReady,
  editorRef,
}: FormulaEditorProps) {
  // useMemo the dynamicExtensions array to prevent unnecessary Compartment reconfigurations
  const stableExtensions = useMemo(
    () => (dynamicExtensions ? [...dynamicExtensions] : undefined),
    [dynamicExtensions],
  )

  const editor = useFormulaEditor({
    initialValue,
    dynamicExtensions: stableExtensions,
    tooltipParent,
    placeholderText,
    onChange,
    onBlur,
    onReady,
  })

  // Expose imperative handle to parent
  const editorRefLocal = useRef(editor)
  editorRefLocal.current = editor
  useEffect(() => {
    if (editorRef) editorRef.current = editorRefLocal.current
    return () => { if (editorRef) editorRef.current = null }
  })

  return (
    <div className="flex items-stretch border border-border rounded-lg bg-background overflow-hidden transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 flex-1 min-h-[48px]">
      <span
        className="flex items-start pt-2 px-2 bg-muted text-[#6E5DCF] font-mono text-[13px] font-semibold italic border-r border-border shrink-0 select-none"
        aria-hidden="true"
      >
        fx
      </span>
      <div
        ref={editor.containerRef}
        className="flex-1 min-h-[40px] py-1"
        aria-label="計算式エディタ"
      />
    </div>
  )
}

export default FormulaEditorInner
