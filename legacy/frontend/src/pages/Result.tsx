import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError, formatTime, postJson, researchId, type AnalysisResult } from '../api'
import { Alert, RiskBadge, Section, Spinner } from '../components/ui'

const MATCH_ZH = { exact: '相同內容', similar: '相似內容（不等於同一事件）' }

function AiBlock({ ai }: { ai: AnalysisResult['ai'] }) {
  if (ai.status === 'ok')
    return (
      <div className="space-y-2">
        {ai.risk_level && <RiskBadge level={ai.risk_level === '無法判斷' ? '資訊不足' : ai.risk_level} />}
        <p className="break-words">{ai.summary}</p>
        {ai.media_description && <p className="break-words text-sm text-slate-600">AI 看到／聽到的內容：{ai.media_description}</p>}
        {!!ai.risk_points?.length && (<><p className="font-medium">可疑之處</p><ul className="list-disc space-y-1 pl-5">{ai.risk_points.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        {!!ai.advice?.length && (<><p className="font-medium">AI 建議</p><ul className="list-disc space-y-1 pl-5">{ai.advice.map((x) => <li key={x}>{x}</li>)}</ul></>)}
        <p className="text-xs text-slate-500">由 Google Gemini（{ai.model}）產生，AI 可能出錯；此判斷不列入下方的規則風險指數。</p>
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

      <Section step={2} title="規則分析結果">
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

      <Section step={3} title="AI 分析（Google Gemini）">
        <AiBlock ai={data.ai} />
      </Section>

      <Section step={4} title="綜合風險指數">
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

      <Section step={5} title="建議的安全行動">
        <ul className="list-disc space-y-1 pl-5">{data.safe_actions.map((a) => <li key={a}>{a}</li>)}</ul>
      </Section>

      <Section step={6} title="查核來源與時間">
        <p className="text-sm">查核時間：{formatTime(data.checked_at)}</p>
        <p className="text-sm">規則版本：{data.rule_version} · Cofacts 模式：{c.mode === 'live' ? 'Live' : 'Demo（未查詢）'} · 外部 AI：{data.external_ai_used ? '有' : '未使用'}</p>
        {c.matches.length === 0 && <p className="text-sm text-slate-600">本次沒有可引用的外部查核來源。</p>}
      </Section>

      <Section step={7} title="這次結果對你有幫助嗎？">
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
