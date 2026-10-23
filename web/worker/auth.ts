/** 管理員登入、頻率限制、輸入驗證 */
import type { Context, MiddlewareHandler } from 'hono'
import type { z } from 'zod'
import type { AppSettings } from './settings'
import { b64url, fromB64url, hmacHex, HttpError, safeEqual, sha256 } from './util'

export type AppEnv = { Bindings: Env; Variables: { settings: AppSettings; admin: string } }
export type Ctx = Context<AppEnv>

const TOKEN_MINUTES = 120

const sessionKey = async (pw: string) => [...(await sha256(`session:${pw}`))].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function checkPassword(env: Env, input: string): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false
  return safeEqual(await sha256(input), await sha256(env.ADMIN_PASSWORD))
}

export async function createToken(env: Env): Promise<string> {
  const payload = b64url(JSON.stringify({ u: 'admin', exp: Date.now() + TOKEN_MINUTES * 60_000 }))
  return `${payload}.${await hmacHex(await sessionKey(env.ADMIN_PASSWORD!), payload)}`
}

async function readToken(env: Env, token: string): Promise<string | null> {
  if (!env.ADMIN_PASSWORD) return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  if (!safeEqual(sig, await hmacHex(await sessionKey(env.ADMIN_PASSWORD), payload))) return null
  try {
    const d = JSON.parse(fromB64url(payload))
    return typeof d.exp === 'number' && d.exp > Date.now() ? String(d.u) : null
  } catch {
    return null
  }
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.ADMIN_PASSWORD) throw new HttpError(503, '管理員密碼尚未設定（請在 Cloudflare 後台設定 ADMIN_PASSWORD）。')
  const auth = c.req.header('Authorization') ?? ''
  const user = auth.startsWith('Bearer ') ? await readToken(c.env, auth.slice(7)) : null
  if (!user) throw new HttpError(401, '需要管理員登入，或登入已逾時。')
  c.set('admin', user)
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
