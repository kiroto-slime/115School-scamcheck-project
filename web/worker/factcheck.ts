/**
 * Google Fact Check Tools（claims:search）：搜尋台灣事實查核中心、MyGoPen 等查核組織發布的查核報告。
 * - 使用者勾選「Google 查核」且有 GOOGLE_CLOUD_API_KEY 才查詢；送出的是遮蔽個資後的一小段文字。
 * - 偏重新聞與謠言，詐騙訊息不一定查得到；查無資料不代表沒有風險。
 */
import { sleep, takeDailyQuota } from './util'

export interface FactCheckItem {
  claim: string
  publisher: string
  rating: string
  url: string
  date: string | null
}

export interface FactCheckResult {
  status: 'found' | 'not_found' | 'not_requested' | 'disabled' | 'rate_limited' | 'error'
  items: FactCheckItem[]
  message: string
}

const res = (status: FactCheckResult['status'], message: string, items: FactCheckItem[] = []): FactCheckResult => ({ status, items, message })

/** 搜尋時忽略的常見字（中英文） */
const STOP = new Set([
  '可以', '請於', '您的', '你的', '我們', '他們', '這個', '那個', '現在', '立即', '馬上', '已經', '如果', '因為', '所以', '但是', '還是', '就是',
  '沒有', '什麼', '怎麼', '一個', '時候', '今天', '明天', '可能', '需要', '進行', '相關', '大家', '自己', '知道', '真的', '一定', '不要', '網傳',
  'the', 'and', 'for', 'are', 'was', 'with', 'this', 'that', 'from', 'can', 'you', 'your', 'have', 'has', 'not', 'will', 'its', 'our',
])

const clean = (text: string) =>
  (text || '')
    .normalize('NFKC')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\[(?:身分證|手機|Email|數字帳號)\]/g, ' ')
    .slice(0, 500)

/**
 * Google 事實查核是「關鍵字搜尋」，整句話幾乎找不到，所以先斷詞、去掉常見字，組成短關鍵字。
 * 回傳最多 2 組：先用前 4 個重點詞，找不到再用最長的 2 個詞。
 */
export function factCheckQueries(text: string): string[] {
  const t = clean(text)
  let words: string[]
  try {
    words = [...new Intl.Segmenter('zh-Hant', { granularity: 'word' }).segment(t)].filter((x) => x.isWordLike).map((x) => x.segment)
  } catch {
    words = t.split(/[\s，。！？、,.!?]+/)
  }
  const keys: string[] = []
  for (const w of words) {
    const k = w.trim()
    if ([...k].length < 2 || /^\d+$/.test(k) || STOP.has(k.toLowerCase()) || keys.includes(k)) continue
    keys.push(k)
  }
  if (!keys.length) return []
  const first = keys.slice(0, 4).join(' ')
  const longest = [...keys].sort((a, b) => [...b].length - [...a].length).slice(0, 2).join(' ')
  return [...new Set([first, longest])]
}

type Claims = { claims?: { text?: string; claimReview?: { publisher?: { name?: string; site?: string }; url?: string; textualRating?: string; reviewDate?: string }[] }[] }

export async function factCheckLookup(env: Env, redactedText: string, dailyLimit: number, opts: { fetcher?: typeof fetch; retryDelayMs?: number } = {}): Promise<FactCheckResult> {
  if (!env.GOOGLE_CLOUD_API_KEY) return res('disabled', '尚未設定 Google 金鑰，未使用 Google 事實查核搜尋。')
  const queries = factCheckQueries(redactedText)
  if (!queries.length) return res('not_found', '沒有足夠的文字可以搜尋查核報告。')
  const doFetch = opts.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  for (const query of queries) {
    if (!(await takeDailyQuota(env.DB, 'factcheck', dailyLimit))) return res('rate_limited', '今日 Google 查詢次數已達上限。')
    const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&pageSize=3&key=${encodeURIComponent(env.GOOGLE_CLOUD_API_KEY)}`
    let data: Claims | null = null
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      try {
        const r = await doFetch(url, { signal: AbortSignal.timeout(8000) })
        if (r.status >= 500 && attempt === 0) {
          await sleep(opts.retryDelayMs ?? 500)
          continue
        }
        if (r.status === 403) return res('error', 'Google 金鑰沒有啟用 Fact Check Tools API，請到 Google Cloud 主控台啟用。')
        if (!r.ok) return res('error', `Google 事實查核搜尋暫時無法使用（${r.status}）。`)
        data = (await r.json()) as Claims
      } catch {
        if (attempt === 0) await sleep(opts.retryDelayMs ?? 500)
      }
    }
    if (!data) return res('error', 'Google 事實查核搜尋失敗或逾時，其他分析照常進行。')
    const items: FactCheckItem[] = []
    for (const c of data.claims ?? []) {
      const rv = c.claimReview?.[0]
      if (!rv?.url || !/^https:\/\//.test(rv.url)) continue
      items.push({
        claim: String(c.text ?? '').slice(0, 120),
        publisher: String(rv.publisher?.name ?? rv.publisher?.site ?? '查核組織').slice(0, 60),
        rating: String(rv.textualRating ?? '').slice(0, 60),
        url: rv.url,
        date: rv.reviewDate ? rv.reviewDate.slice(0, 10) : null,
      })
    }
    // 結果只列查核報告，不存搜尋用的關鍵字（關鍵字來自使用者的訊息）
    if (items.length) return res('found', '用訊息中的關鍵字找到可能相關的查核報告（請自行確認是否為同一件事）。', items)
  }
  return res('not_found', '沒有找到相關的查核報告（查無資料不代表沒有風險）。')
}
