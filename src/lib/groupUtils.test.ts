import { describe, it, expect } from 'vitest'
import { buildGroupMap, resolveVisible, resolveLocked } from './groupUtils'
import type { LayerGroup } from '@/types'

function makeGroup(overrides: Partial<LayerGroup> = {}): LayerGroup {
  return {
    id: 'g1',
    name: 'Group 1',
    elementIds: [],
    collapsed: false,
    visible: true,
    locked: false,
    ...overrides,
  }
}

describe('buildGroupMap', () => {
  it('空配列は空の Map を返す', () => {
    const map = buildGroupMap([])
    expect(map.size).toBe(0)
  })

  it('各 elementId に対してグループをマッピングする', () => {
    const g1 = makeGroup({ id: 'g1', elementIds: ['e1', 'e2'] })
    const g2 = makeGroup({ id: 'g2', elementIds: ['e3'] })
    const map = buildGroupMap([g1, g2])
    expect(map.get('e1')).toBe(g1)
    expect(map.get('e2')).toBe(g1)
    expect(map.get('e3')).toBe(g2)
  })

  it('グループに属さない要素は undefined を返す', () => {
    const map = buildGroupMap([makeGroup({ elementIds: ['e1'] })])
    expect(map.get('e99')).toBeUndefined()
  })
})

describe('resolveVisible', () => {
  it('グループに属さない要素は自身の visible を返す', () => {
    const map = buildGroupMap([])
    expect(resolveVisible({ id: 'e1', visible: true }, map)).toBe(true)
    expect(resolveVisible({ id: 'e1', visible: false }, map)).toBe(false)
  })

  it('グループが visible の場合は要素自身の visible を返す', () => {
    const group = makeGroup({ elementIds: ['e1'], visible: true })
    const map = buildGroupMap([group])
    expect(resolveVisible({ id: 'e1', visible: true }, map)).toBe(true)
    expect(resolveVisible({ id: 'e1', visible: false }, map)).toBe(false)
  })

  it('グループが非表示のとき、要素の visible 関係なく false を返す', () => {
    const group = makeGroup({ elementIds: ['e1'], visible: false })
    const map = buildGroupMap([group])
    expect(resolveVisible({ id: 'e1', visible: true }, map)).toBe(false)
    expect(resolveVisible({ id: 'e1', visible: false }, map)).toBe(false)
  })
})

describe('resolveLocked', () => {
  it('グループに属さない要素は自身の locked を返す', () => {
    const map = buildGroupMap([])
    expect(resolveLocked({ id: 'e1', locked: false }, map)).toBe(false)
    expect(resolveLocked({ id: 'e1', locked: true }, map)).toBe(true)
  })

  it('グループが locked でない場合は要素自身の locked を返す', () => {
    const group = makeGroup({ elementIds: ['e1'], locked: false })
    const map = buildGroupMap([group])
    expect(resolveLocked({ id: 'e1', locked: false }, map)).toBe(false)
    expect(resolveLocked({ id: 'e1', locked: true }, map)).toBe(true)
  })

  it('グループが locked のとき、要素の locked 関係なく true を返す', () => {
    const group = makeGroup({ elementIds: ['e1'], locked: true })
    const map = buildGroupMap([group])
    expect(resolveLocked({ id: 'e1', locked: false }, map)).toBe(true)
    expect(resolveLocked({ id: 'e1', locked: true }, map)).toBe(true)
  })
})
