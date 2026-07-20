/**
 * historySlice — snapshot/push helpers and undo/redo integration (#223).
 *
 * The pure helpers (snapshotPages / pushHistoryEntry) own the fragile bits:
 * deep-cloning so later mutations can't corrupt the past, trimming the redo
 * branch on a new push, and capping the stack at 30 entries.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { snapshotPages, pushHistoryEntry } from './historySlice'
import { useReportStore } from './reportStore'
import type { PageDef, SchemaDefinition } from '@/types'

const page = (id: string): PageDef =>
  ({
    id,
    name: id,
    width: 210,
    height: 297,
    background: '#fff',
    sections: [],
  }) as unknown as PageDef

describe('snapshotPages', () => {
  it('captures a deep copy — later mutation of the source does not leak in', () => {
    const pages = [page('p1')]
    const snap = snapshotPages(pages)
    pages[0].name = 'mutated'
    expect(snap.pages[0].name).toBe('p1')
  })

  it('includes schema/rules/pageSettings when provided', () => {
    const schema = { groups: [] } as unknown as SchemaDefinition
    const snap = snapshotPages([page('p1')], schema, [], [], { margins: { top: 5 } } as never)
    expect(snap.schema).toEqual({ groups: [] })
    expect(snap.pageSettings).toEqual({ margins: { top: 5 } })
  })

  it('leaves optional slices undefined when omitted', () => {
    const snap = snapshotPages([page('p1')])
    expect(snap.schema).toBeUndefined()
    expect(snap.calculationRules).toBeUndefined()
    expect(snap.pageSettings).toBeUndefined()
  })
})

describe('pushHistoryEntry', () => {
  it('appends an entry and points the index at it', () => {
    const r = pushHistoryEntry([], -1, [page('p1')])
    expect(r.history).toHaveLength(1)
    expect(r.historyIndex).toBe(0)
  })

  it('trims the forward (redo) branch when pushing after an undo', () => {
    // Build 3 entries, then simulate an undo to index 0 and push a new state.
    let state = pushHistoryEntry([], -1, [page('a')])
    state = pushHistoryEntry(state.history, state.historyIndex, [page('b')])
    state = pushHistoryEntry(state.history, state.historyIndex, [page('c')])
    expect(state.history).toHaveLength(3)

    // User undid twice → index 0; a fresh edit must discard 'b' and 'c'.
    const afterUndo = pushHistoryEntry(state.history, 0, [page('d')])
    expect(afterUndo.history.map((e) => e.pages[0].id)).toEqual(['a', 'd'])
    expect(afterUndo.historyIndex).toBe(1)
  })

  it('caps the stack at 30 entries, dropping the oldest', () => {
    let state: ReturnType<typeof pushHistoryEntry> = { history: [], historyIndex: -1 }
    for (let i = 0; i < 35; i++) {
      state = pushHistoryEntry(state.history, state.historyIndex, [page(`p${i}`)])
    }
    expect(state.history).toHaveLength(30)
    // Oldest surviving entry is p5 (p0..p4 were dropped); index tracks the last.
    expect(state.history[0].pages[0].id).toBe('p5')
    expect(state.history[29].pages[0].id).toBe('p34')
    expect(state.historyIndex).toBe(29)
  })
})

describe('historySlice — undo/redo integration', () => {
  beforeEach(() => {
    useReportStore.getState().newReport()
  })

  it('undo restores a prior schema snapshot, redo re-applies it', () => {
    const groupCount = () =>
      useReportStore.getState().definition.schema?.groups.length ?? 0

    // Structural schema mutations don't push history themselves — the calling
    // action does. Drive pushHistory explicitly to build two distinct snapshots
    // (1 group, then 2 groups) so undo has a defined-schema baseline to restore.
    useReportStore.getState().addSchemaGroup('master')
    useReportStore.getState().pushHistory()
    useReportStore.getState().addSchemaGroup('detail')
    useReportStore.getState().pushHistory()
    expect(groupCount()).toBe(2)

    useReportStore.getState().undo()
    expect(groupCount()).toBe(1)

    useReportStore.getState().redo()
    expect(groupCount()).toBe(2)
  })

  it('undo is a no-op at the beginning of history', () => {
    const before = useReportStore.getState().historyIndex
    useReportStore.getState().undo()
    // Cannot go before index 0 (guarded by `historyIndex < 1`).
    expect(useReportStore.getState().historyIndex).toBeLessThanOrEqual(Math.max(before, 0))
    expect(useReportStore.getState().definition.pages).toHaveLength(1)
  })
})
