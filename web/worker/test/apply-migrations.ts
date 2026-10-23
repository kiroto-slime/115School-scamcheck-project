import { applyD1Migrations, env, reset } from 'cloudflare:test'
import { beforeEach } from 'vitest'

type Migrations = Parameters<typeof applyD1Migrations>[1]
const migrations = (env as unknown as { TEST_MIGRATIONS: Migrations }).TEST_MIGRATIONS

// 每個測試前清空資料庫並重新建立資料表，測試之間互不影響
beforeEach(async () => {
  await reset()
  await applyD1Migrations(env.DB, migrations)
})
