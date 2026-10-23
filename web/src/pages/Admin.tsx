import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, formatTime, postJson } from '../api'
import { Alert, Section, Spinner } from '../components/ui'
import { buildWorkbook, downloadBlob, type ExportData } from '../excel'

const TOKEN_KEY = 'scamcheck_admin_token'
const getToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) } catch { return null } }
type Dataset = 'formal' | 'demo'
type Tab = 'overview' | 'records' | 'cases' | 'patterns' | 'business' | 'data' | 'settings'

/* eslint-disable @typescript-eslint/no-explicit-any */
const pct = (v: number | null | undefined) => (v === null || v === undefined ? '無資料' : `${(v * 100).toFixed(1)}%`)
const CATEGORIES = ['', 'ignored_link', 'trusted_authority', 'greed', 'fear', 'trusted_acquaintance', 'over_trust_system', 'over_suspicion', 'careless', 'other']
const CAT_ZH: Record<string, string> = { '': '未分類', ignored_link: '忽略連結', trusted_authority: '信任權威', greed: '貪心', fear: '恐懼', trusted_acquaintance: '信任熟人',
  over_trust_system: '過度信任系統', over_suspicion: '過度懷疑', careless: '粗心', other: '其他' }

export default function Admin() {
  const [token, setToken] = useState<string | null>(getToken())
  const [tab, setTab] = useState<Tab>('overview')
  const [dataset, setDataset] = useState<Dataset>('demo')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const call = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T | null> => {
    setError(null)
    try {
      return await api<T>(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { sessionStorage.removeItem(TOKEN_KEY); setToken(null) }
      setError(e instanceof ApiError ? e.message : '操作失敗')
      return null
    }
  }, [token])

  if (!token) return <Login onLogin={(t) => { sessionStorage.setItem(TOKEN_KEY, t); setToken(t) }} />

  const tabs: [Tab, string][] = [['overview', '總覽與統計'], ['records', '研究紀錄'], ['cases', '案例管理'], ['patterns', '風險模式審核'], ['business', '商業指標'], ['data', '匯出與資料管理'], ['settings', '系統設定']]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1>管理員</h1>
        <button className="btn-secondary" onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null) }}>登出</button>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(t)}>{l}</button>)}
      </div>
      <label className="flex items-center gap-2 text-sm">資料集：
        <select className="input min-h-11 w-auto" value={dataset} onChange={(e) => setDataset(e.target.value as Dataset)}>
          <option value="demo">模擬資料（DEMO）</option><option value="formal">正式資料</option>
        </select>
      </label>
      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}
      {tab === 'overview' && <Overview call={call} dataset={dataset} />}
      {tab === 'records' && <Records call={call} dataset={dataset} />}
      {tab === 'cases' && <Cases call={call} />}
      {tab === 'patterns' && <Patterns call={call} />}
      {tab === 'business' && <Business call={call} dataset={dataset} onDone={setNotice} />}
      {tab === 'data' && <DataTools token={token} call={call} dataset={dataset} onDone={setNotice} onError={setError} />}
      {tab === 'settings' && <SettingsTab call={call} onDone={setNotice} />}
    </div>
  )
}

type Call = <T>(path: string, init?: RequestInit) => Promise<T | null>

function Login({ onLogin }: { onLogin: (t: string) => void }) {
  const [p, setP] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr(null)
    try { onLogin((await postJson<{ token: string }>('/api/admin/login', { password: p })).token) } catch (x) { setErr(x instanceof ApiError ? x.message : '登入失敗') }
  }
  return (
    <form className="card mx-auto max-w-sm space-y-3" onSubmit={submit}>
      <h1>管理員登入</h1>
      <p className="text-sm text-slate-600">密碼是在 Cloudflare 後台設定的 ADMIN_PASSWORD。</p>
      <label className="block"><span className="label">密碼</span><input className="input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} /></label>
      {err && <Alert kind="error">{err}</Alert>}
      <button className="btn-primary w-full" disabled={!p}>登入</button>
    </form>
  )
}

function useLoad<T>(call: Call, path: string) {
  const [data, setData] = useState<T | null>(null)
  const reload = useCallback(() => { call<T>(path).then(setData) }, [call, path])
  useEffect(reload, [reload])
  return { data, reload }
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-semibold">{value}</p></div>
}

