import { expect, test } from '@playwright/test'

async function noHorizontalOverflow(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(1)
}

test('主要查核流程：輸入文字 → 結果頁', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '識詐數據庫', level: 1 })).toBeVisible()
  await noHorizontalOverflow(page)
  await page.getByRole('link', { name: '開始防詐查核' }).click()
  await page.getByLabel(/貼上可疑訊息/).fill('【物流通知】您的包裹地址錯誤，請於24小時內點擊 https://bit.ly/abc 更新資料並支付手續費。')
  // 不送 Cofacts：測試結果才不會受外部資料影響
  await page.locator('#service-settings > summary').click()
  await page.getByLabel(/送至 Cofacts/).uncheck()
  await page.getByRole('button', { name: '開始查核' }).click()
  await expect(page.getByRole('heading', { name: '查核結果', exact: true })).toBeVisible()
  await expect(page.getByText('風險等級：高').first()).toBeVisible()
  // 結論卡與建議行動直接顯示；詳細結果要點「查看完整分析」才展開
  await expect(page.getByText('建議你這樣做')).toBeVisible()
  await expect(page.getByText(/未查詢（使用者選擇不送出/)).toBeHidden()
  await page.getByText('查看完整分析').click()
  await expect(page.getByText(/未查詢（使用者選擇不送出/)).toBeVisible()
  await noHorizontalOverflow(page)
  await page.getByRole('button', { name: '有幫助' }).click()
  await expect(page.getByText('感謝回饋！')).toBeVisible()
})

test('研究測驗流程：同意 → 前測 → 輔助 → 後測', async ({ page }) => {
  await page.goto('/research')
  await page.getByLabel(/我自願將匿名作答資料/).check()
  await page.getByRole('button', { name: '同意並開始' }).click()
  for (const title of ['第一題', '第二題：先憑第一印象']) {
    await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible()
    await page.getByLabel('可能是詐騙').check()
    await page.getByLabel('主要判斷理由').selectOption('link')
    await page.getByRole('button', { name: '送出判斷' }).click()
  }
  await page.getByRole('button', { name: '我看完了，再判斷一次' }).click()
  await page.getByLabel('應該是正常訊息').check()
  await page.getByLabel('主要判斷理由').selectOption('system_hint')
  await page.getByRole('button', { name: '送出判斷' }).click()
  await expect(page.getByRole('heading', { name: /測驗完成/ })).toBeVisible()
  await noHorizontalOverflow(page)
})

test('導覽選單可用觸控操作（不依賴 hover）', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByRole('button', { name: '選單' })
  if (await menu.isVisible()) await menu.click() // 窄螢幕：漢堡選單；寬螢幕：左側導覽列
  await expect(page.locator('nav[aria-label="主選單"] a[href="/admin"]')).toHaveCount(0)
  await page.locator('nav[aria-label="主選單"]:visible').getByRole('link', { name: '隱私與說明' }).click()
  await expect(page.getByRole('heading', { name: '隱私與研究說明', level: 1 })).toBeVisible()
  // 寬螢幕：左側導覽列中目前頁面的選項有框起來（手機選單點完會自動收起）
  if (!(await menu.isVisible())) await expect(page.locator('aside').getByRole('link', { name: '隱私與說明' })).toHaveAttribute('aria-current', 'page')
  await noHorizontalOverflow(page)
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: '管理員登入', exact: true })).toBeVisible()
  await noHorizontalOverflow(page)
})

