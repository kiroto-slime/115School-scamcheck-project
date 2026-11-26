import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isLocalQuotaAdmin, prepareGoogleQuotaAuthorization } from './googleQuotaAuthorization'

const clientId = '1234567890-example.apps.googleusercontent.com'
const readScope = 'https://www.googleapis.com/auth/monitoring.read'
const scriptUrl = 'https://accounts.google.com/gsi/client'
const granted = { access_token: 'test-only-token', token_type: 'Bearer', scope: readScope, expires_in: 3600 }

type TestConfig = {
  callback: (response: Record<string, string | number>) => void
  error_callback: (error: { type: string }) => void
}

function mockIdentity() {
  const requestAccessToken = vi.fn()
  const initTokenClient = vi.fn((_config: TestConfig) => ({ requestAccessToken }))
  vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } })
  return { initTokenClient, requestAccessToken }
}

beforeEach(() => { history.replaceState(null, '', '/admin') })
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.querySelectorAll(`script[src="${scriptUrl}"]`).forEach(script => script.remove())
  history.replaceState(null, '', '/')
})

describe('Google 額度的本機唯讀授權', () => {
  it('正式建置即使在管理頁也不會載入或開啟 OAuth', async () => {
    vi.stubEnv('DEV', false)
    expect(isLocalQuotaAdmin()).toBe(false)
    await expect(prepareGoogleQuotaAuthorization(clientId)).rejects.toThrow()
    expect(document.querySelector(`script[src="${scriptUrl}"]`)).toBeNull()
  })

  it('只在本機管理頁載入官方程式，離開管理頁後不會開啟授權', async () => {
    history.replaceState(null, '', '/check')
    expect(isLocalQuotaAdmin()).toBe(false)
    await expect(prepareGoogleQuotaAuthorization(clientId)).rejects.toThrow()
    expect(document.querySelector(`script[src="${scriptUrl}"]`)).toBeNull()
    history.replaceState(null, '', '/admin')
    expect(isLocalQuotaAdmin()).toBe(true)
    const first = prepareGoogleQuotaAuthorization(clientId)
    const second = prepareGoogleQuotaAuthorization(clientId)
    const scripts = document.querySelectorAll(`script[src="${scriptUrl}"]`)
    expect(scripts).toHaveLength(1)
    const identity = mockIdentity()
    scripts[0].dispatchEvent(new Event('load'))
    const request = await first
    await second
    history.replaceState(null, '', '/history')
    await expect(request()).rejects.toThrow()
    expect(identity.requestAccessToken).not.toHaveBeenCalled()
  })

  it('在點擊時同步開啟唯讀要求，只交付範圍完全相同的短效權杖', async () => {
    const identity = mockIdentity()
    const request = await prepareGoogleQuotaAuthorization(clientId)
    expect(identity.requestAccessToken).not.toHaveBeenCalled()
    const first = request()
    expect(identity.requestAccessToken).toHaveBeenCalledTimes(1)
    const config = identity.initTokenClient.mock.calls[0][0]
    expect(config).toMatchObject({ client_id: clientId, scope: readScope, include_granted_scopes: false })
    config.callback({ ...granted, scope: `${readScope} email` })
    await expect(first).rejects.toThrow(/唯讀/)
    const second = request()
    identity.initTokenClient.mock.calls[1][0].callback(granted)
    await expect(second).resolves.toBe(granted.access_token)
  })

  it('關閉視窗或中止可重新取得，舊的授權回應不會交給新的查詢', async () => {
    const identity = mockIdentity()
    const request = await prepareGoogleQuotaAuthorization(clientId)
    const first = request()
    identity.initTokenClient.mock.calls[0][0].error_callback({ type: 'popup_closed' })
    await expect(first).rejects.toThrow(/關閉/)
    const controller = new AbortController()
    const second = request(controller.signal)
    controller.abort()
    await expect(second).rejects.toThrow()
    const third = request()
    identity.initTokenClient.mock.calls[1][0].callback({ ...granted, access_token: 'old' })
    identity.initTokenClient.mock.calls[2][0].callback(granted)
    await expect(third).resolves.toBe(granted.access_token)
  })

  it('載入失敗後可重試，授權無回應時也會結束等待', async () => {
    vi.useFakeTimers()
    const first = prepareGoogleQuotaAuthorization(clientId)
    document.querySelector(`script[src="${scriptUrl}"]`)!.dispatchEvent(new Event('error'))
    await expect(first).rejects.toThrow(/載入/)
    const next = prepareGoogleQuotaAuthorization(clientId)
    const script = document.querySelector(`script[src="${scriptUrl}"]`)
    expect(script).not.toBeNull()
    mockIdentity()
    script!.dispatchEvent(new Event('load'))
    const request = await next
    const authorization = expect(request()).rejects.toThrow(/逾時/)
    await vi.runAllTimersAsync()
    await authorization
  })
})
