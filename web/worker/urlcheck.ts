/**
 * 網址安全檢查：
 * - 165 涉詐網站名單（警政署開放資料，建置時下載成靜態檔；不送出任何資料，一定執行）
 * - Google Safe Browsing（使用者勾選「Google 查核」且有 GOOGLE_CLOUD_API_KEY）：只送網址的網域與路徑，不送查詢參數
 * - VirusTotal（使用者勾選且有 VIRUSTOTAL_API_KEY）：只查網域報告，不提交新網址（不會分享給資安社群）
 * 絕不連線或開啟使用者訊息中的網址。結果只保留遮蔽後的網域，資料庫不存完整網址。
 */
import { sleep, takeDailyQuota } from './util'

const URL_RE = /(?:https?:\/\/|www\.)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi
/** 沒有 http 開頭的網域（例：abc.shop）；前面不能是 @（避免抓到 Email） */
const BARE_RE = /(?<![A-Za-z0-9@.\-/])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,22})(?![A-Za-z0-9\-@])/gi
const MAX_HOSTS = 10

export interface FoundUrl {
  host: string
  /** 只含網域與路徑（不含 ? 之後的參數），給 Safe Browsing 用 */
  url: string
}

/** 與 scripts/build-tw165.mjs 的 normalizeHost 相同規則 */
export function normalizeHost(raw: string): string {
  let h = (raw || '').trim().toLowerCase()
  if (!h) return ''
  try {
    h = new URL(h.includes('://') ? h : 'http://' + h).hostname
  } catch {
    return ''
  }
  h = h.replace(/\.$/, '').replace(/^www\d?\./, '')
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h) ? h : ''
}

/** 從文字找出網址與網域（只分析字串，不連線） */
export function extractUrls(text: string): FoundUrl[] {
  const clean = (text || '').normalize('NFKC')
  const out = new Map<string, FoundUrl>()
  const add = (raw: string) => {
    const host = normalizeHost(raw)
    if (!host || /^\d+(\.\d+)+$/.test(host) || out.size >= MAX_HOSTS) return
    let url = `http://${host}/`
    try {
      const u = new URL(raw.includes('://') ? raw : 'http://' + raw)
      url = `${u.protocol}//${u.hostname}${u.pathname}`
    } catch {
      /* 用預設 */
    }
    if (!out.has(host)) out.set(host, { host, url })
  }
  for (const m of clean.match(URL_RE) ?? []) add(m)
  const rest = clean.replace(URL_RE, ' ')
  for (const m of rest.matchAll(BARE_RE)) add(m[1])
  return [...out.values()]
}

/** 只顯示部分網域：bbhhshf.cc → bbh***.cc */
export function maskHost(host: string): string {
  const parts = host.split('.')
  const tld = parts.pop() ?? ''
  const name = parts.join('.')
  return `${name.slice(0, 3)}***.${tld}`
}

