import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Worker 後端測試：在 Cloudflare 的 workerd 執行環境中跑，並自動套用 D1 migrations
export default defineConfig(async () => {
  const migrations = await readD1Migrations('./migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
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
