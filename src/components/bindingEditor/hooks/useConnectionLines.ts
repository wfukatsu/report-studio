/**
 * useConnectionLines — Calculate SVG line coordinates for binding connections.
 *
 * Uses DOM refs and getBoundingClientRect for position calculation.
 * rAF-throttled recalculation on scroll and resize.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BindingConnection, LinePos } from '../types'

export function useConnectionLines(
  connections: readonly BindingConnection[],
) {
  // -----------------------------------------------------------------------
  // Expansion state (which groups are collapsed/expanded)
  // -----------------------------------------------------------------------
  const [expandedFieldGroups, setExpandedFieldGroups] = useState<Set<string>>(
    () => new Set(),
  )
  const [expandedElementGroups, setExpandedElementGroups] = useState<Set<string>>(
    () => new Set(),
  )

  const toggleFieldGroup = useCallback((id: string) => {
    setExpandedFieldGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleElementGroup = useCallback((id: string) => {
    setExpandedElementGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandFieldGroup = useCallback((id: string) => {
    setExpandedFieldGroups((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const expandElementGroup = useCallback((id: string) => {
    setExpandedElementGroups((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // -----------------------------------------------------------------------
  // DOM refs
  // -----------------------------------------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fieldRefs = useRef<Map<string, HTMLElement | null>>(new Map())
  const elementRefs = useRef<Map<string, HTMLElement | null>>(new Map())

  // Stable ref-registration callbacks. Defined here (next to the useRef
  // declarations) so the refs are locally known to be stable — consumers get
  // memoized callbacks without having to reference the ref objects themselves.
  const setFieldRef = useCallback((fieldId: string, el: HTMLElement | null) => {
    if (el) fieldRefs.current.set(fieldId, el)
    else fieldRefs.current.delete(fieldId)
  }, [])

  const setElementRef = useCallback((elementId: string, el: HTMLElement | null) => {
    if (el) elementRefs.current.set(elementId, el)
    else elementRefs.current.delete(elementId)
  }, [])

  // -----------------------------------------------------------------------
  // Line calculation
  // -----------------------------------------------------------------------
  const [lines, setLines] = useState<readonly LinePos[]>([])
  const [recalcTrigger, setRecalcTrigger] = useState(0)

  const triggerRecalc = useCallback(() => {
    setRecalcTrigger((n) => n + 1)
  }, [])

  // Recalculate line positions whenever connections or recalc trigger changes
  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      setLines([])
      return
    }

    const rafId = requestAnimationFrame(() => {
      const containerRect = container.getBoundingClientRect()
      const newLines: LinePos[] = []

      for (const { fieldId, elementId, groupId } of connections) {
        const fieldEl = fieldRefs.current.get(fieldId)
        const elementEl = elementRefs.current.get(elementId)
        if (!fieldEl || !elementEl) continue

        const fieldRect = fieldEl.getBoundingClientRect()
        const elementRect = elementEl.getBoundingClientRect()

        // Element(左パネル)の右端 → Field(中央パネル)の左端
        newLines.push({
          x1: elementRect.right - containerRect.left,
          y1: elementRect.top + elementRect.height / 2 - containerRect.top,
          x2: fieldRect.left - containerRect.left,
          y2: fieldRect.top + fieldRect.height / 2 - containerRect.top,
          fieldId,
          elementId,
          groupId,
          isCollapsed: false,
        })
      }

      setLines(newLines)
    })

    return () => cancelAnimationFrame(rafId)
  }, [connections, recalcTrigger])

  // Recalc on scroll and resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let rafPending = false
    const scheduleRecalc = () => {
      if (rafPending) return
      rafPending = true
      requestAnimationFrame(() => {
        rafPending = false
        triggerRecalc()
      })
    }

    // Listen on scroll events from child panels
    container.addEventListener('scroll', scheduleRecalc, true)
    window.addEventListener('resize', scheduleRecalc)

    return () => {
      container.removeEventListener('scroll', scheduleRecalc, true)
      window.removeEventListener('resize', scheduleRecalc)
    }
  }, [triggerRecalc])

  return useMemo(() => ({
    // SVG line data
    lines,

    // Expansion state
    expandedFieldGroups,
    expandedElementGroups,
    toggleFieldGroup,
    toggleElementGroup,
    expandFieldGroup,
    expandElementGroup,

    // DOM refs
    containerRef,
    fieldRefs,
    elementRefs,
    setFieldRef,
    setElementRef,

    // Manual recalc
    triggerRecalc,
  }), [
    lines,
    expandedFieldGroups,
    expandedElementGroups,
    toggleFieldGroup,
    toggleElementGroup,
    expandFieldGroup,
    expandElementGroup,
    setFieldRef,
    setElementRef,
    triggerRecalc,
  ])
}
