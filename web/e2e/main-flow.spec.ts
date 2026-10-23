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
  await page.getByLabel(/送至 Cofacts/).uncheck()
  await page.getByRole('button', { name: '開始查核' }).click()
  await expect(page.getByRole('heading', { name: '查核結果', exact: true })).toBeVisible()
  await expect(page.getByText('風險等級：高').first()).toBeVisible()
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
  if (await menu.isVisible()) await menu.click() // 窄螢幕才有選單按鈕
  await page.locator('#main-nav').getByRole('link', { name: '隱私與研究說明' }).click()
  await expect(page.getByRole('heading', { name: '隱私與研究說明', level: 1 })).toBeVisible()
  await noHorizontalOverflow(page)
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
