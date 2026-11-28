import { defineConfig } from 'vitest/config'
import { bundledLocales } from './scripts/bundled-locales'

// 前端（瀏覽器畫面）測試
export default defineConfig({
  plugins: [bundledLocales()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
