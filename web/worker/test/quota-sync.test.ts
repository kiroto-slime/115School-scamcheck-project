import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { modelStates } from '../aimodels'
import { adminQuota, publicQuota, refreshQuota, saveQuotaSchedule } from '../quota-sync'
import { adminHeaders, call } from './helpers'

const path = '/api/admin/ai/quota'
const configured = { ...env, GOOGLE_MONITORING_PROJECT_ID: 'example-monitor', GOOGLE_MONITORING_CLIENT_EMAIL: 'local@example.invalid', GOOGLE_MONITORING_PRIVATE_KEY: 'local-fixture' }
const models = [{ id: 'model-1', daily: 20, rpm: 5, media: true }]
const start = Date.parse('2026-11-27T01:00:00Z')
const at = (minutes: number) => new Date(start + minutes * 60_000)
const read = async () => ({ day: '2026-11-26', models: { 'model-1': { limit: 20, used: 12, asOf: at(-5).toISOString() } } })

describe('管理頁額度校準', () => {
  it('三個操作都需要管理員登入', async () => {
    for (const [suffix, method] of [['', 'GET'], ['/settings', 'PUT'], ['/refresh', 'POST']]) {
      expect((await call(path + suffix, { method })).status).toBe(401)
    }
  })

  it('初次使用時先停用，讀取狀態不會查 Google，手動更新會說明缺少授權', async () => {
    const headers = await adminHeaders()
    const state = await call(path, { headers })
    expect(state.json).toMatchObject({ auto_enabled: false, interval_minutes: 30, configured: false, models: [], checked_at: null })
    expect((await call(path + '/refresh', { headers, method: 'POST' })).status).toBe(503)
    expect((await call(path + '/settings', { headers, method: 'PUT', body: { interval_minutes: 15, auto_enabled: true } })).status).toBe(409)
    expect((await call(path + '/settings', { headers, method: 'PUT', body: { interval_minutes: 45, auto_enabled: false } })).json.interval_minutes).toBe(45)
  })

  it('手動更新回傳該次設定錯誤的操作提示，公開狀態不含診斷或設定值', async () => {
    const headers = await adminHeaders()
    const envOverride = { ...configured, GOOGLE_MONITORING_PROJECT_ID: 'wrong/project', GEMINI_API_KEY: 'local-test' }
    const result = await call(path + '/refresh', { method: 'POST', headers, envOverride })
    expect(result.status).toBe(200)
    expect(result.json).toMatchObject({ status: 'error', message: expect.stringContaining('專案 ID') })
    expect(JSON.stringify(result.json)).not.toContain(envOverride.GOOGLE_MONITORING_PROJECT_ID)
    const health = await call('/api/health', { envOverride })
    expect(health.json.modes.ai_quota_sync).not.toHaveProperty('message')
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('停用時仍能手動讀取，啟用 45 分鐘後只在到期時執行', async () => {
    const reader = vi.fn(read)
    await refreshQuota(configured, models, 'auto', at(0), reader)
    expect(reader).not.toHaveBeenCalled()
    await refreshQuota(configured, models, 'manual', at(0), reader)
    expect((await adminQuota(configured, models, at(0))).can_enable).toBe(true)
    await saveQuotaSchedule(configured, models, 45, true, at(0))
    await refreshQuota(configured, models, 'auto', at(40), reader)
    expect(reader).toHaveBeenCalledTimes(1)
    await Promise.all([refreshQuota(configured, models, 'auto', at(45), reader), refreshQuota(configured, models, 'auto', at(45), reader)])
    expect(reader).toHaveBeenCalledTimes(2)
    await saveQuotaSchedule(configured, models, 45, false, at(46))
    await refreshQuota(configured, models, 'auto', at(95), reader)
    expect(reader).toHaveBeenCalledTimes(2)
    await refreshQuota(configured, models, 'manual', at(95), reader)
    expect(reader).toHaveBeenCalledTimes(3)
  })

  it('同時手動更新只查一次，失敗或缺值時保留上次的資料', async () => {
    const reader = vi.fn(read)
    const results = await Promise.allSettled([
      refreshQuota(configured, models, 'manual', at(0), reader),
      refreshQuota(configured, models, 'manual', at(0), reader),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(reader).toHaveBeenCalledTimes(1)
    await refreshQuota(configured, models, 'manual', at(1), async () => { throw Error('連線中斷') })
    let state = await adminQuota(configured, models, at(1))
    expect(state).toMatchObject({ status: 'error', checked_at: at(0).toISOString(), models: [{ used: 12 }] })
    await refreshQuota(configured, models, 'manual', at(2), async () => ({ day: '2026-11-26', models: {} }))
    state = await adminQuota(configured, models, at(2))
    expect(state).toMatchObject({ status: 'partial', checked_at: at(0).toISOString(), models: [{ used: 12 }] })
  })

  it('校準後計入監控延遲期間與新嘗試，公開頁只讀快照，跨日或換專案就停用舊估計', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO usage_counters VALUES ('2026-11-26','gemini:model-1',3)"),
      env.DB.prepare("INSERT INTO usage_counters VALUES ('2026-11-26','gemini_rpm:model-1:0058',1)"),
    ])
    await refreshQuota(configured, models, 'manual', at(0), read)
    await env.DB.prepare("UPDATE usage_counters SET count=4 WHERE name='gemini:model-1'").run()
    const states = await modelStates(env.DB, models, at(1))
    expect((await publicQuota(configured, states, at(1))).models[0].estimated_remaining).toBe(6)
    expect((await publicQuota(configured, states, at(49))).models).toEqual([])
    expect((await publicQuota(configured, states, at(1440))).models).toEqual([])
    expect((await publicQuota({ ...configured, GOOGLE_MONITORING_PROJECT_ID: 'other' }, states, at(1))).models).toEqual([])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('本機選用監控資料表無法讀取時，公開頁仍能取得原本服務的狀態', async () => {
    await env.DB.prepare('DROP TABLE ai_quota_sync').run()
    const health = await call('/api/health', { envOverride: { ...configured, GEMINI_API_KEY: 'local-test' } })
    expect(health.status).toBe(200)
    expect(health.json.modes.ai_models.length).toBeGreaterThan(0)
    expect(health.json.modes.ai_quota_sync.models).toEqual([])
  })
})
