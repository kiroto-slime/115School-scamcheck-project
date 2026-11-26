export type BrowserQuotaReport = {
  day: string
  asOf: string
  models: { model: string; used: number | null; limit: number | null; remaining: number | null }[]
  issues: { kind: Kind; message: string }[]
}

type QueryOptions = { now?: Date; fetcher?: typeof fetch; signal?: AbortSignal }

const metric = 'generativelanguage.googleapis.com/quota/generate_content_free_tier_requests'
const quotaName = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
const bucketMs = 300_000
const pacificDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
})
type Kind = 'limit' | 'usage'
const kinds = ['usage', 'limit'] as const
export const quotaLabels: Record<Kind, string> = { usage: '今日已用', limit: '每日上限' }
type Series = {
  metric?: { labels?: { model?: string; method?: string } }
  points?: { interval?: { endTime?: string }; value?: { int64Value?: string } }[]
}
type Page = { timeSeries?: Series[]; executionErrors?: unknown[]; nextPageToken?: string }
class QuotaReadError extends Error {}
const incomplete = () => new QuotaReadError('Google 傳回的資料不完整，請稍後再更新。')

function quotaCount(raw: unknown) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) ? value : null
}

function queryUrl(project: string, kind: Kind, since: number, until: number) {
  const url = new URL('https://monitoring.googleapis.com/v3/projects/' + project + '/timeSeries')
  url.search = new URLSearchParams({
    filter: `project = "${project}" AND metric.type = "${metric}/${kind}" AND metric.labels.limit_name = "${quotaName}" AND resource.type = "generativelanguage.googleapis.com/Location"`,
    view: 'FULL', pageSize: '5000',
    'interval.startTime': new Date(since).toISOString(), 'interval.endTime': new Date(until).toISOString(),
    'aggregation.alignmentPeriod': '300s',
    'aggregation.perSeriesAligner': kind === 'usage' ? 'ALIGN_SUM' : 'ALIGN_NEXT_OLDER',
  }).toString()
  if (kind === 'usage') {
    // 由 Google 合併同一模型、同一方法的不同地區，保留方法以檢查讀值是否重疊。
    url.searchParams.set('aggregation.crossSeriesReducer', 'REDUCE_SUM')
    url.searchParams.append('aggregation.groupByFields', 'metric.label.model')
    url.searchParams.append('aggregation.groupByFields', 'metric.label.method')
  }
  return url
}

async function forbiddenError(response: Response) {
  type Detail = { '@type'?: string; reason?: string }
  type ErrorBody = { error?: { message?: string; details?: Detail[] } }
  const data: ErrorBody | null = await response.json().catch(() => null)
  const error = data?.error
  const details = Array.isArray(error?.details) ? error.details : []
  const reasons = details.filter(item => item?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo').map(item => item.reason)
  const message = typeof error?.message === 'string' ? error.message : ''
  // 只依 Google 的已知原因產生提示，避免介面顯示帳戶名稱或專案內部資訊。
  const billing = reasons.includes('BILLING_DISABLED') ||
    /requires billing to be enabled|billing (?:account )?(?:is )?(?:disabled|not enabled|not active)|billing check failed/i.test(message)
  let hint = 'Google 未提供可辨識的拒絕原因。請先在 Google AI Studio 核對用量。'
  if (billing) hint = 'Google 表示這項查詢受專案的帳單條件限制。你可以在 Google AI Studio 查看用量。'
  else if (reasons.includes('SERVICE_DISABLED')) hint = 'Google 表示查詢所需的服務尚未啟用。請核對此專案的 Cloud Monitoring API。'
  else if (reasons.includes('IAM_PERMISSION_DENIED')) hint = '目前登入的帳號沒有讀取這個專案監控資料的權限。請選擇具備監控檢視者權限的帳號。'
  else if (reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) hint = 'Google 表示此次缺少監控唯讀授權。請重新按「立即更新」，並允許查看監控資料。'
  return new QuotaReadError(`Google 拒絕查詢（403）。${hint}`)
}

async function readPages(url: URL, fetcher: typeof fetch, token: string, signal: AbortSignal, consume: (series: Series) => void) {
  const seen = new Set<string>()
  for (;;) {
    let response: Response
    try {
      response = await fetcher(url.toString(), {
        method: 'GET', headers: { Authorization: 'Bearer ' + token },
        credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
      })
    } catch {
      throw new QuotaReadError('查詢已中斷或無法連線至 Google，請重新更新。')
    }
    if (!response.ok) {
      if (response.status === 401) throw new QuotaReadError('Google 授權已失效（401），請重新按「立即更新」並授權。')
      if (response.status === 403) throw await forbiddenError(response)
      throw new QuotaReadError(`Google 查詢失敗（HTTP ${response.status}），請稍後再更新。`)
    }
    const data: Page | null = await response.json().catch(() => null)
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.executionErrors?.length ||
        (data.timeSeries !== undefined && !Array.isArray(data.timeSeries))) throw incomplete()
    for (const series of data.timeSeries ?? []) consume(series)
    if (!data.nextPageToken) return
    if (typeof data.nextPageToken !== 'string' || seen.has(data.nextPageToken)) throw incomplete()
    seen.add(data.nextPageToken)
    // 下一頁只能改 Google 給的游標，目的地固定在同一個專案及 Google 網域。
    url.searchParams.set('pageToken', data.nextPageToken)
  }
}

