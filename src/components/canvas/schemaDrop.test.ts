/**
 * schemaDrop — pure drop-rule logic extracted from ReportCanvas (#435).
 */
import { describe, it, expect } from 'vitest'
import {
  buildBandColumnsPatch,
  resolveCollisionFreePosition,
  SCHEMA_DROP_BINDABLE_TYPES,
  REPEATING_CONTAINER_TYPES,
  type BandLike,
} from './schemaDrop'

describe('buildBandColumnsPatch', () => {
  it('文字列フィールドは左寄せ・フォーマット無しの列になる', () => {
    const result = buildBandColumnsPatch({}, [
      { fieldKey: 'name', fieldLabel: '品名', fieldType: 'string' },
    ])
    expect(result).not.toBeNull()
    expect(result!.addedCount).toBe(1)
    expect(result!.patch.fields).toEqual([
      { key: 'name', label: '品名', width: 20, align: 'left' },
    ])
    expect(result!.patch.totals).toBeUndefined()
    expect(result!.patch.showFooter).toBeUndefined()
  })

  it('数値フィールドは右寄せ + カンマ書式 + 合計行 + フッター有効になる', () => {
    const result = buildBandColumnsPatch({}, [
      { fieldKey: 'price', fieldLabel: '単価', fieldType: 'number' },
    ])
    expect(result!.patch.fields).toEqual([
      { key: 'price', label: '単価', width: 20, align: 'right', format: { type: 'comma' } },
    ])
    expect(result!.patch.totals).toEqual([
      { fieldKey: 'price', formula: 'sum', label: '合計' },
    ])
    expect(result!.patch.showFooter).toBe(true)
  })

  it('既存列と重複するキーはスキップし、全重複なら null を返す', () => {
    const band: BandLike = {
      fields: [{ key: 'price', label: '単価', width: 20 }],
    }
    expect(
      buildBandColumnsPatch(band, [{ fieldKey: 'price', fieldLabel: '単価', fieldType: 'number' }]),
    ).toBeNull()

    const partial = buildBandColumnsPatch(band, [
      { fieldKey: 'price', fieldLabel: '単価', fieldType: 'number' },
      { fieldKey: 'qty', fieldLabel: '数量', fieldType: 'number' },
    ])
    expect(partial!.addedCount).toBe(1)
    expect((partial!.patch.fields as { key: string }[]).map((f) => f.key)).toEqual([
      'price',
      'qty',
    ])
  })

  it('既に合計行のあるフィールドには合計を重複追加しない', () => {
    const band: BandLike = {
      totals: [{ fieldKey: 'price', formula: 'sum' }],
    }
    const result = buildBandColumnsPatch(band, [
      { fieldKey: 'price2', fieldLabel: '金額', fieldType: 'number' },
      { fieldKey: 'price', fieldLabel: '単価', fieldType: 'number' },
    ])
    // price は列としては追加されるが、totals は price2 のみ追加される
    expect((result!.patch.totals as { fieldKey: string }[]).map((t) => t.fieldKey)).toEqual([
      'price',
      'price2',
    ])
  })

  it('dataSource 未設定のバンドにのみ groupDataKey を設定する', () => {
    const unset = buildBandColumnsPatch({}, [{ fieldKey: 'a', fieldLabel: 'A' }], 'items')
    expect(unset!.patch.dataSource).toBe('items')

    const set = buildBandColumnsPatch(
      { dataSource: 'orders' },
      [{ fieldKey: 'a', fieldLabel: 'A' }],
      'items',
    )
    expect(set!.patch.dataSource).toBeUndefined()
  })
})

describe('resolveCollisionFreePosition', () => {
  const size = { width: 40, height: 10 }

  it('重なりが無ければそのままの位置を返す', () => {
    expect(resolveCollisionFreePosition(10, 20, size, [], 210, 297)).toEqual({ x: 10, y: 20 })
  })

  it('既存要素と重なる場合は 5mm 刻みで斜めにずらす（重ならなくなるまで）', () => {
    const existing = [{ position: { x: 10, y: 20 }, size: { width: 40, height: 10 } }]
    // (15,25) はまだ既存要素と重なるため 2 ステップ目の (20,30) に落ち着く
    expect(resolveCollisionFreePosition(10, 20, size, existing, 210, 297)).toEqual({ x: 20, y: 30 })
  })

  it('連続して重なる場合はさらにずらし、セクション境界でクランプする', () => {
    const existing = [
      { position: { x: 0, y: 0 }, size: { width: 200, height: 280 } }, // ほぼ全面
    ]
    const pos = resolveCollisionFreePosition(0, 0, size, existing, 210, 297)
    // 全面占有 → クランプ上限（page - size）まで逃げる
    expect(pos.x).toBeLessThanOrEqual(210 - size.width)
    expect(pos.y).toBeLessThanOrEqual(297 - size.height)
    expect(pos.x).toBeGreaterThan(0)
  })
})

describe('type sets', () => {
  it('バインド可能タイプとリピートコンテナタイプが期待どおり', () => {
    expect([...SCHEMA_DROP_BINDABLE_TYPES].sort()).toEqual([
      'checkbox',
      'dataField',
      'eraSelect',
      'text',
    ])
    expect([...REPEATING_CONTAINER_TYPES].sort()).toEqual(['repeatingBand', 'repeatingList'])
  })
})
