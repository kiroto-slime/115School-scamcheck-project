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

/** 取出適合搜尋的一小段文字：去掉網址與遮蔽標記，取前 60 字 */
export function factCheckQuery(text: string): string {
  return (text || '')
    .normalize('NFKC')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\[(?:身分證|手機|Email|數字帳號)\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export async function factCheckLookup(env: Env, redactedText: string, dailyLimit: number, opts: { fetcher?: typeof fetch; retryDelayMs?: number } = {}): Promise<FactCheckResult> {
  if (!env.GOOGLE_CLOUD_API_KEY) return res('disabled', '尚未設定 Google 金鑰，未使用 Google 事實查核搜尋。')
  const query = factCheckQuery(redactedText)
  if (query.length < 4) return res('not_found', '沒有足夠的文字可以搜尋查核報告。')
  if (!(await takeDailyQuota(env.DB, 'factcheck', dailyLimit))) return res('rate_limited', '今日 Google 查詢次數已達上限。')
  const url = `https://factchecktools.googleapis.com/v1alpha1/claims:search?query=${encodeURIComponent(query)}&languageCode=zh&pageSize=3&key=${encodeURIComponent(env.GOOGLE_CLOUD_API_KEY)}`
  const doFetch = opts.fetcher ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await doFetch(url, { signal: AbortSignal.timeout(8000) })
      if (r.status >= 500 && attempt === 0) {
        await sleep(opts.retryDelayMs ?? 500)
        continue
      }
      if (r.status === 403) return res('error', 'Google 金鑰沒有啟用 Fact Check Tools API，請到 Google Cloud 主控台啟用。')
      if (!r.ok) return res('error', `Google 事實查核搜尋暫時無法使用（${r.status}）。`)
      const data = (await r.json()) as { claims?: { text?: string; claimReview?: { publisher?: { name?: string; site?: string }; url?: string; textualRating?: string; reviewDate?: string }[] }[] }
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
      return items.length
        ? res('found', '找到可能相關的查核報告（請自行確認是否為同一件事）。', items)
        : res('not_found', '沒有找到相關的查核報告（查無資料不代表沒有風險）。')
    } catch {
      if (attempt === 0) {
        await sleep(opts.retryDelayMs ?? 500)
        continue
      }
    }
  }
  return res('error', 'Google 事實查核搜尋失敗或逾時，其他分析照常進行。')
}