function Overview({ call, dataset }: { call: Call; dataset: Dataset }) {
  const { data: s } = useLoad<any>(call, `/api/admin/statistics?dataset=${dataset}`)
  if (!s) return <Spinner label="載入統計…" />
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="已同意研究的分析紀錄" value={s.analysis_records} /><Stat label="研究參與者" value={s.participants} />
        <Stat label="有效樣本（完成前後測）" value={s.valid_samples} /><Stat label="查核成功率" value={pct(s.source_check.success_rate)} />
        <Stat label="判斷正確率" value={pct(s.judgement.accuracy)} /><Stat label="誤判（正常→詐騙）" value={s.judgement.false_positive} />
        <Stat label="漏判（詐騙→正常）" value={s.judgement.false_negative} /><Stat label="回饋數" value={s.feedback.count} />
      </div>
      <Section title="各組前後測">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead><tr className="border-b"><th className="py-2">組別</th><th>人數</th><th>有效樣本</th><th>前測正確率</th><th>後測正確率</th><th>差異</th><th>看輔助後改變決策</th></tr></thead>
            <tbody>{Object.entries(s.groups).map(([g, v]: [string, any]) => (
              <tr key={g} className="border-b"><td className="py-2">{g} 組（{g === 'A' ? '一般防詐資訊' : '網站風險解釋'}）</td><td>{v.participants}</td><td>{v.valid_samples}</td>
                <td>{pct(v.pre_accuracy)}</td><td>{pct(v.post_accuracy)}</td><td>{pct(v.accuracy_change)}</td><td>{v.decision_changed_after_assist}</td></tr>))}</tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">便利樣本結果不能代表全臺灣青少年；樣本數小時差異可能只是隨機波動。</p>
      </Section>
      <Section title="常見風險特徵次數">
        {Object.keys(s.risk_tag_counts).length === 0 ? <p className="text-sm text-slate-600">尚無資料</p> : (
          <ul className="space-y-1 text-sm">{Object.entries(s.risk_tag_counts).map(([k, v]) => <li key={k} className="flex justify-between border-b py-1"><span>{k}</span><span>{v as number}</span></li>)}</ul>
        )}
      </Section>
    </div>
  )
}

function Records({ call, dataset }: { call: Call; dataset: Dataset }) {
  const { data: rows, reload } = useLoad<any[]>(call, `/api/admin/responses?dataset=${dataset}`)
  const { data: analyses } = useLoad<any[]>(call, `/api/admin/analysis-records?dataset=${dataset}`)
  const setCat = async (id: string, v: string) => { await call(`/api/admin/responses/${id}`, { method: 'PATCH', body: JSON.stringify({ researcher_category: v || null }) }); reload() }
  if (!rows || !analyses) return <Spinner label="載入紀錄…" />
  return (
    <div className="space-y-4">
      <Section title={`研究作答（最近 ${rows.length} 筆）`}>
        <p className="text-xs text-slate-500">「自述理由」由參與者選擇；「研究者分類」由研究團隊人工判斷，兩者分開儲存。</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead><tr className="border-b"><th className="py-2">研究編號</th><th>組</th><th>階段</th><th>判斷</th><th>正確</th><th>錯誤類型</th><th>自述理由</th><th>研究者分類</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.response_id} className="border-b"><td className="py-1 font-mono text-xs">{r.research_id}</td><td>{r.group}</td><td>{r.phase}</td><td>{r.user_decision}</td>
                <td>{r.correctness === null ? '—' : r.correctness ? '✓' : '✗'}</td><td>{r.error_type ?? ''}</td><td>{r.decision_reason_code}</td>
                <td><select aria-label="研究者分類" className="input min-h-9 py-1 text-xs" value={r.researcher_category ?? ''} onChange={(e) => setCat(r.response_id, e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_ZH[c]}</option>)}</select></td></tr>))}</tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="text-sm text-slate-600">尚無資料</p>}
      </Section>
      <Section title={`已同意研究的分析紀錄（最近 ${analyses.length} 筆，不含原文）`}>
        <ul className="space-y-1 text-sm">{analyses.map((a) => (
          <li key={a.analysis_id} className="flex flex-wrap justify-between gap-2 border-b py-1"><span>{formatTime(a.created_at)} · {a.media_type}</span><span>{a.risk_level}（{a.risk_score ?? '—'}）{a.risk_tags.join(', ')}</span></li>))}</ul>
        {analyses.length === 0 && <p className="text-sm text-slate-600">尚無資料</p>}
      </Section>
    </div>
  )
}

