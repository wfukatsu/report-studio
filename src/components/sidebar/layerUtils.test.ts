import { describe, it, expect } from 'vitest'
import { defaultName, sectionLabel } from './layerUtils'
import type { ReportElement } from '@/types'

function makeEl(type: ReportElement['type'], extra: Record<string, unknown> = {}): ReportElement {
  return {
    id: 'e1',
    type,
    position: { x: 0, y: 0 },
    size: { width: 50, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    ...extra,
  } as ReportElement
}

describe('defaultName', () => {
  it('name プロパティが設定されているときそれを返す', () => {
    const el = makeEl('text', { name: 'カスタム名' })
    expect(defaultName(el)).toBe('カスタム名')
  })

  it('text → テキスト', () => expect(defaultName(makeEl('text'))).toBe('テキスト'))
  it('label → ラベル', () => expect(defaultName(makeEl('label', { text: '' }))).toBe('ラベル'))
  it('dataField → データフィールド', () => expect(defaultName(makeEl('dataField', { fieldKey: '', label: '', style: {}, fallbackText: '' }))).toBe('データフィールド'))
  it('image → 画像', () => expect(defaultName(makeEl('image', { src: '', alt: '', objectFit: 'contain', opacity: 1 }))).toBe('画像'))
  it('table → テーブル', () => expect(defaultName(makeEl('table', { rows: 1, columns: 1, data: [], headerRow: false }))).toBe('テーブル'))
  it('chart → グラフ', () => expect(defaultName(makeEl('chart', { chartType: 'bar', title: '' }))).toBe('グラフ'))
  it('barcode → バーコード', () => expect(defaultName(makeEl('barcode', { kind: 'qr', value: '', errorCorrection: 'M', darkColor: '#000', lightColor: '#fff', showText: false }))).toBe('バーコード'))
  it('manualEntry → 記入欄', () => expect(defaultName(makeEl('manualEntry', { label: '', labelPosition: 'top', displayMode: 'line', lineColor: '#000', placeholder: '', style: {} }))).toBe('記入欄'))
  it('hanko → 印鑑', () => expect(defaultName(makeEl('hanko', { text: '', shape: 'circle', borderColor: '', textColor: '', fontSize: 4, writingMode: 'vertical-rl', doubleBorder: false }))).toBe('印鑑'))
  it('approvalStampRow → 多段印鑑欄', () => expect(defaultName(makeEl('approvalStampRow', { cells: [], labelPosition: 'bottom', borderColor: '#000', borderWidth: 0.3, cellHeight: 15 }))).toBe('多段印鑑欄'))
  it('revenueStamp → 収入印紙欄', () => expect(defaultName(makeEl('revenueStamp', { borderColor: '#000', borderWidth: 0.3, showLabel: true, showCancellationGuide: true }))).toBe('収入印紙欄'))
  it('shape rectangle → 矩形', () => expect(defaultName(makeEl('shape', { shape: 'rectangle', fill: '', stroke: '', strokeWidth: 0, strokeDash: 'solid' }))).toBe('矩形'))
  it('shape circle → 円', () => expect(defaultName(makeEl('shape', { shape: 'circle', fill: '', stroke: '', strokeWidth: 0, strokeDash: 'solid' }))).toBe('円'))
  it('shape line → 線', () => expect(defaultName(makeEl('shape', { shape: 'line', fill: '', stroke: '', strokeWidth: 0, strokeDash: 'solid' }))).toBe('線'))
  it('repeatingBand → 繰り返しバンド', () => expect(defaultName(makeEl('repeatingBand', { dataSource: '', fields: [], itemHeight: 8, showHeader: true, showFooter: true, totals: [], pageBreak: 'none', maxItems: 0, oddRowColor: '', evenRowColor: '', borderColor: '', borderWidth: 0, sortOrder: 'asc', style: {}, headerStyle: {} }))).toBe('繰り返しバンド'))
  it('repeatingList → 繰り返しリスト', () => expect(defaultName(makeEl('repeatingList', { dataSource: '', layout: 'grid', gridColumns: 3, itemWidth: 55, itemHeight: 20, gap: 2, fields: [], maxItems: 0, borderColor: '', borderWidth: 0, itemBackground: '', borderRadius: 1, pageBreak: 'none' }))).toBe('繰り返しリスト'))
})

describe('sectionLabel', () => {
  it('header → ヘッダー', () => expect(sectionLabel('header')).toBe('ヘッダー'))
  it('footer → フッター', () => expect(sectionLabel('footer')).toBe('フッター'))
  it('body → ボディ', () => expect(sectionLabel('body')).toBe('ボディ'))
  it('custom → カスタム', () => expect(sectionLabel('custom')).toBe('カスタム'))
})
