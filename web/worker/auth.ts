/** 管理員登入、頻率限制、輸入驗證 */
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppSettings } from './settings'
import { b64url, fromB64url, hmacHex, HttpError, newId, safeEqual, sha256 } from './util'

export type AppEnv = { Bindings: Env; Variables: { settings: AppSettings; admin: string; logoutLogId: string } }
export type Ctx = Context<AppEnv>

const TOKEN_MINUTES = 120

const sessionKey = async (pw: string) => [...(await sha256(`session:${pw}`))].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function checkPassword(env: Env, input: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false
  return safeEqual(await sha256(input), await sha256(env.ADMIN_PASSWORD))
}

export async function createToken(env: Env): Promise<string> {
  const payload = b64url(JSON.stringify({ u: 'admin', sid: newId(), exp: Date.now() + TOKEN_MINUTES * 60_000 }))
  return `${payload}.${await hmacHex(await sessionKey(env.ADMIN_PASSWORD!), payload)}`
}

async function readSessionId(env: Env, token: string): Promise<string | null> {
  if (!env.ADMIN_PASSWORD) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  if (!safeEqual(sig, await hmacHex(await sessionKey(env.ADMIN_PASSWORD), payload))) return null
  try {
    const d = JSON.parse(fromB64url(payload))
    return d.u === 'admin' && typeof d.exp === 'number' && d.exp > Date.now()
      && typeof d.sid === 'string' && /^[a-f0-9]{32}$/.test(d.sid) ? d.sid : null
  } catch {
    return null
  }
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.ADMIN_PASSWORD) throw new HttpError(503, '管理員密碼尚未設定（請在 Cloudflare 後台設定 ADMIN_PASSWORD）。')
  const auth = c.req.header('Authorization') ?? ''
  const sid = auth.startsWith('Bearer ') ? await readSessionId(c.env, auth.slice(7)) : null
  if (!sid) throw new HttpError(401, '請重新登入管理後台。')
  // 登出事件的主鍵只含隨機登入編號。即使拿到稽核紀錄也無法當作憑證使用。
  const logoutLogId = 'logout:' + sid
  if (await c.env.DB.prepare('SELECT 1 FROM audit_logs WHERE log_id = ?').bind(logoutLogId).first())
    throw new HttpError(401, '這次登入已結束，請重新登入。')
  c.set('admin', 'admin')
  c.set('logoutLogId', logoutLogId)
  await next()
}

export const clientIp = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? 'unknown'

/** 每個 IP 每分鐘的請求上限（Cloudflare Rate Limiting binding） */
export async function rateLimit(c: Ctx, name: 'ANALYZE_LIMITER' | 'LOGIN_LIMITER' | 'DEFAULT_LIMITER') {
  const binding = c.env[name] as RateLimit | undefined
  if (!binding) return
  const { success } = await binding.limit({ key: clientIp(c) })
  if (!success) throw new HttpError(429, '請求太頻繁，請稍候一分鐘再試。')
}

/** 解析並驗證 JSON 請求內容，錯誤訊息為中文 */
export async function readBody<T extends z.ZodType>(c: Ctx, schema: T): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HttpError(400, '請求內容不是有效的 JSON。')
  }
  const r = schema.safeParse(raw)
  if (!r.success) {
    const fields = [...new Set(r.error.issues.map((i) => i.path.join('.')).filter(Boolean))]
    throw new HttpError(422, `輸入格式不正確：${fields.join(', ') || '請檢查內容'}`)
  }
  return r.data
}
