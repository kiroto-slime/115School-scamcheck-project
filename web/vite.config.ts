import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { LOCAL_STATE_DIR } from './scripts/local-state.mjs'
import { searchPages } from './scripts/search-pages'
import { excelBrowser } from './scripts/excel-browser'

// `npm run dev` 會在本機同時跑 React 網頁與 Cloudflare Worker（含本機 D1 資料庫）
export default defineConfig({
  // remoteBindings: false：本機預覽不連 Cloudflare 遠端（Workers AI 只在正式站使用；本機呼叫備援時會自動略過）
  plugins: [react(), tailwindcss(), cloudflare({ persistState: { path: LOCAL_STATE_DIR }, remoteBindings: false }), searchPages(), excelBrowser()],
  build: { chunkSizeWarningLimit: 1200 }, // exceljs 只在管理頁匯出時才載入
  server: { port: 5173 },
})
