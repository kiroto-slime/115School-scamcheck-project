/**
 * 外部服務的剩餘次數與冷卻（給查核頁顯示，讓用完的選項暫時變灰）。
 * 計數器和實際扣次數的地方一致：takeDailyQuota 用 UTC 日期；VirusTotal 另有每分鐘計數（urlcheck.ts）。
 */
import type { AppSettings } from './settings'
import { nowIso } from './util'

export interface QuotaState {
  /** 今天還能用幾次 */
  daily_left: number
  /** 這一分鐘還能用幾次（沒有每分鐘限制的服務是 null） */
  minute_left: number | null
  /** 這一分鐘用完時，還要等幾秒 */
  cooldown_seconds: number
}

/** VirusTotal 免費版每分鐘 4 次 */
export const VT_PER_MINUTE = 4
export const vtMinuteName = (now = new Date()) => `virustotal_min_${now.toISOString().slice(11, 16).replace(':', '')}`

export async function serviceQuotas(db: D1Database, s: AppSettings, now = new Date()): Promise<{ cofacts: QuotaState; google: QuotaState; virustotal: QuotaState }> {
  const day = nowIso().slice(0, 10)
  const vtMin = vtMinuteName(now)
  const names = ['cofacts', 'safe_browsing', 'factcheck', 'virustotal', vtMin]
  const { results } = await db
    .prepare(`SELECT name, count FROM usage_counters WHERE day = ? AND name IN (${names.map(() => '?').join(',')})`)
    .bind(day, ...names)
    .all<{ name: string; count: number }>()
  const used = (n: string) => results.find((r) => r.name === n)?.count ?? 0
  const left = (limit: number, n: string) => Math.max(0, limit - used(n))
  const vtMinuteLeft = Math.max(0, VT_PER_MINUTE - used(vtMin))
  return {
    cofacts: { daily_left: left(s.cofacts_daily_limit, 'cofacts'), minute_left: null, cooldown_seconds: 0 },
    // 安全瀏覽與事實查核各自計數；兩個都用完才算 Google 用完
    google: { daily_left: Math.max(left(s.google_daily_limit, 'safe_browsing'), left(s.google_daily_limit, 'factcheck')), minute_left: null, cooldown_seconds: 0 },
    virustotal: {
      daily_left: left(s.virustotal_daily_limit, 'virustotal'),
      minute_left: vtMinuteLeft,
      cooldown_seconds: vtMinuteLeft > 0 ? 0 : 60 - now.getUTCSeconds(),
    },
  }
}
