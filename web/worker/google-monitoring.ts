import { googleDay } from './aimodels'
import { b64url } from './util'

export interface MonitoringSecrets {
  GOOGLE_MONITORING_PROJECT_ID?: string
  GOOGLE_MONITORING_CLIENT_EMAIL?: string
  GOOGLE_MONITORING_PRIVATE_KEY?: string
}

export interface GoogleQuotaSnapshot {
  day: string
  models: Record<string, { limit: number; used: number; asOf: string }>
}

export class MonitoringError extends Error {}
export const monitoringConfigured = (env: MonitoringSecrets) => Boolean(
  env.GOOGLE_MONITORING_PROJECT_ID?.trim() && env.GOOGLE_MONITORING_CLIENT_EMAIL?.trim() && env.GOOGLE_MONITORING_PRIVATE_KEY?.trim(),
)

const oauthUrl = 'https://oauth2.googleapis.com/token'
const dailyLimit = 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'
const metric = 'generativelanguage.googleapis.com/quota/generate_content_free_tier_requests'
const intervalMs = 5 * 60_000
const incomplete = () => new MonitoringError('Google 監控資料不完整，請稍後再更新。')

async function authorizedJson(request: Promise<Response>, stage: '服務帳戶授權' | '用量查詢') {
  let response: Response
  try {
    response = await request
  } catch {
    throw new MonitoringError(`Google ${stage}連線失敗或逾時，請稍後再更新。`)
  }
  if (!response.ok) {
    let action = '請稍後再更新。'
    if (stage === '服務帳戶授權' && [400, 401, 403].includes(response.status)) {
      action = '請核對 Worker 的服務帳戶電子郵件和私鑰是否來自同一份有效的金鑰檔。'
    } else if (stage === '用量查詢' && response.status === 400) {
      action = '請檢查網站送出的監控查詢參數。'
    } else if (stage === '用量查詢' && [401, 403].includes(response.status)) {
      action = '請確認目標專案已啟用 Cloud Monitoring API，並已授予此服務帳戶監控讀取權限。'
    }
    throw new MonitoringError(`Google ${stage}失敗（HTTP ${response.status}）。${action}`)
  }
  try {
    return await response.json()
  } catch {
    throw new MonitoringError(`無法讀取 Google ${stage}的回應，請稍後再更新。`)
  }
}

async function getAccessToken(env: MonitoringSecrets, fetcher: typeof fetch, signal: AbortSignal): Promise<string> {
  const encoded = env.GOOGLE_MONITORING_PRIVATE_KEY!.replaceAll('\\n', '\n')
    .replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '')
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(encoded), ch => ch.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  } catch {
    throw new MonitoringError('監控服務帳戶的私鑰格式無法辨識，請確認 Worker 的設定。')
  }
  const issued = Math.floor(Date.now() / 1000)
  const payload = b64url(JSON.stringify({
    iss: env.GOOGLE_MONITORING_CLIENT_EMAIL!.trim(), scope: 'https://www.googleapis.com/auth/monitoring.read',
    aud: oauthUrl, iat: issued, exp: issued + 600,
  }))
  const signed = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + payload
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signed))
  const signature64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signed + '.' + signature64 })
  const data = await authorizedJson(fetcher(oauthUrl, { method: 'POST', body, redirect: 'manual', signal }), '服務帳戶授權') as { access_token?: string }
  if (typeof data.access_token !== 'string' || !data.access_token) throw new MonitoringError('Google 未核發監控權杖，請確認服務帳戶的授權。')
  return data.access_token
}

type Series = {
  metric?: { labels?: { model?: string; method?: string } }
  points?: { interval?: { endTime?: string }; value?: { int64Value?: string } }[]
}
type SeriesPage = { timeSeries?: Series[]; nextPageToken?: string; executionErrors?: unknown[] }

function seriesQuery(project: string, ids: string[], kind: 'usage' | 'limit', start: number, end: number) {
  const url = new URL('https://monitoring.googleapis.com/v3/projects/' + project + '/timeSeries')
  const modelClause = ids.map(id => 'metric.labels.model = "' + id + '"').join(' OR ')
  url.search = new URLSearchParams({
    filter: `project = "${project}" AND metric.type = "${metric}/${kind}" AND metric.labels.limit_name = "${dailyLimit}" AND (${modelClause})`,
    view: 'FULL',
    'interval.startTime': new Date(start).toISOString(), 'interval.endTime': new Date(end).toISOString(),
    'aggregation.alignmentPeriod': '300s',
    'aggregation.perSeriesAligner': kind === 'usage' ? 'ALIGN_SUM' : 'ALIGN_NEXT_OLDER',
    'aggregation.crossSeriesReducer': kind === 'usage' ? 'REDUCE_SUM' : 'REDUCE_MIN',
    'aggregation.groupByFields': 'metric.label.model', pageSize: '3000',
    fields: 'nextPageToken,executionErrors,timeSeries(metric/labels,points(interval/endTime,value/int64Value))',
  }).toString()
  // 每日上限適用整個專案。加總各地用量時保留方法，驗證同一額度確實包含本站的 Interactions API。
  if (kind === 'usage') url.searchParams.append('aggregation.groupByFields', 'metric.label.method')
  return url
}

