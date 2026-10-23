/**
 * 識詐數據庫 Worker 入口：/api/* 由這裡處理，其他路徑由 Cloudflare 靜態資產（React 網頁）處理。
 */
import { Hono } from 'hono'
import { purgeExpired } from './analysis'
import type { AppEnv } from './auth'
import { GeminiError } from './gemini'
import { admin } from './routes/admin'
import { analyze } from './routes/analyze'
import { research } from './routes/research'
import { RULE_VERSION } from './rules'
import { aiMode, cofactsLive, getSettings, LIMITS } from './settings'
import { HttpError } from './util'

export const app = new Hono<AppEnv>().basePath('/api')

app.use('*', async (c, next) => {
  c.set('settings', await getSettings(c.env.DB))
  await next()
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
})

app.get('/health', (c) => {
  const s = c.get('settings')
  return c.json({
    status: 'ok',
    version: c.env.APP_VERSION,
    rule_version: RULE_VERSION,
    modes: {
      cofacts: cofactsLive(c.env) ? 'live' : 'mock',
      ai: aiMode(c.env),
      ai_model: aiMode(c.env) === 'gemini' ? s.gemini_model : null,
      research_mode: s.research_mode,
      research_collection_enabled: s.research_collection_enabled,
      admin_configured: Boolean(c.env.ADMIN_PASSWORD),
    },
    limits: { max_text_chars: LIMITS.maxTextChars, max_image_mb: LIMITS.maxImageMb, max_video_mb: LIMITS.maxVideoMb, max_video_seconds: LIMITS.maxVideoSeconds },
  })
})

app.route('/', analyze)
app.route('/', research)
app.route('/', admin)

app.notFound((c) => c.json({ detail: '找不到 API。' }, 404))
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ detail: err.message }, err.status as 400)
  if (err instanceof GeminiError) return c.json({ detail: err.message }, 502)
  console.error('unhandled error', err) // 不回傳內部細節給使用者
  return c.json({ detail: '伺服器發生錯誤，請稍後再試。' }, 500)
})

export default {
  fetch: app.fetch,
  // 每日排程：清除過期的暫存分析紀錄
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(getSettings(env.DB).then((s) => purgeExpired(env.DB, s)))
  },
} satisfies ExportedHandler<Env>
