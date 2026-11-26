import { describe, expect, it, vi } from 'vitest'
import { readBrowserGoogleQuota } from '../browserGoogleQuota'

const project = 'sample-quota'
const token = 'test-only'
const now = new Date('2026-11-01T16:18:42Z')
const cutoff = '2026-11-01T16:15:00Z'
const earlier = '2026-11-01T16:10:00Z'
const model = 'gemini-3-flash'
const point = (count: number, endTime = cutoff) => ({ interval: { endTime }, value: { int64Value: String(count) } })
const series = (model: string, count: number, method = '', endTime = cutoff) => ({
  metric: { labels: { model, method } }, points: [point(count, endTime)],
})

function googlePages(usage: object, limit: object, next?: object) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input))
    expect(url.origin).toBe('https://monitoring.googleapis.com')
    expect(url.pathname).toBe('/v3/projects/sample-quota/timeSeries')
    expect(url.searchParams.get('filter')).toContain('project = "sample-quota"')
    expect(url.searchParams.get('filter')).toContain('GenerateRequestsPerDayPerProjectPerModel-FreeTier')
    expect(url.searchParams.get('fields')).toBeNull()
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-only')
    expect(init?.credentials).toBe('omit')
    expect(init?.redirect).toBe('error')
    expect(url.searchParams.toString()).not.toContain(token)
    const isLimit = url.searchParams.get('filter')?.includes('/limit"')
    return Response.json(url.searchParams.has('pageToken') ? next : isLimit ? limit : usage)
  })
}

