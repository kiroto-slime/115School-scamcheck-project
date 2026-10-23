# 識詐數據庫

結合 Cofacts 公開查核資料、可解釋的規則分析與 Google Gemini AI，協助青少年判斷可疑訊息、截圖與短影片的詐騙風險，並以匿名研究了解「哪些詐騙特徵最容易被忽略」。三重商工資料處理科學生團隊的商業與管理群專題。

> 分析結果僅供參考，**不是司法認定或正式詐騙判決**；風險指數是規則加權分數，**不是詐騙機率**。

- **網站**：https://scamcheck.slimebvs.net （備用：https://scamcheck.slimebvs-scamcheck.workers.dev ）
- **架設**：Cloudflare 免費方案（Workers + D1），24 小時運作，不需要任何人的電腦開著
- **給使用者**：直接打開網址即可，手機、平板、電腦都能用
- **給管理員與接手同學**：維護與交接說明另行提供

## 功能

| 功能 | 說明 |
|---|---|
| 文字查核 | 10 類規則特徵 + Cofacts 比對（公開 API，可在管理頁關閉）+ Gemini 解釋（設定金鑰後） |
| 網址安全檢查 | 比對警政署 165 涉詐網站名單（約 11 萬個網域，管理頁可更新）；可選 Google 安全瀏覽、VirusTotal |
| AI 分析 | Google Gemini，多個免費模型輪替（額度用完自動換下一個，也可自選模型） |
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

## 資料來源

| 來源 | 用途 | 授權 |
|---|---|---|
| [Cofacts 真的假的](https://cofacts.tw) | 比對已查核的可疑訊息（網站即時查詢，不存在本專案） | CC BY-SA 4.0 |
| [警政署 165 反詐騙諮詢專線：遭停止解析涉詐網站](https://data.gov.tw/dataset/176455) | 涉詐網址比對（`web/snapshot/tw165.json.gz` 為整理後的備份） | 政府資料開放授權條款－第 1 版 |
| [警政署 165 反詐騙諮詢專線：假投資（博弈）網站](https://data.gov.tw/dataset/160055) | 涉詐網址比對 | 政府資料開放授權條款－第 1 版 |
| Google Gemini、Google 安全瀏覽、Google Fact Check Tools、VirusTotal | 選用的外部分析服務（需自行申請金鑰） | 依各服務條款 |

## 授權

Copyright (C) 2026 kiroto-slime

本專案以 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）授權：可以自由使用、修改與散布，但必須保留以上著作權聲明，且修改後的版本（包括架成網站提供他人使用）也必須以 AGPL-3.0 公開完整原始碼。資料來源依各自的授權條款使用。
