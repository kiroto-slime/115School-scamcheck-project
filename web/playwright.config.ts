import { defineConfig, devices } from '@playwright/test'

// 使用 Windows 內建的 Microsoft Edge（channel: 'msedge'），不需另外下載瀏覽器。
// macOS / Linux 可改成 channel: 'chrome' 或執行 npx playwright install chromium。
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)

const mobile = (d: (typeof devices)[string]) => ({ ...d, browserName: 'chromium' as const, channel, defaultBrowserType: 'chromium' as const })

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'iPhone 13 (模擬)', use: mobile(devices['iPhone 13']) },
    { name: 'Pixel 7 (模擬)', use: mobile(devices['Pixel 7']) },
    { name: 'iPad (模擬)', use: mobile(devices['iPad (gen 7)']) },
    { name: 'Desktop', use: { ...devices['Desktop Edge'], channel } },
  ],
  // 本機跑 React 網頁 + Cloudflare Worker（含本機 D1）
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
