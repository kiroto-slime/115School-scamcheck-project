import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { app } from '../index'

export const SCAM = '【物流通知】您的包裹地址錯誤，請於24小時內點擊 https://bit.ly/abc 更新資料並支付手續費，逾期將退回。'
export const ADMIN_PASSWORD = 'test-admin-password-123'

let ipCounter = 0
/** 每個測試用不同 IP，避免互相觸發頻率限制 */
export const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`

export interface CallOptions { method?: string; body?: unknown; raw?: BodyInit; headers?: Record<string, string>; ip?: string; envOverride?: Partial<Env> }

export async function call(path: string, opts: CallOptions = {}) {
  const headers: Record<string, string> = { 'CF-Connecting-IP': opts.ip ?? freshIp(), ...(opts.headers ?? {}) }
  let body: BodyInit | undefined = opts.raw
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }
  const ctx = createExecutionContext()
  const res = await app.request(path, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body }, { ...env, ...(opts.envOverride ?? {}) }, ctx)
  await waitOnExecutionContext(ctx)
  let json: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
  try {
    json = await res.clone().json()
  } catch {
    /* 非 JSON */
  }
  return { status: res.status, json, res }
}

export async function adminHeaders(): Promise<Record<string, string>> {
  const r = await call('/api/admin/login', { body: { password: ADMIN_PASSWORD } })
  if (r.status !== 200) throw new Error('login failed: ' + JSON.stringify(r.json))
  return { Authorization: `Bearer ${r.json.token}` }
}

export const count = async (table: string, where = '1=1') =>
  (await env.DB.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`).first<{ n: number }>())!.n
