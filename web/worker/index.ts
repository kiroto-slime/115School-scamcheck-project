/**
 * 識詐數據庫 Worker 入口：/api/* 由這裡處理，其他路徑由 Cloudflare 靜態資產（React 網頁）處理。
 */
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { purgeExpired } from './analysis'
import type { AppEnv } from './auth'
import { GeminiError } from './gemini'
import { admin } from './routes/admin'
import { analyze } from './routes/analyze'
import { research } from './routes/research'
import { game } from './routes/game'
import { opinions } from './routes/opinions'
import { RULE_VERSION } from './rules'
import { aiMode, cofactsMode, getSettings, googleMode, LIMITS, virusTotalMode } from './settings'
import { tw165Meta } from './urlcheck'
import { cleanupTw165Uploads } from './tw165-upload'
import { currentModel, modelStates, purgeOldCounters } from './aimodels'
import { serviceQuotas } from './quotas'
import { publicQuota, refreshQuota } from './quota-sync'
import { monitoringConfigured } from './google-monitoring'
import { HttpError } from './util'
export { TextCheck } from './text-check'

export const app = new Hono<AppEnv>().basePath('/api')

const formLimit = bodyLimit({ maxSize: 128 * 1024, onError: () => { throw new HttpError(413, '表單內容過大，請縮短後再送出。') } })
const imageLimit = bodyLimit({
  maxSize: Math.ceil(LIMITS.maxImageMb * 1024 * 1024 * 4 / 3) + 128 * 1024,
  onError: () => { throw new HttpError(413, '圖片過大，請縮小圖片後再送出。') },
})

app.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store')
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('Strict-Transport-Security', 'max-age=31536000')
  // 檔案串流、文字查核、名單分片及短心得，由各自的路由核對大小。
  const path = c.req.path
  if (path === '/api/analyze/image') return imageLimit(c, next)
  if (path === '/api/media/video' || path === '/api/analyze/text' || path === '/api/admin/tw165/shards' || path === '/api/result-opinions') return next()
  return formLimit(c, next)
})

app.use('*', async (c, next) => {
  c.set('settings', await getSettings(c.env.DB))
  await next()
})

app.get('/health', async (c) => {
  const s = c.get('settings')
  const tw165 = await tw165Meta(c.env)
  const models = aiMode(c.env) === 'gemini'
    ? await modelStates(c.env.DB, s.gemini_models.filter(m => /^[a-z0-9][a-z0-9.-]{2,60}$/.test(m.id)))
    : []
  const cur = currentModel(models)
  return c.json({
    status: 'ok',
    version: c.env.APP_VERSION,
    rule_version: RULE_VERSION,
    modes: {
      cofacts: cofactsMode(s),
      google: googleMode(c.env),
      virustotal: virusTotalMode(c.env),
      quotas: await serviceQuotas(c.env.DB, s),
      tw165: { available: tw165.available, origin: tw165.origin ?? null, updated_at: tw165.updated_at ?? null, count: tw165.count ?? 0 },
      ai: aiMode(c.env),
      ai_model: cur?.label ?? null,
      ai_models: models,
      ai_quota_sync: await publicQuota(c.env, models),
      research_mode: s.research_mode,
      research_collection_enabled: s.research_collection_enabled,
      consent_version: s.consent_version,
      content_retention_until: s.content_retention_until,
      admin_configured: Boolean(c.env.ADMIN_PASSWORD),
    },
    limits: { max_text_chars: LIMITS.maxTextChars, max_image_mb: LIMITS.maxImageMb, max_video_mb: LIMITS.maxVideoMb, max_video_seconds: LIMITS.maxVideoSeconds },
  })
})

app.route('/', analyze)
app.route('/', opinions)
app.route('/', game)
app.route('/', research)
app.route('/', admin)

app.notFound((c) => c.json({ detail: '找不到 API。' }, 404))
app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ detail: err.message }, err.status as 400)
  if (err instanceof GeminiError) return c.json({ detail: 'AI 服務暫時無法完成處理，請稍後再試。' }, 502)
  console.error('查核服務發生未預期錯誤') // 例外內容可能帶有查核文字或外部服務資訊
  return c.json({ detail: '伺服器發生錯誤，請稍後再試。' }, 500)
})

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    if (controller.cron === '*/5 * * * *') {
      if (monitoringConfigured(env)) {
        ctx.waitUntil(getSettings(env.DB).then(s => refreshQuota(env, s.gemini_models, 'auto')))
      }
      return
    }
    // 僅原有的每日排程處理資料保存期限。
    if (controller.cron !== '17 19 * * *') return
    ctx.waitUntil(Promise.all([
      env.DB.batch([
        env.DB.prepare("DELETE FROM text_jobs WHERE julianday(created_at) < julianday('now','-30 days')"),
        env.DB.prepare("DELETE FROM result_opinions WHERE keep_until < date('now','+8 hours')"),
        env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(Date.now()),
      ]),
      getSettings(env.DB).then((s) => purgeExpired(env.DB, s)),
      purgeOldCounters(env.DB),
      cleanupTw165Uploads(env),
    ]).catch(() => {
      // 使用固定事件名稱，方便維護者設定告警，也避免把資料庫訊息寫入日誌。
      throw new Error('scheduled_cleanup_failed')
    }))
  },
} satisfies ExportedHandler<Env>
