import { useState } from 'react'
import { Alert, Section, Spinner } from './ui'

type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>
type Row = { provider: string; model: string; label: string; status: 'ok' | 'error' | 'skipped'; seconds?: number; risk_level?: string | null; summary?: string; message?: string }

/** 後台：實際呼叫每個備援 AI 一次，確認 Gemini 失敗時的備援能用（正式站才連得到 Workers AI） */
export function BackupAiTest({ call }: { call: Call }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError('')
    setRows(null)
    const r = await call<{ results?: Row[] }>('/api/admin/ai/backup-test', { method: 'POST' })
    if (r && Array.isArray(r.results)) setRows(r.results)
    else setError('測試沒有完成，請稍後再試一次。')
    setBusy(false)
  }

  return <Section title="備援 AI 測試">
    <p className="text-sm">Gemini 連續失敗時，網站會依序改用 Workers AI（Nemotron 3 Super、Gemma 4 26B）與 Groq（GPT-OSS 120B、Llama 3.3 70B）分析文字。按下後會用一則假的詐騙訊息實際呼叫每個模型一次，確認它們能用、判斷是否合理。Workers AI 只在正式站才連得到。</p>
    {busy ? <Spinner label="逐一測試中（最多約 4 分鐘）…" /> : <button type="button" className="btn-secondary" onClick={() => void run()}>測試備援 AI</button>}
    {error && <Alert kind="error">{error}</Alert>}
    {rows && <ul className="divide-y text-sm">{rows.map(row => <li key={row.model} className="space-y-1 py-2">
      <p className="break-all font-medium">{row.label}<span className="block text-xs font-normal text-slate-600">{row.model}</span></p>
      {row.status === 'ok' && <>
        <p className="text-emerald-700">成功・等級 {row.risk_level ?? '未提供'}・{row.seconds} 秒</p>
        {row.summary && <p className="break-words text-slate-700">{row.summary}</p>}
      </>}
      {row.status === 'error' && <p className="break-words text-red-700">失敗・{row.message}{row.seconds !== undefined ? `（${row.seconds} 秒）` : ''}</p>}
      {row.status === 'skipped' && <p className="text-slate-600">略過・{row.message}</p>}
    </li>)}</ul>}
  </Section>
}
