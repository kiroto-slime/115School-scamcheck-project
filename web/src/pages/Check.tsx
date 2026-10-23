import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, currentAiModel, postJson, researchId, type AnalysisResult, type NeedsManualText } from '../api'
import { prepareImage, videoMime } from '../media'
import { type ServiceOption, ServiceOptions } from '../components/ServiceOptions'
import { Alert, Spinner, useHealth } from '../components/ui'

type Mode = 'text' | 'image' | 'video'
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp']
const VIDEO_EXT = ['.mp4', '.mov']

export function validateFile(file: File, mode: 'image' | 'video', maxMb: number): string | null {
  const name = file.name.toLowerCase()
  if (mode === 'image' && !(IMAGE_EXT.some((e) => name.endsWith(e)) && (IMAGE_TYPES.includes(file.type) || !file.type)))
    return '圖片格式不支援，請選擇 JPG、PNG 或 WebP。'
  if (mode === 'video' && !VIDEO_EXT.some((e) => name.endsWith(e))) return '影片格式不支援，請選擇 MP4 或 MOV。'
  if (file.size === 0) return '檔案是空的，請重新選擇。'
  if (file.size > maxMb * 1024 * 1024) return `檔案超過 ${maxMb} MB 上限（目前 ${(file.size / 1024 / 1024).toFixed(1)} MB）。`
  return null
}

