/** 系統設定：預設值 + 管理頁可修改的值（存在 D1 app_settings），取代 v0.1 的 config.env */
import { DEFAULT_MODELS, type ModelConf } from './aimodels'
import { nowIso } from './util'

export interface AppSettings {
  research_mode: 'simulation' | 'formal'
  research_group_mode: 'balanced' | 'A' | 'B'
  research_collection_enabled: boolean
  /** 依序使用的模型；用完一個換下一個 */
  gemini_models: ModelConf[]
  /** 整個網站每天最多呼叫幾次 AI（所有模型合計） */
  gemini_daily_limit: number
  cofacts_enabled: boolean
  cofacts_daily_limit: number
  google_daily_limit: number
  virustotal_daily_limit: number
  consent_version: string
  temp_retention_hours: number
  research_retention_days: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  research_mode: 'simulation',
  research_group_mode: 'balanced',
  research_collection_enabled: true,
  gemini_models: DEFAULT_MODELS,
  gemini_daily_limit: 2000,
  cofacts_enabled: true,
  cofacts_daily_limit: 500,
  google_daily_limit: 1000,
  virustotal_daily_limit: 450,
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
  // 舊設定的錯誤代號（已用「列出可用模型」確認正確名稱）
  s.gemini_models = s.gemini_models.map((m) => (m.id === 'gemini-3-flash' ? { ...m, id: 'gemini-3-flash-preview' } : m))
  return s
}

export async function saveSettings(db: D1Database, patch: Partial<AppSettings>) {
  const now = nowIso()
  const stmts = Object.entries(patch).map(([k, v]) =>
    db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at').bind(k, JSON.stringify(v), now),
  )
  if (stmts.length) await db.batch(stmts)
}

export const googleMode = (env: Env) => (env.GOOGLE_CLOUD_API_KEY ? 'live' : 'off') as 'live' | 'off'
export const virusTotalMode = (env: Env) => (env.VIRUSTOTAL_API_KEY ? 'live' : 'off') as 'live' | 'off'
export const isFormal = (s: AppSettings) => s.research_mode === 'formal'
export const aiMode = (env: Env) => (env.GEMINI_API_KEY ? 'gemini' : 'disabled') as 'gemini' | 'disabled'
/** Cofacts 公開 API 不需要憑證；管理員可在「系統設定」關閉 */
export const cofactsMode = (s: AppSettings) => (s.cofacts_enabled ? 'live' : 'off') as 'live' | 'off'
