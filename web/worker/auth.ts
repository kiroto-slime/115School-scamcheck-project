/** 管理員登入、頻率限制、輸入驗證 */
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppSettings } from './settings'
import { hmacHex, HttpError, newId, safeEqual, sha256 } from './util'

export type AppEnv = { Bindings: Env; Variables: { settings: AppSettings; admin: string; sessionHash: string } }
export type Ctx = Context<AppEnv>

const TOKEN_MINUTES = 120

// 管理密碼更換後，即使瀏覽器還保有舊憑證也無法查到原工作階段。
const sessionHash = (password: string, token: string) => hmacHex(password, 'admin-session:' + token)

export async function checkPassword(env: Env, input: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false
  return safeEqual(await sha256(input), await sha256(env.ADMIN_PASSWORD))
}

export async function createToken(env: Env): Promise<string> {
  const token = newId() + newId()
  const key = await sessionHash(env.ADMIN_PASSWORD!, token)
  await env.DB.prepare('INSERT INTO admin_sessions (key_hash, expires_at) VALUES (?, ?)')
    .bind(key, Date.now() + TOKEN_MINUTES * 60_000).run()
  return token
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.ADMIN_PASSWORD) throw new HttpError(503, '管理員密碼尚未設定（請在 Cloudflare 後台設定 ADMIN_PASSWORD）。')
  const auth = c.req.header('Authorization') ?? ''
  if (!/^Bearer [a-f0-9]{64}$/.test(auth)) throw new HttpError(401, '請重新登入管理後台。')
  const key = await sessionHash(c.env.ADMIN_PASSWORD, auth.slice(7))
  const active = await c.env.DB.prepare('SELECT 1 FROM admin_sessions WHERE key_hash = ? AND expires_at > ?')
    .bind(key, Date.now()).first()
  if (!active) throw new HttpError(401, '這次登入已結束，請重新登入。')
  c.set('admin', 'admin')
  c.set('sessionHash', key)
  await next()
}

export const clientIp = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? 'unknown'

/** 每個 IP 每分鐘的請求上限（Cloudflare Rate Limiting binding） */
export async function rateLimit(c: Ctx, name: 'ANALYZE_LIMITER' | 'LOGIN_LIMITER' | 'DEFAULT_LIMITER') {
  const binding = c.env[name] as RateLimit | undefined
  if (!binding) {
    console.error('rate_limiter_unavailable', name)
    throw new HttpError(503, '暫時無法受理請求，請稍後再試。')
  }
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
