/**
 * Gemini 多模型輪替：依「系統設定」的順序使用，一個模型今天的額度用完就自動換下一個。
 * - 次數以美國太平洋時間的日期計算（和 Google 免費額度的重置時間一致）。
 * - Google 回報「每日額度用完」→ 該模型今天標記為用完；「每分鐘額度」→ 這次先換下一個。
 * - Google 明確指出指定模型不存在或不支援這個 API 時，自動模式今天先跳過該模型。
 */
import { AIMedia, AIResult, Gemini, GeminiError } from './gemini'
import type { AppSettings } from './settings'
import { publicQuota } from './quota-sync'
import { googleDay, takeDailyQuota } from './util'

export { googleDay } from './util'

export interface ModelConf {
  id: string
  /** 每日次數（Google 免費額度 RPD） */
  daily: number
  /** 每分鐘次數（RPM） */
  rpm: number
  /** 能不能分析圖片與影片 */
  media: boolean
}

export const DEFAULT_MODELS: ModelConf[] = [
  { id: 'gemini-3.8-flash', daily: 20, rpm: 5, media: true },
  { id: 'gemini-3.6-flash', daily: 20, rpm: 5, media: true },
  { id: 'gemini-3-flash-preview', daily: 20, rpm: 5, media: true },
  { id: 'gemini-2.5-flash', daily: 20, rpm: 5, media: true },
  { id: 'gemini-3.5-flash-lite', daily: 500, rpm: 15, media: true },
  { id: 'gemini-3.1-flash-lite', daily: 500, rpm: 15, media: true },
  { id: 'gemini-2.5-flash-lite', daily: 20, rpm: 10, media: true },
  { id: 'gemma-4-31b-it', daily: 14400, rpm: 30, media: false },
  { id: 'gemma-4-26b-a4b-it', daily: 14400, rpm: 30, media: false },
]

