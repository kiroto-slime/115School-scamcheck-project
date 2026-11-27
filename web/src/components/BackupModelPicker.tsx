import { useEffect, useState } from 'react'

type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>
type Status = 'available' | 'missing' | 'no_key' | 'unknown' | 'unchecked' | 'no_binding'
type Candidate = { key: string; provider: string; provider_label: string; model: string; label: string; maker: string; status: Status }

const STATUS: Record<Status, [string, string]> = {
  available: ['Groq 目前有提供', 'text-emerald-700'],
  missing: ['已下架（Groq 清單裡找不到），建議移除', 'text-red-700'],
  no_key: ['尚未設定 GROQ_API_KEY，會自動略過', 'text-slate-600'],
  unknown: ['暫時無法向 Groq 確認', 'text-amber-700'],
  unchecked: ['請用「測試備援 AI」確認能不能用', 'text-slate-600'],
  no_binding: ['尚未設定 Workers AI 綁定，會自動略過', 'text-slate-600'],
}

const valid = (r: unknown): r is { models: Candidate[] } =>
  !!r && Array.isArray((r as { models?: unknown }).models) &&
  (r as { models: unknown[] }).models.every(m => !!m && typeof (m as Candidate).key === 'string' && (m as Candidate).status in STATUS)

/** 後台：選擇 Gemini 失敗時要用哪些備援模型與順序（只能從伺服器的候選名單選） */
export function BackupModelPicker({ call, value, onChange }: { call: Call; value: string[]; onChange: (v: string[]) => void }) {
  const [catalog, setCatalog] = useState<Candidate[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void call<unknown>('/api/admin/ai/backup-catalog').then(r => {
      if (!alive) return
      if (valid(r)) setCatalog(r.models)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [call])

  if (failed) return <p className="text-sm text-red-700">無法讀取備援模型清單，請重新整理頁面再試。</p>
  if (!catalog) return <p className="text-sm text-slate-600">讀取備援模型清單中…</p>

  const chosen = value.map(k => catalog.find(m => m.key === k)).filter((m): m is Candidate => !!m)
  const rest = catalog.filter(m => !value.includes(m.key))
  const name = (m: Candidate) => `${m.provider_label} ${m.label}`
  const move = (i: number, d: -1 | 1) => {
    const next = chosen.map(m => m.key)
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  const status = (m: Candidate) => <span className={`block text-xs ${STATUS[m.status][1]}`}>{m.maker} · {m.model} · {STATUS[m.status][0]}</span>

  return <div className="space-y-2">
    <span className="label">Gemini 失敗時的備援 AI（依順序嘗試，只分析文字）</span>
    {chosen.length === 0 && <p className="text-sm text-amber-700">目前沒有啟用任何備援：Gemini 失敗時會直接顯示錯誤。</p>}
    <ol aria-label="使用中的備援模型" className="divide-y rounded-lg border text-sm">
      {chosen.map((m, i) => <li key={m.key} className="flex flex-wrap items-center gap-2 p-2">
        <p className="min-w-0 flex-1 break-words">{i + 1}. {m.provider_label} · {m.label}{status(m)}</p>
        <span className="flex gap-1">
          <button type="button" className="btn-secondary px-3" disabled={i === 0} aria-label={`把 ${name(m)} 往上移`} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="btn-secondary px-3" disabled={i === chosen.length - 1} aria-label={`把 ${name(m)} 往下移`} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="btn-secondary px-3" aria-label={`移除 ${name(m)}`} onClick={() => onChange(chosen.filter(x => x !== m).map(x => x.key))}>移除</button>
        </span>
      </li>)}
    </ol>
    {rest.length > 0 && <>
      <span className="block text-sm text-slate-600">可加入的備援模型</span>
      <ul aria-label="可加入的備援模型" className="divide-y rounded-lg border text-sm">
        {rest.map(m => <li key={m.key} className="flex flex-wrap items-center gap-2 p-2">
          <p className="min-w-0 flex-1 break-words">{m.provider_label} · {m.label}{status(m)}</p>
          <button type="button" className="btn-secondary px-3" aria-label={`加入 ${name(m)}`} onClick={() => onChange([...chosen.map(x => x.key), m.key])}>加入</button>
        </li>)}
      </ul>
    </>}
    <p className="text-xs text-slate-500">候選名單只列已確認的非中國廠牌模型。Groq 會即時比對目前還有提供的模型；Workers AI 沒有公開清單可讀，改到「匯出與資料管理」按「測試備援 AI」確認。改完記得按下方「儲存設定」。</p>
  </div>
}