function Cases({ call }: { call: Call }) {
  const { data: cases, reload } = useLoad<any[]>(call, '/api/admin/cases')
  const [f, setF] = useState({ title: '', simulated_content: '', verified_label: 'scam', label_basis: '', difficulty: 'easy', category: '' })
  const review = async (id: string, status: string) => { await call(`/api/admin/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); reload() }
  const create = async (e: FormEvent) => { e.preventDefault(); if (await call('/api/admin/cases', { method: 'POST', body: JSON.stringify(f) })) { setF({ ...f, title: '', simulated_content: '', label_basis: '' }); reload() } }
  if (!cases) return <Spinner label="載入案例…" />
  return (
    <div className="space-y-4">
      <Alert kind="warn">正式研究只會使用「已核准」的案例；案例需為自行撰寫或已取得授權的內容，不可放入真實個資。</Alert>
      {cases.map((c) => (
        <div key={c.case_id} className="card space-y-2">
          <div className="flex flex-wrap items-center gap-2"><strong>{c.title}</strong>
            <span className="pill bg-slate-100">{c.difficulty}</span><span className="pill bg-slate-100">{c.verified_label === 'scam' ? '詐騙' : '正常'}</span>
            <span className={`pill ${c.reviewer_status === 'approved' ? 'bg-emerald-100 text-emerald-800' : c.reviewer_status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>{c.reviewer_status}</span></div>
          <p className="break-words text-sm">{c.simulated_content}</p>
          <p className="text-xs text-slate-500">判定依據：{c.label_basis}</p>
          <div className="flex gap-2"><button className="btn-secondary" onClick={() => review(c.case_id, 'approved')}>核准</button><button className="btn-secondary" onClick={() => review(c.case_id, 'rejected')}>退回</button><button className="btn-secondary" onClick={() => review(c.case_id, 'pending')}>改為待審</button></div>
        </div>
      ))}
      <Section title="新增模擬案例">
        <form className="space-y-2" onSubmit={create}>
          <input className="input" placeholder="標題" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
          <textarea className="input min-h-24" placeholder="模擬內容（自行撰寫）" value={f.simulated_content} onChange={(e) => setF({ ...f, simulated_content: e.target.value })} required />
          <input className="input" placeholder="判定依據與來源" value={f.label_basis} onChange={(e) => setF({ ...f, label_basis: e.target.value })} required />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <select className="input min-h-11" value={f.verified_label} onChange={(e) => setF({ ...f, verified_label: e.target.value })}><option value="scam">詐騙</option><option value="legit">正常</option></select>
            <select className="input min-h-11" value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value })}><option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option></select>
            <input className="input" placeholder="類別，如：假投資" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} required />
          </div>
          <button className="btn-primary">新增（預設待審）</button>
        </form>
      </Section>
    </div>
  )
}

function Patterns({ call }: { call: Call }) {
  const { data, reload } = useLoad<any[]>(call, '/api/admin/patterns')
  const review = async (id: string, s: string) => { await call(`/api/admin/patterns/${id}`, { method: 'PATCH', body: JSON.stringify({ human_review_status: s, verification_status: s === 'approved' ? 'verified' : 'draft' }) }); reload() }
  if (!data) return <Spinner label="載入…" />
  return (
    <div className="space-y-2">
      {data.map((p) => (
        <div key={p.pattern_id} className="card space-y-1 text-sm">
          <p><strong>{p.scam_category}</strong>（{p.psychological_trigger}）<span className="pill ml-2 bg-slate-100">審核：{p.human_review_status}</span><span className="pill ml-1 bg-slate-100">驗證：{p.verification_status}</span></p>
          <p>指標：{p.risk_indicators}</p><p>防範：{p.prevention_method}</p><p className="text-xs text-slate-500">來源：{p.evidence_source} · 授權：{p.source_license}</p>
          <div className="flex gap-2"><button className="btn-secondary" onClick={() => review(p.pattern_id, 'approved')}>核准</button><button className="btn-secondary" onClick={() => review(p.pattern_id, 'rejected')}>退回</button></div>
        </div>
      ))}
    </div>
  )
}

