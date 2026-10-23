# 識詐數據庫

結合 Cofacts 公開查核資料、可解釋的規則分析與 Google Gemini AI，協助青少年判斷可疑訊息、截圖與短影片的詐騙風險，並以匿名研究了解「哪些詐騙特徵最容易被忽略」。三重商工資料處理科學生團隊的商業與管理群專題。

> 分析結果僅供參考，**不是司法認定或正式詐騙判決**；風險指數是規則加權分數，**不是詐騙機率**。

- **網站**：https://scamcheck.slimebvs-scamcheck.workers.dev
- **架設**：Cloudflare 免費方案（Workers + D1），24 小時運作，不需要任何人的電腦開著
- **給使用者**：直接打開網址即可，手機、平板、電腦都能用
- **給管理員與接手同學**：維護與交接說明另行提供

## 功能

| 功能 | 說明 |
|---|---|
| 文字查核 | 10 類規則特徵 + Cofacts 比對（公開 API，可在管理頁關閉）+ Gemini 解釋（設定金鑰後） |
| 圖片、短影片 | 交給 Gemini 讀圖、看影片（含聲音）；沒有 AI 時可手動輸入文字 |
| 研究測驗 | 同意 → 前測 → 輔助（A 一般資訊／B 網站解釋）→ 後測，匿名研究編號 |
| 隱私 | 不存原文；可撤回同意、刪除研究資料；未同意者的結果 24 小時後自動刪除 |
| 管理後台 | 統計、案例與風險模式審核、研究者分類、商業指標、Excel 匯出、完整備份、系統設定、DEMO 資料 |

## 專案結構

```
web/                 網站（前端 React + 後端 Cloudflare Worker）
  src/               前端頁面
  worker/            後端 API 與測試
  migrations/        D1 資料庫結構
  e2e/               跨裝置瀏覽器測試
legacy/              v0.1 Python／Windows 可攜版（已凍結，不再更新）
```

## 開發

需要 Node.js 20 以上。

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test           # 前端 + Worker 單元測試
npm run test:e2e   # iPhone / Pixel / iPad / 桌面 瀏覽器測試
```

本機要測管理頁：把 `web/.dev.vars.example` 複製成 `web/.dev.vars` 並填入 `ADMIN_PASSWORD`。

修改後推送到 GitHub `main`，Cloudflare 會自動測試、建置並部署；測試沒過不會上線。
