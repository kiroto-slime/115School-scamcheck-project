import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../api'
import { useLanguage } from '../language'
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
      setMessage(t('送出失敗，請確認收件時間、輸入內容及網路連線。', 'Could not send. Check the deadline, your input and your connection.', '送信できません。受付期限、入力内容、接続を確認してください。', '접수 기간, 입력 내용과 연결 상태를 확인하세요.'))
    } finally { setBusy(false) }
  }
  if (code) return <p role="status" className="break-words text-center">{t('謝謝你分享心得！請保留這組刪除碼，日後可在「隱私與說明」移除回覆。', 'Thanks for sharing! Keep this code to remove your comment on the Privacy page.', 'ご感想ありがとうございます。このコードでプライバシーページから回答を削除できます。', '소감을 남겨 주셔서 감사합니다. 개인정보 페이지에서 삭제하려면 이 코드를 보관하세요.')} <code>{code}</code></p>
  if (!period?.open) return <p role="status" className="text-center text-sm text-slate-600">{loadError
    ? t('心得欄暫時無法載入。', 'Comments could not be loaded.', '感想欄を読み込めません。', '소감란을 불러올 수 없습니다.')
    : period ? t('目前未開放補充心得。', 'Comments are closed.', '感想の受付期間外です。', '소감 접수 기간이 아닙니다.') : t('正在載入心得欄…', 'Loading comments…', '感想欄を読み込み中…', '소감란을 불러오는 중…')}</p>
  return <form onSubmit={submit} className="space-y-3 border-t border-slate-200 pt-4">
    <label htmlFor="result-impression" className="label">{t('你對這次查核有什麼心得？（選填）', 'What did you think of this check? (optional)', '今回のチェックの感想を教えてください（任意）', '이번 확인은 어떠셨나요? (선택)')}</label>
    <textarea id="result-impression" className="input" rows={3} maxLength={300} value={suggestion} onChange={e => setSuggestion(e.target.value)} aria-describedby="opinion-hint" />
    <p id="opinion-hint" className="text-sm text-slate-600">{t('最多 300 字，請勿填寫個資或貼上原始訊息。', 'Up to 300 characters. Leave out personal details and the original message.', '300字以内。個人情報や元のメッセージは書かないでください。', '300자 이내. 개인정보나 원문은 적지 마세요.')}</p>
    <p className="text-xs text-slate-600">{t(`三重商工專題團隊用於改善查核服務。收件至 ${period.deadline}（臺灣時間），保存至 ${period.keepUntil}。`, `The Sanchong student team uses comments to improve checks. Closes ${period.deadline} (Taiwan time). Kept through ${period.keepUntil}.`, `三重商工のチームがサービス改善に使用します。受付は台湾時間${period.deadline}まで、保存は${period.keepUntil}までです。`, `싼충상공 팀이 서비스 개선에 사용합니다. 대만 시간 ${period.deadline}까지 접수하고 ${period.keepUntil}까지 보관합니다.`)} <a href="/privacy" target="_blank" rel="noreferrer">{t('隱私與說明', 'Privacy', 'プライバシー', '개인정보')}</a></p>
    <div className="text-center"><button className="btn-primary" disabled={busy || !suggestion.trim()}>{t('送出心得', 'Send comment', '感想を送信', '소감 보내기')}</button></div>
    {message && <p role="status">{message}</p>}
  </form>
}
