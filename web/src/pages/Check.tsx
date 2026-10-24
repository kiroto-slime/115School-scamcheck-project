import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, currentAiModel, postJson, researchId, type AnalysisResult, type NeedsManualText } from '../api'
import { prepareImage, videoMime } from '../media'
import { NaughtyButton } from '../components/NaughtyButton'
import { type ServiceOption, ServiceOptions } from '../components/ServiceOptions'
import { Alert, refreshHealth, Spinner, useHealth } from '../components/ui'

type Mode = 'text' | 'image' | 'video'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']
const VIDEO_EXT = ['.mp4', '.mov']
/** IG、FB、Threads 貼文連結（網站讀不到貼文內容） */
const SOCIAL_LINK = /(?:instagram\.com|instagr\.am|facebook\.com|fb\.com|fb\.watch|m\.me|threads\.net|threads\.com)\//i

export function validateFile(file: File, mode: 'image' | 'video', maxMb: number): string | null {
  const name = file.name.toLowerCase()
  if (mode === 'image' && !(IMAGE_EXT.some((e) => name.endsWith(e)) && (IMAGE_TYPES.includes(file.type) || !file.type)))
    return '圖片格式不支援，請選擇 JPG、PNG 或 WebP。'
  if (mode === 'video' && !VIDEO_EXT.some((e) => name.endsWith(e))) return '影片格式不支援，請選擇 MP4 或 MOV。'
  if (file.size === 0) return '檔案是空的，請重新選擇。'
  if (file.size > maxMb * 1024 * 1024) return `檔案超過 ${maxMb} MB 上限（目前 ${(file.size / 1024 / 1024).toFixed(1)} MB）。`
  return null
}

type Draft = { mode: Mode; text: string; extra: string }
const DRAFT_KEY = 'checkDraft'
function readDraft(): Draft {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null')
    if (d && ['text', 'image', 'video'].includes(d.mode)) return { mode: d.mode, text: String(d.text ?? ''), extra: String(d.extra ?? '') }
  } catch {
    /* 讀不到就用空白 */
  }
  return { mode: 'text', text: '', extra: '' }
}
function saveDraft(d: Draft) {
  try {
    if (d.text || d.extra) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
    else sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* 無痕模式等：不影響使用 */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* 略過 */
  }
}

