import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeWithFallback, googleDay, modelLabel, modelStates } from '../aimodels'
import { DEFAULT_SETTINGS } from '../settings'
import { call } from './helpers'

afterEach(() => vi.restoreAllMocks())
const E = { ...env, GEMINI_API_KEY: 'k' } as Env
const GOOD = { risk_level: '低', summary: '一般邀約。', risk_points: [], advice: [] }
const ok = () => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(GOOD) }] }] }))
const S = (models: { id: string; daily: number; rpm: number; media: boolean }[]) => ({ ...DEFAULT_SETTINGS, gemini_models: models })

/** 依模型代號回應：handler 回傳 Response */
function mockModels(handler: (model: string) => Response) {
  const used: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_i: RequestInfo | URL, init?: RequestInit) => {
    const model = JSON.parse(String(init!.body)).model
    used.push(model)
    return handler(model)
  })
  return used
}

describe('模型輪替', () => {
  it('名稱好讀', () => expect(modelLabel('gemini-3.5-flash-lite')).toBe('Gemini 3.5 Flash Lite'))

  it('自己計數用完就換下一個', async () => {
    const used = mockModels(() => ok())
    const s = S([{ id: 'a-1', daily: 1, rpm: 5, media: true }, { id: 'b-2', daily: 5, rpm: 5, media: true }])
    expect((await analyzeWithFallback(E, s, '你好', [])).model).toBe('a-1')
    const r = await analyzeWithFallback(E, s, '你好', [])
    expect(r.model).toBe('b-2')
    expect(used).toEqual(['a-1', 'b-2'])
    const st = await modelStates(env.DB, s.gemini_models)
    expect(st.map((m) => m.remaining)).toEqual([0, 4])
  })

  it('Google 回報每日額度用完：標記用完並改用下一個，結果註明', async () => {
    mockModels((m) => m === 'a-1'
      ? new Response(JSON.stringify({ error: { code: 429, message: 'Quota exceeded for GenerateRequestsPerDayPerProjectPerModel-FreeTier' } }), { status: 429 })
      : ok())
    const s = S([{ id: 'a-1', daily: 20, rpm: 5, media: true }, { id: 'b-2', daily: 20, rpm: 5, media: true }])
    const r = await analyzeWithFallback(E, s, '你好', [])
    expect(r).toMatchObject({ status: 'ok', model: 'b-2' })
    expect(r.fallback_note).toContain('A 1 今日額度已用完')
    expect((await modelStates(env.DB, s.gemini_models))[0].remaining).toBe(0)
  })

  it('每分鐘額度：這次換下一個，但不扣光今天的次數', async () => {
    mockModels((m) => m === 'a-1' ? new Response('{"error":{"message":"per minute"}}', { status: 429 }) : ok())
    const s = S([{ id: 'a-1', daily: 20, rpm: 5, media: true }, { id: 'b-2', daily: 20, rpm: 5, media: true }])
    expect((await analyzeWithFallback(E, s, '你好', [])).model).toBe('b-2')
    expect((await modelStates(env.DB, s.gemini_models))[0].remaining).toBe(19)
  })

  it('代號錯誤（404）今天跳過；有圖片時跳過只能看文字的模型', async () => {
    const used = mockModels((m) => m === 'bad-1' ? new Response('{"error":{"message":"models/bad-1 is not found"}}', { status: 404 }) : ok())
    const s = S([{ id: 'bad-1', daily: 20, rpm: 5, media: true }, { id: 'text-1', daily: 20, rpm: 5, media: false }, { id: 'pic-1', daily: 20, rpm: 5, media: true }])
    expect((await analyzeWithFallback(E, s, '你好', [])).model).toBe('text-1')
    const img = await analyzeWithFallback(E, s, '', [{ kind: 'image', mime: 'image/png', base64: 'AAAA' }])
    expect(img.model).toBe('pic-1')
    expect(used).toEqual(['bad-1', 'text-1', 'pic-1'])
    expect((await modelStates(env.DB, s.gemini_models))[0].unavailable).toBe(true)
  })

  it('使用者指定模型：先用它；它用完就照順序往下換', async () => {
    const used = mockModels(() => ok())
    const s = S([{ id: 'a-1', daily: 5, rpm: 5, media: true }, { id: 'b-2', daily: 1, rpm: 5, media: true }])
    expect((await analyzeWithFallback(E, s, '你好', [], undefined, 'b-2')).model).toBe('b-2')
    expect((await analyzeWithFallback(E, s, '你好', [], undefined, 'b-2')).model).toBe('a-1')
    expect((await analyzeWithFallback(E, s, '你好', [], undefined, 'not-in-list')).model).toBe('a-1')
    expect(used).toEqual(['b-2', 'a-1', 'a-1'])
  })

  it('全部用完：顯示額度用完，不送出', async () => {
    const used = mockModels(() => ok())
    const s = S([{ id: 'a-1', daily: 0, rpm: 5, media: true }])
    expect((await analyzeWithFallback(E, s, '你好', [])).status).toBe('rate_limited')
    expect(used).toEqual([])
  })

  it('health 顯示目前模型與剩餘次數', async () => {
    const h = await call('/api/health', { envOverride: { GEMINI_API_KEY: 'k' } })
    expect(h.json.modes.ai_model).toBe('Gemini 3.8 Flash')
    expect(h.json.modes.ai_models[0]).toMatchObject({ id: 'gemini-3.8-flash', remaining: 20, media: true })
    expect(googleDay()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
