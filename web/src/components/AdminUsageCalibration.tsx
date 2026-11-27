import { useEffect, useState } from 'react'
import { Section, Spinner } from './ui'

type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>
type Usage = { day: string; models: { id: string; label: string; daily: number; used: number }[] }
const endpoint = '/api/admin/ai/usage'
// 回應格式不對時當作載入失敗，避免整個設定頁當掉
const valid = (result: Usage | null) => result && typeof result.day === 'string' && Array.isArray(result.models) ? result : null

/**
 * 手動校準每日次數：免費方案無法自動讀到 Google 的實際用量，
 * 管理者在 Google AI Studio 或 Explorer 看到同一模型今天已用幾次，就填入這裡。
 */
export function AdminUsageCalibration({ call }: { call: Call }) {
  const [usage, setUsage] = useState<Usage | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>('load')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    call<Usage>(endpoint).then(result => {
      if (!active) return
      setUsage(valid(result))
      setBusy(null)
    })
    return () => { active = false }
  }, [call])

  async function calibrate(id: string, label: string) {
    const used = Number(drafts[id])
    if (busy || !/^\d+$/.test(drafts[id] ?? '')) return
    setBusy(id)
    setNotice('')
    const result = valid(await call<Usage>(endpoint, { method: 'PUT', body: JSON.stringify({ model: id, used }) }))
    if (result) {
      setUsage(result)
      setDrafts(d => ({ ...d, [id]: '' }))
      setNotice(`已把 ${label} 今天的次數校準為 ${used} 次。`)
    } else {
      setNotice('校準沒有完成，請確認數字後再試一次。')
    }
    setBusy(null)
  }

  return <Section title="手動校準每日次數">
    <p className="text-sm">
      免費方案無法讓網站自動讀到 Google 的實際用量。到 Google AI Studio 或 Explorer 查看同一模型「今天已用幾次」，填入後按「校準」，網站會從這個數字接著累加。只影響今天，美國太平洋時間午夜（臺灣下午 3 或 4 點）自動歸零。
    </p>
    <a className="link inline-flex min-h-11 items-center" href="https://aistudio.google.com/rate-limit" target="_blank" rel="noopener noreferrer">在 Google AI Studio 查看用量</a>
    {busy === 'load' ? <Spinner label="載入今天的次數…" /> : !usage ? <p className="text-sm">無法載入今天的次數，請重新整理頁面。</p> : <>
      <p className="text-sm text-slate-600">配額日：{usage.day}（美國太平洋時間）</p>
      <ul className="divide-y">
        {usage.models.map(m => {
          const draft = drafts[m.id] ?? ''
          const ok = /^\d+$/.test(draft) && Number(draft) <= 1_000_000
          return <li key={m.id} className="grid gap-2 py-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="min-w-0">
              <p className="break-all font-medium">{m.label}</p>
              <p className="text-sm text-slate-600">網站今天記了 {m.used.toLocaleString('zh-TW')} 次／上限 {m.daily.toLocaleString('zh-TW')} 次</p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="block"><span className="sr-only">{m.label} 今天 Google 已用次數</span>
                <input className="input min-h-11 w-28" inputMode="numeric" placeholder="已用次數" value={draft}
                  onChange={e => setDrafts(d => ({ ...d, [m.id]: e.target.value.trim() }))} />
              </label>
              <button type="button" className="btn-secondary" aria-label={`校準 ${m.label}`}
                disabled={!ok || Boolean(busy)} onClick={() => void calibrate(m.id, m.label)}>
                {busy === m.id ? '校準中…' : '校準'}
              </button>
            </div>
          </li>
        })}
      </ul>
    </>}
    <p role="status" className="empty:hidden text-sm">{notice}</p>
  </Section>
}
