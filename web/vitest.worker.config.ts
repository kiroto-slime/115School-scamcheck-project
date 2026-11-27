import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Worker 後端測試：在 Cloudflare 的 workerd 執行環境中跑，並自動套用 D1 migrations
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        // 測試不連 Cloudflare 遠端（Workers AI 綁定改用測試內的模擬物件），本機與部署前的自動測試都能離線執行
        remoteBindings: false,
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations, ADMIN_PASSWORD: 'test-admin-password-123' },
        },
      }),
    ],
    test: {
      include: ['worker/test/**/*.test.ts'],
      setupFiles: ['./worker/test/apply-migrations.ts'],
    },
  }
})
