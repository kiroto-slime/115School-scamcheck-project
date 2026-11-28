import { checkMessage } from '../checkMessages'
import { studyMessage } from './studyMessages'
import { riskLabel, useLanguage, tc } from '../language'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, postJson, researchId, type Feature } from '../api'
import { Alert, Section, ServiceConnectionError, Spinner, useHealth } from '../components/ui'

interface Case { case_id: string; title: string; simulated_content: string; reviewer_status: string }
interface StartRes { research_id: string; is_demo: boolean; pre_case: Case; post_case: Case; warnings: string[] }
interface Assist { type: string; title: string; tips?: string[]; risk_level?: string; risk_score?: number | null; features?: Feature[]; basis?: string[]; source_note?: string; disclaimer?: string }
interface Reveal { case_id: string; title: string; verified_label: 'scam' | 'legit'; label_basis: string }
type Step = 'intro' | 'pre' | 'post_initial' | 'assist' | 'post_assisted' | 'done'

function Question({ c, phase, onSubmit, busy }: { c: Case; phase: string; onSubmit: (d: string, r: string, ms: number) => void; busy: boolean }) {
  const { t } = useLanguage()
  const reasons: [string, string][] = [
    ['link', t('有可疑連結')],
    ['money', tc('Research', '要求付款或匯款')],
    ['personal_data', t('要求個資或驗證碼')],
    ['urgency', t('催促、時間壓力')],
    ['authority', t('自稱官方或權威')],
    ['too_good', t('好處太誇張')],
    ['familiar_sender', t('看起來是認識的人')],
    ['looks_official', t('看起來很正式')],
    ['no_red_flag', t('沒有看到可疑之處')],
    ['gut_feeling', t('直覺')],
    ['system_hint', t('參考了輔助資訊')],
    ['other', t('其他')],
  ]
  const decisions: [string, string][] = [
    ['scam', t('可能是詐騙')],
    ['legit', t('應該是正常訊息')],
    ['unsure', t('無法判斷')],
  ]
  const [decision, setDecision] = useState('')
  const [reason, setReason] = useState('')
  const started = useRef(Date.now())
  useEffect(() => { started.current = Date.now(); setDecision(''); setReason('') }, [c.case_id, phase])
  return (
    <div className="space-y-3">
      <blockquote className="whitespace-pre-wrap break-words rounded-xl border-l-4 border-teal-600 bg-slate-50 p-3 text-slate-800">{c.simulated_content}</blockquote>
      <p className="text-xs text-slate-500">{t('模擬案例「{0}」為研究團隊自行撰寫的虛構內容。', c.title)}</p>
      <fieldset>
        <legend className="label">{t('你的判斷')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {decisions.map(([v, l]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 ${decision === v ? 'border-teal-600 bg-teal-50' : 'border-slate-300'}`}>
              <input type="radio" name={`d-${phase}`} value={v} checked={decision === v} onChange={() => setDecision(v)} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor={`r-${phase}`} className="label">{t('主要判斷理由')}</label>
        <select id={`r-${phase}`} className="input min-h-11" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">{t('請選擇')}</option>
          {reasons.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {busy ? <Spinner label={t('送出中…')} /> : (
        <button className="btn-primary w-full sm:w-auto" disabled={!decision || !reason} onClick={() => onSubmit(decision, reason, Date.now() - started.current)}>{t('送出判斷')}</button>
      )}
    </div>
  )
}

export default function Research() {
  const { lang, t } = useLanguage()
  const { health, error: healthError } = useHealth()
  const [step, setStep] = useState<Step>('intro')
  const [b, setB] = useState(false)
  const [c, setC] = useState(false)
  const [session, setSession] = useState<StartRes | null>(null)
  const [assist, setAssist] = useState<Assist | null>(null)
  const [reveal, setReveal] = useState<Reveal[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState<number | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof ApiError ? e.message : '發生錯誤，請稍後再試。') } finally { setBusy(false) }
  }

  const start = () => run(async () => {
    const s = await postJson<StartRes>('/api/research/start', { consent_research: b, consent_secondary: c })
    researchId.set(s.research_id)
    setSession(s)
    setStep('pre')
  })

  const answer = (phase: 'pre' | 'post_initial' | 'post_assisted', next: Step) => (decision: string, reason: string, ms: number) => run(async () => {
    const cs = phase === 'pre' ? session!.pre_case : session!.post_case
    const r = await postJson<{ reveal?: Reveal[] }>('/api/research/answer', {
      research_id: session!.research_id, case_id: cs.case_id, phase, user_decision: decision, decision_reason_code: reason, response_time_ms: ms,
    })
    if (phase === 'post_initial') setAssist(await postJson<Assist>('/api/research/assistance', { research_id: session!.research_id }))
    if (r.reveal) setReveal(r.reveal)
    setStep(next)
  })

  const sendRating = (n: number) => run(async () => {
    await postJson('/api/feedback', { research_id: session!.research_id, rating: n })
    setRating(n)
  })

  if (health && !health.modes.research_collection_enabled)
    return <Alert kind="info">{t('研究資料蒐集已結束，感謝參與！你仍可使用 ')}<Link to="/check">{tc('Research', '防詐查核')}</Link>{tc('Research', '。')}</Alert>

  const progress = { intro: 0, pre: 1, post_initial: 2, assist: 3, post_assisted: 3, done: 4 }[step]
  return (
    <div className="space-y-4">
      <h1>{t('匿名研究測驗')}</h1>
      {healthError && !health && <ServiceConnectionError />}
      {step === 'intro' && health && (
        <p><span className={`pill ${health.modes.research_mode === 'formal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
          {health.modes.research_mode === 'formal'
            ? t('前後測研究：正式')
            : t('前後測研究：模擬（DEMO）')}
        </span></p>
      )}
      {lang !== 'zh-Hant' && <p className="text-sm text-slate-600">{t('研究案例和研究團隊撰寫的解析以原文顯示。')}</p>}
      {step !== 'intro' && (
        <div className="h-2 w-full rounded-full bg-slate-200" role="progressbar" aria-label={t('測驗進度')} aria-valuemin={0} aria-valuemax={4} aria-valuenow={progress}>
          <div className="h-2 rounded-full bg-teal-600 transition-all" style={{ width: `${(progress / 4) * 100}%` }} />
        </div>
      )}
      {session?.warnings.map((w) => <Alert key={w} kind="warn">{studyMessage(w)}</Alert>)}
      {error && <Alert kind="error">{studyMessage(error)}</Alert>}

      {step === 'intro' && (
        <Section title={t('研究說明與同意')}>
          <ul className="list-disc space-y-1 pl-5 text-sm sm:text-base">
            <li><strong>{t('目的：')}</strong>{t('了解青少年判斷可疑訊息的方式，以及不同查核輔助是否有幫助。')}</li>
            <li><strong>{t('流程：')}</strong>{t('先判斷一則模擬訊息 → 再判斷另一則難度相同的訊息，並看過系統提供的輔助資訊後再判斷一次。約 3 分鐘。')}</li>
            <li><strong>{t('蒐集項目：')}</strong>{t('你的判斷、理由選項、作答時間、隨機研究編號。不蒐集姓名、學號、電話等身分資訊。')}</li>
            <li><strong>{t('使用者與期間：')}</strong>{t('僅本專題研究團隊與指導老師使用；研究結束或最長 2 年後刪除。')}</li>
            <li><strong>{t('第三方：')}</strong>{t('研究測驗不會把資料傳給第三方。')}</li>
            <li><strong>{t('風險：')}</strong>{t('極低；模擬內容可能讓你聯想到過去不愉快的經驗，可隨時停止。')}</li>
            <li><strong>{t('撤回：')}</strong>{t('可在 ')}<Link to="/privacy">{tc('Research', '隱私與研究說明')}</Link>{t(' 用研究編號撤回或刪除資料。')}</li>
            <li>{t('未滿 18 歲參與者，正式研究需經學校審查及法定代理人同意。')}</li>
          </ul>
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={b} onChange={(e) => { setB(e.target.checked); if (!e.target.checked) setC(false) }} />
            <span>{t('我自願將匿名作答資料用於校內研究（參與測驗必須勾選）。')}</span>
          </label>
          <label className={`flex min-h-11 items-start gap-3 ${b ? '' : 'opacity-50'}`}>
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!b} checked={c} onChange={(e) => setC(e.target.checked)} />
            <span>{t('（選填）我同意將經審查的衍生統計資料用於教育產品及商業可行性研究。')}</span>
          </label>
          <p className="text-sm text-slate-600">{t('不同意也沒關係，你仍可使用 ')}<Link to="/check">{tc('Research', '防詐查核')}</Link>{tc('Research', '。')}</p>
          {busy ? <Spinner label={t('準備中…')} /> : <button className="btn-primary" disabled={!b} onClick={start}>{t('同意並開始')}</button>}
        </Section>
      )}

      {session && step !== 'intro' && step !== 'done' && (
        <p className="text-sm text-slate-600">{t('你的研究編號：')}<code className="rounded bg-slate-100 px-1 font-mono">{session.research_id}</code>{t('（撤回或刪除資料時使用，請記下）')}</p>
      )}

      {step === 'pre' && session && (
        <Section step={1} title={t('第一題：請自行判斷（沒有輔助）')}>
          <Question c={session.pre_case} phase="pre" busy={busy} onSubmit={answer('pre', 'post_initial')} />
        </Section>
      )}
      {step === 'post_initial' && session && (
        <Section step={2} title={t('第二題：先憑第一印象判斷')}>
          <Question c={session.post_case} phase="post_initial" busy={busy} onSubmit={answer('post_initial', 'assist')} />
        </Section>
      )}
      {(step === 'assist' || step === 'post_assisted') && session && assist && (
        <Section step={3} title={t('輔助資訊：') + studyMessage(assist.title)}>
          {assist.tips && <ul className="list-disc space-y-1 pl-5">{assist.tips.map((tip) => <li key={tip}>{studyMessage(tip)}</li>)}</ul>}
          {assist.features && (
            <div className="space-y-2">
              <p>{t('規則分析等級：')}<strong>{riskLabel(assist.risk_level ?? '—')}</strong>{t('（指數 ')}{assist.risk_score ?? '—'} / 100{t('）')}</p>
              {assist.features.length === 0 && <p className="text-sm">{t('未偵測到已知風險特徵（不代表安全）。')}</p>}
              <ul className="list-disc space-y-1 pl-5 text-sm">{assist.basis?.map((x) => <li key={x}>{checkMessage(t, x)}</li>)}</ul>
              <p className="text-xs text-slate-500">{studyMessage(assist.source_note ?? '')} {studyMessage(assist.disclaimer ?? '')}</p>
            </div>
          )}
          {step === 'assist' && <button className="btn-primary" onClick={() => setStep('post_assisted')}>{t('我看完了，再判斷一次')}</button>}
        </Section>
      )}
      {step === 'post_assisted' && session && (
        <Section step={4} title={t('第二題：看過輔助後，你的判斷是？')}>
          <Question c={session.post_case} phase="post_assisted" busy={busy} onSubmit={answer('post_assisted', 'done')} />
        </Section>
      )}

      {step === 'done' && session && (
        <Section title={t('測驗完成，感謝參與！')}>
          <ul className="space-y-2">
            {reveal.map((r) => (
              <li key={r.case_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium">{r.title}{t('：')}{r.verified_label === 'scam' ? t('詐騙') : t('正常訊息')}</p>
                <p className="text-sm text-slate-600">{r.label_basis}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm">{t('你的研究編號：')}<code className="rounded bg-slate-100 px-1 font-mono">{session.research_id}</code>{t('。若想撤回或刪除資料，請到 ')}<Link to="/privacy">{tc('Research', '隱私與研究說明')}</Link>{tc('Research', '。')}</p>
          <div>
            <p className="label">{t('（自願）這個測驗對你了解詐騙有幫助嗎？')}</p>
            {rating ? <Alert kind="success">{t('已收到回饋，謝謝！')}</Alert> : (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => <button key={n} className="btn-secondary min-w-11" disabled={busy} onClick={() => sendRating(n)} aria-label={t('{0} 分', n)}>{n}</button>)}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
