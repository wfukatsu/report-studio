/**
 * ビルトインテンプレート JSON 変換スクリプト
 *
 * 各 .ts テンプレートを applyTemplate() で ReportDefinition に変換し、
 * src/templates/builtin/{id}.json に formatVersion: 2 エンベロープ形式で出力する。
 *
 * Usage: npx tsx scripts/convert-templates.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Template imports
import { QUOTATION_MODERN_TEMPLATE } from '../src/templates/quotationModernTemplate'
import { PURCHASE_ORDER_TEMPLATE } from '../src/templates/purchaseOrderTemplate'
import { INVOICE_TEMPLATE } from '../src/templates/invoiceTemplate'
import { QUOTATION_TEMPLATE } from '../src/templates/quotationTemplate'
import { QUOTATION_DISCOUNT_TEMPLATE } from '../src/templates/quotationDiscountTemplate'
import { QUOTATION_ENGLISH_TEMPLATE } from '../src/templates/quotationEnglishTemplate'
import { FUYOU_KOJO_TEMPLATE } from '../src/templates/fuyouKojoTemplate'
import { ELEMENT_SHOWCASE_TEMPLATE } from '../src/templates/elementShowcaseTemplate'
import { BINDING_EDITOR_SAMPLE_TEMPLATE } from '../src/templates/bindingEditorSampleTemplate'
import { applyTemplate } from '../src/lib/templateUtils'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(__dirname, '../src/templates/builtin')

mkdirSync(outDir, { recursive: true })

const templates = [
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

let count = 0
for (const template of templates) {
  const definition = applyTemplate(template)
  const envelope = {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    definition,
  }
  const outPath = resolve(outDir, `${template.id}.json`)
  writeFileSync(outPath, JSON.stringify(envelope, null, 2), 'utf-8')
  console.log(`✓ ${template.id} → ${outPath}`)
  count++
}

console.log(`\nDone: ${count} templates converted.`)
