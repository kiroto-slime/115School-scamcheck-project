import { env } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { factCheckLookup, factCheckQueries } from '../factcheck'
import { analyzeText } from '../rules'
import { extractUrls, maskHost, safeBrowsingLookup, tw165Lookup, virusTotalLookup } from '../urlcheck'
import { call } from './helpers'

afterEach(() => vi.restoreAllMocks())

const KEYS = { GOOGLE_CLOUD_API_KEY: 'g-key', VIRUSTOTAL_API_KEY: 'vt-key' }

async function shard(host: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(host))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 2)
}

/** 假的靜態檔：165 名單只有 evil-shop.cc */
async function fakeAssets(available = true) {
  const key = await shard('evil-shop.cc')
  return {
    fetch: async (req: Request) => {
      const path = new URL(req.url).pathname
      if (path === '/tw165/meta.json') return Response.json({ available, updated_at: '2026-10-23T00:00:00Z', count: 1 })
      if (path === `/tw165/${key}.json`) return Response.json({ 'evil-shop.cc': ['s', '2025-12', '電子商務'] })
      return Response.json({})
    },
  } as unknown as Fetcher
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    calls.push({ url, init })
    return handler(url, init)
  })
  return calls
}

describe('找出網址', () => {
  it('有 http、沒 http 的網域都抓得到，不抓 Email', () => {
    const hosts = extractUrls('請點 https://www.Evil-Shop.cc/pay?id=123 或 another.top 聯絡 a@b.com').map((u) => u.host)
    expect(hosts).toEqual(['evil-shop.cc', 'another.top'])
  })
  it('送給 Google 的網址不含查詢參數', () => {
    expect(extractUrls('https://evil-shop.cc/pay?token=secret')[0].url).toBe('https://evil-shop.cc/pay')
  })
  it('遮蔽網域', () => expect(maskHost('bbhhshf.cc')).toBe('bbh***.cc'))
})

describe('165 名單', () => {
  it('子網域也能比對到；結果只保留遮蔽後的網域', async () => {
    const e = { ...env, ASSETS: await fakeAssets() } as Env
    const r = await tw165Lookup(e, extractUrls('http://pay.evil-shop.cc/x'))
    expect(r.status).toBe('listed')
    expect(r.matches[0]).toMatchObject({ host_masked: 'pay***.cc', lists: ['遭停止解析涉詐網站'], month: '2025-12' })
    expect(JSON.stringify(r)).not.toContain('evil-shop')
  })
  it('不在名單、沒有網址、名單無法使用', async () => {
    const e = { ...env, ASSETS: await fakeAssets() } as Env
    expect((await tw165Lookup(e, extractUrls('https://good.example.com'))).status).toBe('not_listed')
    expect((await tw165Lookup(e, [])).status).toBe('no_url')
    expect((await tw165Lookup({ ...env, ASSETS: await fakeAssets(false) } as Env, extractUrls('evil-shop.cc'))).status).toBe('unavailable')
  })
  it('整合：列入名單的網址會加分並列出依據，資料庫不存網址', async () => {
    const r = await call('/api/analyze/text', { body: { text: '快來 evil-shop.cc 看看', query_cofacts: false }, envOverride: { ASSETS: await fakeAssets() } })
    expect(r.json.url_checks.tw165.status).toBe('listed')
    expect(r.json.basis.join()).toContain('165')
    expect(r.json.risk_level).not.toBe('資訊不足')
    const row = await env.DB.prepare('SELECT result_json FROM analysis_records WHERE analysis_id = ?').bind(r.json.analysis_id).first<{ result_json: string }>()
    expect(row!.result_json).not.toContain('evil-shop')
  })
})

