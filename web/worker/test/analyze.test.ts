import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cofactsLookup, similarity } from '../cofacts'
import { extractText, Gemini, REPLY_LANGS, signMediaRef, systemPrompt, verifyMediaRef } from '../gemini'
import { savedContent } from '../analysis'
import { DEFAULT_SETTINGS, saveSettings } from '../settings'
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
  it('查詢外部服務期間撤回研究同意，完成時不再保存研究內容', async () => {
    const { json: grant } = await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })
    expect(grant.research_id).toBeTruthy()
    const calls = mockFetch(async () => {
      await call('/api/consent', { body: { research_id: grant.research_id, purpose: 'research', status: 'withdrawn' } })
      return Response.json({ data: { ListArticles: { edges: [] } } })
    })
    const result = await call('/api/analyze/text', { body: { research_id: grant.research_id, text: '明天請將圖書交回教室。' } })
    expect(result.status).toBe(200)
    expect(calls).toHaveLength(1)
    const record = await env.DB.prepare('SELECT research_id_nullable, consent_research, content_text FROM analysis_records WHERE analysis_id = ?').bind(result.json.analysis_id).first()
    expect(record).toEqual({ research_id_nullable: null, consent_research: 0, content_text: null })
  })

  it.each([
    { label: '停止收集', patch: { research_collection_enabled: false }, research: 0 },
    { label: '更新同意版本', patch: { consent_version: '新版本' }, research: 1 },
    { label: '提前結束保存', patch: { content_retention_until: '2020-01-01' }, research: 1 },
  ])('查詢期間若管理員$label，交易套用新的保存限制', async ({ patch, research }) => {
    const { json: consent } = await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })
    mockFetch(async () => {
      await saveSettings(env.DB, patch)
      return Response.json({ data: { ListArticles: { edges: [] } } })
    })
    const result = await call('/api/analyze/text', { body: { text: '明天請將圖書交回教室。', research_id: consent.research_id } })
    expect(result.status).toBe(200)
    const record = await env.DB.prepare('SELECT consent_research, research_id_nullable, content_text, content_urls_json FROM analysis_records WHERE analysis_id = ?').bind(result.json.analysis_id).first()
    expect(record).toEqual({ consent_research: research, research_id_nullable: research ? consent.research_id : null, content_text: null, content_urls_json: null })
  })

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
    const days = (Date.parse(row!.expires_at) - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(29.9) // 保存 30 天
    expect(days).toBeLessThan(30.1)
    expect(row!.consent_research).toBe(0)
    const saved = await env.DB.prepare('SELECT content_text, content_urls_json, content_edited FROM analysis_records WHERE analysis_id = ?').bind(r.json.analysis_id).first<{ content_text: string | null; content_urls_json: string | null; content_edited: number }>()
    expect(saved!.content_text).toBeNull() // 未同意：不保存內容
    expect(saved!.content_urls_json).toBeNull()
    expect(saved!.content_edited).toBe(0)
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

  it('Gemini 拒絕第一筆查核後仍可讀取規則結果，下一筆指定同模型成功也保留第一筆', async () => {
    const model = 'gemini-3.5-flash-lite'
    const attempts: string[] = []
    mockFetch((url, init) => {
      expect(url).toMatch(/\/interactions$/)
      attempts.push(JSON.parse(String(init?.body)).model)
      // 用不會自動重試的拒絕（地區錯誤現在會自動重試，見 aimodels 測試）
      return attempts.length === 1
        ? Response.json({ error: { message: 'The billing account for the project is disabled.' } }, { status: 403 })
        : geminiReply(GOOD)
    })
    const submit = (text: string) => call('/api/analyze/text', {
      body: { text, use_ai: true, ai_model: model, query_cofacts: false, query_google: false }, envOverride: GEMINI,
    })
    const first = await submit('請在 24 小時內匯款，否則帳戶將被凍結。')
    expect(first.status).toBe(200)
    const firstPath = '/api/analysis/' + first.json.analysis_id
    const saved = await call(firstPath)
    expect(saved.status).toBe(200)
    expect(saved.json).toMatchObject({
      analysis_status: 'completed_with_source_error', risk_tags: expect.arrayContaining(['financial_request']),
      consent_research: false, ai: { status: 'error', model, summary: expect.stringContaining('權限') },
    })

    const second = await submit('請確認這則包裹通知。')
    expect(second.status).toBe(200)
    expect(second.json.analysis_id).not.toBe(first.json.analysis_id)
    expect(second.json.ai).toMatchObject({ status: 'ok', model })
    expect(attempts).toEqual([model, model])
    const reread = await call(firstPath)
    expect(reread.status).toBe(200)
    expect(reread.json).toEqual(saved.json)
  })

  it('供應商的詳細錯誤不會隨查核結果保存或顯示', async () => {
    const diagnostic = 'provider-diagnostic-fixture'
    mockFetch(() => Response.json({ error: { message: diagnostic } }, { status: 400 }))
    const result = await call('/api/analyze/text', { body: { text: '今天教室開放。', query_cofacts: false, use_ai: true }, envOverride: GEMINI })
    expect(result.json.ai.summary).toContain('Gemini 拒絕')
    const row = await env.DB.prepare('SELECT result_json FROM analysis_records WHERE analysis_id = ?').bind(result.json.analysis_id).first<{ result_json: string }>()
    expect(row!.result_json).not.toContain(diagnostic)
    const old = JSON.parse(row!.result_json)
    old.ai.summary += '（Google 訊息：' + diagnostic + '）'
    await env.DB.prepare('UPDATE analysis_records SET result_json = ? WHERE analysis_id = ?').bind(JSON.stringify(old), result.json.analysis_id).run()
    expect((await call('/api/analysis/' + result.json.analysis_id)).json.ai.summary).toBe(result.json.ai.summary)
  })

  it('模型亂回的等級改成「無法判斷」；兩種回應格式都能讀', async () => {
    mockFetch(() => geminiReply({ ...GOOD, risk_level: '詐騙機率 99%' }))
    const r = await call('/api/analyze/text', { body: { text: SCAM, use_ai: true }, envOverride: GEMINI })
    expect(r.json.ai.risk_level).toBe('無法判斷')
    expect(extractText({ outputs: [{ type: 'text', text: 'hi' }] })).toBe('hi')
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
    const reply = { ...GOOD, summary: '冒充物流，要求寄信至 demo@example.test。',
      risk_points: ['聯絡 0912-345-678'], advice: ['避免點 https://example.test/help?trace=fixture'],
      media_description: '一張要求匯款的截圖', debug_field: '內部資料' }
    const calls = mockFetch(() => geminiReply(reply))
    const r = await call('/api/analyze/image', { body: { image_base64: png, mime_type: 'image/png', use_ai: true }, envOverride: GEMINI })
    expect(r.json.ai).toMatchObject({ status: 'ok', sent_media: ['image'], risk_level: '高', summary: '冒充物流，要求寄信至 [Email]。', risk_points: ['聯絡 [手機]'], media_description: null })
    const { result_json } = (await env.DB.prepare('SELECT result_json FROM analysis_records WHERE analysis_id = ?').bind(r.json.analysis_id).first<{ result_json: string }>())!
    for (const value of [reply.media_description, 'demo@example.test', 'trace=fixture', '0912-345-678']) expect(result_json).not.toContain(value)
    // 模擬舊格式；重新讀取時仍須套用遮蔽與公開欄位清單。
    const legacy = { ...JSON.parse(result_json), ai: { ...r.json.ai, ...reply } }
    await env.DB.prepare('UPDATE analysis_records SET result_json = ? WHERE analysis_id = ?').bind(JSON.stringify(legacy), r.json.analysis_id).run()
    const old = await call('/api/analysis/' + r.json.analysis_id)
    expect(old.json.ai).toEqual(r.json.ai)
    const grant = await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })
    const granted = await call('/api/analyze/image', { body: { image_base64: png, mime_type: 'image/png', use_ai: true, research_id: grant.json.research_id }, envOverride: GEMINI })
    const saved = await env.DB.prepare('SELECT result_json, content_text FROM analysis_records WHERE analysis_id = ?').bind(granted.json.analysis_id).first<{ result_json: string; content_text: string }>()
    expect(saved?.content_text).toContain(reply.media_description)
    expect(saved?.result_json).not.toContain(reply.media_description)
    expect(granted.json.ai.summary).toBe(r.json.ai.summary)
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
    const unconfigured = { ...env, GEMINI_API_KEY: undefined } as Env
    expect(await verifyMediaRef(unconfigured, ref)).toBeNull()
    await expect(signMediaRef(unconfigured, { name: 'files/x1', uri: 'u', mime: 'video/mp4' })).rejects.toThrow()
  })

  it('上傳後取消 AI，只查補充文字並清除已上傳的影片', async () => {
    const mediaRef = await signMediaRef({ ...env, ...GEMINI } as Env, { name: 'files/example', uri: 'https://example.test/video', mime: 'video/mp4' })
    const calls = mockFetch(() => new Response(null, { status: 200 }))
    const result = await call('/api/analyze/video', { body: { media_ref: mediaRef, use_ai: false, query_cofacts: false, extra_text: '明天請帶作業。' }, envOverride: GEMINI })
    expect(result.status).toBe(200)
    expect(result.json.ai.status).toBe('not_requested')
    expect(result.json.media.ocr_status).toBe('unavailable')
    expect(calls.map(c => c.init?.method)).toEqual(['DELETE'])
  })

  it('暫時無法刪除影片時會重試，已不存在也視為清理完畢', async () => {
    const statuses = [503, 404]
    const calls = mockFetch(() => new Response(null, { status: statuses.shift() }))
    await new Gemini({ ...env, ...GEMINI } as Env, 'gemini', fetch, 0).deleteFile('files/example')
    expect(calls.filter(c => c.init?.method === 'DELETE')).toHaveLength(2)
  })

  it('刪除無法確認時只記錄事件類別', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockFetch(() => new Response(null, { status: 403 }))
    await new Gemini({ ...env, ...GEMINI } as Env, 'gemini', fetch, 0).deleteFile('files/example')
    expect(warning.mock.calls).toEqual([['gemini_file_cleanup_unconfirmed']])
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

describe('保存內容', () => {
  const grant = async () => {
    const c = await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })
    return c.json.research_id as string
  }
  const contentOf = (id: string) =>
    env.DB.prepare('SELECT content_text, content_urls_json FROM analysis_records WHERE analysis_id = ?').bind(id).first<{ content_text: string | null; content_urls_json: string | null }>()

  it('同意研究：保存遮蔽後內容與去參數網址', async () => {
    const rid = await grant()
    const r = await call('/api/analyze/text', { body: { text: SCAM + ' 聯絡 0912-345-678', research_id: rid } })
    expect(r.status).toBe(200)
    const row = await contentOf(r.json.analysis_id)
    expect(row!.content_text).toContain('包裹地址錯誤')
    expect(row!.content_text).toContain('[手機]')
    expect(row!.content_text).not.toContain('0912')
    expect(JSON.parse(row!.content_urls_json!)).toEqual(['https://bit.ly/abc'])
  })

  it('可疑網址路徑中的手機號碼保存前先遮蔽', async () => {
    const rid = await grant()
    const r = await call('/api/analyze/text', { body: { text: '請點 https://a.cc/u/0912345678?x=1 領取', research_id: rid } })
    expect(r.status).toBe(200)
    const row = await contentOf(r.json.analysis_id)
    expect(JSON.parse(row!.content_urls_json!)).toEqual(['https://a.cc/u/[手機]'])
    expect(row!.content_urls_json).not.toContain('0912345678')
  })

  it('超過「訊息內容保存到」日期後，新查核不保存內容', async () => {
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10)
    await saveSettings(env.DB, { content_retention_until: yesterday })
    try {
      const rid = await grant()
      const r = await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })
      expect(r.status).toBe(200)
      const row = await contentOf(r.json.analysis_id)
      expect(row!.content_text).toBeNull()
      expect(row!.content_urls_json).toBeNull()
    } finally {
      await saveSettings(env.DB, { content_retention_until: DEFAULT_SETTINGS.content_retention_until })
    }
  })

  it('公開 API 不洩漏保存的內容', async () => {
    const rid = await grant()
    const r = await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })
    for (const body of [r.json, (await call(`/api/analysis/${r.json.analysis_id}`)).json])
      for (const k of ['content_text', 'content_urls_json', 'content_edited']) expect(body).not.toHaveProperty(k)
  })

  it('舊版同意：不保存內容', async () => {
    const rid = 'RLEGACY000001'
    await env.DB.prepare('INSERT INTO consent_records (consent_id, research_id, purpose, consent_version, consent_status, consent_time, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind('c'.repeat(32), rid, 'research', '2026.10-v0.2', 'granted', new Date().toISOString(), 0).run()
    const r = await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })
    expect(r.status).toBe(200)
    expect((await contentOf(r.json.analysis_id))!.content_text).toBeNull()
  })

  it('刪除我的研究資料會一併刪除內容', async () => {
    const rid = await grant()
    await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })
    expect(await count('analysis_records', `content_text IS NOT NULL AND research_id_nullable = '${rid}'`)).toBe(1)
    expect((await call('/api/privacy/delete', { body: { research_id: rid } })).status).toBe(200)
    expect(await count('analysis_records', `content_text IS NOT NULL AND research_id_nullable = '${rid}'`)).toBe(0)
  })

  it('health 提供同意版本與保存期限', async () => {
    const h = await call('/api/health')
    expect(h.json.modes.consent_version).toBe('2026.11-v0.3')
    expect(h.json.modes.content_retention_until).toBe('2027-12-31')
  })

  it('預設研究資料保存 730 天', () => {
    expect(DEFAULT_SETTINGS.research_retention_days).toBe(730)
  })

  it('圖片／影片內容格式：補充文字加 AI 描述', () => {
    expect(savedContent('我的補充 0912345678', 'image', '截圖寫著匯款')).toBe('【使用者補充文字】\n我的補充 [手機]\n【AI 看到／聽到的內容】\n截圖寫著匯款')
    expect(savedContent('', 'video', '有人要求轉帳')).toBe('【AI 看到／聽到的內容】\n有人要求轉帳')
    expect(savedContent('https://a.com/x?token=1 hi', 'text', null)).toBe('https://a.com/x hi')
    expect(savedContent('a'.repeat(5000), 'text', null).length).toBe(4000)
  })
})

