import { defineConfig } from 'vitest/config'

// 前端（瀏覽器畫面）測試
export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
