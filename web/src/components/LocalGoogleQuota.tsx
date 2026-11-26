import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../api'
import { quotaLabels, readBrowserGoogleQuota, type BrowserQuotaReport } from '../browserGoogleQuota'
import { prepareGoogleQuotaAuthorization } from '../googleQuotaAuthorization'
import { Alert } from './ui'

type Authorize = Awaited<ReturnType<typeof prepareGoogleQuotaAuthorization>>
const count = (value: number | null) => value === null ? '尚無確定數字' : `${value.toLocaleString('zh-TW')} 次`

export default function LocalGoogleQuota() {
  const [project, setProject] = useState<string>(import.meta.env.VITE_GOOGLE_QUOTA_PROJECT_ID ?? '')
  const [clientId, setClientId] = useState<string>(import.meta.env.VITE_GOOGLE_QUOTA_CLIENT_ID ?? '')
  const [ready, setReady] = useState<{ id: string; authorize: Authorize } | null>(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'authorizing' | 'reading'>('idle')
  const [report, setReport] = useState<BrowserQuotaReport | null>(null)
  const request = useRef<AbortController | null>(null)
  const pending = phase !== 'idle'
  const validProject = /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|\d{6,20})$/.test(project.trim())
  const id = clientId.trim()

  useEffect(() => {
    let active = true
    setReady(null)
    setError('')
    if (id.endsWith('.apps.googleusercontent.com')) {
      prepareGoogleQuotaAuthorization(id).then(authorize => {
        if (active) setReady({ id, authorize })
      }).catch(() => {
        if (active) setError('無法載入 Google 授權，請核對網頁用戶端 ID 和網路連線。')
      })
    }
    return () => { active = false }
  }, [id, retry])

  useEffect(() => () => request.current?.abort(), [])

  async function refresh() {
    if (!ready || ready.id !== id || !validProject || request.current) return
    const controller = new AbortController()
    request.current = controller
    setError('')
    setReport(null)
    setPhase('authorizing')
    try {
      const token = await ready.authorize(controller.signal)
      if (controller.signal.aborted) return
      setPhase('reading')
      const result = await readBrowserGoogleQuota(project.trim(), token, { signal: controller.signal })
      if (!controller.signal.aborted) setReport(result)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '用量讀取失敗，請重試。')
    } finally {
      request.current = null
      if (!controller.signal.aborted) setPhase('idle')
    }
  }

  return <div className="space-y-3">
    <p className="text-sm">由 Google 開啟唯讀授權視窗。這次查到的數字只顯示在本機分頁。</p>
    <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="min-w-0"><span className="label">Google Cloud 專案 ID</span>
        <input className="input min-h-11 w-full" value={project} autoComplete="off" spellCheck={false}
          onChange={event => { setProject(event.target.value); setReport(null); setError('') }} />
      </label>
      <label className="min-w-0"><span className="label">網頁用戶端 ID</span>
        <input className="input min-h-11 w-full" value={clientId} autoComplete="off" spellCheck={false}
          placeholder="…apps.googleusercontent.com" onChange={event => { setClientId(event.target.value); setReport(null) }} />
      </label>
    </fieldset>
    <button type="button" className="btn-primary" onClick={refresh}
      disabled={!validProject || ready?.id !== id || !ready || pending}>立即更新</button>
    <p role="status" className="text-sm" aria-live="polite">
      {phase === 'authorizing' ? '請在 Google 視窗確認唯讀權限。' : phase === 'reading' ? '正在讀取 Google 的已用次數和上限…' :
        report ? `配額日 ${report.day}（美國太平洋時間）` : !validProject || !id.endsWith('.apps.googleusercontent.com') ? '請填入專案 ID 和結尾為 .apps.googleusercontent.com 的公開網頁用戶端 ID。' : !ready && !error ? '正在載入 Google 授權…' : ''}
    </p>
    {error && <Alert kind="warn">{error}</Alert>}
    {error && !ready && <button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>重新載入授權</button>}
    {report && <>
      <p className="text-sm">資料截至 <time dateTime={report.asOf}>{formatTime(report.asOf)}</time>（本地時間）。</p>
      {report.issues.map(issue => <Alert key={issue.kind} kind="warn">
        {quotaLabels[issue.kind]}查詢失敗。{issue.message}
      </Alert>)}
      {report.models.length ? <dl className="divide-y">
        {report.models.map(row => <div key={row.model} className="grid gap-1 py-2 sm:grid-cols-2">
          <dt className="break-all font-medium">{row.model}</dt>
          <dd><span>已用 {count(row.used)}</span> ／ <span>上限 {count(row.limit)}</span>
            <span className="block font-medium">剩餘 {count(row.remaining)}</span></dd>
        </div>)}
      </dl> : report.issues.length === 0 && <p>Google 在這個配額日尚未回傳可供核對的模型資料。</p>}
    </>}
  </div>
}
