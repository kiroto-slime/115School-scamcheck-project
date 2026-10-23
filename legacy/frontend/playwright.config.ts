import { defineConfig, devices } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'

// 使用 Windows 內建的 Microsoft Edge（channel: 'msedge'），不需另外下載瀏覽器。
// macOS / Linux 可改成 channel: 'chrome' 或執行 npx playwright install chromium。
const channel = process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : undefined)
const py = process.platform === 'win32' ? path.join('.venv', 'Scripts', 'python') : '.venv/bin/python'
const e2eDb = path.join(os.tmpdir(), 'scamcheck_e2e.db').split(path.sep).join('/')

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
  webServer: [
    {
      command: `${py} -m uvicorn app.main:app --port 8000`,
      cwd: '../backend',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
      env: { DATABASE_URL: `sqlite:///${e2eDb}`, RATE_LIMIT_ANALYZE_PER_MINUTE: '200' },
    },
    { command: 'npx vite --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  ],
})
