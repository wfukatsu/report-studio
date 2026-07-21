import { describe, it, expect } from 'vitest'
import { elementIcon, defaultName as rawDefaultName, sectionLabel as rawSectionLabel } from './layerUtils'
import i18n from '@/i18n/config'
import type { ReportElement, Section } from '@/types'

// layerUtils now takes an i18n `t` (#329). Bind ja/components so the existing
// Japanese-string assertions below still hold without touching every call site.
const tf = i18n.getFixedT('ja', 'components')
const defaultName = (el: ReportElement) => rawDefaultName(el, tf)
const sectionLabel = (sectionType: Section['sectionType']) => rawSectionLabel(sectionType, tf)

// Minimal element stub
function el(type: ReportElement['type'], extra: Record<string, unknown> = {}): ReportElement {
  return {
    id: 'test', type, position: { x: 0, y: 0 }, size: { width: 10, height: 10 },
    zIndex: 1, visible: true, locked: false, ...extra,
  } as unknown as ReportElement
}

describe('elementIcon', () => {
  const allTypes: ReportElement['type'][] = [
    'text', 'dataField', 'image', 'chart', 'barcode',
    'manualEntry', 'hanko', 'approvalStampRow', 'revenueStamp', 'shape',
    'repeatingBand', 'repeatingList', 'formTable', 'checkbox', 'eraSelect',
    'pageNumber', 'currentDate', 'divider',
  ]
  allTypes.forEach((type) => {
    it(`returns an icon for type "${type}"`, () => {
      expect(elementIcon(type)).toBeTruthy()
    })
  })
})

describe('defaultName', () => {
  it('returns el.name when set', () => {
    expect(defaultName({ ...el('text'), name: 'カスタム名' } as ReportElement)).toBe('カスタム名')
  })
  it('text', () => expect(defaultName(el('text', { content: '', style: {} }))).toBe('テキスト'))
  it('dataField', () => expect(defaultName(el('dataField', { fieldKey: '', style: {} }))).toBe('データフィールド'))
  it('image', () => expect(defaultName(el('image', { src: '', alt: '', objectFit: 'contain' }))).toBe('画像'))
  it('chart', () => expect(defaultName(el('chart', { chartType: 'bar' }))).toBe('グラフ'))
  it('barcode', () => expect(defaultName(el('barcode', { kind: 'qr', value: '' }))).toBe('バーコード'))
  it('manualEntry', () => expect(defaultName(el('manualEntry', { label: '', labelPosition: 'top', displayMode: 'line', lineColor: '#000', style: {} }))).toBe('記入欄'))
  it('hanko', () => expect(defaultName(el('hanko', { text: '', shape: 'circle', borderColor: '#000', textColor: '#000', fontSize: 3, writingMode: 'vertical-rl', doubleBorder: false }))).toBe('印鑑'))
  it('approvalStampRow', () => expect(defaultName(el('approvalStampRow', { cells: [], labelPosition: 'top', borderColor: '#000', borderWidth: 0.3, cellHeight: 20 }))).toBe('多段印鑑欄'))
  it('revenueStamp', () => expect(defaultName(el('revenueStamp', { borderColor: '#000', borderWidth: 0.3, showLabel: true, showCancellationGuide: false }))).toBe('収入印紙欄'))
  it('shape rectangle', () => expect(defaultName(el('shape', { shape: 'rectangle', stroke: '#000', strokeWidth: 0.3, strokeDash: 'solid' }))).toBe('矩形'))
  it('shape circle', () => expect(defaultName(el('shape', { shape: 'circle', stroke: '#000', strokeWidth: 0.3, strokeDash: 'solid' }))).toBe('円'))
  it('shape line', () => expect(defaultName(el('shape', { shape: 'line', stroke: '#000', strokeWidth: 0.3, strokeDash: 'solid' }))).toBe('線'))
  it('repeatingBand', () => expect(defaultName(el('repeatingBand', { dataSource: '', itemHeight: 8, fields: [], showHeader: true }))).toBe('繰り返しバンド'))
  it('repeatingList', () => expect(defaultName(el('repeatingList', { dataSource: '', layout: 'vertical', gridColumns: 2, itemWidth: 50, itemHeight: 30, gap: 2, fields: [], maxItems: 0 }))).toBe('繰り返しリスト'))
  it('formTable', () => expect(defaultName(el('formTable', { columns: [], rows: [], borderColor: '#000', borderWidth: 0.3 }))).toBe('帳票テーブル'))
  it('checkbox', () => expect(defaultName(el('checkbox', { checked: false, checkmark: '✓', label: '' }))).toBe('チェックボックス'))
  it('eraSelect', () => expect(defaultName(el('eraSelect'))).toBe('元号選択'))
  it('pageNumber', () => expect(defaultName(el('pageNumber', { format: '{{page}}', style: {} }))).toBe('ページ番号'))
  it('currentDate', () => expect(defaultName(el('currentDate', { format: 'yyyy/MM/dd', style: {} }))).toBe('現在日付'))
  it('divider', () => expect(defaultName(el('divider', { direction: 'horizontal', color: '#000', thickness: 0.5, dashStyle: 'solid' }))).toBe('区切り線'))
})

describe('sectionLabel', () => {
  const cases: Array<[Section['sectionType'], string]> = [
    ['header', 'ヘッダー'],
    ['footer', 'フッター'],
    ['body',   'ボディ'],
    ['custom', 'カスタム'],
  ]
  cases.forEach(([type, label]) => {
    it(`${type} → ${label}`, () => expect(sectionLabel(type)).toBe(label))
  })
})
