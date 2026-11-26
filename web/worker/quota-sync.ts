import { googleDay, type ModelConf, type ModelState } from './aimodels'
import { monitoringConfigured, readGoogleQuota } from './google-monitoring'
import { HttpError, parseJson } from './util'

const minute = 60_000
const projectId = (env: Env) => env.GOOGLE_MONITORING_PROJECT_ID?.trim() ?? ''
type Outcome = 'pending' | 'ok' | 'partial' | 'error'
type SnapshotModel = { id: string; limit: number; used: number; as_of: string; local_at_cutoff: number }
type Row = {
  interval_minutes: number; auto_enabled: number; approved_project: string | null
  checked_at: number | null; attempted_at: number | null; outcome: Outcome
  snapshot_day: string | null; snapshot_project: string | null; models_json: string
}

const load = (db: D1Database) => db.prepare('SELECT * FROM ai_quota_sync WHERE id=1').first<Row>()
const iso = (time: number | null) => time === null ? null : new Date(time).toISOString()

function storedModels(row: Row, env: Env) {
  return row.snapshot_project === projectId(env) ? parseJson<SnapshotModel[]>(row.models_json, []) : []
}

function fresh(row: Row, sample: SnapshotModel, now: Date) {
  const age = now.getTime() - Date.parse(sample.as_of)
  // 每五分鐘檢查排程一次，監控讀值本身也有數分鐘的延遲。
  return row.snapshot_day === googleDay(now) && age >= 0 && age <= (row.interval_minutes + 15) * minute
}

export async function adminQuota(env: Env, models: ModelConf[], now = new Date()) {
  const row = (await load(env.DB))!
  const configured = monitoringConfigured(env)
  const samples = storedModels(row, env).filter(m => models.some(conf => conf.id === m.id))
  return {
    configured, interval_minutes: row.interval_minutes,
    auto_enabled: Boolean(row.auto_enabled && row.approved_project === projectId(env)),
    checked_at: row.snapshot_project === projectId(env) ? iso(row.checked_at) : null,
    attempted_at: iso(row.attempted_at), status: row.outcome,
    can_enable: configured && samples.some(m => fresh(row, m, now)),
    models: samples.map(({ id, limit, used, as_of }) => ({ id, limit, used, as_of })),
  }
}

export async function saveQuotaSchedule(env: Env, models: ModelConf[], interval: number, enabled: boolean, now = new Date()) {
  if (enabled) {
    const status = await adminQuota(env, models, now)
    if (!status.configured || (!status.can_enable && !status.auto_enabled)) {
      throw new HttpError(409, '請先設定監控授權，按「立即更新」取得當日讀值，核對後再選擇間隔。')
    }
  }
  await env.DB.prepare('UPDATE ai_quota_sync SET interval_minutes=?, auto_enabled=?, approved_project=?, next_due=? WHERE id=1')
    .bind(interval, Number(enabled), enabled ? projectId(env) : null, now.getTime() + interval * minute).run()
  return adminQuota(env, models, now)
}

/** 只在成功取得監控資料時計算基準。分鐘計數可能包含限流嘗試，因此只當作保守估計。 */
async function captureModels(db: D1Database, configs: ModelConf[], data: Awaited<ReturnType<typeof readGoogleQuota>>, now: Date) {
  const stamp = Math.min(...Object.values(data.models).map(m => Date.parse(m.asOf)))
  if (!Number.isFinite(stamp)) return []
  const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16).replace(':', '')
  // 多涵蓋下一分鐘，避免讀取時剛好換分鐘；統一在同一個 SQL 快照讀每日與分鐘計數。
  const start = hhmm(stamp), end = hhmm(now.getTime() + minute)
  const where = start <= end ? 'substr(name,-4) BETWEEN ? AND ?' : '(substr(name,-4) >= ? OR substr(name,-4) <= ?)'
  const local = await db.prepare("SELECT name, count FROM usage_counters WHERE day=? AND (name GLOB 'gemini:*' OR (name GLOB 'gemini_rpm:*' AND " + where + '))')
    .bind(data.day, start, end).all<{ name: string; count: number }>()
  return configs.flatMap(m => {
    const sample = data.models[m.id]
    if (!sample) return []
    // 每個模型使用同一次監控查詢的截止時間。
    const prefix = 'gemini_rpm:' + m.id + ':'
    const after = local.results.reduce((n, r) => n + (r.name.startsWith(prefix) ? r.count : 0), 0)
    const localUsed = local.results.find(r => r.name === 'gemini:' + m.id)?.count ?? 0
    return [{ id: m.id, limit: sample.limit, used: sample.used, as_of: sample.asOf,
      local_at_cutoff: Math.max(0, Math.min(m.daily, localUsed) - after) }]
  })
}

