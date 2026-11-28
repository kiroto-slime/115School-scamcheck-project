import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { useLanguage, tc } from '../language'
import { type OpinionPeriod } from '../../shared/result-opinion'

export function ResultOpinion({ helpful }: { helpful: boolean }) {
  const { t } = useLanguage()
  const [period, setPeriod] = useState<OpinionPeriod | null>(null)
  const [suggestion, setSuggestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    api<OpinionPeriod>('/api/result-opinions', { referrerPolicy: 'no-referrer' })
      .then(value => { if (active) setPeriod(value) }).catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !period?.open || !suggestion.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const reply = await api<{ deletion_code: string }>('/api/result-opinions', {
        headers: { 'Content-Type': 'application/json' }, referrerPolicy: 'no-referrer',
        method: 'POST', body: JSON.stringify({ topic: helpful ? 'helpful' : 'unhelpful', suggestion: suggestion.trim() }),
      })
      setCode(reply.deletion_code)
      setSuggestion('')
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setPeriod(p => p && ({ ...p, open: false }))
      setMessage(t('送出失敗，請確認收件時間、輸入內容及網路連線。'))
    } finally { setBusy(false) }
  }
  if (code) return <p role="status" className="break-words text-center">{t('謝謝你分享心得！請保留這組刪除碼，日後可在「隱私與說明」移除回覆。')} <code>{code}</code></p>
  if (!period?.open) return <p role="status" className="text-center text-sm text-slate-600">{loadError
    ? t('心得欄暫時無法載入。')
    : period ? t('目前未開放補充心得。') : t('正在載入心得欄…')}</p>
  return <form onSubmit={submit} className="space-y-3 border-t border-slate-200 pt-4">
    <label htmlFor="result-impression" className="label">{t('你對這次查核有什麼心得？（選填）')}</label>
    <textarea id="result-impression" className="input" rows={3} maxLength={300} value={suggestion} onChange={e => setSuggestion(e.target.value)} aria-describedby="opinion-hint" />
    <p id="opinion-hint" className="text-sm text-slate-600">{t('最多 300 字，請勿填寫個資或貼上原始訊息。')}</p>
    <p className="text-xs text-slate-600">{t('三重商工專題團隊用於改善查核服務。收件至 {0}（臺灣時間），保存至 {1}。', period.deadline, period.keepUntil)} <a href="/privacy" target="_blank" rel="noreferrer">{tc('ResultOpinion', '隱私與說明')}</a></p>
    <div className="text-center"><button className="btn-primary" disabled={busy || !suggestion.trim()}>{t('送出心得')}</button></div>
    {message && <p role="status">{message}</p>}
  </form>
}
