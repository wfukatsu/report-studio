/**
 * Playwright: 請求書テンプレート作成 → PDF エクスポートを動画で記録
 */
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const VIDEO_DIR = path.join(__dirname, '..', 'report-samples')

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
    locale: 'ja-JP',
  })
  const page = await context.newPage()

  const wait = (ms = 800) => page.waitForTimeout(ms)

  try {
    // ── 1. アプリを開く ──
    console.log('1. Opening app...')
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' })
    await wait(1500)

    // ── 2. テンプレートギャラリーを開く ──
    console.log('2. Opening template gallery...')
    // Debug: dump first toolbar buttons to find the right one
    const toolbarHtml = await page.locator('header button, [role="toolbar"] button, nav button').first().evaluate(
      el => el.parentElement?.innerHTML?.slice(0, 500) ?? 'not found'
    ).catch(() => 'not found')
    console.log('Toolbar HTML sample:', toolbarHtml.slice(0, 200))

    // Try multiple selectors for the "new" button
    const newBtn = page.getByRole('button', { name: '新規作成' })
      .or(page.locator('button[title="新規作成"]'))
      .or(page.locator('button[aria-label="新規作成"]'))
      .or(page.locator('button').filter({ has: page.locator('svg.lucide-file-plus') }))

    const btnCount = await newBtn.count()
    console.log(`Found ${btnCount} new-button candidates`)

    if (btnCount === 0) {
      // Fallback: click the first button in toolbar area (likely "new")
      console.log('Trying first toolbar button...')
      const allBtns = await page.locator('button').all()
      console.log(`Total buttons on page: ${allBtns.length}`)
      // Dump first 5 button titles
      for (let i = 0; i < Math.min(5, allBtns.length); i++) {
        const title = await allBtns[i].getAttribute('title').catch(() => null)
        const aria = await allBtns[i].getAttribute('aria-label').catch(() => null)
        const text = await allBtns[i].innerText().catch(() => '')
        console.log(`  btn[${i}]: title="${title}" aria="${aria}" text="${text}"`)
      }
    }

    await newBtn.first().click({ timeout: 5000 })
    await wait(1000)

    // ── 3. 見積書テンプレートを選択 ──
    console.log('3. Selecting quotation template...')
    // Debug: find template cards
    const modalHtml = await page.locator('.fixed.inset-0').evaluate(
      el => el.innerHTML.slice(0, 2000)
    ).catch(() => 'modal not found')
    console.log('Modal HTML (first 500):', modalHtml.slice(0, 500))

    // Try text-based click
    await page.getByText('見積書（インボイス対応）').first().click({ timeout: 5000 })
    await wait(800)

    // ── 4. 「作成」ボタンで確定（モーダル末尾の primary ボタン） ──
    console.log('4. Confirming template selection...')
    // The confirm button has bg-primary class and is inside the modal footer
    await page.locator('.fixed.inset-0 button.bg-primary').click({ timeout: 5000 })
    await wait(2000)

    // モーダルが閉じるのを待つ
    await page.locator('.fixed.inset-0').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    await wait(1000)

    await page.screenshot({ path: path.join(VIDEO_DIR, 'step1-template-loaded.png') })
    console.log('5. Template loaded!')

    // ── 5. キャンバス上の要素をクリックして選択 ──
    console.log('6. Selecting element on canvas...')
    const canvasArea = page.locator('[data-canvas="true"]').first()
    if (await canvasArea.isVisible({ timeout: 3000 }).catch(() => false)) {
      const box = await canvasArea.boundingBox()
      if (box) {
        // 見積書タイトル付近をクリック
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.08)
        await wait(1000)
      }
    }

    // ── 6. プロパティパネルが表示されていることを確認 ──
    await page.screenshot({ path: path.join(VIDEO_DIR, 'step2-element-selected.png') })
    await wait(500)

    // ── 7. テーブル要素をクリック ──
    console.log('7. Clicking on table area...')
    if (await canvasArea.isVisible().catch(() => false)) {
      const box = await canvasArea.boundingBox()
      if (box) {
        // テーブル付近（中央やや下）をクリック
        await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5)
        await wait(1000)
      }
    }
    await page.screenshot({ path: path.join(VIDEO_DIR, 'step3-table-clicked.png') })

    // ── 8. PDF エクスポート ──
    console.log('8. Exporting to PDF...')

    // PDF ボタンクリック — aria-label でも探す
    const pdfBtn = page.locator('button[title="全ページをPDFでエクスポート"]')
      .or(page.locator('button[aria-label="全ページをPDFでエクスポート"]'))

    // ダウンロード監視を開始
    const downloadPromise = page.waitForEvent('download', { timeout: 35000 }).catch(() => null)

    await pdfBtn.first().click({ timeout: 5000, force: true })
    console.log('9. Waiting for PDF generation...')
    await wait(3000)

    const download = await downloadPromise
    if (download) {
      const filename = download.suggestedFilename() || 'invoice-export.pdf'
      const savePath = path.join(VIDEO_DIR, filename)
      await download.saveAs(savePath)
      console.log(`PDF saved: ${savePath}`)
    } else {
      console.log('PDF download event not captured (blob URL download)')
    }

    await wait(1500)
    await page.screenshot({ path: path.join(VIDEO_DIR, 'step4-pdf-exported.png') })
    console.log('10. Export complete!')

    await wait(2000)
  } catch (err) {
    console.error('Error:', err.message)
    await page.screenshot({ path: path.join(VIDEO_DIR, 'error-screenshot.png') }).catch(() => {})
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }

  // List output files
  console.log('\n=== Output files ===')
  const fs = await import('fs')
  const files = fs.readdirSync(VIDEO_DIR)
  for (const f of files) {
    const stat = fs.statSync(path.join(VIDEO_DIR, f))
    console.log(`  ${f} (${(stat.size / 1024).toFixed(1)} KB)`)
  }
}

main().catch(console.error)
