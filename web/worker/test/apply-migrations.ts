import { applyD1Migrations, env, reset } from 'cloudflare:test'
import { beforeEach, vi } from 'vitest'

type Migrations = Parameters<typeof applyD1Migrations>[1]
const migrations = (env as unknown as { TEST_MIGRATIONS: Migrations }).TEST_MIGRATIONS

// 每個測試前清空資料庫並重新建立資料表，測試之間互不影響
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, migrations)
  // 測試不連外網：Cofacts 預設回「查無資料」，其他外部請求一律失敗（個別測試可再自行 mock）
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith('https://api.cofacts.tw/')) return new Response(JSON.stringify({ data: { ListArticles: { edges: [] } } }))
    throw new Error(`測試中不可連線外部網址：${url}`)
  })
})
