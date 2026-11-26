import { lazy, Suspense, useEffect, useState } from 'react'
import { formatTime } from '../api'
import { isLocalQuotaAdmin } from '../googleQuotaAuthorization'
import { Alert, Section, Spinner } from './ui'

const BrowserQuota = import.meta.env.DEV ? lazy(() => import('./LocalGoogleQuota')) : null

type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>
const intervals = [5, 15, 30, 45] as const
type Interval = typeof intervals[number]
const endpoint = '/api/admin/ai/quota'

type Quota = {
  configured: boolean
  interval_minutes: Interval
  auto_enabled: boolean
  can_enable: boolean
  checked_at: string | null
  attempted_at: string | null
  status: 'pending' | 'ok' | 'partial' | 'error'
  message?: string
  models: { id: string; limit: number; used: number; as_of: string }[]
}

export function AdminAiQuota({ call }: { call: Call }) {
  const [quota, setQuota] = useState<Quota | null>(null)
  const [busy, setBusy] = useState<'load' | 'save' | 'refresh' | null>('load')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const [source, setSource] = useState('browser')
  const local = Boolean(BrowserQuota && isLocalQuotaAdmin())

  useEffect(() => {
    let active = true
    setBusy('load')
    call<Quota>(endpoint).then(result => {
      if (active) {
        setQuota(result && Array.isArray(result.models) ? result : null)
        setBusy(null)
      }
    })
    return () => { active = false }
  }, [call, retry])

  async function refresh() {
    if (busy || !quota?.configured) return
    setBusy('refresh')
    setNotice('')
    const result = await call<Quota>(endpoint + '/refresh', { method: 'POST' })
    if (result) {
      setQuota(result)
      if (result.status === 'ok') setNotice('已更新 Google 用量。')
    } else {
      setNotice('這次查詢未完成，請稍後再按「立即更新」。')
    }
    setBusy(null)
  }

  async function setSchedule(selection: string) {
    if (busy || !quota) return
    const interval = intervals.find(value => String(value) === selection)
    if (selection !== 'off' && !interval) return
    setBusy('save')
    setNotice('')
    const result = await call<Quota>(endpoint + '/settings', {
      method: 'PUT',
      body: JSON.stringify({ auto_enabled: Boolean(interval), interval_minutes: interval ?? quota.interval_minutes }),
    })
    if (result) {
      setQuota(result)
      setNotice(result.auto_enabled ? `已設為每 ${result.interval_minutes} 分鐘自動校準。` : '已停用自動校準，仍可手動更新。')
    } else {
      setNotice('校準設定未儲存，請再選一次。')
    }
    setBusy(null)
  }

  const sourcePicker = local && <label className="block"><span className="label">查詢方式</span>
    <select className="input min-h-11 w-auto" value={source} onChange={event => setSource(event.target.value)}>
      <option value="browser">本機瀏覽器（Google 唯讀）</option>
      <option value="server">網站服務帳戶</option>
    </select>
  </label>
  if (quota && local && BrowserQuota && source === 'browser') {
    return <Section title="Google AI 額度校準">
      {sourcePicker}
      <Suspense fallback={<Spinner label="載入唯讀查詢…" />}><BrowserQuota /></Suspense>
    </Section>
  }

  return <Section title="Google AI 額度校準">
    {busy === 'load' ? <Spinner label="載入校準設定…" /> : !quota ? <>
      <p>無法載入額度校準設定，請再試一次。</p>
      <button type="button" className="btn-secondary" onClick={() => setRetry(n => n + 1)}>重新載入校準設定</button>
    </> : <>
      {sourcePicker}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className="label">自動校準</span>
          <select className="input min-h-11" value={quota.auto_enabled ? quota.interval_minutes : 'off'}
            disabled={Boolean(busy)} onChange={e => void setSchedule(e.target.value)}>
            <option value="off">停用</option>
            {intervals.map(value => <option key={value} value={value}
              disabled={!quota.configured || (!quota.auto_enabled && !quota.can_enable)}>每 {value} 分鐘</option>)}
          </select>
        </label>
        <button type="button" className="btn-secondary" disabled={Boolean(busy) || !quota.configured}
          onClick={refresh}>{busy === 'refresh' ? '更新中…' : '立即更新'}</button>
      </div>
      {quota.configured && !quota.auto_enabled && <p className="text-sm text-slate-600">
        先按「立即更新」，到 Google AI Studio 核對同一天、同一模型的用量，再選擇間隔啟用自動校準。建議每 30 分鐘更新一次。
      </p>}
      {quota.auto_enabled && !quota.configured && <p className="text-sm">已保留間隔，監控授權補齊前會暫停自動查詢。</p>}
      {!quota.configured && <details className="rounded-xl border p-3 text-sm">
        <summary className="cursor-pointer font-medium">尚未設定 Google 監控授權，如何設定？</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>在網站 Gemini 金鑰所屬的 Google Cloud 專案啟用 Cloud Monitoring API，並授予服務帳戶監控讀取權限。</li>
          <li className="break-words">在 Cloudflare Worker 的「變數與秘密」設定 <code>GOOGLE_MONITORING_PROJECT_ID</code> 和 <code>GOOGLE_MONITORING_CLIENT_EMAIL</code>，並以秘密儲存 <code>GOOGLE_MONITORING_PRIVATE_KEY</code>。</li>
          <li>讓 Worker 設定生效後重新整理本頁，再按「立即更新」。</li>
        </ol>
      </details>}
      <a className="link inline-flex min-h-11 items-center" href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer">在 Google AI Studio 查看額度</a>
      {quota.attempted_at && quota.attempted_at !== quota.checked_at && <p className="text-sm">最近查詢於 <time dateTime={quota.attempted_at}>{formatTime(quota.attempted_at)}</time></p>}
      {quota.status === 'error' && <Alert kind="warn">{quota.message || '上次額度校準未完成。按「立即更新」可查看這次的查詢結果。'}</Alert>}
      {quota.status === 'partial' && <p className="text-sm">{quota.message || '僅部分模型有可核對的用量。缺少資料的模型會繼續顯示本站估計。'}</p>}
      {quota.models.length > 0 ? <div className="space-y-1">
        {quota.checked_at && <p className="text-sm font-medium">上次取得用量於 <time dateTime={quota.checked_at}>{formatTime(quota.checked_at)}</time></p>}
        <dl className="divide-y text-sm">{quota.models.map(model => <div key={model.id} className="grid gap-1 py-2 sm:grid-cols-2">
          <dt className="min-w-0 break-all font-medium">{model.id}</dt>
          <dd>估計剩 {Math.max(0, model.limit - model.used).toLocaleString('zh-TW')} 次
            <span className="block text-sm">已用 {model.used.toLocaleString('zh-TW')} ／ 上限 {model.limit.toLocaleString('zh-TW')} 次</span>
            <span className="block text-xs text-slate-600">資料時間 <time dateTime={model.as_of}>{formatTime(model.as_of)}</time></span>
          </dd>
        </div>)}</dl>
      </div> : <p className="text-sm text-slate-600">尚無 Google 用量資料，查核頁會顯示本站估計。</p>}
      <p role="status" className="empty:hidden text-sm">{busy === 'save' ? '儲存中…' : notice}</p>
    </>}
  </Section>
}
