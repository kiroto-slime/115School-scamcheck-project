/** 管理員 API（全部需要登入，除了 /admin/login） */
import { Hono } from 'hono'
import { z } from 'zod'
import { AppEnv, checkPassword, createToken, rateLimit, readBody, requireAdmin } from '../auth'
import { clearDemo, seedDemo } from '../demo'
import { Gemini } from '../gemini'
import { aiMode, AppSettings, saveSettings } from '../settings'
import { computeStatistics, exportData } from '../stats'
import { audit, HttpError, newId, nowIso, parseJson } from '../util'

export const admin = new Hono<AppEnv>()

admin.post('/admin/login', async (c) => {
  await rateLimit(c, 'LOGIN_LIMITER')
  if (!c.env.ADMIN_PASSWORD) throw new HttpError(503, '管理員密碼尚未設定，請在 Cloudflare 後台的 Variables and Secrets 新增 ADMIN_PASSWORD。')
  const b = await readBody(c, z.object({ password: z.string().min(1).max(200) }))
  if (!(await checkPassword(c.env, b.password))) {
    await audit(c.env.DB, 'unknown', 'login_failed')
    throw new HttpError(401, '密碼錯誤。')
  }
  await audit(c.env.DB, 'admin', 'login')
  return c.json({ token: await createToken(c.env), expires_minutes: 120 })
})

const guarded = new Hono<AppEnv>()
guarded.use('*', requireAdmin)
const datasetOf = (c: { req: { query: (k: string) => string | undefined } }) => {
  const d = c.req.query('dataset') ?? 'formal'
  if (d !== 'formal' && d !== 'demo') throw new HttpError(422, '資料集只能是 formal 或 demo。')
  return d === 'demo'
}

guarded.get('/statistics', async (c) => c.json(await computeStatistics(c.env.DB, datasetOf(c))))

guarded.get('/export-data', async (c) => {
  const demo = datasetOf(c)
  const data = await exportData(c.env.DB, demo)
  await audit(c.env.DB, c.get('admin'), 'export', demo ? 'demo' : 'formal')
  return c.json(data)
})

/** 完整備份（JSON）：所有研究相關資料表，不含原始投稿 */
guarded.get('/backup.json', async (c) => {
  const tables = ['analysis_records', 'source_results', 'research_participants', 'research_responses', 'consent_records', 'pattern_dataset', 'research_cases',
    'feedback_records', 'product_survey_responses', 'business_events', 'app_settings', 'audit_logs']
  const out: Record<string, unknown[]> = {}
  for (const t of tables) out[t] = (await c.env.DB.prepare(`SELECT * FROM ${t}`).all()).results
  await audit(c.env.DB, c.get('admin'), 'backup')
  return c.json({ exported_at: nowIso(), version: c.env.APP_VERSION, tables: out }, 200, { 'Content-Disposition': `attachment; filename="scamcheck-backup-${nowIso().slice(0, 10)}.json"` })
})

guarded.get('/analysis-records', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM analysis_records WHERE is_demo = ? AND consent_research = 1 ORDER BY created_at DESC LIMIT 200').bind(datasetOf(c) ? 1 : 0)
    .all<{ analysis_id: string; research_id_nullable: string; created_at: string; media_type: string; risk_level: string; risk_score_nullable: number; risk_tags_json: string }>()).results
  return c.json(rows.map((a) => ({ analysis_id: a.analysis_id, research_id: a.research_id_nullable, created_at: a.created_at, media_type: a.media_type,
    risk_level: a.risk_level, risk_score: a.risk_score_nullable, risk_tags: parseJson(a.risk_tags_json, []) })))
})

guarded.get('/responses', async (c) => {
  const rows = (await c.env.DB.prepare('SELECT * FROM research_responses WHERE is_demo = ? ORDER BY created_at DESC LIMIT 200').bind(datasetOf(c) ? 1 : 0).all<Record<string, unknown>>()).results
  return c.json(rows.map((r) => ({ response_id: r.response_id, research_id: r.research_id, group: r.experiment_group, phase: r.phase, user_decision: r.user_decision,
    decision_reason_code: r.decision_reason_code, correctness: r.correctness === null ? null : Boolean(r.correctness), error_type: r.error_type,
    researcher_category: r.researcher_category, created_at: r.created_at })))
})

guarded.patch('/responses/:id', async (c) => {
  const b = await readBody(c, z.object({ researcher_category: z.enum(['ignored_link', 'trusted_authority', 'greed', 'fear', 'trusted_acquaintance', 'over_trust_system', 'over_suspicion', 'careless', 'other']).nullable() }))
  const r = await c.env.DB.prepare('UPDATE research_responses SET researcher_category = ? WHERE response_id = ?').bind(b.researcher_category, c.req.param('id')).run()
  if (!r.meta.changes) throw new HttpError(404, '找不到作答紀錄。')
  await audit(c.env.DB, c.get('admin'), 'update_researcher_category', c.req.param('id'), String(b.researcher_category))
  return c.json({ updated: true })
})

