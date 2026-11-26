const readScope = 'https://www.googleapis.com/auth/monitoring.read'
const localOnly = '請從本機開發站的管理頁開啟 Google 額度查詢。'

type TokenResponse = {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
}

interface GoogleAuthorization {
  initTokenClient(config: {
    client_id: string
    scope: string
    include_granted_scopes: boolean
    callback: (response: TokenResponse) => void
    error_callback: (error: { type: string }) => void
  }): { requestAccessToken: () => void }
}

function googleAuthorization(): GoogleAuthorization | undefined {
  return (window as Window & { google?: { accounts?: { oauth2?: GoogleAuthorization } } }).google?.accounts?.oauth2
}

export function isLocalQuotaAdmin(): boolean {
  return import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && ['http:', 'https:'].includes(location.protocol) && /^\/admin\/?$/.test(location.pathname)
}

let loading: Promise<GoogleAuthorization> | undefined

function loadGoogleAuthorization(): Promise<GoogleAuthorization> {
  const ready = googleAuthorization()
  if (ready) return Promise.resolve(ready)
  if (loading) return loading
  loading = new Promise<GoogleAuthorization>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    const failed = () => {
      clearTimeout(timer)
      script.remove()
      reject(new Error('Google 授權程式載入失敗，請確認連線後再試。'))
    }
    const timer = window.setTimeout(failed, 15_000)
    script.onerror = failed
    script.onload = () => {
      clearTimeout(timer)
      const api = googleAuthorization()
      if (api) resolve(api)
      else failed()
    }
    document.head.append(script)
  }).finally(() => { loading = undefined })
  return loading
}

/** 預先載入 Google 授權元件，讓點擊當下可以同步開啟 Google 視窗。 */
export async function prepareGoogleQuotaAuthorization(clientId: string): Promise<(signal?: AbortSignal) => Promise<string>> {
  if (!isLocalQuotaAdmin()) throw new Error(localOnly)
  if (!/^\d+(?:-[A-Za-z0-9-]+)?\.apps\.googleusercontent\.com$/.test(clientId)) {
    throw new Error('請填入專案的 Google 網頁應用程式用戶端 ID。')
  }
  const api = await loadGoogleAuthorization()
  return signal => new Promise<string>((resolve, reject) => {
    if (!isLocalQuotaAdmin()) throw new Error(localOnly)
    signal?.throwIfAborted()
    const abort = () => fail('授權已中止，可再次按「立即更新」。')
    const timer = window.setTimeout(() => fail('Google 授權逾時，請再按一次「立即更新」。'), 180_000)
    const cleanup = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
    function fail(message: string) {
      cleanup()
      reject(new Error(message))
    }
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const client = api.initTokenClient({
        client_id: clientId,
        scope: readScope,
        include_granted_scopes: false,
        callback(response) {
          if (!isLocalQuotaAdmin() || signal?.aborted) return abort()
          if (response.error === 'access_denied') return fail('已取消 Google 唯讀授權，需要時可再次查詢。')
          if (response.error) return fail('Google 未完成授權，請核對用戶端 ID 和已授權的本機網址。')
          if (response.scope?.trim() !== readScope || response.token_type?.toLowerCase() !== 'bearer' || !response.access_token) {
            return fail('未取得僅限讀取監控資料的唯讀授權，請重新確認權限。')
          }
          cleanup()
          resolve(response.access_token)
        },
        error_callback(error) {
          if (error.type === 'popup_closed') return fail('Google 授權視窗已關閉，需要時可再次查詢。')
          fail('無法開啟 Google 授權視窗，請允許此本機管理頁開啟彈出式視窗後重試。')
        },
      })
      client.requestAccessToken()
    } catch {
      fail('無法啟動 Google 授權，請核對用戶端 ID 和已授權的本機網址。')
    }
  })
}