function Business({ call, dataset, onDone }: { call: Call; dataset: Dataset; onDone: (s: string) => void }) {
  const { data: s, reload } = useLoad<any>(call, `/api/admin/statistics?dataset=${dataset}`)
  const [ev, setEv] = useState({ product: 'A', event_type: 'actual_trial', count: '1' })
  const add = async (e: FormEvent) => { e.preventDefault(); if (await call('/api/admin/business-events', { method: 'POST', body: JSON.stringify({ ...ev, count: Number(ev.count) }) })) { onDone('已登錄行為紀錄'); reload() } }
  if (!s) return <Spinner label="載入…" />
  const cols: [string, string][] = [['survey_responses', '問卷數'], ['avg_perceived_value', '平均價值'], ['verbal_interest', '口頭興趣'], ['trial_intent', '試用意願'], ['actual_trial', '實際試用'], ['payment_intent', '付款意願'], ['actual_payment', '實際付款']]
  return (
    <div className="space-y-4">
      <Section title="五種需求指標（分開統計）">
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr className="border-b"><th className="py-2">產品</th>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{Object.entries(s.business).map(([p, v]: [string, any]) => <tr key={p} className="border-b"><td className="py-2">{p}</td>{cols.map(([k]) => <td key={k}>{v[k] ?? '無資料'}</td>)}</tr>)}</tbody>
        </table></div>
        <p className="text-xs text-slate-500">「願意購買」是自述意願，不等於營收；實際試用與實際付款由研究團隊依真實行為登錄。</p>
      </Section>
      <Section title="登錄實際行為">
        <form className="grid gap-2 sm:grid-cols-4" onSubmit={add}>
          <select className="input min-h-11" value={ev.product} onChange={(e) => setEv({ ...ev, product: e.target.value })}><option>A</option><option>B</option><option>C</option></select>
          <select className="input min-h-11" value={ev.event_type} onChange={(e) => setEv({ ...ev, event_type: e.target.value })}><option value="actual_trial">實際試用</option><option value="actual_payment">實際付款</option></select>
          <input className="input" type="number" min={1} value={ev.count} onChange={(e) => setEv({ ...ev, count: e.target.value })} aria-label="次數" />
          <button className="btn-primary">登錄</button>
        </form>
      </Section>
    </div>
  )
}

