/**
 * ビルトインテンプレートの各要素に意味のある name を付与するスクリプト
 *
 * Usage: node scripts/add-element-names.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const builtinDir = resolve(__dirname, '../src/templates/builtin')

// ─── 共通ルール: fieldKey / type / content からname を推測 ──────

const FIELD_NAMES = {
  // document
  'document.documentNo': '書類番号',
  'document.issueDate': '発行日',
  'document.registrationNo': '登録番号',
  'document.validUntil': '有効期限',
  'document.deliveryTerms': '納品条件',
  'document.paymentTerms': '支払条件',
  'document.notes': '備考テキスト',
  // customer
  'customer.customerName': '顧客名',
  'customer.postalCode': '郵便番号',
  'customer.address': '住所',
  'customer.contactPerson': '担当者名',
  // summary
  'summary.subtotal': '小計',
  'summary.tax10Base': '10%対象額',
  'summary.tax10Amount': '消費税（10%）',
  'summary.tax8Base': '8%対象額',
  'summary.tax8Amount': '消費税（8%）',
  'summary.totalIncTax': '合計金額（税込）',
  // delivery
  'delivery.deliveryDate': '納期',
  'delivery.deliveryAddress': '納品先住所',
  'delivery.deliveryContact': '納品先担当',
  // bank account
  'bankAccount.paymentDueDate': 'お支払期限',
  'bankAccount.bankName': '銀行名',
  'bankAccount.branchName': '支店名',
  'bankAccount.accountType': '口座種別',
  'bankAccount.accountNumber': '口座番号',
  'bankAccount.accountHolder': '口座名義',
  // quotation (legacy format)
  'quotation.issueDate': '発行日',
  'quotation.number': '見積番号',
  'quotation.registrationNo': '登録番号',
  'quotation.customer.name': '顧客名',
  'quotation.customer.postalCode': '郵便番号',
  'quotation.customer.address': '住所',
  'quotation.validUntil': '有効期限',
  'quotation.sender.name': '差出人名',
  'quotation.sender.address': '差出人住所',
  'quotation.sender.tel': '電話番号',
  'quotation.sender.email': 'メール',
  'quotation.sender.contact': '担当者',
  'quotation.totalAmountIncTax': '合計金額（税込）',
}

const TENANT_TYPE_NAMES = {
  tenantLogo: '自社ロゴ',
  tenantCompanyName: '自社名',
  tenantAddress: '自社住所',
  tenantPhone: '自社電話',
  tenantRepresentative: '代表者',
  tenantCustom: 'テナントカスタム',
}

function nameElement(el) {
  // Already named
  if (el.name) return

  // Tenant elements
  if (TENANT_TYPE_NAMES[el.type]) {
    el.name = TENANT_TYPE_NAMES[el.type]
    return
  }

  // DataField with known fieldKey
  if (el.type === 'dataField' && el.fieldKey && FIELD_NAMES[el.fieldKey]) {
    el.name = FIELD_NAMES[el.fieldKey]
    return
  }

  // Text with content → use trimmed content as name
  if (el.type === 'text' && el.content) {
    const trimmed = el.content.replace(/\s+/g, ' ').trim()
    if (trimmed.length <= 20) {
      el.name = trimmed
    } else {
      el.name = trimmed.substring(0, 18) + '…'
    }
    return
  }

  // Shape → descriptive name based on shape type and position
  if (el.type === 'shape') {
    if (el.shape === 'line') {
      el.name = '区切り線'
    } else if (el.shape === 'rectangle') {
      if (el.fill && el.fill !== 'transparent') {
        el.name = '背景ボックス'
      } else {
        el.name = '枠線'
      }
    } else if (el.shape === 'circle') {
      el.name = '円'
    }
    return
  }

  // RepeatingBand
  if (el.type === 'repeatingBand') {
    el.name = '明細テーブル'
    return
  }

  // Image
  if (el.type === 'image') {
    el.name = '画像'
    return
  }

  // Hanko
  if (el.type === 'hanko') {
    el.name = '印鑑'
    return
  }

  // Chart
  if (el.type === 'chart') {
    el.name = 'グラフ'
    return
  }

  // Barcode
  if (el.type === 'barcode') {
    const fmt = el.barcodeFormat || el.format || ''
    el.name = fmt ? `バーコード（${fmt}）` : 'バーコード'
    return
  }

  // ManualEntry
  if (el.type === 'manualEntry') {
    el.name = '手入力欄'
    return
  }

  // EraSelect
  if (el.type === 'eraSelect') {
    el.name = '元号選択'
    return
  }

  // Checkbox
  if (el.type === 'checkbox') {
    el.name = 'チェックボックス'
    return
  }

  // DataField without known fieldKey
  if (el.type === 'dataField') {
    if (el.fieldKey) {
      // Use last segment of fieldKey
      const parts = el.fieldKey.split('.')
      el.name = parts[parts.length - 1]
    } else {
      el.name = 'データフィールド'
    }
  }
}

// ─── 各テンプレートに適用 ────────────────────────────────────

const files = [
  'quotation-modern.json',
  'purchase-order-modern.json',
  'invoice-modern.json',
  'quotation-basic-invoice.json',
  'quotation-discount-invoice.json',
  'quotation-english.json',
  'fuyou-kojo-r7.json',
  'element-showcase.json',
  'binding-editor-sample.json',
]

for (const filename of files) {
  const path = resolve(builtinDir, filename)
  const data = JSON.parse(readFileSync(path, 'utf-8'))

  let namedCount = 0
  for (const page of data.definition.pages) {
    for (const section of page.sections) {
      for (const el of section.elements) {
        const before = el.name
        nameElement(el)
        if (el.name && el.name !== before) namedCount++
      }
    }
  }

  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  const total = data.definition.pages.reduce(
    (sum, p) => sum + p.sections.reduce((s2, sec) => s2 + sec.elements.length, 0), 0
  )
  console.log(`✓ ${filename}: ${namedCount}/${total} elements named`)
}

console.log('\nDone.')
