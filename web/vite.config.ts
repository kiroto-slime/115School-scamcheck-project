import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { LOCAL_STATE_DIR } from './scripts/local-state.mjs'

// `npm run dev` 會在本機同時跑 React 網頁與 Cloudflare Worker（含本機 D1 資料庫）
export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare({ persistState: { path: LOCAL_STATE_DIR } })],
  build: { chunkSizeWarningLimit: 1200 }, // exceljs 只在管理頁匯出時才載入
  server: { port: 5173 },
})
