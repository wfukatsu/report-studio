/**
 * ビルトインテンプレートにレイヤーグループを追加するスクリプト
 *
 * Usage: node scripts/add-layer-groups.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const builtinDir = resolve(__dirname, '../src/templates/builtin')

function gid() { return 'grp-' + randomUUID().substring(0, 8) }

function addGroups(filename, groupDefs) {
  const path = resolve(builtinDir, filename)
  const data = JSON.parse(readFileSync(path, 'utf-8'))
  const page = data.definition.pages[0]
  const elements = page.sections[0].elements

  const groups = groupDefs.map(({ name, matcher }) => {
    const matched = elements.filter(matcher)
    return {
      id: gid(),
      name,
      elementIds: matched.map(el => el.id),
      collapsed: true,
    }
  })

  page.groups = groups

  // Verify all elements are grouped
  const groupedIds = new Set(groups.flatMap(g => g.elementIds))
  const ungrouped = elements.filter(el => !groupedIds.has(el.id))
  if (ungrouped.length > 0) {
    console.warn(`  ⚠ ${filename}: ${ungrouped.length} ungrouped elements:`)
    ungrouped.forEach(el => console.warn(`    - ${el.type} y=${el.position.y} ${el.fieldKey || el.content?.substring(0, 20) || ''}`))
  }

  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`✓ ${filename}: ${groups.length} groups (${groups.map(g => g.name + ':' + g.elementIds.length).join(', ')})`)
}

// ─── 共通マッチャー ─────────────────────────────────────────

const isTenant = (el) => el.type.startsWith('tenant')
const isHeader = (el) => el.position.y < 20 && !isTenant(el)
const isTenantInfo = (el) => isTenant(el)

const isDocMeta = (el) =>
  el.position.y >= 29 && el.position.y <= 44 && el.position.x < 100 && !isTenant(el)

const isCustomer = (el) =>
  el.position.y >= 46 && el.position.y <= 67

const isTotalBanner = (el) =>
  el.position.y >= 69 && el.position.y <= 81

const isItemTable = (el) => el.type === 'repeatingBand'

const isTaxBreakdown = (el) =>
  el.position.y >= 163 && el.position.y <= 206 && el.position.x >= 120

const isNotes = (el) =>
  (el.content?.includes('備考') || (el.fieldKey === 'document.notes') ||
   (el.type === 'shape' && el.position.y >= 233 && el.position.x < 20))

// ─── 見積書（モダン）─────────────────────────────────────────

addGroups('quotation-modern.json', [
  { name: 'タイトル', matcher: isHeader },
  { name: '自社情報', matcher: isTenantInfo },
  { name: '書類情報', matcher: isDocMeta },
  { name: '宛先', matcher: isCustomer },
  { name: '合計金額', matcher: isTotalBanner },
  { name: '明細テーブル', matcher: isItemTable },
  { name: '税額内訳', matcher: isTaxBreakdown },
  { name: '取引条件', matcher: (el) =>
    el.position.y >= 210 && el.position.y <= 230 && !isNotes(el)
  },
  { name: '備考', matcher: (el) =>
    el.position.y >= 233
  },
])

// ─── 注文書 ──────────────────────────────────────────────────

addGroups('purchase-order-modern.json', [
  { name: 'タイトル', matcher: isHeader },
  { name: '自社情報', matcher: isTenantInfo },
  { name: '書類情報', matcher: isDocMeta },
  { name: '宛先', matcher: isCustomer },
  { name: '合計金額', matcher: isTotalBanner },
  { name: '明細テーブル', matcher: isItemTable },
  { name: '税額内訳', matcher: isTaxBreakdown },
  { name: '納品情報', matcher: (el) =>
    el.position.y >= 209 && el.position.y <= 235 &&
    !(el.type === 'shape' && el.position.y >= 242)
  },
  { name: '備考', matcher: (el) =>
    el.position.y >= 242
  },
])

// ─── 請求書 ──────────────────────────────────────────────────

addGroups('invoice-modern.json', [
  { name: 'タイトル', matcher: isHeader },
  { name: '自社情報', matcher: isTenantInfo },
  { name: '書類情報', matcher: isDocMeta },
  { name: '宛先', matcher: isCustomer },
  { name: '合計金額', matcher: isTotalBanner },
  { name: '明細テーブル', matcher: isItemTable },
  { name: '税額内訳', matcher: isTaxBreakdown },
  { name: 'お支払情報', matcher: (el) =>
    el.position.y >= 210 && el.position.y <= 215 &&
    (el.fieldKey?.startsWith('bankAccount.paymentDue') || el.content?.includes('お支払'))
  },
  { name: '振込先口座', matcher: (el) =>
    el.position.y >= 220 && el.position.y <= 256
  },
  { name: '備考', matcher: (el) =>
    el.position.y >= 259
  },
])

console.log('\nDone.')