describe('瀏覽器直接讀取 Google 的每日模型用量', () => {
  it('辨認空白方法、原始模型名稱以及同一模型的上限；分頁重複區間只計一次', async () => {
    const fetcher = googlePages(
      { timeSeries: [series(model, 5)], nextPageToken: 'second' },
      { timeSeries: [series(model, 20), series('gemini-3-flash-preview', 40)] },
      { timeSeries: [series(model, 5), series(model, 2, '', earlier)] },
    )
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.day).toBe('2026-11-01')
    expect(Date.parse(report.asOf)).toBe(Date.parse(cutoff))
    expect(report.models).toEqual([
      { model, used: 7, limit: 20, remaining: 13 },
      { model: 'gemini-3-flash-preview', used: null, limit: 40, remaining: null },
    ])
    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)))
    const usage = urls.find(url => url.searchParams.get('filter')?.includes('/usage"'))!
    expect(usage.searchParams.get('interval.startTime')).toBe('2026-11-01T07:00:00.000Z')
    expect(usage.searchParams.get('aggregation.crossSeriesReducer')).toBe('REDUCE_SUM')
    expect(usage.searchParams.getAll('aggregation.groupByFields')).toContain('metric.label.method')
  })

  it('當日確有零值才顯示零；同一時段方法可能重疊或上限彼此矛盾則標為未知', async () => {
    const fetcher = googlePages(
      { timeSeries: [series('a', 3), series('a', 2, 'GenerateContent'), series('b', 0), series('c', 3)] },
      { timeSeries: [series('a', 20), series('b', 20), series('c', 20), series('c', 40)] },
    )
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.models).toEqual([
      { model: 'a', used: null, limit: 20, remaining: null },
      { model: 'b', used: 0, limit: 20, remaining: 20 },
      { model: 'c', used: 3, limit: null, remaining: null },
    ])
  })

  it('單一模型的負一上限保持未知，其他有一致地區上限的模型仍可顯示', async () => {
    const fetcher = googlePages(
      { timeSeries: [series('unlimited', 3), series(model, 4)] },
      { timeSeries: [series('unlimited', -1), series(model, 20), series(model, 20)] },
    )
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.models).toEqual([
      { model, used: 4, limit: 20, remaining: 16 },
      { model: 'unlimited', used: 3, limit: null, remaining: null },
    ])
  })

  it('太平洋午夜後尚無完整區間時不讀昨天；一般冬日從 UTC 08:00 開始', async () => {
    const fetcher = googlePages({}, {})
    await expect(readBrowserGoogleQuota(project, token, { now: new Date('2026-11-02T08:01:00Z'), fetcher })).rejects.toThrow(/配額日/)
    expect(fetcher).not.toHaveBeenCalled()
    await readBrowserGoogleQuota(project, token, { now: new Date('2026-11-02T16:18:42Z'), fetcher })
    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)))
    expect(urls.find(url => url.searchParams.get('filter')?.includes('/usage"'))?.searchParams.get('interval.startTime'))
      .toBe('2026-11-02T08:00:00.000Z')
  })

  it('Google 回報部分失敗時不呈現不完整總數，不帶出上游錯誤內文', async () => {
    const fetcher = googlePages({ executionErrors: [{ message: 'private details' }] }, {})
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.models).toEqual([])
    expect(report.issues).toEqual([{ kind: 'usage', message: expect.stringMatching(/完整/) }])
    expect(report.issues[0].message).not.toContain('private')
  })

  it('只計目前配額日已到齊的區間；超過上限仍保留真實用量', async () => {
    const fetcher = googlePages({ timeSeries: [{
      metric: { labels: { model, method: '' } },
      points: [point(99, '2026-11-01T07:00:00Z'), point(24), point(1, '2026-11-01T16:20:00Z')],
    }] }, { timeSeries: [series(model, 20)] })
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.models).toEqual([{ model, used: 24, limit: 20, remaining: 0 }])
  })

  it('對齊終點偏移但屬同日仍能讀取；跨過午夜且無法拆分的區間保留未知', async () => {
    const fetcher = googlePages(
      { timeSeries: [series(model, 2, '', '2026-11-01T16:14:30Z'), series('boundary', 3, '', '2026-11-01T07:02:30Z')] },
      { timeSeries: [series(model, 20, '', '2026-11-01T16:14:30Z'), series('boundary', 20)] },
    )
    expect((await readBrowserGoogleQuota(project, token, { now, fetcher })).models).toEqual([
      { model: 'boundary', used: null, limit: 20, remaining: null },
      { model, used: 2, limit: 20, remaining: 18 },
    ])
  })

  it('有下一頁卻無法讀完時不以部分用量當成當日總數', async () => {
    const page = { timeSeries: [series(model, 1)], nextPageToken: 'repeated-page' }
    const fetcher = googlePages(page, { timeSeries: [series(model, 20)] }, page)
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.issues).toEqual([{ kind: 'usage', message: expect.stringMatching(/完整/) }])
    expect(report.models).toEqual([{ model, used: null, limit: 20, remaining: null }])
  })

  it.each(['usage', 'limit'] as const)('一項查詢 %s 回 403 時仍讀完另一項，剩餘保留未知', async denied => {
    const fetcher: typeof fetch = async (input, init) => {
      const usage = new URL(String(input)).searchParams.get('filter')!.includes('/usage"')
      if ((usage ? 'usage' : 'limit') === denied) {
        return Response.json({ error: { message: 'Billing check failed for private-example.' } }, { status: 403 })
      }
      await new Promise(resolve => setTimeout(resolve, 5))
      init?.signal?.throwIfAborted()
      return Response.json({ timeSeries: [series(model, usage ? 7 : 20)] })
    }
    const report = await readBrowserGoogleQuota(project, token, { now, fetcher })
    expect(report.issues).toEqual([{ kind: denied, message: expect.stringMatching(/403.*帳單/) }])
    expect(report.models).toEqual([{ model, used: denied === 'usage' ? null : 7,
      limit: denied === 'limit' ? null : 20, remaining: null }])
  })

  it('兩項都被拒絕時分別交代原因，隱去 Google 錯誤原文', async () => {
    const fetcher: typeof fetch = async input => {
      const usage = new URL(String(input)).searchParams.get('filter')!.includes('/usage"')
      const reason = usage ? 'BILLING_DISABLED' : 'SERVICE_DISABLED'
      return Response.json({ error: { message: 'private details', details: [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason },
      ] } }, { status: 403 })
    }
    const read = readBrowserGoogleQuota(project, token, { now, fetcher })
    await expect(read).rejects.toThrow(/今日已用[\s\S]*帳單[\s\S]*每日上限[\s\S]*Monitoring API/)
    await expect(read).rejects.not.toThrow(/private/)
  })

  it('失敗只說明狀態碼及處理方式，不重送憑證到其他服務', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('private details', { status: 403 }))
    await expect(readBrowserGoogleQuota(project, token, { now, fetcher })).rejects.toThrow(/403/)
    await expect(readBrowserGoogleQuota('bad/project', token, { now, fetcher })).rejects.toThrow(/專案/)
    expect(fetcher.mock.calls.every(([input]) => new URL(String(input)).origin === 'https://monitoring.googleapis.com')).toBe(true)
  })

  it.each([
    ['BILLING_DISABLED', 'internal private detail', /帳單/],
    ['', 'This API method requires billing to be enabled on project private-example.', /帳單/],
    ['SERVICE_DISABLED', 'internal private detail', /Monitoring API/],
    ['IAM_PERMISSION_DENIED', 'internal private detail', /監控檢視者/],
    ['ACCESS_TOKEN_SCOPE_INSUFFICIENT', 'internal private detail', /唯讀授權/],
    ['UNRECOGNIZED_REASON', 'private account detail', /未提供可辨識/],
  ])('區分 403 原因 %s，保留 Google 的錯誤細節在分頁內', async (reason, message, hint) => {
    const fetcher: typeof fetch = async () => Response.json({ error: {
      message, details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com' }],
    } }, { status: 403 })
    const read = readBrowserGoogleQuota(project, token, { now, fetcher })
    await expect(read).rejects.toThrow(hint)
    await expect(read).rejects.not.toThrow(/private/)
  })
})
