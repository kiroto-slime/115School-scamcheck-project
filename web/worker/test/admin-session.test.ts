import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ADMIN_PASSWORD, adminHeaders, call } from './helpers'

describe('管理登入的期限及權限', () => {
  it('憑證只留在使用者端，變更管理密碼或超過期限都要重新登入', async () => {
    const headers = await adminHeaders()
    const token = headers.Authorization.slice('Bearer '.length)
    const row = await env.DB.prepare('SELECT key_hash FROM admin_sessions').first<{ key_hash: string }>()
    expect(row?.key_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(row?.key_hash).not.toBe(token)
    expect((await call('/api/admin/statistics', { headers, envOverride: { ADMIN_PASSWORD: ADMIN_PASSWORD + '2' } })).status).toBe(401)
    await env.DB.prepare('UPDATE admin_sessions SET expires_at = 0').run()
    expect((await call('/api/admin/statistics', { headers })).status).toBe(401)
  })

  it('登入限流服務未設定時，暫停受理管理登入', async () => {
    const result = await call('/api/admin/login', {
      body: { password: ADMIN_PASSWORD }, envOverride: { LOGIN_LIMITER: undefined },
    })
    expect(result.status).toBe(503)
  })

  it('超過一般表單大小時回覆 413，錯誤也套用隱私標頭', async () => {
    const result = await call('/api/admin/login', { body: { password: '測'.repeat(50_000) } })
    expect(result.status).toBe(413)
    expect(result.res.headers.get('Cache-Control')).toBe('no-store')
    expect(result.res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000')
  })
})
