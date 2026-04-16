import type { Template } from '@/types'
import { QUOTATION_TEMPLATE } from './quotationTemplate'
import { QUOTATION_DISCOUNT_TEMPLATE } from './quotationDiscountTemplate'
import { QUOTATION_ENGLISH_TEMPLATE } from './quotationEnglishTemplate'
import { FUYOU_KOJO_TEMPLATE } from './fuyouKojoTemplate'
import { ELEMENT_SHOWCASE_TEMPLATE } from './elementShowcaseTemplate'
import { BINDING_EDITOR_SAMPLE_TEMPLATE } from './bindingEditorSampleTemplate'
import { QUOTATION_MODERN_TEMPLATE } from './quotationModernTemplate'
import { PURCHASE_ORDER_TEMPLATE } from './purchaseOrderTemplate'
import { INVOICE_TEMPLATE } from './invoiceTemplate'

export const BUILTIN_TEMPLATES: Template[] = [
  QUOTATION_MODERN_TEMPLATE,
  PURCHASE_ORDER_TEMPLATE,
  INVOICE_TEMPLATE,
  QUOTATION_TEMPLATE,
  QUOTATION_DISCOUNT_TEMPLATE,
  QUOTATION_ENGLISH_TEMPLATE,
  FUYOU_KOJO_TEMPLATE,
  ELEMENT_SHOWCASE_TEMPLATE,
  BINDING_EDITOR_SAMPLE_TEMPLATE,
]
