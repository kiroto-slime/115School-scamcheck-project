/** 共用小工具 */

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export const nowIso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString().replace(/\.\d{3}Z$/, 'Z')
export const newId = () => crypto.randomUUID().replace(/-/g, '')
export const bool = (v: boolean | null | undefined) => (v === null || v === undefined ? null : v ? 1 : 0)
export const toBool = (v: unknown) => (v === null || v === undefined ? null : Boolean(v))

export function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const enc = new TextEncoder()

export async function hmacHex(key: string, data: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(data))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

/** 常數時間比較，避免時序攻擊 */
export function safeEqual(a: Uint8Array | string, b: Uint8Array | string): boolean {
  const x = typeof a === 'string' ? enc.encode(a) : a
  const y = typeof b === 'string' ? enc.encode(b) : b
  if (x.length !== y.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

export const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
export const fromB64url = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

/** 每日用量計數（D1）。超過上限回傳 false。 */
export async function takeDailyQuota(db: D1Database, name: string, limit: number): Promise<boolean> {
  const day = nowIso().slice(0, 10)
  const row = await db
    .prepare('INSERT INTO usage_counters (day, name, count) VALUES (?, ?, 1) ON CONFLICT(day, name) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(day, name)
    .first<{ count: number }>()
  return (row?.count ?? 1) <= limit
}

export async function audit(db: D1Database, actor: string, action: string, target?: string | null, detail?: string | null) {
  await db
    .prepare('INSERT INTO audit_logs (log_id, actor, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(newId(), actor, action, target ?? null, detail ? detail.slice(0, 300) : null, nowIso())
    .run()
}
