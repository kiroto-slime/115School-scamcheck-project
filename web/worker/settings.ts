/** 系統設定：預設值 + 管理頁可修改的值（存在 D1 app_settings），取代 v0.1 的 config.env */
import { nowIso } from './util'

export interface AppSettings {
  research_mode: 'simulation' | 'formal'
  research_group_mode: 'balanced' | 'A' | 'B'
  research_collection_enabled: boolean
  gemini_model: string
  gemini_daily_limit: number
  cofacts_daily_limit: number
  consent_version: string
  temp_retention_hours: number
  research_retention_days: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  research_mode: 'simulation',
  research_group_mode: 'balanced',
  research_collection_enabled: true,
  gemini_model: 'gemini-3.8-flash',
  gemini_daily_limit: 300,
  cofacts_daily_limit: 500,
  consent_version: '2026.10-v0.2',
  temp_retention_hours: 24,
  research_retention_days: 365,
}

/** 上傳限制（開發預設值，非外部服務官方限制） */
export const LIMITS = { maxTextChars: 10_000, maxImageMb: 10, maxVideoMb: 20, maxVideoSeconds: 30 }

export async function getSettings(db: D1Database): Promise<AppSettings> {
  const { results } = await db.prepare('SELECT key, value FROM app_settings').all<{ key: string; value: string }>()
  const s: AppSettings = { ...DEFAULT_SETTINGS }
  for (const r of results) {
    if (!(r.key in s)) continue
    try {
      ;(s as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value)
    } catch {
      /* 壞掉的值忽略，使用預設 */
    }
  }
  return s
}

export async function saveSettings(db: D1Database, patch: Partial<AppSettings>) {
  const now = nowIso()
  const stmts = Object.entries(patch).map(([k, v]) =>
    db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, JSON.stringify(v), now),
  )
  if (stmts.length) await db.batch(stmts)
}

export const isFormal = (s: AppSettings) => s.research_mode === 'formal'
export const aiMode = (env: Env) => (env.GEMINI_API_KEY ? 'gemini' : 'disabled') as 'gemini' | 'disabled'
export const cofactsLive = (env: Env) => Boolean(env.COFACTS_APP_ID && env.COFACTS_APP_SECRET)