describe('AI 回覆語言跟著介面語言', () => {
  it.each([['en', '英文'], ['ja', '日文'], ['ko', '韓文'], ['zh-Hant', '繁體中文'], ['vi', '越南文（Tiếng Việt）'], ['id', '印尼文（Bahasa Indonesia）'], ['th', '泰文（ไทย）'], ['zh-Hans', '簡體中文']] as const)('介面語言 %s：要求 AI 用%s回覆，風險等級仍用固定代碼', async (lang, label) => {
    const calls = mockFetch(() => geminiReply(GOOD))
    const r = await call('/api/analyze/text', { body: { text: 'Your parcel is held. Pay the fee at this link now.', use_ai: true, query_cofacts: false, query_google: false, lang }, envOverride: GEMINI })
    expect(r.status).toBe(200)
    const sent = calls.find(c => c.url.includes('/interactions'))!
    const body = JSON.parse(String(sent.init!.body))
    expect(body.system_instruction).toContain(label)
    expect(body.system_instruction).toContain('這四個值不要翻譯')
  })

  it('支援的回覆語言依選單順序共八種', () => {
    expect(REPLY_LANGS).toEqual(['zh-Hant', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans'])
  })

  it('簡體中文回覆保留臺灣機構名稱', () => {
    expect(systemPrompt('zh-Hans')).toContain('臺灣機構名稱保留原名')
  })

  it('不認得的語言代碼會被拒絕', async () => {
    const r = await call('/api/analyze/text', { body: { text: '你好', lang: 'xx' } })
    expect(r.status).toBe(422)
  })
})