export default function Check() {
  const { health } = useHealth()
  const limits = health?.limits ?? { max_text_chars: 10000, max_image_mb: 10, max_video_mb: 20, max_video_seconds: 30 }
  const nav = useNavigate()
  const [mode, setMode] = useState<Mode>('text')
  const [text, setText] = useState('')
  const [extra, setExtra] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [queryCofacts, setQueryCofacts] = useState(true)
  const [useAi, setUseAi] = useState(true)
  const aiAvailable = health?.modes.ai === 'gemini'
  const cofactsAvailable = health?.modes.cofacts === 'live'
  const aiModels = health?.modes.ai_models ?? []
  const aiNow = currentAiModel(aiModels, mode !== 'text')
  const aiLeft = aiModels.filter((m) => mode === 'text' || m.media).reduce((n, m) => n + m.remaining, 0)
  const googleAvailable = health?.modes.google === 'live'
  const vtAvailable = health?.modes.virustotal === 'live'
  const [queryGoogle, setQueryGoogle] = useState(true)
  const [queryVt, setQueryVt] = useState(false)
  const [consentB, setConsentB] = useState(false)
  const [consentC, setConsentC] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
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
    if (!consentB) return undefined
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
      const sourceFlags = { query_cofacts: cofactsAvailable && queryCofacts, query_google: googleAvailable && queryGoogle, query_virustotal: vtAvailable && queryVt }
      if (mode === 'text') {
        setBusy(aiAvailable && useAi ? '分析中（含 Gemini AI，約需 5–30 秒）…' : '分析文字與查詢來源中…')
        result = await postJson<AnalysisResult>('/api/analyze/text', { text, ...sourceFlags, use_ai: aiAvailable && useAi, ...(rid ? { research_id: rid } : {}) })
      } else {
        const ai = aiAvailable && useAi
        const common = { extra_text: extra, ...sourceFlags, use_ai: ai, ...(rid ? { research_id: rid } : {}) }
        if (mode === 'image') {
          setBusy('處理圖片中…')
          const img = await prepareImage(file!)
          setBusy(ai ? '上傳並交給 Gemini 判讀圖片（約需 5–30 秒）…' : '分析補充文字中…')
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
      nav(`/result/${result.analysis_id}`, { state: result })
    } catch (err) {
      setError(err instanceof ApiError || (err instanceof Error && /[一-鿿]/.test(err.message)) ? err.message : '發生未預期的錯誤，請稍後再試。')
    } finally {
      setBusy(null)
    }
  }

  const tabs: [Mode, string][] = [['text', '文字訊息'], ['image', '圖片截圖'], ['video', '短影片']]
  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <h1>防詐查核</h1>
      <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="輸入類型">
        {tabs.map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
            className={mode === m ? 'btn-primary' : 'btn-secondary'}>
            {label}
          </button>
        ))}
      </div>

      <div className="card space-y-3">
        {mode === 'text' ? (
          <div>
            <label htmlFor="text" className="label">貼上可疑訊息、廣告或對話內容</label>
            <textarea id="text" className="input min-h-40" value={text} maxLength={limits.max_text_chars}
              onChange={(e) => setText(e.target.value)} placeholder="例如：您的包裹地址有誤，請點擊連結更新…" />
            <p className="mt-1 text-right text-xs text-slate-500">{text.length} / {limits.max_text_chars} 字</p>
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
            </div>
            {fileError && <Alert kind="error">{fileError}</Alert>}
            {preview && mode === 'image' && <img src={preview} alt="已選擇的圖片預覽" className="max-h-64 rounded-lg border object-contain" />}
            {preview && mode === 'video' && <video src={preview} controls playsInline className="max-h-64 w-full rounded-lg border" />}
            {mode === 'video' && (aiAvailable && useAi
              ? <Alert kind="info">影片會交給 Gemini 分析畫面與聲音，分析完成後即刪除 Google 上的檔案。</Alert>
              : <Alert kind="warn">未使用 AI 時無法分析影片內容，請在下方「補充文字」輸入影片中的文字或旁白重點。</Alert>)}
            {manualHint && <Alert kind="warn">{manualHint}</Alert>}
            <div>
              <label htmlFor="extra" className="label">補充文字（{aiAvailable && useAi ? '選填' : '未使用 AI 時必填'}：圖片或影片中的文字、旁白重點）</label>
              <textarea id="extra" ref={extraRef} className="input min-h-24" value={extra} maxLength={limits.max_text_chars}
                onChange={(e) => setExtra(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <fieldset className="card space-y-3">
        <legend className="sr-only">資料處理與同意</legend>
        <p className="text-sm text-slate-700">
          <strong>A. 必要處理：</strong>送出後，系統會暫時處理你的內容以完成本次查核，原始檔案處理完立即刪除；
          分析結果（不含原文）暫存 24 小時後自動刪除。<Link to="/privacy">詳細說明</Link>
        </p>
        <ServiceOptions options={([
          cofactsAvailable && { key: 'cofacts', label: '送至 Cofacts 比對', sends: ['文字'], to: 'Cofacts「真的假的」查核資料庫', checked: queryCofacts, onChange: setQueryCofacts },
          aiAvailable && { key: 'ai', label: '使用 Gemini AI 分析', sends: mode === 'text' ? ['文字'] : ['文字', '圖片影片'], to: 'Google Gemini（請勿上傳他人隱私）', checked: useAi, onChange: setUseAi,
            chip: aiNow
              ? <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-xs text-teal-800">目前：{aiNow.label}・今日剩 {aiNow.remaining} 次</span>
              : <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">今日 AI 額度已用完</span>,
            detail: (
              <p className="text-xs text-slate-600">
                免費額度用完會自動換下一個模型（共剩 {aiLeft} 次）：{aiModels.filter((m) => mode === 'text' || m.media).map((m) => `${m.label} 剩 ${m.remaining}`).join(' → ')}
              </p>
            ) },
          googleAvailable && { key: 'google', label: 'Google 網址安全與事實查核', sends: ['網址', '文字'], to: 'Google 安全瀏覽、Google 事實查核搜尋', checked: queryGoogle, onChange: setQueryGoogle },
          vtAvailable && { key: 'vt', label: 'VirusTotal 病毒掃描', sends: ['網域'], to: 'VirusTotal（只查已有的掃描紀錄）', checked: queryVt, onChange: setQueryVt },
        ].filter(Boolean) as ServiceOption[])} />
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={consentB}
            onChange={(e) => { setConsentB(e.target.checked); if (!e.target.checked) setConsentC(false) }} />
          <span className="text-sm"><strong>B.（自願）</strong>同意將這次的匿名分析結果（風險特徵、等級，不含原文）用於校內研究。</span>
        </label>
        <label className={`flex min-h-11 items-start gap-3 ${consentB ? '' : 'opacity-50'}`}>
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!consentB} checked={consentC} onChange={(e) => setConsentC(e.target.checked)} />
          <span className="text-sm"><strong>C.（自願）</strong>同意將經審查的衍生統計資料用於教育產品及商業可行性研究。</span>
        </label>
        <p className="text-xs text-slate-500">不勾選 B、C 完全不影響查核服務。</p>
      </fieldset>

      {error && <Alert kind="error">{error}</Alert>}
      {busy ? <Spinner label={busy} /> : <button type="submit" className="btn-primary w-full sm:w-auto">開始查核</button>}
    </form>
  )
}