function AiTest({ call }: { call: Call }) {
  const [r, setR] = useState<{ ok: boolean; model: string; reply?: string; message?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async () => { setBusy(true); setR(await call('/api/admin/ai/test', { method: 'POST' })); setBusy(false) }
  return (
    <Section title="Gemini AI 連線測試">
      <p className="text-sm">檢查 Cloudflare 後台的 GEMINI_API_KEY 與「系統設定」中的模型名稱是否正確（會使用一次極少量的額度）。</p>
      {busy ? <Spinner label="測試中…" /> : <button className="btn-secondary" onClick={run}>測試 Gemini 連線</button>}
      {r && (r.ok ? <Alert kind="success">連線成功（模型 {r.model}）。</Alert> : <Alert kind="error">連線失敗（模型 {r.model}）：{r.message}</Alert>)}
    </Section>
  )
}

function DataTools({ token, call, dataset, onDone, onError }: { token: string; call: Call; dataset: Dataset; onDone: (s: string) => void; onError: (s: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const { data: logs, reload } = useLoad<any[]>(call, '/api/admin/audit-logs')
  const day = new Date().toISOString().slice(0, 10)
  const exportExcel = async () => {
    setBusy('產生 Excel 中…')
    try {
      const data = await call<ExportData>(`/api/admin/export-data?dataset=${dataset}`)
      if (!data) return
      downloadBlob(await buildWorkbook(data), `識詐數據庫_${dataset === 'demo' ? 'DEMO' : '正式'}_${day}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      onDone('已匯出 Excel')
      reload()
    } catch (e) { onError(e instanceof Error ? e.message : '匯出失敗') } finally { setBusy(null) }
  }
  const backup = async () => {
    setBusy('產生備份中…')
    try {
      const r = await fetch('/api/admin/backup.json', { headers: { Authorization: `Bearer ${token}` } })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail ?? '備份失敗')
      downloadBlob(await r.blob(), `識詐數據庫_完整備份_${day}.json`, 'application/json')
      onDone('已下載完整備份')
      reload()
    } catch (e) { onError(e instanceof Error ? e.message : '備份失敗') } finally { setBusy(null) }
  }
  const seed = async () => { const r = await call<any>('/api/admin/demo/seed', { method: 'POST' }); if (r) { onDone(`已建立 ${r.participants} 位 DEMO 參與者的合成資料`); reload() } }
  const clear = async () => { setConfirmClear(false); if (await call('/api/admin/demo/clear', { method: 'POST' })) { onDone('已清除所有 DEMO 測試資料（正式資料不受影響）'); reload() } }
  return (
    <div className="space-y-4">
      <Section title="匯出研究資料">
        <p className="text-sm">匯出目前選擇的資料集（{dataset === 'demo' ? '模擬資料 DEMO' : '正式資料'}）為 Excel，含 Analysis_Records、Source_Results、Research_Responses、Pattern_Dataset、Consent_Records、Product_Survey、Summary 七個工作表。不含原始投稿或個資。</p>
        {busy ? <Spinner label={busy} /> : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="btn-primary" onClick={exportExcel}>匯出研究資料（.xlsx）</button>
            <button className="btn-secondary" onClick={backup}>下載完整備份（.json）</button>
          </div>
        )}
        <p className="text-xs text-slate-500">完整備份包含所有資料表，換帳號或搬家時可用來還原。Cloudflare 另外會自動保留 7 天內的資料庫還原點。</p>
      </Section>
      <AiTest call={call} />
      <Section title="測試資料">
        <p className="text-sm">合成資料一律標示為 DEMO，不會混入正式資料。</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button className="btn-secondary" onClick={seed}>建立 DEMO 合成資料</button>
          {confirmClear ? (<><button className="btn-danger" onClick={clear}>確定清除所有 DEMO 資料</button><button className="btn-secondary" onClick={() => setConfirmClear(false)}>取消</button></>)
            : <button className="btn-danger" onClick={() => setConfirmClear(true)}>清除測試資料</button>}
        </div>
      </Section>
      <Section title="操作紀錄（最近 100 筆）">
        <ul className="max-h-72 space-y-1 overflow-y-auto text-xs">{logs?.map((l, i) => <li key={i} className="border-b py-1">{formatTime(l.created_at)} · {l.actor} · {l.action} {l.target ?? ''} {l.detail ?? ''}</li>)}</ul>
      </Section>
    </div>
  )
}

function SettingsTab({ call, onDone }: { call: Call; onDone: (s: string) => void }) {
  const { data, reload } = useLoad<any>(call, '/api/admin/settings')
  const [f, setF] = useState<any>(null)
  const [confirmFormal, setConfirmFormal] = useState(false)
  useEffect(() => { if (data) setF(data) }, [data])
  if (!f) return <Spinner label="載入設定…" />
  const save = async () => {
    if (f.research_mode === 'formal' && data.research_mode !== 'formal' && !confirmFormal) return setConfirmFormal(true)
    const body = { research_mode: f.research_mode, research_group_mode: f.research_group_mode, research_collection_enabled: f.research_collection_enabled,
      gemini_model: String(f.gemini_model).trim(), gemini_daily_limit: Number(f.gemini_daily_limit), cofacts_daily_limit: Number(f.cofacts_daily_limit) }
    if (await call('/api/admin/settings', { method: 'PUT', body: JSON.stringify(body) })) { setConfirmFormal(false); onDone('設定已儲存，立即生效'); reload() }
  }
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v })
  return (
    <div className="space-y-4">
      <Section title="研究設定">
        <label className="block"><span className="label">研究模式</span>
          <select className="input min-h-11" value={f.research_mode} onChange={(e) => set('research_mode', e.target.value)}>
            <option value="simulation">模擬（DEMO，預設）</option><option value="formal">正式（須學校審查核准後才可使用）</option>
          </select></label>
        <label className="block"><span className="label">分組方式</span>
          <select className="input min-h-11" value={f.research_group_mode} onChange={(e) => set('research_group_mode', e.target.value)}>
            <option value="balanced">自動平衡 A／B 組</option><option value="A">全部 A 組（一般防詐資訊）</option><option value="B">全部 B 組（網站風險解釋）</option>
          </select></label>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={f.research_collection_enabled} onChange={(e) => set('research_collection_enabled', e.target.checked)} />蒐集研究資料（研究結束後取消勾選）</label>
      </Section>
      <Section title="AI 與外部查詢">
        <label className="block"><span className="label">Gemini 模型名稱</span><input className="input" value={f.gemini_model} onChange={(e) => set('gemini_model', e.target.value)} /></label>
        <p className="text-xs text-slate-500">Google 推出新模型時改這裡即可，例如 gemini-3.8-flash。金鑰在 Cloudflare 後台的 GEMINI_API_KEY 設定。</p>
        <label className="block"><span className="label">Gemini 每日上限（次）</span><input className="input" type="number" min={0} value={f.gemini_daily_limit} onChange={(e) => set('gemini_daily_limit', e.target.value)} /></label>
        <label className="block"><span className="label">Cofacts 每日上限（次）</span><input className="input" type="number" min={0} value={f.cofacts_daily_limit} onChange={(e) => set('cofacts_daily_limit', e.target.value)} /></label>
      </Section>
      {confirmFormal && <Alert kind="warn">切換到正式模式前，請確認已通過學校審查、取得法定代理人同意，並已核准研究案例。確定請再按一次「儲存設定」。</Alert>}
      <button className="btn-primary" onClick={save}>儲存設定</button>
    </div>
  )
}
