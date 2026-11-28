import { riskLabel, useLanguage, tc } from '../language'
import { checkMessage } from '../checkMessages'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigationType, useParams } from 'react-router-dom'
import { api, ApiError, formatTime, postJson, researchId, type AnalysisResult } from '../api'
import { Alert, RiskBadge, Section, Spinner } from '../components/ui'
import { addHistory, readHistory, resultSummary, type CheckReceipt } from '../history'
import { ResultOpinion } from '../components/ResultOpinion'
import { finalRisk, mainReasons, riskConclusion } from '../../shared/conclusion'
export { mainReasons } from '../../shared/conclusion'

const MATCH_ZH = { exact: '相同內容', similar: '相似內容（不等於同一事件）' }

/** gemini-3.5-flash-lite → Gemini 3.5 Flash Lite；備援模型先去掉 @cf/nvidia/、openai/ 這類前綴 */
const modelName = (id: string) => id.replace(/^@?[^/]*\/(?:[^/]*\/)?/, '').replace(/-it$/, '').replace(/-preview$/, '').replace(/-a\d+b$/, '').split('-').map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')

/** 實際回答的 AI：[完整名稱, 簡稱]（Gemini 失敗時可能改用備援 AI） */
const PROVIDERS: Record<string, [string, string]> = {
  gemini: ['Google Gemini', 'Gemini'], workers_ai: ['Cloudflare Workers AI', 'Workers AI'], groq: ['Groq', 'Groq'],
}
const providerOf = (p?: string | null) => PROVIDERS[p ?? 'gemini'] ?? PROVIDERS.gemini

const HEADLINE: Record<string, [string, string]> = {
  高: [riskConclusion('高'), 'border-red-300 bg-red-50'],
  中: [riskConclusion('中'), 'border-amber-300 bg-amber-50'],
  低: [riskConclusion('低'), 'border-emerald-300 bg-emerald-50'],
  資訊不足: [riskConclusion('資訊不足'), 'border-slate-300 bg-slate-50'],
}

