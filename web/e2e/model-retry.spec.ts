import { expect, test } from '@playwright/test'

test('自動查核跳過暫停的模型，手動可重試，取消 AI 後只送基本查核', async ({ page, isMobile, baseURL }) => {
  await page.setViewportSize(isMobile ? { width: 375, height: 812 } : { width: 1280, height: 900 })
  const localPage = new URL('/check', baseURL)
  expect(['localhost', '127.0.0.1']).toContain(localPage.hostname)
  const requestedModel = 'gemini-3.5-flash-lite'
  const exhaustedModel = 'gemini-3.6-flash'
  const paused = [
    'gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', requestedModel,
    'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it',
  ]
  const models = [...paused, exhaustedModel].map(id => ({
    id, label: id, daily: 20, remaining: id === exhaustedModel ? 0 : 10, media: !id.startsWith('gemma'),
    minute_left: 5, cooldown_seconds: 0, unavailable: id !== exhaustedModel,
  }))
  const receipt = { analysis_id: '1234567890abcdef1234567890abcdef', created_at: '2026-11-27T01:00:00Z', job_status: 'pending' }
  const submissions: { use_ai: boolean; ai_model?: string }[] = []
  await page.route('**/*', async route => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.origin !== localPage.origin) return route.abort()
    if (url.pathname === '/api/health') return route.fulfill({ json: { status: 'ok', modes: {
      ai: 'gemini', ai_model: null, ai_models: models, research_collection_enabled: false,
      ai_quota_sync: { models: [], unavailable_models: models.filter(m => m.unavailable).map(m => ({ media: m.media })), checked_at: null },
    } } })
    if (url.pathname === '/api/analyze/text') {
      expect(req.method()).toBe('POST')
      expect(req.headers().prefer).toBe('respond-async')
      submissions.push(req.postDataJSON())
      return route.fulfill({ status: 202, json: receipt })
    }
    if (url.pathname === '/api/analysis/' + receipt.analysis_id) return route.fulfill({ status: 202, json: receipt })
    if (url.pathname.startsWith('/api/')) return route.abort()
    return route.continue()
  })

  const model = page.getByRole('combobox', { name: '選擇 AI 模型' })
  const ai = page.getByRole('checkbox', { name: /使用 Gemini AI 分析/ })
  for (const mode of ['自動', '手動', '取消 AI'] as const) {
    const beforeSelection = submissions.length
    await page.goto(localPage.href)
    await page.getByLabel(/貼上可疑訊息/).fill('這是文字查核的本機測試資料')
    await page.locator('#service-settings > summary').click()
    await expect(model.locator(`option[value="${exhaustedModel}"]`)).toBeDisabled()
    await expect(model.locator(`option[value="${requestedModel}"]`)).toBeEnabled()
    if (mode === '自動') {
      await expect(ai).not.toBeChecked()
      await expect(ai).toBeDisabled()
    } else {
      await model.selectOption(requestedModel)
      await expect(ai).toBeEnabled()
      if (mode === '取消 AI') await ai.uncheck()
    }
    expect(submissions).toHaveLength(beforeSelection)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '開始查核' }).click()
    await expect(page.getByRole('dialog', { name: '已收到' })).toBeVisible()
    const submitted = submissions.at(-1)
    if (mode === '手動') expect(submitted).toMatchObject({ use_ai: true, ai_model: requestedModel })
    else expect(submitted?.use_ai).toBe(false)
  }
  expect(submissions).toHaveLength(3)
})