/** 管理員和排程共用租約。Worker 中途停止時，下次更新可在租約到期後接手。 */
export async function refreshQuota(env: Env, configs: ModelConf[], mode: 'manual' | 'auto', now = new Date(), reader = readGoogleQuota) {
  if (!monitoringConfigured(env)) {
    if (mode === 'auto') return
    throw new HttpError(503, '請先在 Worker 設定 Google 監控授權，再按立即更新。')
  }
  const time = now.getTime()
  const project = projectId(env)
  const lease = crypto.randomUUID()
  const due = mode === 'auto' ? 'AND auto_enabled=1 AND approved_project=? AND next_due<=?' : ''
  const args = mode === 'auto' ? [project, time] : []
  const row = await env.DB.prepare(`UPDATE ai_quota_sync SET lease_id=?, lease_until=?, attempted_at=?,
    next_due=?+interval_minutes*60000 WHERE id=1 AND lease_until<=?
    AND (attempted_at IS NULL OR attempted_at<=?) ${due} RETURNING *`)
    .bind(lease, time + 90_000, time, Math.floor(time / minute) * minute, time, time - 30_000, ...args).first<Row>()
  if (!row) {
    if (mode === 'auto') return
    throw new HttpError(429, '剛查詢過或正在更新，請稍等半分鐘再試。')
  }
  try {
    const started = Date.now()
    const data = await reader(env, configs.map(m => m.id), now)
    const capturedAt = new Date(time + Math.max(0, Date.now() - started))
    const incoming = await captureModels(env.DB, configs, data, capturedAt)
    const outcome: Outcome = incoming.length === configs.length && incoming.length ? 'ok' : 'partial'
    if (incoming.length) {
      const previous = row.snapshot_day === data.day ? storedModels(row, env) : []
      const samples = new Map(previous.map(m => [m.id, m]))
      for (const m of incoming) samples.set(m.id, m)
      await env.DB.prepare(`UPDATE ai_quota_sync SET snapshot_project=?, snapshot_day=?, models_json=?, checked_at=?,
        outcome=?, lease_id=NULL, lease_until=0 WHERE id=1 AND lease_id=?`)
        .bind(project, data.day, JSON.stringify([...samples.values()]), time, outcome, lease).run()
    } else {
      await env.DB.prepare("UPDATE ai_quota_sync SET outcome='partial', lease_id=NULL, lease_until=0 WHERE id=1 AND lease_id=?").bind(lease).run()
    }
  } catch {
    await env.DB.prepare("UPDATE ai_quota_sync SET outcome='error', lease_id=NULL, lease_until=0 WHERE id=1 AND lease_id=?").bind(lease).run()
  }
}

export async function publicQuota(env: Env, states: ModelState[], now = new Date()) {
  const result = { models: [] as { id: string; daily_limit_reached: boolean; as_of: string; estimated_remaining: number }[],
    unavailable_models: states.filter(m => m.unavailable).map(m => ({ media: m.media })), checked_at: null as string | null }
  if (!states.length || !monitoringConfigured(env)) return result
  // 監控快照為選用資料。即使剛部署、尚無快照，其他查核服務仍可取得狀態。
  const row = await load(env.DB).catch(() => null)
  if (!row) return result
  const samples = storedModels(row, env)
  if (!Array.isArray(samples)) return result
  for (const m of samples) {
    if (!m || !Number.isFinite(m.used) || !Number.isFinite(m.limit) || !Number.isFinite(m.local_at_cutoff)) continue
    const state = states.find(s => s.id === m.id && !s.unavailable)
    if (!state || !fresh(row, m, now)) continue
    const sinceCutoff = Math.max(0, state.daily - state.remaining - m.local_at_cutoff)
    result.models.push({ id: m.id, daily_limit_reached: m.limit > 0 && m.used >= m.limit, as_of: m.as_of,
      estimated_remaining: Math.max(0, Math.min(state.remaining, m.limit - m.used - sinceCutoff)) })
  }
  if (result.models.length) result.checked_at = iso(row.checked_at)
  return result
}