/** 自己與上層網域（不含只剩頂級網域的情況）：a.b.example.com → a.b.example.com, b.example.com, example.com */
function candidates(host: string): string[] {
  const p = host.split('.')
  const out: string[] = []
  for (let i = 0; i <= p.length - 2 && out.length < 4; i++) out.push(p.slice(i).join('.'))
  return out
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ---------- 165 名單 ----------

export interface Tw165Meta {
  available: boolean
  /** build：部署時內建；upload：管理員從管理頁上傳 */
  origin?: 'build' | 'upload'
  updated_at?: string
  count?: number
  sources?: { code: string; name: string; page: string; rows: number }[]
}

export const TW165_SOURCE_NAME: Record<string, string> = { s: '遭停止解析涉詐網站', i: '假投資（博弈）網站' }

export interface Tw165Match {
  host_masked: string
  lists: string[]
  month: string
  category: string
}

export interface Tw165Result {
  status: 'listed' | 'not_listed' | 'no_url' | 'unavailable'
  matches: Tw165Match[]
  updated_at: string | null
  message: string
}

// 正式環境的 ASSETS 不看網域；本機 Vite 只接受 localhost（其他網域會 403）
const ASSET_ORIGIN = 'http://localhost'

async function readAsset<T>(env: Env, path: string): Promise<T | null> {
  try {
    const r = await env.ASSETS.fetch(new Request(`${ASSET_ORIGIN}/tw165/${path}`))
    if (!r.ok) {
      console.warn('tw165 asset not ok', path, r.status)
      return null
    }
    return (await r.json()) as T
  } catch (e) {
    console.warn('tw165 asset error', path, String(e))
    return null
  }
}

async function readKv<T>(env: Env, key: string): Promise<T | null> {
  try {
    return await env.TW165.get<T>(key, 'json')
  } catch {
    return null
  }
}

/** 部署內建與管理員上傳兩份名單，用比較新的那份 */
export async function tw165Meta(env: Env): Promise<Tw165Meta> {
  const [built, uploaded] = await Promise.all([readAsset<Tw165Meta>(env, 'meta.json'), readKv<Tw165Meta>(env, 'meta')])
  const b = built?.available ? { ...built, origin: 'build' as const } : null
  const u = uploaded?.available ? { ...uploaded, origin: 'upload' as const } : null
  if (b && u) return (u.updated_at ?? '') >= (b.updated_at ?? '') ? u : b
  return u ?? b ?? { available: false }
}

const readShard = (env: Env, meta: Tw165Meta, key: string) =>
  meta.origin === 'upload' ? readKv<Record<string, [string, string, string]>>(env, `shard:${key}`) : readAsset<Record<string, [string, string, string]>>(env, `${key}.json`)

export async function tw165Lookup(env: Env, urls: FoundUrl[]): Promise<Tw165Result> {
  const meta = await tw165Meta(env)
  if (!meta.available) return { status: 'unavailable', matches: [], updated_at: null, message: '165 涉詐網站名單暫時無法使用，其他分析照常進行。' }
  const updated = meta.updated_at ?? null
  if (!urls.length) return { status: 'no_url', matches: [], updated_at: updated, message: '訊息中沒有網址，未比對 165 名單。' }
  const shards = new Map<string, Record<string, [string, string, string]> | null>()
  const matches: Tw165Match[] = []
  for (const { host } of urls) {
    for (const cand of candidates(host)) {
      const key = (await sha256Hex(cand)).slice(0, 2)
      if (!shards.has(key)) shards.set(key, await readShard(env, meta, key))
      const hit = shards.get(key)?.[cand]
      if (hit) {
        matches.push({ host_masked: maskHost(host), lists: [...hit[0]].map((c) => TW165_SOURCE_NAME[c] ?? c), month: hit[1], category: hit[2] })
        break
      }
    }
  }
  return matches.length
    ? { status: 'listed', matches, updated_at: updated, message: `有 ${matches.length} 個網址列在警政署 165 涉詐網站名單中，請不要開啟。` }
    : { status: 'not_listed', matches: [], updated_at: updated, message: '網址不在 165 涉詐網站名單中（不在名單上不代表安全，新的詐騙網站常常還沒被列入）。' }
}

// ---------- 外部服務共用 ----------

export type ExternalStatus = 'found' | 'clean' | 'no_url' | 'not_requested' | 'disabled' | 'rate_limited' | 'error'

export interface UrlThreat {
  host_masked: string
  detail: string
  /** VirusTotal：判定惡意的引擎數 */
  malicious?: number
}

export interface ExternalUrlResult {
  status: ExternalStatus
  threats: UrlThreat[]
  message: string
}

const ext = (status: ExternalStatus, message: string, threats: UrlThreat[] = []): ExternalUrlResult => ({ status, threats, message })

async function fetchRetry(doFetch: typeof fetch, url: string, init: RequestInit, retryDelayMs: number): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await doFetch(url, { ...init, signal: AbortSignal.timeout(8000) })
      if (r.status >= 500 && attempt === 0) {
        await sleep(retryDelayMs)
        continue
      }
      return r
    } catch (e) {
      if (attempt === 0) {
        await sleep(retryDelayMs)
        continue
      }
      throw e
    }
  }
}

const defaultFetch: typeof fetch = (input, init) => fetch(input, init)

// ---------- Google Safe Browsing ----------

const SB_TYPES: Record<string, string> = {
  MALWARE: '惡意軟體', SOCIAL_ENGINEERING: '詐騙／釣魚網站', UNWANTED_SOFTWARE: '有害軟體', POTENTIALLY_HARMFUL_APPLICATION: '可能有害的應用程式',
}

