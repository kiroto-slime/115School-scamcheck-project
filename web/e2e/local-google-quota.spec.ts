import { expect, test } from '@playwright/test'

const localOrigin = 'http://localhost:5173'
const googleOrigin = 'https://monitoring.googleapis.com'
const readScope = 'https://www.googleapis.com/auth/monitoring.read'
const project = 'quota-browser-test'
const clientId = '123456-local-test.apps.googleusercontent.com'
const adminSession = 'example-admin-session'
const googleToken = 'example-google-access-token'

test('本機管理員按立即更新取得同一模型的用量，Google 唯讀憑證只送給監控 API', async ({ context, page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 375, height: 812 } : { width: 1280, height: 900 })
  await page.clock.setFixedTime(new Date('2026-11-26T18:20:00Z'))

  const authorizedQueries: string[] = []
  const unexpectedTransfers: string[] = []
  const adminWrites: string[] = []
  const denied = new Set<string>()
  const upstreamDetail = 'private-test-detail'
  let sensitiveLog = false
  page.on('console', message => {
    if (message.text().includes(googleToken) || message.text().includes(upstreamDetail)) sensitiveLog = true
  })
  await context.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const headers = await request.allHeaders()
    const target = url.origin + url.pathname
    const monitoringQuery = url.origin === googleOrigin && url.pathname === `/v3/projects/${project}/timeSeries`
    if ((request.postData() ?? '').includes(googleToken) || url.href.includes(googleToken) ||
        Object.entries(headers).some(([key, value]) => value.includes(googleToken) &&
          !(monitoringQuery && key === 'authorization' && value === `Bearer ${googleToken}`))) {
      unexpectedTransfers.push(target)
    }

    if (target === 'https://accounts.google.com/gsi/client') {
      // 在隔離的瀏覽器內模擬 Google 官方元件，測試不會開啟真實帳號登入畫面。
      return route.fulfill({ contentType: 'text/javascript', body: `
        window.google = { accounts: { oauth2: { initTokenClient(config) {
          return { requestAccessToken() {
            if (!navigator.userActivation.isActive || config.client_id !== ${JSON.stringify(clientId)} ||
                config.scope !== ${JSON.stringify(readScope)} || config.include_granted_scopes !== false) {
              config.callback({ error: 'invalid_scope' });
              return;
            }
            config.callback({ access_token: ${JSON.stringify(googleToken)}, token_type: 'Bearer', scope: config.scope });
          } };
        } } } };
      ` })
    }

    if (monitoringQuery) {
      const cors = { 'Access-Control-Allow-Origin': localOrigin, 'Access-Control-Allow-Headers': 'authorization', 'Access-Control-Allow-Methods': 'GET' }
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
      expect(request.method()).toBe('GET')
      expect(headers.authorization).toBe(`Bearer ${googleToken}`)
      const filter = url.searchParams.get('filter') ?? ''
      expect(filter).toContain('GenerateRequestsPerDayPerProjectPerModel-FreeTier')
      const kind = filter.match(/generate_content_free_tier_requests\/(usage|limit)"/)?.[1]
      expect(kind).toBeDefined()
      authorizedQueries.push(kind!)
      if (denied.has(kind!)) return route.fulfill({ status: 403, headers: cors, json: { error: {
        message: upstreamDetail,
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'BILLING_DISABLED' }],
      } } })
      const endTime = url.searchParams.get('interval.endTime')
      return route.fulfill({ headers: cors, json: { timeSeries: [{
        metric: { labels: { model: 'gemini-3-flash', method: '' } },
        points: [{ interval: { endTime }, value: { int64Value: kind === 'usage' ? '7' : '20' } }],
      }] } })
    }

    if (url.origin !== localOrigin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    if (url.pathname === '/api/admin/login') {
      expect(request.method()).toBe('POST')
      expect(request.postDataJSON()).toEqual({ password: '本機瀏覽器測試' })
      return route.fulfill({ json: { token: adminSession } })
    }
    if (url.pathname.startsWith('/api/admin/')) {
      expect(headers.authorization).toBe(`Bearer ${adminSession}`)
      if (request.method() !== 'GET') adminWrites.push(url.pathname)
    }
    if (url.pathname === '/api/admin/ai/quota') return route.fulfill({ json: { configured: false, models: [], status: 'pending' } })
    if (url.pathname === '/api/admin/statistics') return route.fulfill({ json: { source_check: {}, judgement: {}, feedback: {}, groups: {}, risk_tag_counts: {} } })
    if (url.pathname === '/api/health') return route.fulfill({ json: { status: 'ok', modes: { ai: 'disabled', research_mode: 'simulation' } } })
    return route.fulfill({ contentType: 'application/json', body: 'null' })
  })

  await page.goto(`${localOrigin}/admin`)
  await page.getByLabel('密碼', { exact: true }).fill('本機瀏覽器測試')
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.getByRole('tab', { name: '系統設定' }).click()
  const projectField = page.getByLabel('Google Cloud 專案 ID')
  const clientField = page.getByLabel('網頁用戶端 ID')
  const refresh = page.getByRole('button', { name: '立即更新', exact: true })
  await projectField.fill('')
  await clientField.fill('')
  await expect(refresh).toBeDisabled()
  await expect(page.getByText('請填入專案 ID 和結尾為', { exact: false })).toBeVisible()
  await projectField.fill(project)
  await expect(refresh).toBeDisabled()
  await clientField.fill(clientId)
  await refresh.click()

  const result = page.getByRole('definition').filter({ hasText: '已用 7 次' })
  await expect(page.getByRole('term').filter({ hasText: /^gemini-3-flash$/ })).toBeVisible()
  await expect(result).toContainText('上限 20 次')
  await expect(result).toContainText('剩餘 13 次')
  await expect(page.getByText('配額日 2026-11-26', { exact: false })).toBeVisible()

  await test.step('只有每日上限被拒絕時保留今天的已用次數', async () => {
    denied.add('limit')
    await refresh.click()
    await expect(page.getByRole('status').filter({ hasText: /每日上限.*帳單/ })).toBeVisible()
    await expect(result).toContainText('上限 尚無確定數字')
    await expect(result).toContainText('剩餘 尚無確定數字')
  })
  await test.step('只有已用次數被拒絕時保留每日上限', async () => {
    denied.delete('limit')
    denied.add('usage')
    await refresh.click()
    await expect(page.getByRole('status').filter({ hasText: /今日已用.*帳單/ })).toBeVisible()
    const row = page.getByRole('definition').filter({ hasText: '上限 20 次' })
    await expect(row).toContainText('已用 尚無確定數字')
    await expect(row).toContainText('剩餘 尚無確定數字')
  })
  await test.step('兩項均被拒絕時逐項提示並移除舊次數', async () => {
    denied.add('limit')
    await refresh.click()
    await expect(page.getByRole('status').filter({ hasText: /今日已用/ })).toContainText('每日上限')
    await expect(page.getByRole('term').filter({ hasText: 'gemini-3-flash' })).toHaveCount(0)
    await expect(page.getByText('資料截至', { exact: false })).toHaveCount(0)
  })
  expect(authorizedQueries.filter(kind => kind === 'usage')).toHaveLength(4)
  expect(authorizedQueries.filter(kind => kind === 'limit')).toHaveLength(4)
  await expect(page.getByText(upstreamDetail)).toHaveCount(0)
  expect(sensitiveLog).toBe(false)
  expect(unexpectedTransfers).toEqual([])
  expect(adminWrites).toEqual([])
  const stored = await page.evaluate(token => [localStorage, sessionStorage].some(storage =>
    Object.keys(storage).some(key => key.includes(token) || (storage.getItem(key) ?? '').includes(token))), googleToken)
  expect(stored).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
