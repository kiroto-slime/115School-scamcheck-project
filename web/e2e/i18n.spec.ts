import { expect, test, type Page } from '@playwright/test'

// 多語言：網址前綴、記住選擇、第一次造訪判斷。只在桌面跑一次（版面檢查另外指定寬度）。
test.beforeEach(({}, info) => test.skip(info.project.name !== 'Desktop', '語言邏輯與裝置無關，只需驗證一次'))

const saved = (page: Page, lang: string) => page.addInitScript(l => {
  if (!sessionStorage.getItem('initDone')) { localStorage.setItem('interfaceLanguage', l); sessionStorage.setItem('initDone', '1') }
}, lang)
const main = (page: Page) => page.locator('main')

test.describe('語言網址', () => {
  test('/en/check 顯示英文，網址不變，站內連結帶 /en', async ({ page }) => {
    await page.goto('/en/check')
    await expect(main(page)).toContainText('Scam check')
    expect(new URL(page.url()).pathname).toBe('/en/check')
    await expect(page.locator('a[href="/en/history"]').first()).toBeAttached()
  })
  test('/EN/check 不分大小寫也顯示英文，網址列不改', async ({ page }) => {
    await page.goto('/EN/check')
    await expect(main(page)).toContainText('Scam check')
    expect(new URL(page.url()).pathname).toBe('/EN/check')
  })
  test('/en/不存在 顯示英文的找不到頁面', async ({ page }) => {
    await page.goto('/en/no-such-page')
    await expect(page.getByText('Page not found.')).toBeVisible()
  })
  test('/xx/check 與改前一樣顯示繁中的找不到頁面', async ({ page }) => {
    await page.goto('/xx/check')
    await expect(page.getByText('找不到頁面。')).toBeVisible()
  })
  test('原網址 /check 在已存日文時顯示日文，網址列不變', async ({ page }) => {
    await saved(page, 'ja')
    await page.goto('/check')
    await expect(main(page)).toContainText('詐欺チェック')
    expect(new URL(page.url()).pathname).toBe('/check')
  })
  test('從 /en/check 點到查核紀錄仍是英文', async ({ page }) => {
    await page.goto('/en/check')
    await page.locator('a[href="/en/history"]:visible').first().click()
    await expect(page).toHaveURL(/\/en\/history$/)
    await expect(main(page)).toContainText('Check history')
  })
  test('已存日文時打開 /en/check：顯示英文、不覆蓋日文；同分頁再開原網址仍是英文', async ({ page }) => {
    await saved(page, 'ja')
    await page.goto('/en/check')
    await expect(main(page)).toContainText('Scam check')
    expect(await page.evaluate(() => localStorage.getItem('interfaceLanguage'))).toBe('ja')
    await page.goto('/history')
    await expect(main(page)).toContainText('Check history')
  })
})

test.describe('第一次造訪自動判斷', () => {
  test.use({ locale: 'vi-VN' })
  test('越南文瀏覽器第一次打開顯示越南文；之後瀏覽器語言改變也不再切換', async ({ page, browser }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
    expect(await page.evaluate(() => localStorage.getItem('interfaceLanguage'))).toBe('vi')
    const state = await page.context().storageState()
    const later = await browser.newContext({ storageState: state, locale: 'en-US' })
    const again = await later.newPage()
    await again.goto('/')
    await expect(again.locator('html')).toHaveAttribute('lang', 'vi')
    await later.close()
  })
})

test('語言清單是「英文、中文（臺灣）」時照順序顯示英文', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'zh-TW'] }))
  await page.goto('/check')
  await expect(main(page)).toContainText('Scam check')
})

test('語言選單依序列出八種語言，原本四種在最前面', async ({ page }) => {
  await page.goto('/')
  const values = await page.locator('.language-dock select option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value))
  expect(values).toEqual(['zh-Hant', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans'])
})

test('八種語言的公開頁在手機 375px 與桌面都沒有水平捲動', async ({ page }) => {
  test.setTimeout(600_000)
  const paths = ['/', '/check', '/guides/parcel-message', '/research', '/products', '/game', '/chat', '/privacy']
  const prefixes = ['', '/en', '/ja', '/ko', '/vi', '/id', '/th', '/zh-hans']
  const overflow: string[] = []
  for (const [w, h] of [[375, 812], [1280, 800]]) {
    await page.setViewportSize({ width: w, height: h })
    for (const prefix of prefixes) for (const path of paths) {
      const url = prefix + (path === '/' && prefix ? '/' : path)
      await page.goto(url)
      await page.waitForLoadState('networkidle')
      const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      if (wide) overflow.push(`${w} ${url}`)
    }
  }
  expect(overflow).toEqual([])
})

test.describe('小遊戲跟著新語言', () => {
  for (const [lang, script] of [['th', /[฀-๿]/], ['zh-Hans', /开始/]] as const) {
    test(`${lang} 能開啟並顯示對應文字`, async ({ page }) => {
      await saved(page, lang)
      await page.goto('/games/block-parkour/index.html')
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      await expect(page.locator('body')).toContainText(script)
    })
  }
})

test('越南文語言檔下載不到：先用英文顯示並只提示一次，已存語言不變', async ({ page }) => {
  await saved(page, 'vi')
  await page.route(/\/(assets|src\/locales)\/vi[-.]/, route => route.abort())
  await page.goto('/check')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  const notice = page.getByRole('status').filter({ hasText: 'Showing English for now.' })
  await expect(notice).toContainText('Tiếng Việt will load next time.')
  await expect(notice).not.toContainText(/fail|error/i)
  await expect(notice.getByRole('button', { name: 'Use English' })).toBeVisible()
  await notice.getByRole('button', { name: 'Close' }).click()
  await page.reload()
  await expect(main(page)).toContainText('Scam check')
  await expect(page.getByRole('status').filter({ hasText: 'Showing English for now.' })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('interfaceLanguage'))).toBe('vi')
})

test('在 /vi/check 從選單改成日文，重新整理後仍是日文', async ({ page }) => {
  await page.goto('/vi/check')
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi')
  await page.locator('.language-dock select').selectOption('ja')
  await expect(main(page)).toContainText('詐欺チェック')
  await page.reload()
  await expect(main(page)).toContainText('詐欺チェック')
  expect(new URL(page.url()).pathname).toBe('/vi/check')
})

test('首頁主圖的通知文字在每種語言都留在卡片內', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const overflow: string[] = []
  for (const prefix of ['', '/en', '/ja', '/ko', '/vi', '/id', '/th', '/zh-hans']) {
    await page.goto(prefix + '/')
    await page.locator('.parcel-screen text').first().waitFor()
    const parts = await page.evaluate(() => {
      const g = document.querySelector('.parcel-screen g')!
      const width = (g.querySelector('rect') as SVGGraphicsElement).getBBox().width
      return [...g.querySelectorAll('text')].map(t => { const b = (t as SVGGraphicsElement).getBBox(); return { left: b.x, right: b.x + b.width, width } })
    })
    parts.forEach((p, i) => { if (p.left < 0 || p.right > p.width) overflow.push(`${prefix || '/'} 第 ${i + 1} 行 ${Math.round(p.left)}–${Math.round(p.right)}`) })
  }
  expect(overflow).toEqual([])
})
