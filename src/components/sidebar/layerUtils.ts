import {
  Type, Tag, Square, Image, Table, BarChart2, Database,
  QrCode, PenLine, Stamp, Rows3, Ticket, AlignJustify, LayoutGrid, TableProperties, SquareCheck, Calendar,
} from 'lucide-react'
import { createElement } from 'react'
import type { ReportElement, Section } from '@/types'

function assertNever(x: never): never {
  throw new Error(`Unhandled element type: ${typeof x === 'object' && x !== null && 'type' in x ? (x as { type: string }).type : String(x)}`)
}

export function elementIcon(type: ReportElement['type']) {
  const cls = 'w-3.5 h-3.5 shrink-0'
  switch (type) {
    case 'text':            return createElement(Type, { className: cls })
    case 'label':           return createElement(Tag, { className: cls })
    case 'dataField':       return createElement(Database, { className: cls })
    case 'image':           return createElement(Image, { className: cls })
    case 'table':           return createElement(Table, { className: cls })
    case 'chart':           return createElement(BarChart2, { className: cls })
    case 'barcode':         return createElement(QrCode, { className: cls })
    case 'manualEntry':     return createElement(PenLine, { className: cls })
    case 'hanko':           return createElement(Stamp, { className: cls })
    case 'approvalStampRow': return createElement(Rows3, { className: cls })
    case 'revenueStamp':    return createElement(Ticket, { className: cls })
    case 'shape':           return createElement(Square, { className: cls })
    case 'repeatingBand':   return createElement(AlignJustify, { className: cls })
    case 'repeatingList':   return createElement(LayoutGrid, { className: cls })
    case 'formTable':       return createElement(TableProperties, { className: cls })
    case 'checkbox':        return createElement(SquareCheck, { className: cls })
    case 'eraSelect':       return createElement(Calendar, { className: cls })
    default:                return assertNever(type)
  }
}

export function defaultName(el: ReportElement): string {
  if (el.name) return el.name
  switch (el.type) {
    case 'text':            return 'テキスト'
    case 'label':           return 'ラベル'
    case 'dataField':       return 'データフィールド'
    case 'image':           return '画像'
    case 'table':           return 'テーブル'
    case 'chart':           return 'グラフ'
    case 'barcode':         return 'バーコード'
    case 'manualEntry':     return '記入欄'
    case 'hanko':           return '印鑑'
    case 'approvalStampRow': return '多段印鑑欄'
    case 'revenueStamp':    return '収入印紙欄'
    case 'shape': {
      if (el.shape === 'circle') return '円'
      if (el.shape === 'line') return '線'
      return '矩形'
    }
    case 'repeatingBand':   return '繰り返しバンド'
    case 'repeatingList':   return '繰り返しリスト'
    case 'formTable':       return '帳票テーブル'
    case 'checkbox':        return 'チェックボックス'
    case 'eraSelect':       return '元号選択'
    default: return assertNever(el)
  }
}

export function sectionLabel(sectionType: Section['sectionType']): string {
  switch (sectionType) {
    case 'header': return 'ヘッダー'
    case 'footer': return 'フッター'
    case 'body':   return 'ボディ'
    case 'custom': return 'カスタム'
  }
}