describe('規則加分', () => {
  it('165、Google、VirusTotal（2 個引擎以上）各自加分', () => {
    const base = analyzeText('這是一段普通的文字內容，沒有特別的地方').risk_score ?? 0
    const r = analyzeText('這是一段普通的文字內容，沒有特別的地方', [], { tw165Listed: 1, safeBrowsingThreats: 1, virusTotalMalicious: 2 })
    expect(r.risk_score).toBe(Math.min(base + 90, 100))
    expect(analyzeText('普通文字內容很普通的一段話', [], { tw165Listed: 0, safeBrowsingThreats: 0, virusTotalMalicious: 1 }).basis.join()).not.toContain('VirusTotal')
  })
})

describe('Google 與 VirusTotal', () => {
  const e = () => ({ ...env, ...KEYS }) as Env
  it('Safe Browsing：找到威脅時顯示「疑似」', async () => {
    const calls = mockFetch(() => Response.json({ matches: [{ threatType: 'SOCIAL_ENGINEERING', threat: { url: 'https://evil-shop.cc/pay' } }] }))
    const r = await safeBrowsingLookup(e(), extractUrls('https://evil-shop.cc/pay?x=1'), 100)
    expect(r.status).toBe('found')
    expect(r.threats[0].detail).toBe('疑似詐騙／釣魚網站')
    expect(String(calls[0].init!.body)).not.toContain('x=1')
  })
  it('VirusTotal：只查網域報告；404 視為沒有紀錄', async () => {
    const calls = mockFetch((url) => url.includes('bad.top')
      ? Response.json({ data: { attributes: { last_analysis_stats: { malicious: 3, suspicious: 1, harmless: 50, undetected: 10 } } } })
      : new Response('{}', { status: 404 }))
    const r = await virusTotalLookup(e(), extractUrls('bad.top 和 new-site.shop'), 100)
    expect(r.status).toBe('found')
    expect(r.threats[0]).toMatchObject({ host_masked: 'bad***.top', malicious: 3 })
    expect(calls.every((c) => c.url.startsWith('https://www.virustotal.com/api/v3/domains/'))).toBe(true)
    expect((calls[0].init!.headers as Record<string, string>)['x-apikey']).toBe('vt-key')
  })
  it('VirusTotal：只有 1 個引擎標示（常見誤判）不列出', async () => {
    mockFetch(() => Response.json({ data: { attributes: { last_analysis_stats: { malicious: 1, suspicious: 0, harmless: 70, undetected: 20 } } } }))
    const r = await virusTotalLookup(e(), extractUrls('https://www.google.com'), 100)
    expect(r).toMatchObject({ status: 'clean', threats: [] })
  })
  it('VirusTotal：每分鐘超過 4 次就停', async () => {
    mockFetch(() => new Response('{}', { status: 404 }))
    for (let i = 0; i < 2; i++) await virusTotalLookup(e(), extractUrls('a1.top a2.top'), 100)
    expect((await virusTotalLookup(e(), extractUrls('a3.top'), 100)).status).toBe('rate_limited')
  })

  it('狀態接口：VirusTotal 這一分鐘用完顯示冷卻；其他服務顯示今日剩餘', async () => {
    mockFetch(() => new Response('{}', { status: 404 }))
    for (let i = 0; i < 2; i++) await virusTotalLookup(e(), extractUrls('b1.top b2.top'), 100)
    const q = (await call('/api/health', { envOverride: KEYS })).json.modes.quotas
    expect(q.virustotal.minute_left).toBe(0)
    expect(q.virustotal.cooldown_seconds).toBeGreaterThan(0)
    expect(q.virustotal.daily_left).toBe(450 - 4)
    expect(q.cofacts).toMatchObject({ daily_left: 500, minute_left: null, cooldown_seconds: 0 })
    expect(q.google.daily_left).toBe(1000)
  })
  it('沒勾選就不送出；沒金鑰顯示未設定', async () => {
    const calls = mockFetch(() => Response.json({}))
    const r = await call('/api/analyze/text', { body: { text: '請到 https://evil-shop.cc 付款', query_cofacts: false, query_google: false }, envOverride: KEYS })
    expect(r.json.url_checks.safe_browsing.status).toBe('not_requested')
    expect(r.json.url_checks.virustotal.status).toBe('not_requested')
    expect(calls).toEqual([])
    const r2 = await call('/api/analyze/text', { body: { text: '請到 https://evil-shop.cc 付款', query_cofacts: false } })
    expect(r2.json.url_checks.safe_browsing.status).toBe('disabled')
  })
  it('Fact Check：送出遮蔽個資的短文字，回傳查核報告', async () => {
    const calls = mockFetch(() => Response.json({ claims: [{ text: '假訊息', claimReview: [{ publisher: { name: '台灣事實查核中心' }, url: 'https://tfc-taiwan.org.tw/x', textualRating: '錯誤', reviewDate: '2026-01-02T00:00:00Z' }] }] }))
    const r = await factCheckLookup(e(), '[手機] 您的帳戶將被凍結 https://bit.ly/x', 100)
    expect(r.items[0]).toMatchObject({ publisher: '台灣事實查核中心', rating: '錯誤', date: '2026-01-02' })
    // 送出的是關鍵字，不含個資、網址
    const q = decodeURIComponent(calls[0].url)
    expect(q).toContain('帳戶')
    expect(q).toContain('凍結')
    expect(q).not.toMatch(/bit\.ly|手機/)
  })

  it('Fact Check：整句話先抽關鍵字；第一組找不到再用最長的兩個詞', async () => {
    expect(factCheckQueries('喝溫開水可以預防新冠肺炎')).toEqual(['溫開水 預防 新冠 肺炎', '溫開水 預防'])
    expect(factCheckQueries('看 https://a.b/c [手機]')).toEqual([])
    const calls = mockFetch((url) => decodeURIComponent(url).includes('query=溫開水 預防&')
      ? Response.json({ claims: [{ text: '溫開水防疫', claimReview: [{ publisher: { name: 'MyGoPen' }, url: 'https://mygopen.com/x', textualRating: '不實' }] }] })
      : Response.json({}))
    const r = await factCheckLookup(e(), '喝溫開水可以預防新冠肺炎', 100)
    expect(r).toMatchObject({ status: 'found', items: [{ publisher: 'MyGoPen' }] })
    expect(calls.length).toBe(2)
    expect(JSON.stringify(r)).not.toContain('溫開水 預防') // 不保存搜尋關鍵字
  })
})