export default function Check() {
  const { health } = useHealth()
  const limits = health?.limits ?? { max_text_chars: 10000, max_image_mb: 10, max_video_mb: 20, max_video_seconds: 30 }
  const nav = useNavigate()
  // 草稿存在 sessionStorage：重新整理還在，關掉分頁就清除（不上傳）
  const [draft] = useState(readDraft)
  const [mode, setMode] = useState<Mode>(draft.mode)
  const [text, setText] = useState(draft.text)
  const [extra, setExtra] = useState(draft.extra)
  useEffect(() => saveDraft({ mode, text, extra }), [mode, text, extra])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [queryCofacts, setQueryCofacts] = useState(true)
  const [useAi, setUseAi] = useState(true)
  const aiAvailable = health?.modes.ai === 'gemini'
  const cofactsAvailable = health?.modes.cofacts === 'live'
  // 每分鐘次數用完的模型會冷卻：用讀到狀態的時間，每秒倒數
  const [healthAt, setHealthAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = Date.now()
    setHealthAt(t)
    setNow(t)
  }, [health])
  // 不能是負數：否則沒在冷卻的模型會被誤算成「冷卻 1 秒」而一直閃
  const passed = Math.max(0, Math.floor((now - healthAt) / 1000))
  // 圖片、影片模式只列出能分析媒體的模型
  const aiModels = (health?.modes.ai_models ?? [])
    .filter((m) => mode === 'text' || m.media)
    .map((m) => {
      const cooldown = Math.max(0, m.cooldown_seconds - passed)
      return { ...m, cooldown, minute_left: cooldown > 0 ? 0 : Math.max(m.minute_left, 1) }
    })
  const aiNow = currentAiModel(aiModels)
  const aiLeft = aiModels.reduce((n, m) => n + m.remaining, 0)
  const anyLeftToday = aiModels.some((m) => m.remaining > 0)
  // 今天還有額度、但這一分鐘全部冷卻中：顯示最短的等待秒數
  const aiWait = !aiNow && anyLeftToday ? Math.min(...aiModels.filter((m) => m.remaining > 0).map((m) => m.cooldown)) : 0
  // Cofacts、Google、VirusTotal 的剩餘次數與冷卻（VirusTotal 每分鐘只有 4 次）
  const quotas = health?.modes.quotas
  const svc = (k: 'cofacts' | 'google' | 'virustotal') => {
    const q = quotas?.[k]
    if (!q) return { blocked: false, cooldown: 0, chip: null as ReactNode }
    const cooldown = Math.max(0, q.cooldown_seconds - passed)
    const blocked = q.daily_left <= 0 || cooldown > 0
    const chip = q.daily_left <= 0
      ? <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">今日次數已用完</span>
      : cooldown > 0
        ? <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700" role="status">冷卻中，{cooldown} 秒後可用</span>
        : k === 'virustotal'
          ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">今日剩 {q.daily_left} 次・每分鐘最多 4 次</span>
          : null
    return { blocked, cooldown, chip }
  }
  const cofactsQ = svc('cofacts')
  const googleQ = svc('google')
  const vtQ = svc('virustotal')
  const cooling = aiModels.some((m) => m.cooldown > 0) || vtQ.cooldown > 0
  useEffect(() => {
    if (!cooling) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [cooling])
  // 伺服器說有模型在冷卻、而倒數已經結束：重新讀一次狀態（只會在真的冷卻過後觸發）
  const serverCooling = (health?.modes.ai_models ?? []).some((m) => m.cooldown_seconds > 0) || (quotas?.virustotal.cooldown_seconds ?? 0) > 0
  useEffect(() => { if (serverCooling && !cooling) refreshHealth() }, [serverCooling, cooling])
  const [aiChoice, setAiChoice] = useState('')
  // 切到圖片／影片、或選的模型用完／冷卻中時，改回自動
  const aiModel = aiModels.some((m) => m.id === aiChoice && m.remaining > 0 && m.cooldown === 0) ? aiChoice : ''
  const aiBlocked = !aiNow // 今天用完，或這一分鐘全部冷卻中
  const aiOn = aiAvailable && useAi && !aiBlocked
  const googleAvailable = health?.modes.google === 'live'
  const vtAvailable = health?.modes.virustotal === 'live'
  const [queryGoogle, setQueryGoogle] = useState(true)
  const [queryVt, setQueryVt] = useState(false)
  // 協助校內研究：預設勾選，可取消（使用者決定）
  const [consentB, setConsentB] = useState(true)
  const [consentC, setConsentC] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // 分析進行中重新整理或關分頁：瀏覽器先問一次，避免分析中斷、結果不見
  useEffect(() => {
    if (!busy) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [busy])
  const [error, setError] = useState<string | null>(null)
  const [manualHint, setManualHint] = useState<string | null>(null)
  const [videoSeconds, setVideoSeconds] = useState<number | null>(null)
  const extraRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const switchMode = (m: Mode) => {
    setMode(m)
    setFile(null)
    setPreview(null)
    setFileError(null)
    setError(null)
    setManualHint(null)
  }

  const onFile = (f: File | null) => {
    setError(null)
    setManualHint(null)
    setFile(null)
    setPreview(null)
    if (!f || mode === 'text') return setFileError(null)
    const err = validateFile(f, mode, mode === 'image' ? limits.max_image_mb : limits.max_video_mb)
    setFileError(err)
    if (err) return
    const url = URL.createObjectURL(f)
    if (mode === 'video') {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => {
        setVideoSeconds(Number.isFinite(v.duration) ? Math.round(v.duration * 10) / 10 : null)
        if (v.duration > limits.max_video_seconds) {
          setFileError(`影片長度 ${Math.round(v.duration)} 秒，超過 ${limits.max_video_seconds} 秒上限，請剪輯後再上傳。`)
          setFile(null)
          setPreview(null)
        }
      }
      v.src = url
    }
    setFile(f)
    setPreview(url)
  }

  async function ensureConsent(): Promise<string | undefined> {
    // 管理頁關閉研究蒐集時不建立同意紀錄，避免預設勾選讓查核失敗
    if (!consentB || health?.modes.research_collection_enabled === false) return undefined
    let rid = researchId.get()
    if (!rid) {
      const r = await postJson<{ research_id: string }>('/api/consent', { purpose: 'research', status: 'granted' })
      rid = r.research_id
      researchId.set(rid)
    }
    if (consentC) await postJson('/api/consent', { research_id: rid, purpose: 'secondary_use', status: 'granted' })
    return rid
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setManualHint(null)
    if (mode === 'text' && text.trim().length === 0) return setError('請輸入要查核的訊息內容。')
    if (mode !== 'text' && !file) return setError(fileError ?? '請先選擇檔案。')
    try {
      setBusy('準備中…')
      const rid = await ensureConsent()
      let result: AnalysisResult | NeedsManualText
      const sourceFlags = {
        query_cofacts: cofactsAvailable && queryCofacts && !cofactsQ.blocked,
        query_google: googleAvailable && queryGoogle && !googleQ.blocked,
        query_virustotal: vtAvailable && queryVt && !vtQ.blocked,
      }
      if (mode === 'text') {
        setBusy(aiOn ? 'AI 分析中，內容較長時可能需要 1～2 分鐘，請稍候…' : '分析文字與查詢來源中…')
        result = await postJson<AnalysisResult>('/api/analyze/text', { text, ...sourceFlags, use_ai: aiOn, ...(aiModel ? { ai_model: aiModel } : {}), ...(rid ? { research_id: rid } : {}) })
      } else {
        const ai = aiOn
        const common = { extra_text: extra, ...sourceFlags, use_ai: ai, ...(aiModel ? { ai_model: aiModel } : {}), ...(rid ? { research_id: rid } : {}) }
        if (mode === 'image') {
          setBusy('處理圖片中…')
          const img = await prepareImage(file!)
          setBusy(ai ? 'AI 判讀圖片中，可能需要 1～2 分鐘，請稍候…' : '分析補充文字中…')
          result = await postJson<AnalysisResult | NeedsManualText>('/api/analyze/image', { image_base64: img.base64, mime_type: img.mime, ...common })
        } else {
          let mediaRef: string | null = null
          if (ai) {
            setBusy('上傳影片中…')
            mediaRef = (await api<{ media_ref: string }>('/api/media/video', { method: 'POST', headers: { 'Content-Type': videoMime(file!) }, body: file! })).media_ref
            setBusy('Gemini 正在分析影片畫面與聲音（可能需要 30–90 秒）…')
          } else setBusy('分析補充文字中…')
          result = await postJson<AnalysisResult | NeedsManualText>('/api/analyze/video', { media_ref: mediaRef, duration_seconds: videoSeconds, ...common })
        }
      }
      if ('needs_manual_text' in result) {
        setManualHint(result.message)
        setTimeout(() => extraRef.current?.focus(), 50)
        return
      }
      refreshHealth() // AI 次數變了
      clearDraft()
      nav(`/result/${result.analysis_id}`, { state: result })
    } catch (err) {
      setError(err instanceof ApiError || (err instanceof Error && /[一-鿿]/.test(err.message)) ? err.message : '發生未預期的錯誤，請稍後再試。')
    } finally {
      setBusy(null)
    }
  }

  const tabs: [Mode, string][] = [['text', '文字訊息'], ['image', '圖片截圖'], ['video', '短影片']]
  return (
    <form className="check-form space-y-5" onSubmit={submit} noValidate>
      <h1>防詐查核</h1>
      <div className="card check-workbench space-y-5">
      <div className="input-tabs" role="tablist" aria-label="輸入類型">
        {tabs.map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
            className="input-tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {m === 'text' ? <path d="M4 6h16M4 12h14M4 18h9" /> : m === 'image' ? <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1" /><path d="m3 17 5-5 4 4 4-5 5 6" /></> : <><rect x="2" y="5" width="14" height="14" rx="3" /><path d="m16 9 6-3v12l-6-3" /></>}
            </svg>
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {mode === 'text' ? (
          <div>
            <label htmlFor="text" className="label">貼上可疑訊息、廣告或對話內容</label>
            <textarea id="text" className="input min-h-52" value={text} maxLength={limits.max_text_chars}
              onChange={(e) => setText(e.target.value)} placeholder="例如：您的包裹地址有誤，請點擊連結更新…" />
            <div className="mt-1 flex flex-wrap items-start justify-between gap-2 text-xs text-slate-500">
              <p>IG、Facebook 貼文的內容網站讀不到，請截圖或錄影後上傳。</p>
              <p className="ml-auto">{text.length} / {limits.max_text_chars} 字</p>
            </div>
            {SOCIAL_LINK.test(text) && (
              <div className="mt-2 space-y-2">
                <Alert kind="warn">
                  偵測到 IG、Facebook 或 Threads 的連結：網站只能檢查這個網址本身，<strong>看不到貼文裡的圖片、影片和文字</strong>。
                  請把貼文截圖或螢幕錄影後上傳，才能分析內容。
                </Alert>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => switchMode('image')}>改用圖片截圖</button>
                  <button type="button" className="btn-secondary" onClick={() => switchMode('video')}>改用短影片</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="file" className="label">
                {mode === 'image' ? `選擇圖片（JPG、PNG、WebP，${limits.max_image_mb} MB 內）` : `選擇影片（MP4、MOV，${limits.max_video_mb} MB、${limits.max_video_seconds} 秒內）`}
              </label>
              <input id="file" type="file" className="input file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:text-teal-800"
                accept={mode === 'image' ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' : '.mp4,.mov,video/mp4,video/quicktime'}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'image' ? 'IG、Facebook 貼文請先截圖（含貼文文字與帳號名稱）再上傳；網站讀不到貼文連結的內容。' : 'IG、Facebook 影片請先用手機螢幕錄影再上傳；網站讀不到貼文連結的內容。'}
              </p>
            </div>
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {preview && mode === 'image' && <img src={preview} alt="已選擇的圖片預覽" className="max-h-64 rounded-lg border object-contain" />}
            {preview && mode === 'video' && <video src={preview} controls playsInline className="max-h-64 w-full rounded-lg border" />}
            {mode === 'video' && (aiOn
              ? <Alert kind="info">影片會交給 Gemini 分析畫面與聲音，分析完成後即刪除 Google 上的檔案。</Alert>
              : <Alert kind="warn">未使用 AI 時無法分析影片內容，請在下方「補充文字」輸入影片中的文字或旁白重點。</Alert>)}
            {manualHint && <Alert kind="warn">{manualHint}</Alert>}
            <div>
              <label htmlFor="extra" className="label">補充文字（{aiOn ? '選填' : '未使用 AI 時必填'}：圖片或影片中的文字、旁白重點）</label>
              <textarea id="extra" ref={extraRef} className="input min-h-24" value={extra} maxLength={limits.max_text_chars}
                onChange={(e) => setExtra(e.target.value)} />
              {SOCIAL_LINK.test(extra) && (
                <Alert kind="warn">補充文字裡的 IG、Facebook 或 Threads 連結只會檢查網址本身，網站看不到貼文內容；請以上傳的截圖或錄影為主。</Alert>
              )}
            </div>
          </>
        )}
      </div>
      </div>

      <fieldset className="card space-y-3">
        <legend className="sr-only">資料處理與同意</legend>
        <h2 className="text-sm font-medium">資料處理說明</h2>
        <p className="text-sm text-slate-700">
          送出後，系統會暫時處理你的內容以完成本次查核，原始檔案處理完立即刪除；
          分析結果（不含原文）保存 30 天後自動刪除。<Link to="/privacy">詳細說明</Link>
        </p>
        <p className="text-xs text-slate-500">外部查詢只會送至已勾選的服務，可展開下方設定調整。圖片、影片只有勾選 Gemini 時才會送到 Google，請勿上傳他人隱私。</p>
        <details className="setting-disclosure" id="service-settings">
          <summary><span className="disclosure-label">查核設定<span className="disclosure-hint">服務與 AI 模型</span></span></summary>
          <div className="disclosure-content">
        <ServiceOptions options={([
          cofactsAvailable && { key: 'cofacts', label: '送至 Cofacts 比對', sends: ['文字'], to: 'Cofacts「真的假的」查核資料庫', checked: queryCofacts, onChange: setQueryCofacts, disabled: cofactsQ.blocked, chip: cofactsQ.chip },
          aiAvailable && { key: 'ai', label: '使用 Gemini AI 分析', sends: mode === 'text' ? ['文字'] : ['文字', '圖片影片'], to: 'Google Gemini（請勿上傳他人隱私）', checked: useAi, onChange: setUseAi,
            disabled: aiBlocked,
            chip: aiNow ? (
              <select aria-label="選擇 AI 模型" className="input min-h-11 py-1 text-xs" value={aiModel}
                onClick={(e) => e.stopPropagation()} onChange={(e) => setAiChoice(e.target.value)}>
                <option value="">自動（目前 {aiNow.label}，剩 {aiNow.remaining} 次）</option>
                {aiModels.map((m) => (
                  <option key={m.id} value={m.id} disabled={m.remaining <= 0 || m.cooldown > 0}>
                    {m.label}（{m.remaining <= 0 ? '今日已用完' : m.cooldown > 0 ? `冷卻中 ${m.cooldown} 秒` : `剩 ${m.remaining} 次`}）
                  </option>
                ))}
              </select>
            ) : aiWait > 0
              ? <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700" role="status">使用人數較多，AI 冷卻中，{aiWait} 秒後可用</span>
              : <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">今日 AI 額度已用完</span>,
            detail: (
              <p className="text-xs text-slate-600">
                選「自動」時，免費額度用完會自動換下一個模型（共剩 {aiLeft} 次）；自己選的模型用完也會自動往下換：{aiModels.map((m) => `${m.label} 剩 ${m.remaining}`).join(' → ')}
              </p>
            ) },
          googleAvailable && { key: 'google', label: 'Google 網址安全與事實查核', sends: ['網址', '文字'], to: 'Google 安全瀏覽、Google 事實查核搜尋', checked: queryGoogle, onChange: setQueryGoogle, disabled: googleQ.blocked, chip: googleQ.chip },
          vtAvailable && { key: 'vt', label: 'VirusTotal 病毒掃描', sends: ['網域'], to: 'VirusTotal（只查已有的掃描紀錄）', checked: queryVt, onChange: setQueryVt, disabled: vtQ.blocked, chip: vtQ.chip },
        ].filter(Boolean) as ServiceOption[])} />
          </div>
        </details>
        {/* 預設展開，讓「協助校內研究」預設勾選的狀態一眼看得到 */}
        <details className="setting-disclosure" id="research-consent" open>
          <summary><span className="disclosure-label">參與匿名研究（選填）</span></summary>
          <div className="disclosure-content space-y-3">
        <label className="consent-row">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consentB}
            onChange={(e) => { setConsentB(e.target.checked); if (!e.target.checked) setConsentC(false) }} />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">協助校內研究（選填）</span>
            <span className="mt-1 block text-xs text-slate-500">同意將這次的匿名分析結果（風險特徵、等級，不含原文）用於校內研究。</span>
          </span>
        </label>
        <label className="consent-row">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!consentB} checked={consentC} onChange={(e) => setConsentC(e.target.checked)} />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">教育產品與商業研究（選填）</span>
            <span className="mt-1 block text-xs text-slate-500">同意將經審查的衍生統計資料用於教育產品及商業可行性研究。</span>
          </span>
        </label>
        <p className="text-xs text-slate-500">不參與研究也能使用查核服務。</p>
          </div>
        </details>
      </fieldset>

      {error && <Alert kind="error">{error}</Alert>}
      {busy ? <Spinner label={busy} /> : (
        <NaughtyButton empty={mode === 'text' ? !text.trim() : !file} hint={mode === 'text' ? '先貼上要查核的訊息喔！' : '先選擇要上傳的檔案喔！'}>開始查核</NaughtyButton>
      )}
    </form>
  )
}
