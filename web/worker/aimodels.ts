/**
 * Gemini 多模型輪替：依「系統設定」的順序使用，一個模型今天的額度用完就自動換下一個。
 * - 次數以美國太平洋時間的日期計算（和 Google 免費額度的重置時間一致）。
 * - Google 回報「每日額度用完」→ 該模型今天標記為用完；「每分鐘額度」→ 這次先換下一個。
 * - 模型代號錯誤（404）→ 今天先跳過，管理頁可用「列出可用模型」確認正確代號。
 */
import { AIMedia, AIResult, Gemini, GeminiError } from './gemini'
import type { AppSettings } from './settings'
import { nowIso, takeDailyQuota } from './util'

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
    .split('-')
    .map((w) => (/^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

/** Google 免費額度的「一天」：美國太平洋時間 */
export function googleDay(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

const usedKey = (id: string) => `gemini:${id}`
const badKey = (id: string) => `gemini_bad:${id}`

async function bump(db: D1Database, day: string, name: string, by = 1): Promise<number> {
  const row = await db
    .prepare('INSERT INTO usage_counters (day, name, count) VALUES (?, ?, ?) ON CONFLICT(day, name) DO UPDATE SET count = count + excluded.count RETURNING count')
    .bind(day, name, by)
    .first<{ count: number }>()
  return row?.count ?? by
}

async function setCount(db: D1Database, day: string, name: string, count: number) {
  await db.prepare('INSERT INTO usage_counters (day, name, count) VALUES (?, ?, ?) ON CONFLICT(day, name) DO UPDATE SET count = excluded.count').bind(day, name, count).run()
}

export interface ModelState {
  id: string
  label: string
  remaining: number
  daily: number
  media: boolean
  /** 代號錯誤或不支援，今天先跳過 */
  unavailable: boolean
}

export async function modelStates(db: D1Database, models: ModelConf[]): Promise<ModelState[]> {
  const day = googleDay()
  const { results } = await db.prepare('SELECT name, count FROM usage_counters WHERE day = ? AND (name LIKE ? OR name LIKE ?)').bind(day, 'gemini:%', 'gemini_bad:%').all<{ name: string; count: number }>()
  const counts = new Map(results.map((r) => [r.name, r.count]))
  return models.map((m) => ({
    id: m.id,
    label: modelLabel(m.id),
    daily: m.daily,
    remaining: Math.max(0, m.daily - (counts.get(usedKey(m.id)) ?? 0)),
    media: m.media,
    unavailable: (counts.get(badKey(m.id)) ?? 0) > 0,
  }))
}

/** 目前會被使用的模型（有圖片／影片時只看能分析媒體的） */
export const currentModel = (states: ModelState[], needMedia = false) =>
  states.find((m) => !m.unavailable && m.remaining > 0 && (!needMedia || m.media)) ?? null

const isDailyQuota = (raw: string) => /PerDay|per day|daily/i.test(raw)
const isNotFound = (e: GeminiError) => e.status === 404 || (e.status === 400 && /not found|not supported|unsupported model|is not available/i.test(e.raw))

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

  const day = googleDay()
  const minute = nowIso().slice(11, 16).replace(':', '')
  const states = await modelStates(env.DB, models)
  const skipped: string[] = []
  for (const m of models) {
    const st = states.find((x) => x.id === m.id)!
    if (st.unavailable || st.remaining <= 0 || (needMedia && !m.media)) continue
    // 先檢查每分鐘，再扣每日次數
    if ((await bump(env.DB, day, `gemini_rpm:${m.id}:${minute}`)) > m.rpm) {
      skipped.push(`${modelLabel(m.id)} 這一分鐘的次數已滿`)
      continue
    }
    if ((await bump(env.DB, day, usedKey(m.id))) > m.daily) continue
    try {
      const out = await new Gemini(env, m.id, fetcher).analyzeOnce(text, media)
      return { ...out, sent_media: sent, fallback_note: skipped.length ? `已自動改用 ${modelLabel(m.id)}（${skipped.join('；')}）` : null }
    } catch (e) {
      if (!(e instanceof GeminiError)) return fail('error', 'Gemini 回覆格式無法解讀，請再試一次。', m.id)
      if (e.status === 429) {
        if (isDailyQuota(e.raw)) {
          await setCount(env.DB, day, usedKey(m.id), m.daily)
          skipped.push(`${modelLabel(m.id)} 今日額度已用完`)
        } else skipped.push(`${modelLabel(m.id)} 這一分鐘的次數已滿`)
        continue
      }
      if (isNotFound(e)) {
        await bump(env.DB, day, badKey(m.id))
        skipped.push(`${modelLabel(m.id)} 無法使用`)
        continue
      }
      return fail('error', e.message, m.id)
    }
  }
  return fail('rate_limited', needMedia
    ? '今天能分析圖片、影片的 AI 模型額度都用完了，請明天再試，或改在補充文字輸入內容。'
    : '今天所有 AI 模型的免費額度都用完了（或這一分鐘太多人使用），請稍後再試。')
}