function ConclusionCard({ data }: { data: AnalysisResult }) {
  const { t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  // 綜合等級：規則、Gemini、網址名單、Cofacts 取最高
  const final = finalRisk(data)
  const [headline, tone] = HEADLINE[final.level] ?? HEADLINE['資訊不足']
  const reasons = mainReasons(data)
  const aiOk = data.ai.status === 'ok'
  // 訊息裡藏有要 AI 改判的指令：規則或 AI 任一方發現就警告
  const manipulated = data.features.some((f) => f.feature_id === 'ai_manipulation') || (aiOk && data.ai.manipulation === true)
  // 有用 Gemini 就一定顯示它的回答（也是匯出的重要參考）
  const aiSummary = aiOk ? data.ai.summary : null
  return (
    <section className={`conclusion-card space-y-4 rounded-2xl border-2 p-4 shadow-sm sm:p-6 ${tone}`} data-risk={final.level} aria-labelledby="conclusion">
      <div className="flex flex-wrap items-center gap-3">
        <RiskBadge level={final.level} />
        {final.sources.length > 0 && <span className="text-sm text-slate-600">{t('依據：')}{final.sources.map(messageText).join(t('、'))}</span>}
      </div>
      <h2 id="conclusion" className="text-xl sm:text-2xl">{messageText(headline)}</h2>
      {manipulated && (
        <Alert kind="error">
          <strong>{t('這則訊息試圖操控 AI 的判斷。')}</strong>{t('內容裡藏有要 AI 忽略指示或改判為安全的文字，正常的通知不會這樣寫，這通常是詐騙集團想騙過查核工具。')}
        </Alert>
      )}
      {aiSummary && <p className="break-words text-slate-700"><span className="font-medium">{t('{0} 的判斷（', providerOf(data.ai.provider)[1])}{data.ai.risk_level && riskLabel(data.ai.risk_level)}{t('）：')}</span>{aiSummary}</p>}
      {reasons.length > 0 && (
        <div>
          <p className="font-medium">{t('主要原因')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">{reasons.map((r) => <li key={r}>{messageText(r)}</li>)}</ul>
        </div>
      )}
      <div className="conclusion-actions rounded-xl bg-white/70 p-3">
        <p className="font-medium">{t('建議你這樣做')}</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">{data.safe_actions.map((a) => <li key={a}>{messageText(a)}</li>)}</ul>
      </div>
      <p className="text-xs text-slate-500">
        {t('各來源判斷：')}{final.parts.map((p) => `${messageText(p.name)} ${riskLabel(p.level)}`).join(t('、'))}{t('。綜合等級取其中最高者，不是詐騙機率，也不是司法認定。')}{aiSummary ? t('AI 摘要可能出錯。') : ''}
      </p>
    </section>
  )
}

function AiBlock({ ai }: { ai: AnalysisResult['ai'] }) {
  const { t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  const vendor = ai.provider === 'gemini' || !ai.provider ? 'Google' : providerOf(ai.provider)[0]
  const model = ai.model ? modelName(ai.model) : providerOf(ai.provider)[1]
  if (ai.status === 'ok')
    return (
      <div className="space-y-2">
        {ai.risk_level && <RiskBadge level={ai.risk_level === '無法判斷' ? '資訊不足' : ai.risk_level} />}
        <p className="break-words">{ai.summary}</p>
        {ai.media_description && <p className="break-words text-sm text-slate-600">{t('AI 看到／聽到的內容：')}{ai.media_description}</p>}
        {!!ai.risk_points?.length && (<><p className="font-medium">{t('可疑之處')}</p><ul className="list-disc space-y-1 pl-5">{ai.risk_points.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {!!ai.advice?.length && (<><p className="font-medium">{t('AI 建議')}</p><ul className="list-disc space-y-1 pl-5">{ai.advice.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {ai.fallback_note && <p className="text-xs text-amber-800">{messageText(ai.fallback_note)}</p>}
        <p className="text-xs text-slate-500">{t('由 {0} {1} 產生，AI 可能出錯；此判斷不列入下方的規則風險指數。', vendor, model)}</p>
      </div>
    )
  const statusText = ai.summary && messageText(ai.summary)
  if (ai.status === 'demo') return <Alert kind="warn">{statusText}</Alert>
  if (ai.status === 'error' || ai.status === 'rate_limited') return <Alert kind="error">{statusText} {t('其他分析結果不受影響。')}</Alert>
  return <p className="text-slate-600">{statusText}</p>
}

export default function Result() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigation = useNavigationType()
  // 只在這次送出後顯示。重新整理、回上一頁或從紀錄打開時直接看結果。
  return <>
    <ResultBody />
    {navigation === 'PUSH' && state?.receipt?.analysis_id === id && <ReceiptDialog saved={state.saved} />}
  </>
}

function ReceiptDialog({ saved }: { saved: boolean }) {
  const { t } = useLanguage()
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])

  return <dialog ref={ref} className="receipt-dialog card" aria-labelledby="receipt-title" aria-describedby="receipt-description">
    <h2 id="receipt-title">{t('已收到')}</h2>
    <p id="receipt-description" className="my-4 text-slate-700">{saved
      ? t('現在可以關閉這個分頁。稍後用同一個瀏覽器開啟「查核紀錄」，就能查看這筆結果。')
      : t('這台裝置無法儲存查核紀錄。關閉分頁或查核下一則前，請先將本頁加入書籤，以便回來查看結果。')}</p>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" className="btn-secondary" onClick={() => ref.current?.close()}>{t('了解，我已明白')}</button>
      <Link to="/check" className="btn-primary text-center no-underline hover:no-underline">{t('查核下一則')}</Link>
    </div>
  </dialog>
}

function ResultBody() {
  const { lang, t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  const { id } = useParams()
  const loc = useLocation()
  const receipt = loc.state?.receipt as CheckReceipt | undefined
  const [saved] = useState(() => loc.state?.saved ?? readHistory().some(item => item.id === id))
  const [job, setJob] = useState(receipt?.job_status)
  const [data, setData] = useState<AnalysisResult | null>(loc.state?.analysis_id === id ? loc.state : null)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [fb, setFb] = useState<'idle' | 'sending' | 'helpful' | 'unhelpful' | 'error'>('idle')
  const [fbError, setFbError] = useState('')

  useEffect(() => {
    if (data?.analysis_id === id) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const read = async () => {
      try {
        const value = await api<AnalysisResult | CheckReceipt>(`/api/analysis/${id}`)
        if (!active) return
        if ('job_status' in value) {
          setJob(value.job_status)
          if (value.job_status === 'pending') timer = setTimeout(read, 2500)
        } else { setJob(undefined); setData(value) }
      } catch (e) { if (active) setError(e instanceof ApiError ? e.message : '讀取失敗') }
    }
    void read()
    return () => { active = false; clearTimeout(timer) }
  }, [id, data?.analysis_id, attempt])

  // 看過的結果記到這台裝置的「查核紀錄」（不含原文）
  useEffect(() => {
    if (!data || data.analysis_id !== id) return
    addHistory(resultSummary(data))
  }, [data, id])

  if (error) return <Alert kind="error">{messageText(error)} <button type="button" onClick={() => { setError(null); setAttempt(n => n + 1) }}>{t('重新讀取結果')}</button></Alert>
  if (job) return <Section title={t('文字查核')}>
    <p role="status">{job === 'failed'
      ? t('這筆查核已中斷，請重新送出。')
      : !saved
        ? t('已收到。這台裝置的紀錄裡還沒有這一筆，請先收藏本頁網址。')
        : t('正在查核，完成後會自動顯示結果。')}</p>
    <div className="flex flex-wrap gap-2"><Link className="btn-primary" to="/check">{t('再查一則')}</Link>
    <Link className="btn-secondary" to="/history">{t('查核紀錄')}</Link></div>
  </Section>
  if (!data) return <Spinner label={t('載入結果中…')} />

  const sendFeedback = async (helpful: boolean) => {
    if (fb !== 'idle' && fb !== 'error') return
    setFb('sending')
    try {
      const rid = researchId.get()
      await postJson('/api/feedback', { analysis_id: data.analysis_id, helpful, ...(rid && data.consent_research ? { research_id: rid } : {}) })
      setFb(helpful ? 'helpful' : 'unhelpful')
    } catch (e) {
      setFbError(e instanceof ApiError ? e.message : '')
      setFb('error')
    }
  }

  const separator = t('、')
  const colon = t('：')
  const c = data.cofacts
  const u = data.url_checks
  const fc = data.fact_check
  return (
    <div className="space-y-4">
      <h1>{tc('Result', '查核結果')}</h1>
      <ConclusionCard data={data} />
      {data.media?.notes?.map((n) => <Alert key={n} kind="info">{messageText(n)}</Alert>)}
      {data.extracted_text_preview && (
        <details className="card">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">{t('查看自動辨識出的文字（只顯示於本次，不會保存）')}</summary>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{data.extracted_text_preview}</p>
        </details>
      )}

      <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 py-3 font-medium text-slate-800 hover:bg-slate-50 sm:px-6 [&::-webkit-details-marker]:hidden">
          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" fill="currentColor" aria-hidden="true"><path d="M8 5l10 7-10 7z" /></svg>
          <span className="group-open:hidden">{t('查看完整分析')}</span><span className="hidden group-open:inline">{t('收起完整分析')}</span>
          <span className="text-sm font-normal text-slate-500">{t('（各來源查詢結果、規則、AI、風險指數）')}</span>
        </summary>
        <div className="space-y-4 border-t border-slate-200 p-3 sm:p-4">
      <Section step={1} title={t('Cofacts 查核結果')}>
        <p className={c.status === 'error' ? 'text-red-700' : 'text-slate-700'}>{messageText(c.message)}</p>
        {c.status === 'not_found' && <p className="text-sm text-slate-600">{t('查無資料不代表沒有詐騙風險。')}</p>}
        {c.matches.map((m) => (
          <div key={m.url} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="pill bg-slate-100">{messageText(MATCH_ZH[m.match_type])}</span>
              <span className={`pill ${m.reply_type === 'RUMOR' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}>{t('查核回覆：')}{messageText(m.reply_type_zh)}</span>
            </div>
            <p className="mt-2 break-words text-sm">{m.title}</p>
            {m.reply_excerpt && <p className="mt-1 break-words text-sm text-slate-600">{t('回覆摘要：')}{m.reply_excerpt}</p>}
            <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-sm">{t('在 Cofacts 查看原始查核 ↗')}</a>
          </div>
        ))}
        {c.matches.length > 0 && (
          <p className="text-xs text-slate-500">{t('資料來源：Cofacts 真的假的（cofacts.tw），以 {0} 授權。查核內容由 Cofacts 社群編輯提供，非本網站人工查核。', c.license)}</p>
        )}
      </Section>

      {fc && !['disabled', 'not_requested'].includes(fc.status) && (
        <Section title={t('Google 事實查核搜尋')}>
          <p className={fc.status === 'error' ? 'text-red-700' : 'text-slate-700'}>{messageText(fc.message)}</p>
          {fc.items.map((it) => (
            <div key={it.url} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="break-words">{it.claim}</p>
              <p className="text-slate-600">{it.publisher}{it.rating && `${t('：')}${it.rating}`}{it.date && ` · ${it.date}`}</p>
              <a href={it.url} target="_blank" rel="noopener noreferrer nofollow">{t('查看查核報告 ↗')}</a>
            </div>
          ))}
        </Section>
      )}

      {u && (
        <Section step={2} title={t('網址安全檢查')}>
          {u.url_count === 0 ? <p className="text-slate-700">{t('訊息中沒有網址。')}</p> : (
            <ul className="space-y-2">
              <UrlRow name={t('165 涉詐網站名單（警政署）')} status={u.tw165.status === 'listed' ? 'found' : u.tw165.status === 'not_listed' ? 'clean' : u.tw165.status} message={u.tw165.message}
                items={u.tw165.matches.map((m) => `${m.host_masked}${colon}${m.lists.map(messageText).join(separator)}${m.category ? `（${m.category}）` : ''}${m.month ? ` · ${m.month}` : ''}`)} />
              <UrlRow name={t('Google 安全瀏覽')} status={u.safe_browsing.status} message={u.safe_browsing.message} items={u.safe_browsing.threats.map((t) => `${t.host_masked}${colon}${messageText(t.detail)}`)} />
              <UrlRow name="VirusTotal" status={u.virustotal.status} message={u.virustotal.message} items={u.virustotal.threats.map((t) => `${t.host_masked}${colon}${messageText(t.detail)}`)} />
            </ul>
          )}
          <p className="text-xs text-slate-500">{t('網站不會開啟你訊息中的網址。165 名單來自政府資料開放平臺（政府資料開放授權條款）；Google 安全瀏覽結果由 Google 提供，可能有誤判或漏判。')}</p>
        </Section>
      )}

      <Section step={3} title={t('規則分析結果')}>
        {data.features.length === 0 ? (
          <p className="text-slate-700">{t('未偵測到規則庫中的已知風險特徵。這不代表訊息安全。')}</p>
        ) : (
          <ul className="space-y-2">
            {data.features.map((f) => (
              <li key={f.feature_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium">{messageText(f.label)} <span className="text-xs text-slate-500">({f.feature_id})</span></p>
                <p className="text-sm text-slate-600">{messageText(f.description)}</p>
                <p className="mt-1 break-words text-sm">{t('觸發依據：')}{f.triggers.map(messageText).join(separator)}</p>
                <p className="text-xs text-slate-500">{t('規則版本')} {f.rule_version} · {f.human_verified ? t('已人工驗證') : t('尚未經人工驗證')}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section step={4} title={t('AI 分析（{0}）', providerOf(data.ai.provider)[0])}>
        <AiBlock ai={data.ai} />
      </Section>

      <Section step={5} title={t('規則風險指數')}>
        <div className="flex flex-wrap items-end gap-4">
          <p className="text-4xl font-bold text-slate-900">{data.risk_score ?? '—'}<span className="text-base font-normal text-slate-500"> / 100</span></p>
          <RiskBadge level={data.risk_level} />
        </div>
        {data.risk_score !== null && (
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500" style={{ width: `${data.risk_score}%` }} />
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm">{data.basis.map((b) => <li key={b}>{messageText(b)}</li>)}</ul>
        <Alert kind="info">{messageText(data.score_disclaimer)}</Alert>
      </Section>

      <Section step={6} title={t('查核來源與時間')}>
        <p className="text-sm">{t('查核時間：')}{formatTime(data.checked_at, lang)}</p>
        <p className="text-sm">{t('規則版本：')}{data.rule_version} · Cofacts{colon}{c.mode === 'live' ? (c.status === 'skipped' ? t('未送出') : t('已查詢')) : t('已關閉')} · {t('外部 AI：')}{data.external_ai_used ? t('有') : t('未使用')}</p>
        {c.matches.length === 0 && <p className="text-sm text-slate-600">{t('本次沒有可引用的外部查核來源。')}</p>}
      </Section>
        </div>
      </details>

      <section className="card" aria-labelledby="feedback-heading">
        <div className="mx-auto max-w-xl space-y-4 px-2 sm:px-6">
          <h2 id="feedback-heading" className="text-center">{t('這次結果對你有幫助嗎？')}</h2>
          {fb === 'helpful' || fb === 'unhelpful' ? <>
            <p role="status" className="text-center text-sm text-slate-700">{t('感謝回饋！')} · {fb === 'helpful' ? t('有幫助') : t('沒幫助')}</p>
            <ResultOpinion helpful={fb === 'helpful'} />
          </> : (
            <div className="flex justify-center gap-3">
              <button className="btn-secondary min-w-24" disabled={fb === 'sending'} onClick={() => sendFeedback(true)}>{t('有幫助')}</button>
              <button className="btn-secondary min-w-24" disabled={fb === 'sending'} onClick={() => sendFeedback(false)}>{t('沒幫助')}</button>
            </div>
          )}
          {fb === 'error' && <Alert kind="error">{t('回饋送出失敗')}{fbError ? `${colon}${messageText(fbError)}` : t('，請檢查網路後再試一次。')}</Alert>}
        </div>
      </section>

      <Link to="/check" className="btn-primary no-underline hover:no-underline">{t('查核另一則訊息')}</Link>
    </div>
  )
}

const URL_STATUS: Record<string, [string, string]> = {
  found: ['⚠ 有疑慮', 'bg-red-100 text-red-800'],
  clean: ['未發現', 'bg-emerald-100 text-emerald-800'],
  not_requested: ['未勾選', 'bg-slate-100 text-slate-600'],
  disabled: ['未設定', 'bg-slate-100 text-slate-600'],
  no_url: ['沒有網址', 'bg-slate-100 text-slate-600'],
  rate_limited: ['已達上限', 'bg-amber-100 text-amber-900'],
  unavailable: ['暫停', 'bg-amber-100 text-amber-900'],
  error: ['查詢失敗', 'bg-amber-100 text-amber-900'],
}

function UrlRow({ name, status, message, items }: { name: string; status: string; message: string; items: string[] }) {
  const { t } = useLanguage()
  const messageText = (value: string) => checkMessage(t, value)
  const [label, cls] = URL_STATUS[status] ?? [status, 'bg-slate-100 text-slate-600']
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{name}</span><span className={`pill ${cls}`}>{messageText(label)}</span></div>
      {status !== 'disabled' && status !== 'not_requested' && <p className="mt-1 text-sm text-slate-600">{messageText(message)}</p>}
      {items.map((t) => <p key={t} className="mt-1 break-words text-sm text-red-800">{t}</p>)}
    </li>
  )
}