type UsageBuckets = Map<number, Map<string, number>>

function totalUsage(buckets: UsageBuckets | null | undefined) {
  if (!buckets) return null
  let used = 0
  let previousEnd = -Infinity
  for (const [end, methods] of [...buckets].sort(([a], [b]) => a - b)) {
    if (end - previousEnd < bucketMs) return null
    previousEnd = end
    // 同時有無方法名稱的正數與具名方法的正數時，無法確認前者是否已包含後者。
    if ((methods.get('') ?? 0) > 0 && [...methods].some(([method, count]) => method !== '' && count > 0)) return null
    for (const count of methods.values()) used += count
    if (!Number.isSafeInteger(used)) throw incomplete()
  }
  return used
}

export async function readBrowserGoogleQuota(
  projectId: string, accessToken: string, options: QueryOptions = {},
): Promise<BrowserQuotaReport> {
  if (!/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{6,20})$/.test(projectId)) throw new Error('Google Cloud 專案 ID 格式不正確，請核對設定。')
  if (!accessToken) throw new Error('尚未取得 Google 唯讀授權，請重新按「立即更新」。')
  const now = options.now ?? new Date()
  const day = pacificDay.format(now)
  // 美國太平洋午夜可能是 UTC 07:00 或 08:00，依午夜當時的夏令時間判斷。
  const seven = Date.parse(day + 'T07:00:00Z')
  const start = pacificDay.format(seven) === day ? seven : seven + 3_600_000
  // 指標取樣後最多延遲 150 秒。兩個查詢共用已到齊的五分鐘截止點。
  const end = Math.floor((now.getTime() - 180_000) / bucketMs) * bucketMs
  if (end <= start) throw new Error('配額日剛開始，Google 今天的資料仍在彙整，請稍後再更新。')

  const usage = new Map<string, UsageBuckets | null>()
  const limits = new Map<string, Set<number | null>>()
  const issues: BrowserQuotaReport['issues'] = []
  const controller = new AbortController()
  const cancel = () => controller.abort()
  const timer = setTimeout(cancel, 30_000)
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  try {
    const results = await Promise.allSettled(kinds.map(kind => {
      const since = kind === 'usage' ? start : end - bucketMs
      const url = queryUrl(projectId, kind, since, end)
      return readPages(url, options.fetcher ?? fetch, accessToken, controller.signal, series => {
        const model = series?.metric?.labels?.model
        const method = series?.metric?.labels?.method ?? ''
        if (typeof model !== 'string' || !model || typeof method !== 'string' || !Array.isArray(series.points)) throw incomplete()
        for (const point of series.points) {
          const time = Date.parse(point?.interval?.endTime ?? '')
          if (time <= since || time > end) continue
          const count = Number.isFinite(time) ? quotaCount(point?.value?.int64Value) : null
          if (kind === 'limit') {
            // 每專案每日上限可能在多個地區回報；只有讀值一致時才採用，不能相加。
            const values = limits.get(model) ?? new Set<number | null>()
            values.add(count)
            limits.set(model, values)
          } else {
            if (usage.get(model) === null) continue
            if (count === null || time - bucketMs < start) {
              usage.set(model, null)
              continue
            }
            const buckets = usage.get(model) ?? new Map<number, Map<string, number>>()
            const methods = buckets.get(time) ?? new Map<string, number>()
            if (methods.has(method) && methods.get(method) !== count) {
              usage.set(model, null)
              continue
            }
            methods.set(method, count)
            buckets.set(time, methods)
            usage.set(model, buckets)
          }
        }
      })
    }))
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return
      const kind = kinds[index]
      // 分頁未讀完時捨棄這個指標的所有數字，另一項完整的讀值仍然有效。
      if (kind === 'usage') usage.clear()
      else limits.clear()
      const message = result.reason instanceof QuotaReadError ? result.reason.message : incomplete().message
      issues.push({ kind, message })
    })
  } finally {
    cancel()
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', cancel)
  }

  if (issues.length === kinds.length) {
    const [used, limit] = issues
    if (used.message === limit.message) throw new Error(`今日已用和每日上限都查詢失敗。${used.message}`)
    throw new Error(issues.map(issue => `${quotaLabels[issue.kind]}：${issue.message}`).join('\n'))
  }
  const models = Array.from(new Set([...usage.keys(), ...limits.keys()])).sort().map(model => {
    const samples = limits.get(model)
    const limit = samples?.size === 1 ? [...samples][0] : null
    const used = totalUsage(usage.get(model))
    const remaining = used !== null && limit !== null ? Math.max(0, limit - used) : null
    return { model, used, limit, remaining }
  })
  return { day, asOf: new Date(end).toISOString(), models, issues }
}
