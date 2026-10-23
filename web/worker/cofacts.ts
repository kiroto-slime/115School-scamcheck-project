/**
 * Cofacts 官方 GraphQL API（https://api.cofacts.tw/）。
 * - 沒有憑證時是 Mock 模式：不查詢、不產生任何虛構查核回覆。
 * - 相似資料不等於同一事件；查無資料不代表沒有詐騙風險。
 * - Cofacts 資料以 CC BY-SA 4.0 授權，顯示時必須標示來源。不爬取 Cofacts 網站。
 */
import { sleep, takeDailyQuota } from './util'

export const LICENSE = 'CC BY-SA 4.0'
const API_URL = 'https://api.cofacts.tw/graphql'
const REPLY_TYPE_ZH: Record<string, string> = {
  RUMOR: '含有不實訊息', NOT_RUMOR: '含有正確訊息', OPINIONATED: '含有個人意見', NOT_ARTICLE: '不在查證範圍',
}
const STATUS_ZH: Record<string, string> = {
  found: '找到相關查核資料',
  not_found: '尚無查核資料',
  error: 'Cofacts 查詢失敗或逾時，其他分析仍正常進行。',
  not_configured: 'Demo 模式：尚未設定 Cofacts 憑證，未進行查詢（尚無查核資料）',
  rate_limited: '今日查詢次數已達上限，暫停外部查詢',
  skipped: '未查詢（使用者選擇不送出或沒有可查詢文字）',
}

const QUERY = `query($text: String!) {
  ListArticles(filter: { moreLikeThis: { like: $text, minimumShouldMatch: "0" } }, orderBy: [{ _score: DESC }], first: 3) {
    edges { score node { id text articleReplies(status: NORMAL) { reply { id type text } } } }
  }
}`

export interface SourceMatch {
  match_type: 'exact' | 'similar'
  title: string
  url: string
  reply_type: string | null
  reply_type_zh: string
  reply_excerpt: string | null
  similarity: number
}

export interface SourceLookup {
  status: keyof typeof STATUS_ZH
  mode: 'live' | 'mock'
  matches: SourceMatch[]
  message: string
  license: string
}

const lookup = (status: string, mode: 'live' | 'mock', matches: SourceMatch[] = []): SourceLookup =>
  ({ status, mode, matches, message: STATUS_ZH[status], license: LICENSE })

const canon = (t: string) => (t || '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()

/** 字元二元組 Dice 相似度（0–1）。比逐字比對省 CPU，適合 Workers 免費方案。 */
export function similarity(a: string, b: string): number {
  const x = [...canon(a)].slice(0, 600), y = [...canon(b)].slice(0, 600)
  if (!x.length || !y.length) return 0
  if (x.join('') === y.join('')) return 1
  if (x.length < 2 || y.length < 2) return 0
  const grams = new Map<string, number>()
  for (let i = 0; i < x.length - 1; i++) {
    const g = x[i] + x[i + 1]
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  let hit = 0
  for (let i = 0; i < y.length - 1; i++) {
    const g = y[i] + y[i + 1]
    const n = grams.get(g) ?? 0
    if (n > 0) {
      hit++
      grams.set(g, n - 1)
    }
  }
  return (2 * hit) / (x.length - 1 + y.length - 1)
}

export async function cofactsLookup(env: Env, text: string, dailyLimit: number, opts: { fetcher?: typeof fetch; retryDelayMs?: number } = {}): Promise<SourceLookup> {
  if (!(env.COFACTS_APP_ID && env.COFACTS_APP_SECRET)) return lookup('not_configured', 'mock')
  if (!text.trim()) return lookup('skipped', 'live')
  if (!(await takeDailyQuota(env.DB, 'cofacts', dailyLimit))) return lookup('rate_limited', 'live')
  const doFetch = opts.fetcher ?? fetch
  let data: { data?: { ListArticles?: { edges?: { node?: { id?: string; text?: string; articleReplies?: { reply?: { type?: string; text?: string } }[] } }[] } }; errors?: unknown } | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await doFetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-app-id': env.COFACTS_APP_ID, 'x-app-secret': env.COFACTS_APP_SECRET },
        body: JSON.stringify({ query: QUERY, variables: { text: text.slice(0, 2000) } }),
        signal: AbortSignal.timeout(8000),
      })
      if (r.status >= 500) throw new Error('server error')
      if (!r.ok) break // 4xx 不重試
      data = await r.json()
      if (data?.errors) data = null
      break
    } catch {
      if (attempt < 2) await sleep((opts.retryDelayMs ?? 400) * (attempt + 1))
    }
  }
  if (!data) return lookup('error', 'live')

  const matches: SourceMatch[] = []
  for (const edge of data.data?.ListArticles?.edges ?? []) {
    const node = edge.node ?? {}
    const artText = String(node.text ?? '')
    const ratio = similarity(text, artText)
    if (ratio < 0.4) continue // 關聯太低不列入，避免誤導
    const first = (node.articleReplies ?? []).map((ar) => ar.reply ?? {})[0] ?? {}
    const rtype = first.type ?? null
    matches.push({
      match_type: ratio >= 0.95 ? 'exact' : 'similar',
      title: artText.slice(0, 80),
      url: `https://cofacts.tw/article/${encodeURIComponent(String(node.id ?? ''))}`,
      reply_type: rtype,
      reply_type_zh: (rtype && REPLY_TYPE_ZH[rtype]) || '尚無查核回覆',
      reply_excerpt: first.text ? String(first.text).slice(0, 200) : null,
      similarity: Math.round(ratio * 100) / 100,
    })
  }
  return lookup(matches.length ? 'found' : 'not_found', 'live', matches)
}

export const skippedLookup = (env: Env) => lookup('skipped', env.COFACTS_APP_ID && env.COFACTS_APP_SECRET ? 'live' : 'mock')
