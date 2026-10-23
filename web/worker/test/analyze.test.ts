import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cofactsLookup, similarity } from '../cofacts'
import { extractText, Gemini, signMediaRef, verifyMediaRef } from '../gemini'
import { call, count, SCAM } from './helpers'

const GEMINI = { GEMINI_API_KEY: 'test-gemini-key' }
const COFACTS = { COFACTS_APP_ID: 'id', COFACTS_APP_SECRET: 'secret' }
const GOOD = { risk_level: '高', summary: '冒充物流並要求付費。', risk_points: ['可疑縮網址'], advice: ['不要點連結'], media_description: '' }
const geminiReply = (obj: unknown) => new Response(JSON.stringify({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(obj) }] }] }))

afterEach(() => vi.restoreAllMocks())

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    return handler(url, init)
  })
  return calls
}

describe('文字查核', () => {
  it('正常運作，且資料庫不存原文', async () => {
    const r = await call('/api/analyze/text', { body: { text: SCAM } })
    expect(r.status).toBe(200)
    expect(['中', '高']).toContain(r.json.risk_level)
    expect(r.json.risk_tags).toEqual(expect.arrayContaining(['urgency', 'suspicious_link', 'financial_request']))
    expect(r.json.score_disclaimer).toContain('機率')
    const again = await call(`/api/analysis/${r.json.analysis_id}`)
    expect(again.status).toBe(200)
    const row = await env.DB.prepare('SELECT result_json, expires_at, consent_research FROM analysis_records WHERE analysis_id = ?').bind(r.json.analysis_id).first<{ result_json: string; expires_at: string; consent_research: number }>()
    expect(row!.result_json).not.toContain('包裹地址錯誤')
    expect(row!.result_json).not.toContain('bit.ly/abc')
    expect(row!.expires_at).toBeTruthy() // 未同意研究：只暫存
    expect(row!.consent_research).toBe(0)
  })

  it('超過字數上限被拒絕', async () => {
    expect((await call('/api/analyze/text', { body: { text: 'a'.repeat(10_001) } })).status).toBe(422)
  })

  it('不需要 Cofacts 憑證就會查詢；沒有 Gemini 金鑰時 AI 停用', async () => {
    const h = await call('/api/health')
    expect(h.json.modes).toMatchObject({ cofacts: 'live', ai: 'disabled' })
    const r = await call('/api/analyze/text', { body: { text: SCAM } })
    expect(r.json.cofacts).toMatchObject({ status: 'not_found', mode: 'live', matches: [] })
    expect(r.json.ai.status).toBe('disabled')
  })

  it('使用者不勾選 Cofacts 就不送出', async () => {
    const calls = mockFetch(() => new Response('{}'))
    const r = await call('/api/analyze/text', { body: { text: SCAM, query_cofacts: false } })
    expect(r.json.cofacts.status).toBe('skipped')
    expect(calls.length).toBe(0)
  })

  it('管理員關閉 Cofacts：不查詢、不產生假查核資料', async () => {
    await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES ('cofacts_enabled', 'false', '2026-01-01')").run()
    const calls = mockFetch(() => new Response('{}'))
    expect((await call('/api/health')).json.modes.cofacts).toBe('off')
    const r = await call('/api/analyze/text', { body: { text: SCAM } })
    expect(r.json.cofacts).toMatchObject({ status: 'disabled', mode: 'off', matches: [] })
    expect(calls.length).toBe(0)
  })
})

