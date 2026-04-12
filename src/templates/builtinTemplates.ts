import type { Template } from '@/types'
import { QUOTATION_TEMPLATE } from './quotationTemplate'
import { QUOTATION_DISCOUNT_TEMPLATE } from './quotationDiscountTemplate'
import { QUOTATION_ENGLISH_TEMPLATE } from './quotationEnglishTemplate'
import { FUYOU_KOJO_TEMPLATE } from './fuyouKojoTemplate'
import { ELEMENT_SHOWCASE_TEMPLATE } from './elementShowcaseTemplate'

export const BUILTIN_TEMPLATES: Template[] = [
  QUOTATION_TEMPLATE,
  QUOTATION_DISCOUNT_TEMPLATE,
  QUOTATION_ENGLISH_TEMPLATE,
  FUYOU_KOJO_TEMPLATE,
  ELEMENT_SHOWCASE_TEMPLATE,
]
