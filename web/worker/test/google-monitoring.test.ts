import { beforeAll, describe, expect, it, vi } from 'vitest'
import { readGoogleQuota, type MonitoringSecrets } from '../google-monitoring'

const credentials: MonitoringSecrets = {
  GOOGLE_MONITORING_PROJECT_ID: 'example-quota',
  GOOGLE_MONITORING_CLIENT_EMAIL: 'monitor@example-quota.iam.gserviceaccount.com',
}
beforeAll(async () => {
  const keys = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256',
  }, true, ['sign', 'verify'])
  if (!('privateKey' in keys)) throw new Error('測試私鑰未建立。')
  const bytes = await crypto.subtle.exportKey('pkcs8', keys.privateKey)
  if (!(bytes instanceof ArrayBuffer)) throw new Error('測試私鑰格式錯誤。')
  credentials.GOOGLE_MONITORING_PRIVATE_KEY = btoa(String.fromCharCode(...new Uint8Array(bytes)))
})
const now = new Date('2026-11-01T12:09:35Z')
const asOf = '2026-11-01T12:05:00.000Z'
function series(model: string, value: number, method?: string, endTime = asOf) {
  return { metric: { labels: { model, method } }, points: [{ interval: { endTime }, value: { int64Value: String(value) } }] }
}
describe('Google 免費模型每日監控', () => {
  it('依太平洋午夜查詢，確認互動方法後加總同一模型的各種呼叫，空資料保留未知', async () => {
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input))
      if (url.hostname === 'oauth2.googleapis.com') {
        expect(new Request(input, init).headers.get('content-type')).toMatch(/^application\/x-www-form-urlencoded/i)
        const jwt = new URLSearchParams(String(init?.body)).get('assertion')!
        expect(JSON.parse(atob(jwt.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))).scope)
          .toBe('https://www.googleapis.com/auth/monitoring.read')
        return Response.json({ access_token: 'temporary-test-token' })
      }
      expect(url.hostname).toBe('monitoring.googleapis.com')
      expect(url.searchParams.get('view')).toBe('FULL')
      expect(url.searchParams.get('filter')).toContain('example-quota')
      expect(url.searchParams.get('filter')).toContain('GenerateRequestsPerDayPerProjectPerModel-FreeTier')
      if (url.searchParams.get('filter')?.includes('/limit"')) return Response.json({ timeSeries: [series('a-1', 20), series('b-2', 50)] })
      expect(url.searchParams.get('interval.startTime')).toBe('2026-11-01T07:00:00.000Z')
      expect(url.searchParams.get('interval.endTime')).toBe(asOf)
      expect(url.searchParams.getAll('aggregation.groupByFields')).toContain('metric.label.method')
      if (url.searchParams.has('pageToken')) return Response.json({ timeSeries: [series('a-1', 2, 'GenerateContent')] })
      return Response.json({ nextPageToken: 'second', timeSeries: [
        series('a-1', 4, 'google.ai.generativelanguage.v1beta.InteractionsService.CreateInteraction'),
        series('b-2', 8, 'GenerateContent'), series('other', 10, 'CreateInteraction'),
      ] })
    }
    expect(await readGoogleQuota(credentials, ['a-1', 'b-2'], now, fetcher)).toEqual({
      day: '2026-11-01', models: { 'a-1': { used: 6, limit: 20, asOf } },
    })
  })

  it('新的一天尚未有完整資料時不拿昨天的數字補上', async () => {
    const fetcher = vi.fn<typeof fetch>()
    expect(await readGoogleQuota(credentials, ['a-1'], new Date('2026-11-02T08:02:00Z'), fetcher))
      .toEqual({ day: '2026-11-02', models: {} })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('部分監控資料或權限失敗時回傳安全錯誤', async () => {
    const fetcher: typeof fetch = async (input) => String(input).includes('oauth2.googleapis.com')
      ? Response.json({ access_token: 'temporary-test-token' })
      : Response.json({ executionErrors: [{ message: 'private upstream detail' }], timeSeries: [] })
    await expect(readGoogleQuota(credentials, ['a-1'], now, fetcher)).rejects.toThrow(/監控/)
  })

  it.each([
    ['授權', 400, /授權.*400.*私鑰/],
    ['監控', 400, /用量查詢.*400.*參數/],
    ['監控', 403, /用量查詢.*403.*權限/],
  ] as const)('%s 階段的 HTTP %i 只顯示安全提示', async (stage, status, expected) => {
    const fetcher: typeof fetch = async input => {
      if (stage === '監控' && String(input).includes('oauth2.googleapis.com')) {
        return Response.json({ access_token: 'temporary-test-token' })
      }
      return new Response('private upstream detail', { status })
    }
    const request = readGoogleQuota(credentials, ['a-1'], now, fetcher)
    await expect(request).rejects.toThrow(expected)
    await expect(request).rejects.not.toThrow('private upstream detail')
  })

  it.each(['服務帳戶授權', '用量查詢'])('%s 連線中斷時會標出失敗階段', async stage => {
    const fetcher: typeof fetch = async input => {
      if (stage === '用量查詢' && String(input).includes('oauth2.googleapis.com')) {
        return Response.json({ access_token: 'temporary-test-token' })
      }
      throw Error('private upstream detail')
    }
    const request = readGoogleQuota(credentials, ['a-1'], now, fetcher)
    await expect(request).rejects.toThrow(stage)
    await expect(request).rejects.not.toThrow('private upstream detail')
  })

  it.each(['服務帳戶授權', '用量查詢'])('%s 遇到重新導向就停止，憑證只送往原本的服務', async stage => {
    const calls: Request[] = []
    const fetcher: typeof fetch = async (input, init) => {
      const req = new Request(input, init)
      calls.push(req)
      if (stage === '用量查詢' && new URL(req.url).hostname === 'oauth2.googleapis.com') {
        return Response.json({ access_token: 'temporary-test-token' })
      }
      return Response.redirect('https://example.invalid/', 307)
    }
    await expect(readGoogleQuota(credentials, ['a-1'], now, fetcher)).rejects.toThrow('HTTP 307')
    expect(calls.length).toBeGreaterThan(0)
    for (const req of calls) {
      expect(req.redirect).toBe('manual')
      expect(['oauth2.googleapis.com', 'monitoring.googleapis.com']).toContain(new URL(req.url).hostname)
    }
  })
})