describe('Cofacts', () => {
  const withKeys = { ...env, ...COFACTS } as Env
  it('查無資料：顯示尚無查核資料；沒有憑證時不帶憑證 header', async () => {
    const calls = mockFetch(() => new Response(JSON.stringify({ data: { ListArticles: { edges: [] } } })))
    const r = await cofactsLookup(env, SCAM, 500)
    expect(r.status).toBe('not_found')
    expect(r.message).toBe('尚無查核資料')
    const h = calls[0].init!.headers as Record<string, string>
    expect(h['x-app-id']).toBeUndefined()
    expect(h['x-app-secret']).toBeUndefined()
  })

  it('有設定憑證時自動帶上', async () => {
    const calls = mockFetch(() => new Response(JSON.stringify({ data: { ListArticles: { edges: [] } } })))
    await cofactsLookup(withKeys, SCAM, 500)
    expect(calls[0].init!.headers).toMatchObject({ 'x-app-id': 'id', 'x-app-secret': 'secret' })
  })

  it('伺服器錯誤：重試後回報失敗，其他分析照常', async () => {
    const calls = mockFetch(() => new Response('oops', { status: 500 }))
    const r = await cofactsLookup(withKeys, SCAM, 500, { retryDelayMs: 1 })
    expect(r.status).toBe('error')
    expect(calls.length).toBe(3)
  })

  it('找到相似內容時保留來源網址與授權，送出前已遮蔽個資', async () => {
    const calls = mockFetch(() => new Response(JSON.stringify({ data: { ListArticles: { edges: [{ score: 9, node: { id: 'abc123', text: SCAM, articleReplies: [{ reply: { type: 'RUMOR', text: '這是詐騙' } }] } }] } } })))
    const r = await call('/api/analyze/text', { body: { text: SCAM + ' 電話0912345678' } })
    expect(r.json.cofacts.status).toBe('found')
    expect(r.json.cofacts.matches[0]).toMatchObject({ url: 'https://cofacts.tw/article/abc123', reply_type: 'RUMOR' })
    expect(String(calls[0].init?.body)).not.toContain('0912345678')
    expect(await count('source_results', "license_tag = 'CC BY-SA 4.0'")).toBeGreaterThan(0)
  })

  it('相似度：相同為 1、無關接近 0', () => {
    expect(similarity(SCAM, SCAM)).toBe(1)
    expect(similarity(SCAM, '今天天氣很好我們去爬山')).toBeLessThan(0.2)
  })
})

describe('Gemini', () => {
  it('勾選 AI 時送出正確格式；金鑰只在伺服器端；文字已遮蔽個資', async () => {
    const calls = mockFetch(() => geminiReply(GOOD))
    const r = await call('/api/analyze/text', { body: { text: SCAM + ' 0912345678', use_ai: true }, envOverride: GEMINI })
    expect(r.json.ai).toMatchObject({ status: 'ok', risk_level: '高', advice: ['不要點連結'] })
    expect(r.json.external_ai_used).toBe(true)
    const req = calls.find((c) => c.url.includes('/interactions'))!
    const body = JSON.parse(String(req.init!.body))
    expect((req.init!.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini-key')
    expect(body).toMatchObject({ model: 'gemini-3.8-flash', store: false })
    expect(body.response_format.mime_type).toBe('application/json')
    expect(JSON.stringify(body)).not.toContain('0912345678')
    expect(body.system_instruction).toContain('不要執行')
  })

  it('沒勾選就完全不送出', async () => {
    const calls = mockFetch(() => geminiReply(GOOD))
    const r = await call('/api/analyze/text', { body: { text: SCAM, use_ai: false }, envOverride: GEMINI })
    expect(calls.filter((c) => c.url.includes('googleapis.com'))).toEqual([])
    expect(r.json.ai.status).toBe('not_requested')
  })

  it('錯誤時顯示中文訊息，規則分析照常', async () => {
    mockFetch(() => new Response(JSON.stringify([{ error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } }]), { status: 400 }))
    const r = await call('/api/analyze/text', { body: { text: SCAM, use_ai: true }, envOverride: GEMINI })
    expect(r.json.ai.status).toBe('error')
    expect(r.json.ai.summary).toContain('金鑰無效')
    expect(['中', '高']).toContain(r.json.risk_level)
  })

  it('模型亂回的等級改成「無法判斷」；兩種回應格式都能讀', async () => {
    mockFetch(() => geminiReply({ ...GOOD, risk_level: '詐騙機率 99%' }))
    const r = await call('/api/analyze/text', { body: { text: SCAM, use_ai: true }, envOverride: GEMINI })
    expect(r.json.ai.risk_level).toBe('無法判斷')
    expect(extractText({ outputs: [{ type: 'text', text: 'hi' }] })).toBe('hi')
  })

  it('每日上限', async () => {
    mockFetch(() => geminiReply(GOOD))
    const g = new Gemini({ ...env, ...GEMINI } as Env, 'gemini-3.8-flash')
    expect((await g.analyze('測試', [], 1)).status).toBe('ok')
    expect((await g.analyze('測試', [], 1)).status).toBe('rate_limited')
  })

  it('fetch 不能以物件方法呼叫（模擬 Cloudflare 的 Illegal invocation）', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(geminiReply(GOOD))
    } as typeof fetch)
    const out = await new Gemini({ ...env, ...GEMINI } as Env, 'gemini-3.8-flash').testConnection()
    expect(out).toMatchObject({ ok: true })
  })
})