export async function safeBrowsingLookup(env: Env, urls: FoundUrl[], dailyLimit: number, opts: { fetcher?: typeof fetch; retryDelayMs?: number } = {}): Promise<ExternalUrlResult> {
  if (!env.GOOGLE_CLOUD_API_KEY) return ext('disabled', '尚未設定 Google 金鑰，未使用 Google 安全瀏覽。')
  if (!urls.length) return ext('no_url', '訊息中沒有網址。')
  if (!(await takeDailyQuota(env.DB, 'safe_browsing', dailyLimit))) return ext('rate_limited', '今日 Google 查詢次數已達上限。')
  try {
    const r = await fetchRetry(opts.fetcher ?? defaultFetch, `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(env.GOOGLE_CLOUD_API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'scamcheck', clientVersion: '0.2' },
        threatInfo: {
          threatTypes: Object.keys(SB_TYPES), platformTypes: ['ANY_PLATFORM'], threatEntryTypes: ['URL'],
          threatEntries: urls.map((u) => ({ url: u.url })),
        },
      }),
    }, opts.retryDelayMs ?? 500)
    if (r.status === 403) return ext('error', 'Google 金鑰沒有啟用 Safe Browsing API，請到 Google Cloud 主控台啟用。')
    if (!r.ok) return ext('error', `Google 安全瀏覽暫時無法使用（${r.status}）。`)
    const data = (await r.json()) as { matches?: { threatType?: string; threat?: { url?: string } }[] }
    const threats: UrlThreat[] = []
    for (const m of data.matches ?? []) {
      const host = normalizeHost(m.threat?.url ?? '')
      if (!host) continue
      threats.push({ host_masked: maskHost(host), detail: `疑似${SB_TYPES[m.threatType ?? ''] ?? '不安全網站'}` })
    }
    return threats.length
      ? ext('found', 'Google 安全瀏覽將網址標示為疑似不安全（可能有誤判）。', threats)
      : ext('clean', 'Google 安全瀏覽沒有發現已知威脅（可能有漏判，不代表安全）。')
  } catch {
    return ext('error', 'Google 安全瀏覽查詢失敗或逾時，其他分析照常進行。')
  }
}

// ---------- VirusTotal ----------

/** 免費版每分鐘 4 次：用「每分鐘」與「每日」兩個計數器 */
async function vtQuota(db: D1Database, dailyLimit: number): Promise<boolean> {
  const minute = new Date().toISOString().slice(11, 16).replace(':', '')
  return (await takeDailyQuota(db, `virustotal_min_${minute}`, 4)) && takeDailyQuota(db, 'virustotal', dailyLimit)
}

export async function virusTotalLookup(env: Env, urls: FoundUrl[], dailyLimit: number, opts: { fetcher?: typeof fetch; retryDelayMs?: number } = {}): Promise<ExternalUrlResult> {
  if (!env.VIRUSTOTAL_API_KEY) return ext('disabled', '尚未設定 VirusTotal 金鑰。')
  if (!urls.length) return ext('no_url', '訊息中沒有網址。')
  const threats: UrlThreat[] = []
  let checked = 0
  let failed = false
  for (const { host } of urls.slice(0, 2)) {
    if (!(await vtQuota(env.DB, dailyLimit))) {
      if (!checked) return ext('rate_limited', 'VirusTotal 免費額度已達上限（每分鐘 4 次），請稍後再試。')
      break
    }
    try {
      const r = await fetchRetry(opts.fetcher ?? defaultFetch, `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(host)}`, {
        headers: { 'x-apikey': env.VIRUSTOTAL_API_KEY },
      }, opts.retryDelayMs ?? 500)
      checked++
      if (r.status === 404) continue
      if (r.status === 401 || r.status === 403) return ext('error', 'VirusTotal 金鑰無效，請重新複製 VIRUSTOTAL_API_KEY。')
      if (r.status === 429) return ext('rate_limited', 'VirusTotal 免費額度已達上限，請稍後再試。')
      if (!r.ok) {
        failed = true
        continue
      }
      const data = (await r.json()) as { data?: { attributes?: { last_analysis_stats?: { malicious?: number; suspicious?: number; harmless?: number; undetected?: number } } } }
      const s = data.data?.attributes?.last_analysis_stats ?? {}
      const bad = (s.malicious ?? 0) + (s.suspicious ?? 0)
      const total = bad + (s.harmless ?? 0) + (s.undetected ?? 0)
      if (bad > 0) threats.push({ host_masked: maskHost(host), detail: `${total} 個資安引擎中有 ${s.malicious ?? 0} 個判定惡意、${s.suspicious ?? 0} 個判定可疑`, malicious: s.malicious ?? 0 })
    } catch {
      failed = true
    }
  }
  if (threats.length) return ext('found', 'VirusTotal 有資安引擎將網域標示為惡意或可疑（少數引擎標示可能是誤判）。', threats)
  if (failed && !checked) return ext('error', 'VirusTotal 查詢失敗或逾時，其他分析照常進行。')
  return ext('clean', 'VirusTotal 的資安引擎沒有將網域標示為惡意（新網站可能還沒有紀錄）。')
}

/** VirusTotal 多少個引擎判定惡意才算數（1 個常是誤判） */
export const vtMaliciousCount = (r: ExternalUrlResult) => r.threats.reduce((n, t) => Math.max(n, t.malicious ?? 0), 0)
