import { useEffect, useState, type ReactNode } from 'react'
import { api, type Health } from '../api'
import { useLanguage, riskLabel } from '../language'

let pendingHealth: Promise<Health> | null = null
let lastHealth: Health | null = null
const healthListeners = new Set<(h: Health) => void>()

/** 只共用進行中的站內查詢，返回查核頁時重新取得剩餘次數。 */
function readHealth() {
  pendingHealth ??= api<Health>('/api/health').then(h => {
    lastHealth = h
    healthListeners.forEach(notify => notify(h))
    return h
  }).finally(() => { pendingHealth = null })
  return pendingHealth
}

export function refreshHealth() {
  void readHealth().catch(() => { /* 保留畫面最後一次讀取成功的狀態 */ })
}

export function useHealth(refreshOnReturn = false) {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    const receive = (value: Health) => { setHealth(value); setError(false) }
    const load = () => { void readHealth().catch(() => { if (active) setError(true) }) }
    const resume = () => { if (document.visibilityState === 'visible') load() }
    healthListeners.add(receive)
    if (!refreshOnReturn && lastHealth && !pendingHealth) receive(lastHealth)
    else load()
    if (refreshOnReturn) document.addEventListener('visibilitychange', resume)
    return () => {
      active = false
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
