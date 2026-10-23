import { useEffect, useState, type ReactNode } from 'react'
import { api, type Health } from '../api'

let healthCache: Promise<Health> | null = null
const healthListeners = new Set<(h: Health) => void>()

/** 重新讀取系統狀態（AI 剩餘次數、冷卻秒數會變），所有用到 useHealth 的元件一起更新 */
export function refreshHealth() {
  healthCache = api<Health>('/api/health')
  healthCache.then((h) => healthListeners.forEach((fn) => fn(h))).catch(() => { healthCache = null })
}

export function useHealth() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    healthListeners.add(setHealth)
    healthCache ??= api<Health>('/api/health')
    healthCache.then(setHealth).catch(() => {
      healthCache = null
      setError(true)
    })
    return () => { healthListeners.delete(setHealth) }
  }, [])
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
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${LEVEL_STYLE[level] ?? LEVEL_STYLE['資訊不足']}`}>
      風險等級：{level}
    </span>
  )
}

export function ModeBanner() {
  const { health, error } = useHealth()
  if (error) return <Alert kind="error">無法連線到後端服務，查核功能暫時無法使用。</Alert>
  if (!health) return null
  const m = health.modes
  // 目前模型用完會自動換下一個，所以這裡顯示「現在輪到的模型」與它今天剩下的次數
  const cur = m.ai_models?.find((x) => x.label === m.ai_model)
  const items: [string, boolean][] = [
    m.ai !== 'gemini'
      ? ['AI：未設定金鑰（圖片、影片需手動輸入文字）', false]
      : cur
        ? [`AI 模型：${cur.label}（今日剩 ${cur.remaining} 次，用完自動換下一個）`, true]
        : ['AI：今日免費額度已用完', false],
    [m.research_mode === 'formal' ? '前後測研究：正式' : '前後測研究：模擬（DEMO）', m.research_mode === 'formal'],
  ]
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="系統狀態">
      {items.map(([t, ok]) => (
        <span key={t} className={`pill ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{t}</span>
      ))}
    </div>
  )
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