/** gemini-3.5-flash-lite → Gemini 3.5 Flash Lite */
export function modelLabel(id: string): string {
  return id
    .replace(/-it$/, '')
    .replace(/-preview$/, '')
    .replace(/-a\d+b$/, '')
    .split('-')
    .map((w) => (/^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

const usedKey = (id: string) => `gemini:${id}`
// 舊 gemini_bad 資料混有檔案與輸入錯誤，不再用來判斷模型。每日和每分鐘的用量仍沿用原資料。
const availabilityKey = (id: string) => `gemini_model_status:${id}`

/** 為要送出的請求保留一次額度；同時有人查核時，已滿的計數不再遞增。 */
async function reserveCount(db: D1Database, day: string, name: string, limit: number): Promise<number | null> {
  if (limit <= 0) return null
  const row = await db
    .prepare(`INSERT INTO usage_counters (day, name, count) VALUES (?, ?, 1)
      ON CONFLICT(day, name) DO UPDATE SET count = count + 1 WHERE count < ? RETURNING count`)
    .bind(day, name, limit)
    .first<{ count: number }>()
  return row?.count ?? null
}

/**
 * 調整已記的次數（可正可負，最低為 0），讓網站的計數貼近 Google 的計算方式：
 * 依 Google 開發者論壇的說明，400 與 5xx 的請求會算進每日額度、429 不算。
 */
async function adjustCount(db: D1Database, day: string, name: string, delta: number) {
  if (!delta) return
  await db.prepare(`INSERT INTO usage_counters (day, name, count) VALUES (?, ?, MAX(0, ?))
      ON CONFLICT(day, name) DO UPDATE SET count = MAX(0, count + ?)`).bind(day, name, delta, delta).run()
}

async function setCount(db: D1Database, day: string, name: string, count: number) {
  await db.prepare('INSERT INTO usage_counters (day, name, count) VALUES (?, ?, ?) ON CONFLICT(day, name) DO UPDATE SET count = MAX(count, excluded.count)').bind(day, name, count).run()
}

async function recordModelAvailability(db: D1Database, day: string, id: string, attempt: number, available: boolean) {
  // 以該次請求扣每日次數的順序為準。正值表示模型不可用，負值表示成功；較早送出的回應不能蓋掉後來的結果。
  await db.prepare(`INSERT INTO usage_counters (day, name, count) VALUES (?, ?, ?)
      ON CONFLICT(day, name) DO UPDATE SET count = excluded.count
      WHERE ABS(excluded.count) > ABS(usage_counters.count)`)
    .bind(day, availabilityKey(id), available ? -attempt : attempt).run()
}

export interface ModelState {
  id: string
  label: string
  remaining: number
  daily: number
  media: boolean
  /** 代號錯誤或不支援，今天先跳過 */
  unavailable: boolean
  /** 這一分鐘還能用幾次 */
  minute_left: number
  /** 這一分鐘用完時，還要等幾秒 */
  cooldown_seconds: number
}

const minuteKey = (now = new Date()) => now.toISOString().slice(11, 16).replace(':', '')
const rpmKey = (id: string, minute: string) => `gemini_rpm:${id}:${minute}`

export async function modelStates(db: D1Database, models: ModelConf[], now = new Date()): Promise<ModelState[]> {
  const day = googleDay(now)
  const minute = minuteKey(now)
  const { results } = await db
    .prepare('SELECT name, count FROM usage_counters WHERE day = ? AND (name LIKE ? OR name LIKE ? OR name LIKE ?)')
    .bind(day, 'gemini:%', 'gemini_model_status:%', `gemini_rpm:%:${minute}`)
    .all<{ name: string; count: number }>()
  const counts = new Map(results.map((r) => [r.name, r.count]))
  const secondsToNextMinute = 60 - now.getUTCSeconds()
  return models.map((m) => {
    const minuteLeft = Math.max(0, m.rpm - (counts.get(rpmKey(m.id, minute)) ?? 0))
    return {
      id: m.id,
      label: modelLabel(m.id),
      daily: m.daily,
      remaining: Math.max(0, m.daily - (counts.get(usedKey(m.id)) ?? 0)),
      media: m.media,
      unavailable: (counts.get(availabilityKey(m.id)) ?? 0) > 0,
      minute_left: minuteLeft,
      cooldown_seconds: minuteLeft > 0 ? 0 : secondsToNextMinute,
    }
  })
}

/** AI 錯誤分類：只存分類與狀態碼，不存 Google 錯誤原文（原文可能夾帶檔案網址或輸入片段） */
export type ErrorCategory = 'model_unavailable' | 'unsupported_input' | 'region' | 'api_key' | 'not_found' | 'daily_quota'
  | 'minute_quota' | 'busy' | 'timeout' | 'network' | 'bad_response' | 'other'
const errKey = (model: string, category: ErrorCategory, status: number) => `gemini_err:${model}|${category}|${status}`
/** 管理員警告：地區錯誤重試超過 2 次後才成功的查核筆數 */
const REGION_WARN_KEY = 'gemini_warn:region_retry'
const REGION_RETRY_MS = 1000
/** 一筆查核累計 5xx 或地區錯誤的請求達到此數就停止（擁有者 2026-11-27 決定為 4） */
const MAX_FAILED_REQUESTS = 4

export function errorCategory(e: unknown): { category: ErrorCategory; status: number } {
  if (!(e instanceof GeminiError)) return { category: 'bad_response', status: 0 }
  const status = e.status
  if (e.reason) return { category: e.reason, status }
  if (status === 429) return { category: 'minute_quota', status }
  if (status === 408) return { category: 'timeout', status }
  if (status >= 500) return { category: 'busy', status }
  if (status === 0) return { category: 'network', status }
  return { category: 'other', status }
}

async function recordModelError(db: D1Database, day: string, model: string, e: unknown) {
  const { category, status } = errorCategory(e)
  await db.prepare('INSERT INTO usage_counters (day, name, count) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET count = count + 1')
    .bind(day, errKey(model, category, status)).run()
}

/** 後台用：最近 7 個配額日（美國太平洋時間）每個模型的錯誤類型與次數，新的在前 */
export async function siteErrors(db: D1Database, now = new Date()) {
  const days = Array.from({ length: 7 }, (_, i) => googleDay(new Date(now.getTime() - i * 86_400_000)))
  const { results } = await db.prepare(`SELECT day, name, count FROM usage_counters WHERE (name GLOB 'gemini_err:*' OR name = ?)
      AND day IN (${days.map(() => '?').join(',')})`).bind(REGION_WARN_KEY, ...days).all<{ day: string; name: string; count: number }>()
  return {
    days: days.map(day => ({
      day,
      warnings: { region_retry: results.find(r => r.day === day && r.name === REGION_WARN_KEY)?.count ?? 0 },
      rows: results.filter(r => r.day === day && r.name !== REGION_WARN_KEY).map(r => {
        const [model, category, status] = r.name.slice('gemini_err:'.length).split('|')
        return { model, category: category as ErrorCategory, status: Number(status), count: r.count }
      }).sort((a, b) => b.count - a.count || a.model.localeCompare(b.model)),
    })),
  }
}

/** 每日排程：刪除 90 天以前的計數（每日次數、每分鐘次數、錯誤紀錄），今天與近期的保留 */
export async function purgeOldCounters(db: D1Database) {
  await db.prepare("DELETE FROM usage_counters WHERE day < date('now', '-90 days')").run()
}

/** 後台用：網站今天（美國太平洋時間）替每個模型記了幾次 */
export async function siteUsage(db: D1Database, models: ModelConf[], now = new Date()) {
  const day = googleDay(now)
  const { results } = await db.prepare("SELECT name, count FROM usage_counters WHERE day = ? AND name GLOB 'gemini:*'")
    .bind(day).all<{ name: string; count: number }>()
  const counts = new Map(results.map(r => [r.name, r.count]))
  return { day, models: models.map(m => ({ id: m.id, label: modelLabel(m.id), daily: m.daily, used: counts.get(usedKey(m.id)) ?? 0 })) }
}

/**
 * 後台手動校準：把某模型今天的次數改成管理者從 Google AI Studio／Explorer 看到的數字。
 * 之後的查核從這個數字接著累加；換日後自然歸零。
 */
export async function calibrateUsage(db: D1Database, model: string, used: number, now = new Date()) {
  await db.prepare('INSERT INTO usage_counters (day, name, count) VALUES (?, ?, ?) ON CONFLICT(day, name) DO UPDATE SET count = excluded.count')
    .bind(googleDay(now), usedKey(model), used).run()
}

/** 目前會被使用的模型（有圖片／影片時只看能分析媒體的；這一分鐘用完的先跳過） */
export const currentModel = (states: ModelState[], needMedia = false) =>
  states.find((m) => !m.unavailable && m.remaining > 0 && m.minute_left > 0 && (!needMedia || m.media)) ??
  states.find((m) => !m.unavailable && m.remaining > 0 && (!needMedia || m.media)) ??
  null


/** 依序嘗試模型；回傳結果並註明是否因額度改用其他模型 */
export async function analyzeWithFallback(env: Env, s: AppSettings, text: string, media: AIMedia[], fetcher?: typeof fetch, preferred?: string): Promise<AIResult> {
  const all = s.gemini_models.length ? s.gemini_models : DEFAULT_MODELS
  // 使用者指定的模型排第一個；它不能用時照原本順序往下換
  const chosen = preferred ? all.find((m) => m.id === preferred) : undefined
  const models = chosen ? [chosen, ...all.filter((m) => m !== chosen)] : all
  const needMedia = media.length > 0
  const sent = [...new Set(media.map((m) => m.kind))].sort()
  const fail = (status: AIResult['status'], summary: string, model: string | null = null): AIResult => ({
    provider: 'gemini', status, is_demo: false, summary, external: status === 'error', model,
    risk_level: null, risk_points: [], advice: [], media_description: null, sent_media: sent,
  })
  if (!(await takeDailyQuota(env.DB, 'gemini', s.gemini_daily_limit)))
    return fail('rate_limited', '今日 AI 分析次數已達網站上限（可在管理頁「系統設定」調整）。')

  const now = new Date()
  const day = googleDay(now)
  const minute = minuteKey(now)
  const states = await modelStates(env.DB, models, now)
  // 這裡只讀 D1 快照。只有 Google 已確認用完的才跳過；監控延遲而推估為零的仍可試。
  const snapshot = await publicQuota(env, states, now)
  const exhausted = new Set(snapshot.models.filter(m => m.daily_limit_reached).map(m => m.id))
  const skipped: string[] = []
  let lastFailure: AIResult | undefined
  // 「地區不支援」多半是 Google 判錯 Cloudflare 對外連線的 IP：同一模型等 1 秒重試 1 次，仍失敗才換下一個模型。
  // 只有 Google 明確回了這個錯誤才重試；Gemini 還在回應時照常等待（最多 3 分鐘），不會被當成錯誤。
  const regionRetried = new Set<string>()
  let regionFailures = 0
  // 失敗上限：Google 真的掛掉時（全面 5xx 或地區錯誤），一筆查核最多送 4 次失敗請求就停，不把每個模型的額度都燒掉
  let failedRequests = 0
  const giveUp = (model: string) => fail('error', regionFailures === failedRequests
    ? 'Google 暫時不接受目前伺服器所在地區的連線（已自動重試），請稍後再試。'
    : 'Google Gemini 目前暫時無法使用（連續多次失敗），請稍後再試。', model)
  for (let i = 0; i < models.length; i++) {
    const m = models[i]
    const st = states.find((x) => x.id === m.id)!
    if (exhausted.has(m.id) || (st.unavailable && m.id !== chosen?.id) || st.remaining <= 0 || (needMedia && !m.media)) continue
    // 先檢查每分鐘，再扣每日次數
    if (st.minute_left <= 0 || await reserveCount(env.DB, day, rpmKey(m.id, minute), m.rpm) === null) {
      skipped.push(`${modelLabel(m.id)} 這一分鐘的次數已滿`)
      continue
    }
    const attempt = await reserveCount(env.DB, day, usedKey(m.id), m.daily)
    if (attempt === null) continue
    let out: AIResult
    const gemini = new Gemini(env, m.id, fetcher)
    try {
      out = await gemini.analyzeOnce(text, media)
    } catch (e) {
      await adjustCount(env.DB, day, usedKey(m.id), gemini.extraRequests)
      await recordModelError(env.DB, day, m.id, e)
      if (!(e instanceof GeminiError)) return fail('error', 'Gemini 回覆格式無法解讀，請再試一次。', m.id)
      if (e.status === 429) {
        if (e.reason === 'daily_quota') {
          await setCount(env.DB, day, usedKey(m.id), m.daily)
          skipped.push(`${modelLabel(m.id)} 今日額度已用完`)
        } else {
          // 429 不算 Google 的每日額度：退回送出前先扣的一次
          await adjustCount(env.DB, day, usedKey(m.id), -1)
          // Google 說這一分鐘滿了：記下來，讓查核頁顯示冷卻中
          await setCount(env.DB, day, rpmKey(m.id, minute), m.rpm)
          skipped.push(`${modelLabel(m.id)} 這一分鐘的次數已滿`)
        }
        continue
      }
      lastFailure = fail('error', e.message, m.id)
      if (e.status === 408) {
        skipped.push(`${modelLabel(m.id)} 超過 3 分鐘沒有回應`)
        continue
      }
      // Google 那邊暫時太忙（503 high demand 等）：換下一個模型
      if (e.status >= 500) {
        failedRequests += 1 + gemini.extraRequests // 最後這次加上自動重送的 5xx
        if (failedRequests >= MAX_FAILED_REQUESTS) return giveUp(m.id)
        skipped.push(`${modelLabel(m.id)} 暫時太多人使用`)
        continue
      }
      if (e.reason === 'model_unavailable') {
        await recordModelAvailability(env.DB, day, m.id, attempt, false)
        skipped.push(`${modelLabel(m.id)} 無法使用`)
        continue
      }
      if (e.reason === 'unsupported_input') {
        skipped.push(`${modelLabel(m.id)} 不支援這次查核的格式`)
        continue
      }
      if (e.reason === 'not_found') {
        // 例如模型被 Google 下架：這一筆跳過，不標記不可用（避免誤判把模型鎖整天），並計入失敗上限
        failedRequests++
        if (failedRequests >= MAX_FAILED_REQUESTS) return giveUp(m.id)
        skipped.push(`${modelLabel(m.id)} 暫時找不到（可能已被 Google 下架）`)
        continue
      }
      if (e.reason === 'region') {
        regionFailures++
        failedRequests++
        if (failedRequests >= MAX_FAILED_REQUESTS) return giveUp(m.id)
        if (!regionRetried.has(m.id)) {
          regionRetried.add(m.id)
          await new Promise((r) => setTimeout(r, REGION_RETRY_MS))
          i-- // 同一模型再試一次（重新扣每分鐘與每日次數，因為這是新的請求）
          continue
        }
        skipped.push(`${modelLabel(m.id)} 連線地區暫時被 Google 拒絕`)
        continue
      }
      return lastFailure
    }
    await adjustCount(env.DB, day, usedKey(m.id), gemini.extraRequests)
    await recordModelAvailability(env.DB, day, m.id, attempt, true)
    // 累計地區錯誤超過 2 次才成功：記給管理員看的警告（只記次數，不影響使用者）
    if (regionFailures > 2) await adjustCount(env.DB, day, REGION_WARN_KEY, 1)
    return { ...out, sent_media: sent, fallback_note: skipped.length ? `已自動改用 ${modelLabel(m.id)}（${skipped.join('；')}）` : null }
  }
  if (lastFailure) return lastFailure
  if (states.some((m) => m.unavailable && !exhausted.has(m.id) && m.remaining > 0 && (!needMedia || m.media)))
    return fail('error', '找不到指定的 Gemini 模型，請到管理頁「系統設定」確認模型名稱。')
  if (needMedia && !states.some((m) => m.media)) return fail('error', '這個模型不支援這次查核的格式，請改用其他模型或調整輸入內容。')
  return fail('rate_limited', needMedia
    ? '今天能分析圖片、影片的 AI 模型額度都用完了，請明天再試，或改在補充文字輸入內容。'
    : '今天所有 AI 模型的免費額度都用完了（或這一分鐘太多人使用），請稍後再試。')
}