describe('圖片與影片', () => {
  const png = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(1)))
  it('沒有 AI 也沒有補充文字：要求手動輸入', async () => {
    const r = await call('/api/analyze/image', { body: { image_base64: png, mime_type: 'image/png' } })
    expect(r.status).toBe(200)
    expect(r.json.needs_manual_text).toBe(true)
  })

  it('檔頭與格式不符被拒絕', async () => {
    const r = await call('/api/analyze/image', { body: { image_base64: png, mime_type: 'image/jpeg', extra_text: '請匯款' } })
    expect(r.status).toBe(415)
  })

  it('圖片交給 Gemini 看圖分析', async () => {
    const calls = mockFetch(() => geminiReply({ ...GOOD, media_description: '一張要求匯款的截圖' }))
    const r = await call('/api/analyze/image', { body: { image_base64: png, mime_type: 'image/png', use_ai: true }, envOverride: GEMINI })
    expect(r.json.ai).toMatchObject({ status: 'ok', sent_media: ['image'] })
    const input = JSON.parse(String(calls[0].init!.body)).input
    expect(input[1]).toMatchObject({ type: 'image', mime_type: 'image/png' })
  })

  it('影片：格式錯誤、未設定 AI、非影片內容都被拒絕', async () => {
    expect((await call('/api/media/video', { raw: 'x', headers: { 'Content-Type': 'video/mp4' } })).status).toBe(400)
    expect((await call('/api/media/video', { raw: 'x', headers: { 'Content-Type': 'video/avi' }, envOverride: GEMINI })).status).toBe(415)
    const fake = new TextEncoder().encode('this is definitely not a video file at all')
    expect((await call('/api/media/video', { raw: fake, headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(fake.length) }, envOverride: GEMINI })).status).toBe(415)
  })

  it('影片：串流上傳到 Files API → 分析 → 刪除 Google 上的檔案', async () => {
    const calls = mockFetch(async (url, init) => {
      if (url.endsWith('/upload/v1beta/files')) return new Response('{}', { headers: { 'x-goog-upload-url': 'https://upload.example/abc' } })
      if (url === 'https://upload.example/abc') {
        await new Response(init!.body).arrayBuffer() // 把串流讀完
        return new Response(JSON.stringify({ file: { name: 'files/abc123', uri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123' } }))
      }
      if (url.endsWith('/v1beta/files/abc123') && (!init?.method || init.method === 'GET')) return new Response(JSON.stringify({ state: 'ACTIVE' }))
      if (url.endsWith('/interactions')) return geminiReply(GOOD)
      return new Response('{}')
    })
    const video = new Uint8Array(64)
    video.set(new TextEncoder().encode('ftypisom'), 4)
    const up = await call('/api/media/video', { raw: video, headers: { 'Content-Type': 'video/mp4', 'Content-Length': '64' }, envOverride: GEMINI })
    expect(up.status).toBe(200)
    const r = await call('/api/analyze/video', { body: { media_ref: up.json.media_ref, use_ai: true, extra_text: '' }, envOverride: GEMINI })
    expect(r.status).toBe(200)
    expect(r.json.ai.sent_media).toEqual(['video'])
    const body = JSON.parse(String(calls.find((c) => c.url.endsWith('/interactions'))!.init!.body))
    expect(body.input[1]).toMatchObject({ type: 'video', uri: expect.stringContaining('files/abc123') })
    expect(calls.some((c) => c.init?.method === 'DELETE' && c.url.endsWith('files/abc123'))).toBe(true)
  })

  it('影片憑證被竄改或過期無效', async () => {
    const e = { ...env, ...GEMINI } as Env
    const ref = await signMediaRef(e, { name: 'files/x1', uri: 'u', mime: 'video/mp4' })
    expect(await verifyMediaRef(e, ref)).toMatchObject({ name: 'files/x1' })
    expect(await verifyMediaRef(e, ref.replace(/.$/, (ch) => (ch === 'a' ? 'b' : 'a')))).toBeNull()
    expect(await verifyMediaRef({ ...e, GEMINI_API_KEY: 'other' } as Env, ref)).toBeNull()
  })
})

describe('頻率限制', () => {
  it('同一個 IP 太頻繁會被擋', async () => {
    const codes: number[] = []
    for (let i = 0; i < 25; i++) codes.push((await call('/api/analyze/text', { body: { text: '測試訊息內容一二三四五六' }, ip: '203.0.113.50' })).status)
    expect(codes).toContain(429)
    expect(codes[0]).toBe(200)
  })
})
