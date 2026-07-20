/**
 * 残りのビルトインテンプレートにレイヤーグループを追加
 *
 * Usage: node scripts/add-layer-groups-remaining.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const builtinDir = resolve(__dirname, '../src/templates/builtin')

function gid() { return 'grp-' + randomUUID().substring(0, 8) }

function addGroups(filename, groupDefs, pageIndex = 0) {
  const path = resolve(builtinDir, filename)
  const data = JSON.parse(readFileSync(path, 'utf-8'))
  const page = data.definition.pages[pageIndex]
  const elements = page.sections[0].elements

  const groups = groupDefs.map(({ name, matcher }) => {
    const matched = elements.filter(matcher)
    return {
      id: gid(),
      name,
      elementIds: matched.map(el => el.id),
      collapsed: true,
    }
  }).filter(g => g.elementIds.length > 0) // Skip empty groups

  page.groups = groups

  const groupedIds = new Set(groups.flatMap(g => g.elementIds))
  const ungrouped = elements.filter(el => !groupedIds.has(el.id))
  if (ungrouped.length > 0) {
    console.warn(`  ⚠ ${filename}: ${ungrouped.length} ungrouped elements`)
  }

  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
  const summary = groups.map(g => g.name + ':' + g.elementIds.length).join(', ')
  console.log(`✓ ${filename}: ${groups.length} groups (${summary})`)
}

// ─── 見積書（インボイス対応）─────────────────────────────────

addGroups('quotation-basic-invoice.json', [
  { name: 'タイトル', matcher: el => el.position.y < 18 },
  { name: '書類情報', matcher: el => el.position.y >= 21 && el.position.y <= 38 && el.position.x >= 120 },
  { name: '宛先', matcher: el =>
    el.position.y >= 29 && el.position.y <= 58 && el.position.x < 110 &&
    !(el.position.y < 21)
  },
  { name: '差出人情報', matcher: el =>
    ((el.position.y >= 45 && el.position.x >= 120) ||
     (el.position.y >= 58 && el.position.x >= 120)) &&
    el.position.y <= 94
  },
  { name: '合計金額', matcher: el =>
    el.position.y >= 63 && el.position.y <= 76 && el.position.x < 110
  },
  { name: '明細テーブル', matcher: el =>
    el.position.y >= 77 && el.position.y <= 160
  },
  { name: '税額内訳', matcher: el =>
    el.position.y >= 161 && el.position.y <= 210
  },
  { name: '取引条件', matcher: el =>
    el.position.y >= 211 && el.position.y <= 255
  },
  { name: '備考', matcher: el =>
    el.position.y >= 256
  },
])

// ─── 見積書（値引対応・インボイス対応）──────────────────────

addGroups('quotation-discount-invoice.json', [
  { name: 'タイトル', matcher: el => el.position.y < 18 },
  { name: '書類情報', matcher: el => el.position.y >= 21 && el.position.y <= 38 && el.position.x >= 120 },
  { name: '宛先', matcher: el =>
    el.position.y >= 29 && el.position.y <= 58 && el.position.x < 110 &&
    !(el.position.y < 21)
  },
  { name: '差出人情報', matcher: el =>
    ((el.position.y >= 45 && el.position.x >= 120) ||
     (el.position.y >= 58 && el.position.x >= 120)) &&
    el.position.y <= 94
  },
  { name: '合計金額', matcher: el =>
    el.position.y >= 63 && el.position.y <= 76 && el.position.x < 110
  },
  { name: '明細テーブル', matcher: el =>
    el.position.y >= 77 && el.position.y <= 160
  },
  { name: '税額内訳', matcher: el =>
    el.position.y >= 161 && el.position.y <= 210
  },
  { name: '取引条件', matcher: el =>
    el.position.y >= 211 && el.position.y <= 255
  },
  { name: '備考', matcher: el =>
    el.position.y >= 256
  },
])

// ─── Quotation (English) ────────────────────────────────────

addGroups('quotation-english.json', [
  { name: 'Sender Info', matcher: el =>
    el.position.y < 36 && el.position.x < 100
  },
  { name: 'Document Info', matcher: el =>
    el.position.y >= 12 && el.position.y <= 40 && el.position.x >= 138
  },
  { name: 'Recipient', matcher: el =>
    el.position.y >= 44 && el.position.y <= 60 && el.position.x < 100
  },
  { name: 'Terms', matcher: el =>
    el.position.y >= 44 && el.position.y <= 60 && el.position.x >= 138
  },
  { name: 'Item Table', matcher: el =>
    el.position.y >= 70 && el.position.y <= 160
  },
  { name: 'Summary', matcher: el =>
    el.position.y >= 161
  },
])

// ─── 要素ショーケース ───────────────────────────────────────

addGroups('element-showcase.json', [
  { name: 'ヘッダー', matcher: el => el.position.y < 23 },
  { name: 'テキスト・データ', matcher: el =>
    el.position.y >= 25 && el.position.y < 80 && (el.type === 'text' || el.type === 'dataField')
  },
  { name: '画像・図形', matcher: el =>
    el.position.y >= 25 && el.position.y <= 80 && (el.type === 'image' || el.type === 'shape')
  },
  { name: 'グラフ', matcher: el => el.type === 'chart' },
  { name: 'バーコード', matcher: el => el.type === 'barcode' },
])

// ─── バインドエディタ検証用納品書 ────────────────────────────

addGroups('binding-editor-sample.json', [
  { name: 'タイトル', matcher: el => el.position.y <= 25 },
  { name: '書類情報', matcher: el => el.position.y >= 31 && el.position.y <= 37 },
  { name: '宛先・差出人', matcher: el => el.position.y >= 43 && el.position.y <= 75 },
  { name: '明細', matcher: el => el.position.y >= 83 && el.position.y <= 170 },
  { name: '集計', matcher: el => el.position.y >= 175 && el.position.y <= 200 },
  { name: 'その他', matcher: el => el.position.y >= 215 },
])

// ─── 不要小銃等除去通知書（様式第7号）────────────────────────

addGroups('fuyou-kojo-r7.json', [
  { name: 'ヘッダー・タイトル', matcher: el => el.position.y < 9 },
  { name: '基本情報（氏名・住所等）', matcher: el =>
    el.position.y >= 9 && el.position.y < 42
  },
  { name: '源泉控除対象配偶者', matcher: el =>
    el.position.y >= 42 && el.position.y < 62
  },
  { name: '控除対象扶養親族', matcher: el =>
    el.position.y >= 62 && el.position.y < 100
  },
  { name: '16歳未満の扶養親族', matcher: el =>
    el.position.y >= 100 && el.position.y < 140
  },
  { name: '障害者・寡婦・勤労学生', matcher: el =>
    el.position.y >= 140 && el.position.y < 180
  },
  { name: '住民税に関する事項', matcher: el =>
    el.position.y >= 180 && el.position.y < 220
  },
  { name: '退職手当等・注記', matcher: el =>
    el.position.y >= 220
  },
])

console.log('\nDone.')
