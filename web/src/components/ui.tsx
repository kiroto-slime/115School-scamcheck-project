import { useEffect, useState, type ReactNode } from 'react'
import { api, type Health } from '../api'
import { useLanguage, riskLabel } from '../language'

let pendingHealth: Promise<Health> | null = null
let pendingDay = ''
let lastHealth: Health | null = null
const healthListeners = new Set<(h: Health) => void>()
const pacificDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' })
const hour = 3_600_000

/** 只共用進行中的站內查詢，返回查核頁時重新取得剩餘次數。 */
function readHealth(): Promise<Health> {
  const day = pacificDate.format(Date.now())
  if (pendingHealth && pendingDay === day) return pendingHealth
  pendingDay = day
  const request = api<Health>('/api/health').then(h => {
    // 昨天發出的請求可能比今天的慢，避免舊回應蓋掉新額度。
    if (pendingHealth === request) {
      lastHealth = h
      healthListeners.forEach(notify => notify(h))
    }
    return h
  }).finally(() => { if (pendingHealth === request) pendingHealth = null })
  pendingHealth = request
  return request
}

export function refreshHealth() {
  void readHealth().catch(() => { /* 保留畫面最後一次讀取成功的狀態 */ })
}

export function useHealth(refreshOnReturn = false) {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    let seenDay = pacificDate.format(Date.now())
    let timer: number | undefined
    const receive = (value: Health) => { setHealth(value); setError(false) }
    const load = () => {
      const day = seenDay
      void readHealth().catch(() => { if (active && day === seenDay) setError(true) })
    }
    function scheduleCheck() {
      window.clearTimeout(timer)
      if (document.visibilityState !== 'visible') return
      // 太平洋午夜落在 UTC 整點。只在瀏覽器比對日期，跨日時才向本站讀取。
      timer = window.setTimeout(() => {
        if (document.visibilityState !== 'visible') return
        const day = pacificDate.format(Date.now())
        if (seenDay !== day) { seenDay = day; load() }
        scheduleCheck()
      }, hour - Date.now() % hour)
    }
    const resume = () => {
      if (document.visibilityState === 'visible') {
        seenDay = pacificDate.format(Date.now())
        load()
      }
      scheduleCheck()
    }
    healthListeners.add(receive)
    if (!refreshOnReturn && lastHealth && !pendingHealth) receive(lastHealth)
    else load()
    if (refreshOnReturn) {
      scheduleCheck()
      document.addEventListener('visibilitychange', resume)
    }
    return () => {
      active = false
      window.clearTimeout(timer)
      healthListeners.delete(receive)
      if (refreshOnReturn) document.removeEventListener('visibilitychange', resume)
    }
  }, [refreshOnReturn])
  return { health, error }
}

export function Alert({ kind = 'info', children }: { kind?: 'info' | 'error' | 'warn' | 'success'; children: ReactNode }) {
  const style = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    error: 'border-red-200 bg-red-50 text-red-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[kind]
  return (
    <div className={`notice ${style}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-slate-600" role="status" aria-live="polite">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" aria-hidden />
      {label}
    </div>
  )
}

const LEVEL_STYLE: Record<string, string> = {
  高: 'bg-red-100 text-red-800 border-red-300',
  中: 'bg-amber-100 text-amber-900 border-amber-300',
  低: 'bg-sky-100 text-sky-900 border-sky-300',
  資訊不足: 'bg-slate-100 text-slate-700 border-slate-300',
}
export function RiskBadge({ level }: { level: string }) {
  const { t, lang } = useLanguage()
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${LEVEL_STYLE[level] ?? LEVEL_STYLE['資訊不足']}`}>
      {t('風險等級：', 'Risk level: ', 'リスク：', '위험 수준: ')}{riskLabel(lang,level)}
    </span>
  )
}

export function ServiceConnectionError() {
  const { t } = useLanguage()
  return <Alert kind="error">{t('無法連線到服務，請稍後重新整理頁面。', 'Cannot connect to the service. Refresh the page and try again.', 'サービスに接続できません。しばらくしてからページを再読み込みしてください。', '서비스에 연결할 수 없습니다. 잠시 후 페이지를 새로 고쳐 주세요.')}</Alert>
}

export function Section({ title, step, children }: { title: string; step?: number; children: ReactNode }) {
  return (
    <section className="card space-y-3">
      <h2 className="flex items-center gap-2">
        {step !== undefined && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm text-white">{step}</span>
        )}
        {title}
      </h2>
      {children}
    </section>
  )
}
