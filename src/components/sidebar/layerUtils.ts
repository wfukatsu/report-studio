import {
  Type, Square, Image, BarChart2, Database,
  QrCode, PenLine, Stamp, Rows3, Ticket, AlignJustify, LayoutGrid, TableProperties, SquareCheck, Calendar,
  Hash, CalendarDays, SeparatorHorizontal, Building2, MapPin, Phone, User, Minus,
} from 'lucide-react'
import { createElement } from 'react'
import type { TFunction } from 'i18next'
import type { ReportElement, Section } from '@/types'

function assertNever(x: never): never {
  throw new Error(`Unhandled element type: ${typeof x === 'object' && x !== null && 'type' in x ? (x as { type: string }).type : String(x)}`)
}

export function elementIcon(type: ReportElement['type']) {
  const cls = 'w-3.5 h-3.5 shrink-0'
  switch (type) {
    case 'text':            return createElement(Type, { className: cls })
    case 'dataField':       return createElement(Database, { className: cls })
    case 'image':           return createElement(Image, { className: cls })
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
    case 'pageNumber':      return createElement(Hash, { className: cls })
    case 'currentDate':     return createElement(CalendarDays, { className: cls })
    case 'divider':               return createElement(SeparatorHorizontal, { className: cls })
    case 'tenantCompanyName':     return createElement(Building2, { className: cls })
    case 'tenantAddress':         return createElement(MapPin, { className: cls })
    case 'tenantPhone':           return createElement(Phone, { className: cls })
    case 'tenantRepresentative':  return createElement(User, { className: cls })
    case 'tenantLogo':            return createElement(Image, { className: cls })
    case 'tenantCustom':          return createElement(Minus, { className: cls })
    default:                      return assertNever(type)
  }
}

export function defaultName(el: ReportElement, t: TFunction<'components'>): string {
  if (el.name) return el.name
  switch (el.type) {
    case 'text':            return t('sidebar.layerUtils.text')
    case 'dataField':       return t('sidebar.layerUtils.dataField')
    case 'image':           return t('sidebar.layerUtils.image')
    case 'chart':           return t('sidebar.layerUtils.chart')
    case 'barcode':         return t('sidebar.layerUtils.barcode')
    case 'manualEntry':     return t('sidebar.layerUtils.manualEntry')
    case 'hanko':           return t('sidebar.layerUtils.hanko')
    case 'approvalStampRow': return t('sidebar.layerUtils.approvalStampRow')
    case 'revenueStamp':    return t('sidebar.layerUtils.revenueStamp')
    case 'shape': {
      if (el.shape === 'circle') return t('sidebar.layerUtils.shapeCircle')
      if (el.shape === 'line') return t('sidebar.layerUtils.shapeLine')
      return t('sidebar.layerUtils.shapeRect')
    }
    case 'repeatingBand':   return t('sidebar.layerUtils.repeatingBand')
    case 'repeatingList':   return t('sidebar.layerUtils.repeatingList')
    case 'formTable':       return t('sidebar.layerUtils.formTable')
    case 'checkbox':        return t('sidebar.layerUtils.checkbox')
    case 'eraSelect':       return t('sidebar.layerUtils.eraSelect')
    case 'pageNumber':      return t('sidebar.layerUtils.pageNumber')
    case 'currentDate':     return t('sidebar.layerUtils.currentDate')
    case 'divider':               return t('sidebar.layerUtils.divider')
    case 'tenantCompanyName':     return t('sidebar.layerUtils.tenantCompanyName')
    case 'tenantAddress':         return t('sidebar.layerUtils.tenantAddress')
    case 'tenantPhone':           return t('sidebar.layerUtils.tenantPhone')
    case 'tenantRepresentative':  return t('sidebar.layerUtils.tenantRepresentative')
    case 'tenantLogo':            return t('sidebar.layerUtils.tenantLogo')
    case 'tenantCustom':          return t('sidebar.layerUtils.tenantCustom', { field: el.fieldKey || t('sidebar.layerUtils.unset') })
    default: return assertNever(el)
  }
}

export function sectionLabel(sectionType: Section['sectionType'], t: TFunction<'components'>): string {
  switch (sectionType) {
    case 'header': return t('sidebar.layerUtils.sectionHeader')
    case 'footer': return t('sidebar.layerUtils.sectionFooter')
    case 'body':   return t('sidebar.layerUtils.sectionBody')
    case 'custom': return t('sidebar.layerUtils.sectionCustom')
  }
}