guarded.get('/cases', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM research_cases ORDER BY difficulty, case_id').all()).results))

guarded.post('/cases', async (c) => {
  const b = await readBody(c, z.object({
    title: z.string().min(1).max(120), simulated_content: z.string().min(5).max(2000), verified_label: z.enum(['scam', 'legit']),
    label_basis: z.string().min(1).max(1000), difficulty: z.enum(['easy', 'medium', 'hard']), category: z.string().min(1).max(60),
  }))
  const id = newId()
  await c.env.DB.prepare("INSERT INTO research_cases (case_id, title, simulated_content, verified_label, label_basis, difficulty, category, reviewer_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')")
    .bind(id, b.title, b.simulated_content, b.verified_label, b.label_basis, b.difficulty, b.category).run()
  await audit(c.env.DB, c.get('admin'), 'create_case', id)
  return c.json({ case_id: id })
})

guarded.patch('/cases/:id', async (c) => {
  const b = await readBody(c, z.object({ status: z.enum(['pending', 'approved', 'rejected']) }))
  const r = await c.env.DB.prepare('UPDATE research_cases SET reviewer_status = ? WHERE case_id = ?').bind(b.status, c.req.param('id')).run()
  if (!r.meta.changes) throw new HttpError(404, '找不到案例。')
  await audit(c.env.DB, c.get('admin'), 'review_case', c.req.param('id'), b.status)
  return c.json({ updated: true })
})

guarded.get('/patterns', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM pattern_dataset ORDER BY pattern_id').all()).results))

guarded.patch('/patterns/:id', async (c) => {
  const b = await readBody(c, z.object({ human_review_status: z.enum(['pending', 'approved', 'rejected']), verification_status: z.enum(['draft', 'verified', 'deprecated']).nullish() }))
  const r = await c.env.DB.prepare('UPDATE pattern_dataset SET human_review_status = ?, verification_status = COALESCE(?, verification_status) WHERE pattern_id = ?')
    .bind(b.human_review_status, b.verification_status ?? null, c.req.param('id')).run()
  if (!r.meta.changes) throw new HttpError(404, '找不到風險模式。')
  await audit(c.env.DB, c.get('admin'), 'review_pattern', c.req.param('id'), b.human_review_status)
  return c.json({ updated: true })
})

guarded.post('/business-events', async (c) => {
  const b = await readBody(c, z.object({ product: z.enum(['A', 'B', 'C']), event_type: z.enum(['actual_trial', 'actual_payment']), count: z.number().int().min(1).max(10_000), amount_twd: z.number().min(0).nullish() }))
  await c.env.DB.prepare('INSERT INTO business_events (event_id, product, event_type, count, amount_twd, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(newId(), b.product, b.event_type, b.count, b.amount_twd ?? null, c.get('settings').research_mode === 'formal' ? 0 : 1, nowIso()).run()
  await audit(c.env.DB, c.get('admin'), 'business_event', b.event_type)
  return c.json({ recorded: true })
})

/** 系統設定（取代 v0.1 的 config.env） */
guarded.get('/settings', (c) => c.json(c.get('settings')))

guarded.put('/settings', async (c) => {
  const b = await readBody(c, z.object({
    research_mode: z.enum(['simulation', 'formal']),
    research_group_mode: z.enum(['balanced', 'A', 'B']),
    research_collection_enabled: z.boolean(),
    gemini_model: z.string().regex(/^[a-z0-9][a-z0-9.\-]{2,60}$/),
    gemini_daily_limit: z.number().int().min(0).max(100_000),
    cofacts_daily_limit: z.number().int().min(0).max(100_000),
  }).partial())
  await saveSettings(c.env.DB, b as Partial<AppSettings>)
  await audit(c.env.DB, c.get('admin'), 'update_settings', null, JSON.stringify(b))
  return c.json({ updated: true })
})

guarded.post('/ai/test', async (c) => {
  const s = c.get('settings')
  if (aiMode(c.env) !== 'gemini') return c.json({ ok: false, model: s.gemini_model, message: '尚未設定 GEMINI_API_KEY（請在 Cloudflare 後台的 Variables and Secrets 新增）。' })
  const out = await new Gemini(c.env, s.gemini_model).testConnection()
  await audit(c.env.DB, c.get('admin'), 'ai_test', s.gemini_model, out.ok ? 'ok' : 'failed')
  return c.json(out)
})

guarded.post('/demo/seed', async (c) => {
  const out = await seedDemo(c.env.DB)
  await audit(c.env.DB, c.get('admin'), 'demo_seed', null, JSON.stringify(out))
  return c.json(out)
})

guarded.post('/demo/clear', async (c) => {
  const out = await clearDemo(c.env.DB)
  await audit(c.env.DB, c.get('admin'), 'demo_clear', null, JSON.stringify(out))
  return c.json(out)
})

guarded.get('/audit-logs', async (c) =>
  c.json((await c.env.DB.prepare('SELECT actor, action, target, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100').all()).results))

admin.route('/admin', guarded)
