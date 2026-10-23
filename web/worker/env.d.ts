// 秘密值（在 Cloudflare 後台 Settings → Variables and Secrets 設定；本機放 .dev.vars）
interface Env {
  ADMIN_PASSWORD?: string
  GEMINI_API_KEY?: string
  COFACTS_APP_ID?: string
  COFACTS_APP_SECRET?: string
}
