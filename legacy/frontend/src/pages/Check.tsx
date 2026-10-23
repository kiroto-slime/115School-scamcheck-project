import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, postJson, researchId, type AnalysisResult, type NeedsManualText } from '../api'
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
  const [consentB, setConsentB] = useState(false)
  const [consentC, setConsentC] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualHint, setManualHint] = useState<string | null>(null)
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
      if (mode === 'text') {
        setBusy(aiAvailable && useAi ? '分析中（含 Gemini AI，約需 5–30 秒）…' : '分析文字與查詢來源中…')
        result = await postJson<AnalysisResult>('/api/analyze/text', { text, query_cofacts: queryCofacts, use_ai: aiAvailable && useAi, ...(rid ? { research_id: rid } : {}) })
      } else {
        setBusy(mode === 'image' ? '上傳並辨識圖片文字中…' : '上傳並擷取影片關鍵影格中（可能需要數十秒）…')
        const fd = new FormData()
        fd.append('file', file!)
        fd.append('extra_text', extra)
        fd.append('query_cofacts', String(queryCofacts))
        fd.append('use_ai', String(aiAvailable && useAi))
        if (rid) fd.append('research_id', rid)
        result = await api(`/api/analyze/${mode}`, { method: 'POST', body: fd })
      }
      if ('needs_manual_text' in result) {
        setManualHint(result.message)
        setTimeout(() => extraRef.current?.focus(), 50)
        return
      }
      nav(`/result/${result.analysis_id}`, { state: result })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '發生未預期的錯誤，請稍後再試。')
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
              ? <Alert kind="info">影片會交給 Gemini 分析畫面與聲音（14 MB 以下送完整影片，超過則只送關鍵畫面）。</Alert>
              : <Alert kind="warn">未使用 AI 時只擷取少量畫面做文字辨識，不分析語音與影片語意。若重點在旁白，請在下方補充。</Alert>)}
            {manualHint && <Alert kind="warn">{manualHint}</Alert>}
            <div>
              <label htmlFor="extra" className="label">補充文字（選填；OCR 無法辨識時請在此輸入圖片或影片中的文字）</label>
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
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={queryCofacts} onChange={(e) => setQueryCofacts(e.target.checked)} />
          <span className="text-sm">將文字送至 Cofacts 比對已查核訊息（送出前會遮蔽手機、身分證、Email 等；不勾選則只做本機規則分析）</span>
        </label>
        {aiAvailable && (
          <label className="flex min-h-11 items-start gap-3">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span className="text-sm">使用 Google Gemini AI 分析（內容會傳送到 Google：文字會先遮蔽手機、身分證等，<strong>圖片和影片會原樣傳送</strong>；請勿上傳含他人隱私的內容）</span>
          </label>
        )}
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