test('導覽列可常駐或自動隱藏，橫向遊戲取消左側占位', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'Desktop', '同一情境檢查桌面、375px與手機橫向')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/privacy')
  const panel = page.locator('#sidebar-panel')
  const content = page.locator('.content-column')
  await expect(panel).toBeVisible()
  const pinnedX = (await content.boundingBox())!.x
  expect(pinnedX).toBeGreaterThan(200)
  await page.getByRole('button', { name: '將導覽列設為自動隱藏', exact: true }).click()
  await expect(panel).toBeHidden()
  expect((await content.boundingBox())!.x).toBeLessThan(2)
  await page.locator('.sidebar-edge').hover()
  await expect(panel).toBeVisible()
  expect((await content.boundingBox())!.x).toBeLessThan(2)
  await page.mouse.move(900, 500)
  await expect(panel).toBeHidden()
  const handle = page.getByRole('button', { name: '展開左側導覽列', exact: true })
  await handle.click()
  await expect(panel).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(handle).toBeFocused()
  await handle.press('Enter')
  await expect(panel.getByRole('link', { name: '防詐查核', exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('link', { name: '查核紀錄', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: '將導覽列設為常駐', exact: true }).click()
  expect((await content.boundingBox())!.x).toBeGreaterThan(200)
  await noHorizontalOverflow(page)

  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/game')
  await expect(panel).toBeHidden()
  expect((await content.boundingBox())!.x).toBeLessThan(2)
  await handle.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1 })
  await handle.click()
  await expect(panel).toBeVisible()
  expect((await content.boundingBox())!.x).toBeLessThan(2)
  await page.getByRole('button', { name: '關閉左側導覽列', exact: true }).click({ position: { x: 600, y: 150 } })
  await expect(panel).toBeHidden()
  await noHorizontalOverflow(page)

  await page.setViewportSize({ width: 375, height: 812 })
  await page.reload()
  await page.getByRole('button', { name: '開啟選單', exact: true }).click()
  await expect(page.locator('.mobile-nav')).toBeVisible()
  await page.getByRole('button', { name: '將導覽列設為自動隱藏', exact: true }).click()
  await expect(page.locator('.mobile-nav')).toBeHidden()
  await handle.click()
  await expect(panel).toBeVisible()
  await panel.getByRole('link', { name: '查核紀錄', exact: true }).click()
  await expect(panel).toBeHidden()
  await noHorizontalOverflow(page)

  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } })
  try {
    const touchPage = await touchContext.newPage()
    await touchPage.goto(new URL('/game', page.url()).href)
    await expect(touchPage.locator('#sidebar-panel')).toBeHidden()
    await touchPage.getByRole('button', { name: '展開左側導覽列', exact: true }).tap()
    await expect(touchPage.locator('#sidebar-panel')).toBeVisible()
    expect((await touchPage.locator('.content-column').boundingBox())!.x).toBeLessThan(2)
    await touchPage.getByRole('button', { name: '關閉左側導覽列', exact: true }).tap({ position: { x: 600, y: 150 } })
    await expect(touchPage.locator('#sidebar-panel')).toBeHidden()
    await touchPage.setViewportSize({ width: 375, height: 812 })
    await expect(touchPage.getByRole('button', { name: '開啟選單', exact: true })).toBeVisible()
    await noHorizontalOverflow(touchPage)
  } finally { await touchContext.close() }
})