async function readSeries(url: URL, token: string, fetcher: typeof fetch, signal: AbortSignal,
  consume: (series: Series) => void) {
  for (let page = 0; page < 8; page++) {
    const request = fetcher(url.toString(), { headers: { Authorization: 'Bearer ' + token }, redirect: 'manual', signal })
    const data = await authorizedJson(request, '用量查詢') as SeriesPage
    if (data.executionErrors?.length || (data.timeSeries !== undefined && !Array.isArray(data.timeSeries))) throw incomplete()
    for (const series of data.timeSeries ?? []) consume(series)
    if (!data.nextPageToken) return
    url.searchParams.set('pageToken', data.nextPageToken)
  }
  throw incomplete()
}

/** 僅讀取已到齊的五分鐘區間；沒有當日互動用量的模型不會被當成用量為零。 */
export async function readGoogleQuota(env: MonitoringSecrets, modelIds: readonly string[], now = new Date(),
  fetcher: typeof fetch = fetch): Promise<GoogleQuotaSnapshot> {
  const project = env.GOOGLE_MONITORING_PROJECT_ID?.trim() ?? ''
  if (!monitoringConfigured(env) || !/^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]{6,20})$/.test(project))
    throw new MonitoringError('尚未完成 Google 監控設定，請確認專案 ID 和唯讀服務帳戶。')
  const ids = [...new Set(modelIds.filter(id => /^[a-z0-9][a-z0-9.-]{2,60}$/.test(id)))]
  const day = googleDay(now)
  const snapshot: GoogleQuotaSnapshot = { day, models: Object.create(null) }
  // 太平洋午夜是 UTC 07:00 或 08:00。切換日要以午夜當刻的時差計算。
  const seven = Date.parse(day + 'T07:00:00Z')
  const start = googleDay(new Date(seven)) === day ? seven : seven + 3_600_000
  // Google 取樣後可能再延遲 150 秒，避免把剛送出的查核誤判成尚有額度。
  const end = Math.floor((now.getTime() - 180_000) / intervalMs) * intervalMs
  if (!ids.length || end <= start) return snapshot
  const limits = new Map<string, { value: number; endTime: number }>()
  const usage = new Map<string, number>()
  const interactions = new Set<string>()
  const limitStart = Math.max(start, end - 2 * intervalMs)
  const signal = AbortSignal.timeout(25_000)
  try {
    const token = await getAccessToken(env, fetcher, signal)
    await Promise.all((['limit', 'usage'] as const).map(kind => {
      const since = kind === 'limit' ? limitStart : start
      return readSeries(seriesQuery(project, ids, kind, since, end), token, fetcher, signal, series => {
        const model = series.metric?.labels?.model
        if (!model || !ids.includes(model)) return
        for (const point of series.points ?? []) {
          const endTime = Date.parse(point.interval?.endTime ?? '')
          if (!Number.isFinite(endTime)) throw incomplete()
          if (endTime <= since || endTime > end) continue
          const raw = point.value?.int64Value
          const value = Number(raw)
          if (typeof raw !== 'string' || !/^\d+$/.test(raw) || !Number.isSafeInteger(value)) throw incomplete()
          if (kind === 'limit') {
            if (endTime > (limits.get(model)?.endTime ?? 0)) limits.set(model, { value, endTime })
          } else {
            const sum = (usage.get(model) ?? 0) + value
            if (!Number.isSafeInteger(sum)) throw incomplete()
            usage.set(model, sum)
            const method = series.metric?.labels?.method ?? ''
            if (value > 0 && /(?:^|[./])(?:CreateInteraction(?:Http)?|Interactions(?:Service)?[./]Create)$/i.test(method))
              interactions.add(model)
          }
        }
      })
    }))
  } catch (error) {
    if (error instanceof MonitoringError) throw error
    throw new MonitoringError('無法連線至 Google 監控或讀取回應，請稍後再更新。')
  }
  for (const model of interactions) {
    const limit = limits.get(model)
    if (limit) snapshot.models[model] = { limit: limit.value, used: usage.get(model)!, asOf: new Date(end).toISOString() }
  }
  return snapshot
}
