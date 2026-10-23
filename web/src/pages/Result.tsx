import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError, formatTime, postJson, researchId, type AnalysisResult } from '../api'
import { Alert, RiskBadge, Section, Spinner } from '../components/ui'

const MATCH_ZH = { exact: '相同內容', similar: '相似內容（不等於同一事件）' }

/** gemini-3.5-flash-lite → Gemini 3.5 Flash Lite */
const modelName = (id: string) => id.replace(/-it$/, '').replace(/-preview$/, '').split('-').map((w) => (/^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')

function AiBlock({ ai }: { ai: AnalysisResult['ai'] }) {
  if (ai.status === 'ok')
    return (
      <div className="space-y-2">
        {ai.risk_level && <RiskBadge level={ai.risk_level === '無法判斷' ? '資訊不足' : ai.risk_level} />}
        <p className="break-words">{ai.summary}</p>
        {ai.media_description && <p className="break-words text-sm text-slate-600">AI 看到／聽到的內容：{ai.media_description}</p>}
        {!!ai.risk_points?.length && (<><p className="font-medium">可疑之處</p><ul className="list-disc space-y-1 pl-5">{ai.risk_points.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {!!ai.advice?.length && (<><p className="font-medium">AI 建議</p><ul className="list-disc space-y-1 pl-5">{ai.advice.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {ai.fallback_note && <p className="text-xs text-amber-800">{ai.fallback_note}</p>}
        <p className="text-xs text-slate-500">由 Google {ai.model ? modelName(ai.model) : 'Gemini'} 產生，AI 可能出錯；此判斷不列入下方的規則風險指數。</p>
      </div>
    )
  if (ai.status === 'demo') return <Alert kind="warn">{ai.summary}</Alert>
  if (ai.status === 'error' || ai.status === 'rate_limited') return <Alert kind="error">{ai.summary} 其他分析結果不受影響。</Alert>
  return <p className="text-slate-600">{ai.summary}</p>
}

export default function Result() {
  const { id } = useParams()
  const loc = useLocation()
  const [data, setData] = useState<AnalysisResult | null>((loc.state as AnalysisResult) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [fb, setFb] = useState<'idle' | 'sent' | 'error'>('idle')

  useEffect(() => {
    if (data?.analysis_id === id) return
    api<AnalysisResult>(`/api/analysis/${id}`).then(setData).catch((e) => setError(e instanceof ApiError ? e.message : '讀取失敗'))
  }, [id, data?.analysis_id])

  if (error) return <Alert kind="error">{error} <Link to="/check">重新查核</Link></Alert>
  if (!data) return <Spinner label="載入結果中…" />

  const sendFeedback = async (helpful: boolean) => {
    try {
      const rid = researchId.get()
      await postJson('/api/feedback', { analysis_id: data.analysis_id, helpful, ...(rid && data.consent_research ? { research_id: rid } : {}) })
      setFb('sent')
    } catch {
      setFb('error')
    }
  }

  const c = data.cofacts
  const u = data.url_checks
  const fc = data.fact_check
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>查核結果</h1>
        <RiskBadge level={data.risk_level} />
      </div>
      {data.media?.notes?.map((n) => <Alert key={n} kind="info">{n}</Alert>)}
      {data.extracted_text_preview && (
        <details className="card">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">查看自動辨識出的文字（只顯示於本次，不會保存）</summary>
          <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{data.extracted_text_preview}</p>
        </details>
      )}

      <Section step={1} title="Cofacts 查核結果">
        <p className={c.status === 'error' ? 'text-red-700' : 'text-slate-700'}>{c.message}</p>
        {c.status === 'not_found' && <p className="text-sm text-slate-600">查無資料不代表沒有詐騙風險。</p>}
        {c.matches.map((m) => (
          <div key={m.url} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="pill bg-slate-100">{MATCH_ZH[m.match_type]}</span>
              <span className={`pill ${m.reply_type === 'RUMOR' ? 'bg-red-100 text-red-800' : 'bg-slate-100'}`}>查核回覆：{m.reply_type_zh}</span>
            </div>
            <p className="mt-2 break-words text-sm">{m.title}</p>
            {m.reply_excerpt && <p className="mt-1 break-words text-sm text-slate-600">回覆摘要：{m.reply_excerpt}</p>}
            <a href={m.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-sm">在 Cofacts 查看原始查核 ↗</a>
          </div>
        ))}
        {c.matches.length > 0 && (
          <p className="text-xs text-slate-500">資料來源：Cofacts 真的假的（cofacts.tw），以 {c.license} 授權。查核內容由 Cofacts 社群編輯提供，非本網站人工查核。</p>
        )}
      </Section>

      {fc && !['disabled', 'not_requested'].includes(fc.status) && (
        <Section title="Google 事實查核搜尋">
          <p className={fc.status === 'error' ? 'text-red-700' : 'text-slate-700'}>{fc.message}</p>
          {fc.items.map((it) => (
            <div key={it.url} className="rounded-xl border border-slate-200 p-3 text-sm">
              <p className="break-words">{it.claim}</p>
              <p className="text-slate-600">{it.publisher}{it.rating && `：${it.rating}`}{it.date && ` · ${it.date}`}</p>
              <a href={it.url} target="_blank" rel="noopener noreferrer nofollow">查看查核報告 ↗</a>
            </div>
          ))}
        </Section>
      )}

      {u && (
        <Section step={2} title="網址安全檢查">
          {u.url_count === 0 ? <p className="text-slate-700">訊息中沒有網址。</p> : (
            <ul className="space-y-2">
              <UrlRow name="165 涉詐網站名單（警政署）" status={u.tw165.status === 'listed' ? 'found' : u.tw165.status === 'not_listed' ? 'clean' : u.tw165.status} message={u.tw165.message}
                items={u.tw165.matches.map((m) => `${m.host_masked}：${m.lists.join('、')}${m.category ? `（${m.category}）` : ''}${m.month ? ` · ${m.month}` : ''}`)} />
              <UrlRow name="Google 安全瀏覽" status={u.safe_browsing.status} message={u.safe_browsing.message} items={u.safe_browsing.threats.map((t) => `${t.host_masked}：${t.detail}`)} />
              <UrlRow name="VirusTotal" status={u.virustotal.status} message={u.virustotal.message} items={u.virustotal.threats.map((t) => `${t.host_masked}：${t.detail}`)} />
            </ul>
          )}
          <p className="text-xs text-slate-500">網站不會開啟你訊息中的網址。165 名單來自政府資料開放平臺（政府資料開放授權條款）；Google 安全瀏覽結果由 Google 提供，可能有誤判或漏判。</p>
        </Section>
      )}

      <Section step={3} title="規則分析結果">
        {data.features.length === 0 ? (
          <p className="text-slate-700">未偵測到規則庫中的已知風險特徵。這不代表訊息安全。</p>
        ) : (
          <ul className="space-y-2">
            {data.features.map((f) => (
              <li key={f.feature_id} className="rounded-xl border border-slate-200 p-3">
                <p className="font-medium">{f.label} <span className="text-xs text-slate-500">({f.feature_id})</span></p>
                <p className="text-sm text-slate-600">{f.description}</p>
                <p className="mt-1 break-words text-sm">觸發依據：{f.triggers.join('、')}</p>
                <p className="text-xs text-slate-500">規則版本 {f.rule_version} · {f.human_verified ? '已人工驗證' : '尚未經人工驗證'}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section step={4} title="AI 分析（Google Gemini）">
        <AiBlock ai={data.ai} />
      </Section>

      <Section step={5} title="綜合風險指數">
        <div className="flex flex-wrap items-end gap-4">
          <p className="text-4xl font-bold text-slate-900">{data.risk_score ?? '—'}<span className="text-base font-normal text-slate-500"> / 100</span></p>
          <RiskBadge level={data.risk_level} />
        </div>
        {data.risk_score !== null && (
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
            <div className="h-full bg-gradient-to-r from-sky-400 via-amber-400 to-red-500" style={{ width: `${data.risk_score}%` }} />
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-sm">{data.basis.map((b) => <li key={b}>{b}</li>)}</ul>
        <Alert kind="info">{data.score_disclaimer}</Alert>
      </Section>

      <Section step={6} title="建議的安全行動">
        <ul className="list-disc space-y-1 pl-5">{data.safe_actions.map((a) => <li key={a}>{a}</li>)}</ul>
      </Section>

      <Section step={7} title="查核來源與時間">
        <p className="text-sm">查核時間：{formatTime(data.checked_at)}</p>
        <p className="text-sm">規則版本：{data.rule_version} · Cofacts：{c.mode === 'live' ? (c.status === 'skipped' ? '未送出' : '已查詢') : '已關閉'} · 外部 AI：{data.external_ai_used ? '有' : '未使用'}</p>
        {c.matches.length === 0 && <p className="text-sm text-slate-600">本次沒有可引用的外部查核來源。</p>}
      </Section>

      <Section step={8} title="這次結果對你有幫助嗎？">
        {fb === 'sent' ? <Alert kind="success">感謝回饋！</Alert> : (
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 sm:flex-none" onClick={() => sendFeedback(true)}>有幫助</button>
            <button className="btn-secondary flex-1 sm:flex-none" onClick={() => sendFeedback(false)}>沒幫助</button>
          </div>
        )}
        {fb === 'error' && <Alert kind="error">回饋送出失敗，請稍後再試。</Alert>}
      </Section>

      <Link to="/check" className="btn-primary no-underline hover:no-underline">查核另一則訊息</Link>
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
  const [label, cls] = URL_STATUS[status] ?? [status, 'bg-slate-100 text-slate-600']
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{name}</span><span className={`pill ${cls}`}>{label}</span></div>
      {status !== 'disabled' && status !== 'not_requested' && <p className="mt-1 text-sm text-slate-600">{message}</p>}
      {items.map((t) => <p key={t} className="mt-1 break-words text-sm text-red-800">{t}</p>)}
    </li>
  )
}