describe('管理頁上傳 165 名單', () => {
  it('上傳後改用新名單（比部署內建的新）；未登入不能上傳', async () => {
    const { adminHeaders } = await import('./helpers')
    expect((await call('/api/admin/tw165/meta', { method: 'PUT', body: { count: 1000, sources: [] } })).status).toBe(401)
    const h = await adminHeaders()
    const key = await shard('new-scam.shop')
    const up = await call('/api/admin/tw165/shards', { method: 'PUT', raw: `${key}\t{"new-scam.shop":["s","2026-10","電子商務"]}`, headers: h })
    expect(up.json).toEqual({ saved: 1 })
    expect((await call('/api/admin/tw165/shards', { method: 'PUT', raw: 'zz\t{}', headers: h })).status).toBe(422)
    const m = await call('/api/admin/tw165/meta', { method: 'PUT', body: { count: 1000, sources: [{ code: 's', name: '涉詐網站', page: 'https://data.gov.tw/dataset/176455', rows: 1000 }] }, headers: h })
    expect(m.status).toBe(200)
    const e = { ...env, ASSETS: await fakeAssets() } as Env
    const r = await tw165Lookup(e, extractUrls('https://new-scam.shop'))
    expect(r.status).toBe('listed')
    expect((await call('/api/health', { envOverride: { ASSETS: await fakeAssets() } })).json.modes.tw165).toMatchObject({ origin: 'upload', count: 1000 })
  })
})