test('小方塊跑酷每百分讀後台題庫，作答與音效只存本機且手機可操作', async ({ page }, info) => {
  test.skip(info.project.name !== 'Desktop', '同一情境會直接檢查桌面與375px版面')
  for (const [path, type] of [['css/style.css', 'text/css'], ['css/ex.css', 'text/css'], ['js/ex.js', 'javascript']]) {
    const response = await page.request.get(`/games/block-parkour/${path}`)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toContain(type)
  }
  let reads = 0
  await page.route('**/api/game/question', async route => {
    expect(route.request().method()).toBe('GET'); reads++
    await route.fulfill({ json: { id: 'practice-test', question: '教學範例：驗證碼應如何處理？', options: ['交給陌生人', '不提供並查證'], correct_index: 1, explanation: '驗證碼應保密。' } })
  })
  await page.goto('/game')
  await expect(page.getByRole('heading', { name: '小方塊跑酷', exact: true })).toBeVisible()
  const brand = (await page.locator('.brand').boundingBox())!
  const toggle = (await page.locator('.sidebar-toggle').boundingBox())!
  expect(Math.abs(brand.y + brand.height / 2 - toggle.y - toggle.height / 2)).toBeLessThan(2)
  const game = page.frameLocator('iframe[title="小方塊跑酷遊戲"]')
  await game.getByRole('button', { name: '關閉音效', exact: true }).click()
  await expect(game.getByRole('button', { name: '開啟音效', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await game.locator('#ex-name').fill('測試玩家')
  await game.locator('#ex-start').click()
  await expect(game.locator('#ex-canvas')).toBeVisible()
  const frame = page.frames().find((f) => f.url().includes('/games/block-parkour/'))!
  expect(await frame.evaluate("localStorage.getItem('scamcheck-block-parkour-sound')")).toBe('off')
  expect(await frame.evaluate('Sfx.enabled')).toBe(false)
  await game.getByRole('button', { name: '開啟音效', exact: true }).click()
  expect(await frame.evaluate('Sfx.enabled')).toBe(true)
  const milestone = await frame.evaluate('Run.bonus = 100; Run.step(); ({level: Run.level, next: Run.nextLevel, paused: Run.paused})')
  expect(milestone).toEqual({ level: 2, next: 200, paused: 'quiz' })
  await expect(game.locator('#ex-quiz')).toBeVisible()
  await game.getByRole('button', { name: '不提供並查證', exact: true }).click()
  await expect(game.locator('#quiz-feedback')).toContainText('答對了')
  expect(await frame.evaluate("JSON.parse(localStorage.getItem('scamcheck-block-parkour-practice')).at(-1).correct")).toBe(true)
  await game.locator('#quiz-continue').click()
  const cleared = await frame.evaluate('Run.bonus = 1000; Run.step(); ({cleared: Run.hasCleared, running: Run.running, paused: Run.paused})')
  expect(cleared).toEqual({ cleared: true, running: true, paused: 'quiz' })
  await game.getByRole('button', { name: '交給陌生人', exact: true }).click()
  await expect(game.locator('#quiz-feedback')).toContainText('正確答案')
  await game.locator('#quiz-continue').click()
  expect(reads).toBe(2)
  await noHorizontalOverflow(page)
  await page.setViewportSize({ width: 375, height: 900 })
  await noHorizontalOverflow(page)
  await expect(game.locator('[data-control="left"]')).toBeVisible()
  await expect(game.locator('[data-control="right"]')).toBeVisible()
  await expect(game.locator('[data-control="jump"]')).toBeVisible()
  const mobileCanvas = (await game.locator('#ex-canvas').boundingBox())!
  const mobileControls = []
  for (const selector of ['[data-control="left"]', '[data-control="right"]', '[data-control="jump"]', '#pause-btn', '#rank-btn', '#sound-btn']) {
    const box = (await game.locator(selector).boundingBox())!
    if (selector.startsWith('[data-control')) {
      expect(box.width).toBeGreaterThanOrEqual(48)
      expect(box.height).toBeGreaterThanOrEqual(48)
      expect(box.width).toBeLessThanOrEqual(mobileCanvas.width * .2)
      expect(mobileCanvas.y + mobileCanvas.height - box.y - box.height).toBeGreaterThanOrEqual(mobileCanvas.height * 0.12)
    }
    mobileControls.push(box)
  }
  for (let i = 0; i < mobileControls.length; i++) for (let j = i + 1; j < mobileControls.length; j++) {
    const a = mobileControls[i], b = mobileControls[j]
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
  }
  if (await game.locator('#resume-btn').isVisible()) await game.locator('#resume-btn').click()
  await game.locator('[data-control="right"]').dispatchEvent('pointerdown', { pointerId: 10, pointerType: 'touch' })
  await game.locator('[data-control="jump"]').dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch' })
  expect(await frame.evaluate('({right: Keys.right, jump: Keys.jump})')).toEqual({ right: true, jump: true })
  await game.locator('[data-control="right"]').dispatchEvent('pointercancel', { pointerId: 10 })
  await game.locator('[data-control="jump"]').dispatchEvent('pointercancel', { pointerId: 11 })
  expect(await frame.evaluate('({right: Keys.right, jump: Keys.jump})')).toEqual({ right: false, jump: false })
  expect(await frame.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')).toBeLessThanOrEqual(1)
  await expect(game.locator('#ex-quiz')).toBeHidden()
  // 獨立遊戲在手機橫向時也要放大，控制鍵需在畫面內。
  await page.goto('/games/block-parkour/index.html')
  await page.setViewportSize({ width: 844, height: 390 })
  await page.locator('#ex-name').fill('橫向測試')
  await page.locator('#ex-start').click()
  const canvas = await page.locator('#ex-canvas').boundingBox()
  expect(canvas!.width).toBeGreaterThan(844 * 0.65)
  const controls = []
  for (const selector of ['[data-control="left"]', '[data-control="right"]', '[data-control="jump"]', '#pause-btn']) {
    const box = (await page.locator(selector).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(canvas!.x)
    expect(box.y).toBeGreaterThanOrEqual(canvas!.y)
    expect(box.x + box.width).toBeLessThanOrEqual(canvas!.x + canvas!.width + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(canvas!.y + canvas!.height + 1)
    expect(box.width).toBeGreaterThanOrEqual(48)
    expect(box.height).toBeGreaterThanOrEqual(48)
    if (selector.startsWith('[data-control')) {
      expect(box.width).toBeGreaterThanOrEqual(72)
      expect(box.height).toBeGreaterThanOrEqual(72)
      expect(canvas!.y + canvas!.height - box.y - box.height).toBeGreaterThanOrEqual(canvas!.height * 0.12)
    }
    controls.push(box)
  }
  const leftControl = (await page.locator('[data-control="left"]').boundingBox())!
  const jumpControl = (await page.locator('[data-control="jump"]').boundingBox())!
  expect(leftControl.x - canvas!.x).toBeGreaterThanOrEqual(canvas!.width * 0.07)
  expect(canvas!.x + canvas!.width - jumpControl.x - jumpControl.width).toBeGreaterThanOrEqual(canvas!.width * 0.07)
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j]
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
  }
  await noHorizontalOverflow(page)
})

test('閱讀工具不重疊、頂端固定且平順回到真正頂端', async ({ page }) => {
  await page.goto('/privacy')
  const font = page.getByRole('button', { name: '放大文字（大字模式）' })
  const top = page.getByRole('button', { name: '回到頁面頂端' })
  await expect(top).toBeHidden()
  const original = await font.boundingBox()
  await page.keyboard.press('Control+End')
  await expect(top).toBeVisible()
  await expect.poll(async () => {
    const upper = await font.boundingBox()
    const lower = await top.boundingBox()
    return lower!.y - upper!.y - upper!.height
  }).toBeCloseTo(10, 0)
  expect((await top.boundingBox())!.y).toBeCloseTo(original!.y, 0)
  expect(await page.locator('header').evaluate((el) => el.getBoundingClientRect().top)).toBe(0)
  await top.click()
  await expect(top).toBeHidden()
  expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1)
  await noHorizontalOverflow(page)
})

test('375px 與桌面：深淺色及大字下各分頁均可閱讀', async ({ page }, info) => {
  test.skip(info.project.name !== 'Desktop', '固定寬度的全站版面巡檢只需執行一次')
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/check')
    await page.getByRole('button', { name: '放大文字（大字模式）' }).click()
    for (const dark of [false, true]) {
      const currentlyDark = await page.locator('html').evaluate((el) => el.classList.contains('dark'))
      if (currentlyDark !== dark) await page.getByRole('button', { name: /切換成.*色模式/ }).click()
      for (const path of ['/', '/check', '/history', '/research', '/products', '/privacy', '/admin']) {
        await page.goto(path)
        await expect(page.locator('h1')).toBeVisible()
        if (path === '/check') {
          await page.locator('#service-settings > summary').click()
          await page.locator('#research-consent > summary').click()
        }
        await noHorizontalOverflow(page)
      }
    }
    await page.getByRole('button', { name: '恢復一般文字大小' }).click()
  }
})

test('桌面與大字模式能完整顯示目前的 AI 模型選項', async ({ page }, info) => {
  test.skip(info.project.name !== 'Desktop', '此情境檢查桌面模型選單寬度')
  await page.route('**/api/health', async (route) => {
    const response = await route.fetch()
    const health = await response.json()
    health.modes.ai = 'gemini'
    health.modes.ai_model = 'Gemini 3.8 Flash'
    health.modes.ai_models = [{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', remaining: 8, daily: 20, media: true, minute_left: 5, cooldown_seconds: 0 }]
    await route.fulfill({ response, json: health })
  })
  await page.goto('/check')
  await page.locator('#service-settings > summary').click()
  const model = page.getByLabel('選擇 AI 模型', { exact: true })
  await expect(model).toContainText('自動（目前 Gemini 3.8 Flash，剩 8 次）')
  for (const large of [false, true]) {
    if (large) await page.getByRole('button', { name: '放大文字（大字模式）' }).click()
    for (const width of [1280, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 })
      const fits = await model.evaluate((element) => {
        const select = element as HTMLSelectElement
        const context = document.createElement('canvas').getContext('2d')!
        context.font = getComputedStyle(select).font
        // 預留左右內距與原生下拉箭頭，文字本身必須完整容納。
        return context.measureText(select.selectedOptions[0].text).width + 40 <= select.clientWidth
      })
      expect(fits, `視窗 ${width}px，大字模式 ${large}`).toBe(true)
      await noHorizontalOverflow(page)
    }
  }
})

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

test('圖片上傳：瀏覽器縮圖後送出，沒有 AI 時改用補充文字', async ({ page }) => {
  await page.goto('/check')
  await page.getByRole('tab', { name: '圖片截圖' }).click()
  await page.locator('#file').setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: '開始查核' }).click()
  await expect(page.getByText(/請在「補充文字」輸入圖片中的文字/)).toBeVisible()
  await page.getByLabel(/補充文字/).fill('請立即匯款到指定帳戶，逾期將停權')
  await page.getByRole('button', { name: '開始查核' }).click()
  await expect(page.getByRole('heading', { name: '查核結果', exact: true })).toBeVisible()
  await expect(page.getByText('要求付款或匯款').first()).toBeVisible()
})
