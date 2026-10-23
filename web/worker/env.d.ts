// 秘密值（在 Cloudflare 後台 Settings → Variables and Secrets 設定；本機放 .dev.vars）
interface Env {
  ADMIN_PASSWORD?: string
  GEMINI_API_KEY?: string
  // 選填：Google Cloud 金鑰（啟用 Safe Browsing API 與 Fact Check Tools API）
  GOOGLE_CLOUD_API_KEY?: string
  // 選填：VirusTotal 免費金鑰（每分鐘 4 次、每日 500 次）
  VIRUSTOTAL_API_KEY?: string
  // 選填：Cofacts 公開 API 不需要憑證，日後若 Cofacts 發給專屬憑證再填
  COFACTS_APP_ID?: string
  COFACTS_APP_SECRET?: string
}
