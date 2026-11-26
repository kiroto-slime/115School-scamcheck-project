import { useLanguage } from '../language'
import { checkMessage } from '../checkMessages'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, ApiError, consentRecorded, currentAiModel, postJson, researchId, researchWithdrawn, type AnalysisResult, type NeedsManualText } from '../api'
import { prepareImage, videoMime } from '../media'
import { NaughtyButton } from '../components/NaughtyButton'
import { saveReceipt, type CheckReceipt } from '../history'
import { type ServiceOption, ServiceOptions } from '../components/ServiceOptions'
import { Alert, refreshHealth, ServiceConnectionError, Spinner, useHealth } from '../components/ui'

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
  const { t, lang } = useLanguage()
  const message = (value: string) => checkMessage(t, value)
  const { health, error: healthError } = useHealth(true)
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
  const retentionUntil = health?.modes.content_retention_until
  const retentionText = retentionUntil ? retentionUntil.slice(0, 10).replace(/-/g, '/') : t('專題結束', 'the end of the project', 'プロジェクト終了時', '프로젝트 종료 시점')
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
  const sync = health?.modes.ai_quota_sync
  // 圖片、影片模式只列出能分析媒體的模型
  const aiModels = (health?.modes.ai_models ?? [])
    .filter((m) => mode === 'text' || m.media)
    .map((m) => {
      const cooldown = Math.max(0, m.cooldown_seconds - passed)
      const sample = sync?.models.find(sample => sample.id === m.id)
      const left = Math.min(m.remaining, sample?.estimated_remaining ?? m.remaining)
      const estimate = sample
        ? t(`校準後估剩 ${left} 次`, `about ${left} left after sync`, `照合後の目安 残り${left}回`, `동기화 후 약 ${left}회 남음`)
        : t(`本站估計剩 ${left} 次`, `site estimate: ${left} left`, `サイト推定 残り${left}回`, `사이트 추정 ${left}회 남음`)
      return { ...m, sample, estimate, left, cooldown, minute_left: cooldown > 0 ? 0 : Math.max(m.minute_left, 1) }
    })
  const aiNow = currentAiModel(aiModels)
  const aiLeft = aiModels.reduce((sum, m) => sum + m.left, 0)
  const unavailable = sync?.unavailable_models.some(m => mode === 'text' || m.media) ?? false
  const confirmedDailyLimit = aiModels.length > 0 && aiModels.every(m => m.sample?.daily_limit_reached)
  const blockedReason = !aiModels.length || unavailable
    ? t('目前沒有可用的 AI 模型', 'No AI model is currently available', '現在利用できるAIモデルがありません', '현재 사용할 수 있는 AI 모델이 없습니다')
    : confirmedDailyLimit
      ? t('Google 今日 AI 額度已用完', 'Google’s daily AI limit has been reached', 'Googleの本日のAI利用枠に達しました', 'Google의 오늘 AI 사용 한도에 도달했습니다')
      : t('本站記錄的今日 AI 次數已達上限', 'The site’s daily AI counter has reached its limit', 'サイトの本日のAI利用回数が上限に達しました', '사이트에 기록된 오늘의 AI 사용량이 한도에 도달했습니다')
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
      ? <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{t('今日次數已用完', 'Daily limit reached', '本日の上限に達しました', '오늘 사용량 소진')}</span>
      : cooldown > 0
        ? <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700" role="status">{t(`冷卻中，${cooldown} 秒後可用`, `Available again in ${cooldown}s`, `あと${cooldown}秒で利用できます`, `${cooldown}초 후 이용 가능`)}</span>
        : k === 'virustotal'
          ? <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{t(`今日剩 ${q.daily_left} 次・每分鐘最多 4 次`, `${q.daily_left} left today · up to 4 per minute`, `本日の残り${q.daily_left}回・毎分4回まで`, `오늘 ${q.daily_left}회 남음 · 분당 최대 4회`)}</span>
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
  const activeSample = (aiModel ? aiModels.find(m => m.id === aiModel) : aiNow)?.sample
  const updated = activeSample && new Date(activeSample.as_of).toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const modelOptions = aiModels.map(m => {
    const quotaLabel = m.remaining <= 0
      ? t('今日已達上限', 'daily limit reached', '本日の上限', '오늘 사용 한도 도달')
      : m.cooldown > 0
        ? t(`冷卻中 ${m.cooldown} 秒`, `available in ${m.cooldown}s`, `あと${m.cooldown}秒`, `${m.cooldown}초 후 가능`)
        : m.estimate
    return {
      id: m.id,
      disabled: m.remaining <= 0 || m.cooldown > 0,
      label: m.label + t('（', ' (', '（', ' (') + quotaLabel + t('）', ')', '）', ')'),
    }
  })
  const autoLabel = aiNow ? t(`自動（${aiNow.label}，估剩 ${aiNow.left} 次）`, `Auto (${aiNow.label}, ~${aiNow.left} left)`, `自動（${aiNow.label}、残り約${aiNow.left}回）`, `자동(${aiNow.label}, 약 ${aiNow.left}회 남음)`) : ''
  const aiBlocked = !aiNow // 今天用完，或這一分鐘全部冷卻中
  const aiOn = aiAvailable && useAi && !aiBlocked
  const googleAvailable = health?.modes.google === 'live'
  const vtAvailable = health?.modes.virustotal === 'live'
  const [queryGoogle, setQueryGoogle] = useState(true)
  const [queryVt, setQueryVt] = useState(false)
  // 協助校內研究：預設勾選，可取消（使用者決定）；撤回過同意的裝置預設不勾
  const [wasWithdrawn] = useState(() => researchWithdrawn.get())
  const [consentB, setConsentB] = useState(() => !wasWithdrawn)
  const [consentNotice, setConsentNotice] = useState<string | null>(null)
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

  // 研究同意是選填：記錄失敗（例如請求太頻繁）時不擋查核，這次改成不帶研究編號送出
  async function ensureConsent(): Promise<string | undefined> {
    if (!consentB) return undefined
    // 使用者自己勾選並送出，代表重新同意，清掉「已撤回」旗標
    researchWithdrawn.clear()
    // 管理頁關閉研究蒐集時不建立同意紀錄，避免預設勾選讓查核失敗
    if (health?.modes.research_collection_enabled === false) return undefined
    let rid = researchId.get()
    // 同一分頁、同一編號只記錄一次（以目前版本），之後的查核沿用，避免撞到頻率限制
    if (!rid || !consentRecorded.has(rid, 'research')) {
      try {
        const r = await postJson<{ research_id: string }>('/api/consent',
          rid ? { research_id: rid, purpose: 'research', status: 'granted' } : { purpose: 'research', status: 'granted' })
        rid = r.research_id
        researchId.set(rid)
        consentRecorded.mark(rid, 'research')
      } catch {
        setConsentNotice('這次未能記錄研究同意，查核照常進行，訊息內容不會被保存。')
        return undefined
      }
    }
    if (consentC && !consentRecorded.has(rid, 'secondary_use')) {
      try {
        await postJson('/api/consent', { research_id: rid, purpose: 'secondary_use', status: 'granted' })
        consentRecorded.mark(rid, 'secondary_use')
      } catch {
        setConsentNotice('這次未能記錄「教育產品與商業研究」同意，查核照常進行；下次送出時會再試一次。')
      }
    }
    return rid
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setManualHint(null)
    setConsentNotice(null)
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
        setBusy(t('正在送出，請先保留此頁。', 'Sending. Keep this page open.', '送信中です。このページでお待ちください。', '보내는 중입니다. 이 페이지를 열어 두세요.'))
        const response = await postJson<AnalysisResult | CheckReceipt>('/api/analyze/text', { text, ...sourceFlags, use_ai: aiOn, ...(aiModel ? { ai_model: aiModel } : {}), ...(rid ? { research_id: rid } : {}) }, { Prefer: 'respond-async' })
        if ('job_status' in response) {
          const saved = saveReceipt({ id: response.analysis_id, at: response.created_at, job: 'pending', level: '', media: 'text', score: null, reason: null })
          clearDraft()
          nav(`/result/${response.analysis_id}`, { state: { receipt: response, saved } })
          return
        }
        result = response
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

  const tabs: [Mode, string][] = [['text', t('文字訊息', 'Text', 'テキスト', '텍스트')], ['image', t('圖片截圖', 'Screenshot', 'スクリーンショット', '스크린샷')], ['video', t('短影片', 'Short video', '短い動画', '짧은 동영상')]]
  return (
    <form className="check-form space-y-5" onSubmit={submit} noValidate>
      <h1>{t('防詐查核', 'Scam check', '詐欺チェック', '사기 확인')}</h1>
      {healthError && !health && <ServiceConnectionError />}
      <div className="card check-workbench space-y-5">
      <div className="input-tabs" role="tablist" aria-label={t('輸入類型', 'Input type', '入力の種類', '입력 유형')}>
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
            <label htmlFor="text" className="label">{t('貼上可疑訊息、廣告或對話內容', 'Paste a suspicious message, ad or conversation', '不審なメッセージ・広告・会話を貼り付けてください', '의심스러운 메시지, 광고 또는 대화를 붙여 넣으세요')}</label>
            <textarea id="text" className="input min-h-52" value={text} maxLength={limits.max_text_chars}
              onChange={(e) => setText(e.target.value)} placeholder={t('例如：您的包裹地址有誤，請點擊連結更新…', 'Example: Your delivery address is incorrect. Click the link to update it…', '例：お荷物のお届け先に誤りがあります。リンクから更新してください…', '예: 배송 주소가 잘못되었습니다. 링크를 눌러 수정하세요…')} />
            <div className="mt-1 flex flex-wrap items-start justify-between gap-2 text-xs text-slate-500">
              <p>{t('IG、Facebook 貼文的內容網站讀不到，請截圖或錄影後上傳。', 'For Instagram or Facebook posts, upload a screenshot or screen recording so we can check the content.', 'InstagramやFacebookの投稿はリンクから内容を読み取れません。スクリーンショットか画面録画をアップロードしてください。', 'Instagram이나 Facebook 게시물은 링크로 내용을 읽을 수 없습니다. 스크린샷이나 화면 녹화를 올려 주세요.')}</p>
              <p className="ml-auto">{t(`${text.length} / ${limits.max_text_chars} 字`, `${text.length} / ${limits.max_text_chars} characters`, `${text.length} / ${limits.max_text_chars}文字`, `${text.length} / ${limits.max_text_chars}자`)}</p>
            </div>
            {SOCIAL_LINK.test(text) && (
              <div className="mt-2 space-y-2">
                <Alert kind="warn">
                  {t('偵測到 IG、Facebook 或 Threads 的連結：網站只能檢查這個網址本身，', 'Instagram, Facebook or Threads link detected. We can only check the link itself. ', 'Instagram、Facebook、Threadsのリンクを検出しました。確認できるのはURLのみです。', 'Instagram, Facebook 또는 Threads 링크가 있습니다. URL 자체만 확인할 수 있으며, ')}<strong>{t('看不到貼文裡的圖片、影片和文字', 'We cannot see the images, video or text in the post', '投稿内の画像・動画・文章は読み取れません', '게시물의 이미지, 동영상, 텍스트는 볼 수 없습니다')}</strong>{t('。', '. ', '。', '. ')}
                  {t('請把貼文截圖或螢幕錄影後上傳，才能分析內容。', 'Upload a screenshot or screen recording to check the post itself.', '投稿内容を確認するには、スクリーンショットか画面録画をアップロードしてください。', '게시물 내용을 분석하려면 스크린샷이나 화면 녹화를 올려 주세요.')}
                </Alert>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => switchMode('image')}>{t('改用圖片截圖', 'Use a screenshot', 'スクリーンショットを使う', '스크린샷으로 변경')}</button>
                  <button type="button" className="btn-secondary" onClick={() => switchMode('video')}>{t('改用短影片', 'Use a short video', '短い動画を使う', '짧은 동영상으로 변경')}</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor="file" className="label">
                {mode === 'image' ? t(`選擇圖片（JPG、PNG、WebP，${limits.max_image_mb} MB 內）`, `Choose an image (JPG, PNG or WebP, up to ${limits.max_image_mb} MB)`, `画像を選択（JPG、PNG、WebP、${limits.max_image_mb} MBまで）`, `이미지 선택(JPG, PNG, WebP, 최대 ${limits.max_image_mb} MB)`) : t(`選擇影片（MP4、MOV，${limits.max_video_mb} MB、${limits.max_video_seconds} 秒內）`, `Choose a video (MP4 or MOV, up to ${limits.max_video_mb} MB and ${limits.max_video_seconds} seconds)`, `動画を選択（MP4、MOV、${limits.max_video_mb} MB・${limits.max_video_seconds}秒まで）`, `동영상 선택(MP4, MOV, 최대 ${limits.max_video_mb} MB 및 ${limits.max_video_seconds}초)`)}
              </label>
              <div className="relative rounded-lg focus-within:outline-2 focus-within:outline-teal-700">
                <div aria-hidden="true" className="input flex min-h-11 items-center gap-3">
                  <span className="shrink-0 rounded-lg bg-teal-50 px-3 py-2 text-teal-800">{t('選擇檔案', 'Choose file', 'ファイルを選択', '파일 선택')}</span>
                  <span className="min-w-0 truncate">{file?.name || t('未選擇檔案', 'No file selected', '未選択', '선택한 파일 없음')}</span>
                </div>
                <input id="file" type="file" className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  accept={mode === 'image' ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp' : '.mp4,.mov,video/mp4,video/quicktime'}
                  onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {mode === 'image' ? t('IG、Facebook 貼文請先截圖（含貼文文字與帳號名稱）再上傳；網站讀不到貼文連結的內容。', 'Upload a screenshot of the Instagram or Facebook post that includes its text and account name. We cannot read the post from its link.', 'InstagramやFacebookの投稿は、本文とアカウント名を含むスクリーンショットをアップロードしてください。リンクから内容は読み取れません。', 'Instagram이나 Facebook 게시물은 본문과 계정 이름이 보이게 캡처해 올려 주세요. 링크로는 게시물 내용을 읽을 수 없습니다.') : t('IG、Facebook 影片請先用手機螢幕錄影再上傳；網站讀不到貼文連結的內容。', 'Use your phone to record the Instagram or Facebook video on screen, then upload it. We cannot read the post from its link.', 'InstagramやFacebookの動画はスマートフォンで画面録画してからアップロードしてください。リンクから内容は読み取れません。', 'Instagram이나 Facebook 동영상은 휴대폰으로 화면을 녹화해 올려 주세요. 링크로는 게시물 내용을 읽을 수 없습니다.')}
              </p>
            </div>
            {fileError && <Alert kind="error">{message(fileError)}</Alert>}
            {preview && mode === 'image' && <img src={preview} alt={t('已選擇的圖片預覽', 'Preview of selected image', '選択した画像のプレビュー', '선택한 이미지 미리보기')} className="max-h-64 rounded-lg border object-contain" />}
            {preview && mode === 'video' && <video src={preview} controls playsInline className="max-h-64 w-full rounded-lg border" />}
            {mode === 'video' && (aiOn
              ? <Alert kind="info">{t('影片會交給 Gemini 分析畫面與聲音。處理結束後系統會要求 Google 刪除檔案，Google 也會在上傳 48 小時後自動刪除。', 'Gemini analyzes the video and audio. The site requests deletion when processing ends. Google also deletes uploaded files after 48 hours.', 'Geminiに映像と音声を送信して分析します。処理後に削除を依頼します。Googleでもアップロードから48時間後に自動削除されます。', 'Gemini가 영상과 소리를 분석합니다. 처리가 끝나면 파일 삭제를 요청하며 Google도 업로드 48시간 후 자동 삭제합니다.')}</Alert>
              : <Alert kind="warn">{t('未使用 AI 時無法分析影片內容，請在下方「補充文字」輸入影片中的文字或旁白重點。', 'Without AI, we can only check text. Enter the video’s on-screen text or main narration points below.', 'AIを使わない場合は動画を分析できません。画面内の文字やナレーションの要点を下の「補足テキスト」に入力してください。', 'AI를 사용하지 않으면 동영상 내용을 분석할 수 없습니다. 아래 ‘추가 설명’에 화면 속 글이나 내레이션의 요점을 입력하세요.')}</Alert>)}
            {manualHint && <Alert kind="warn">{message(manualHint)}</Alert>}
            <div>
              <label htmlFor="extra" className="label">{aiOn
                ? t('補充文字（選填：圖片或影片中的文字、旁白重點）', 'Additional text (optional): text in the image or video, or key narration points', '補足テキスト（任意）：画像・動画内の文字、ナレーションの要点', '추가 설명(선택): 이미지·동영상 속 글이나 내레이션 요점')
                : t('補充文字（未使用 AI 時必填：圖片或影片中的文字、旁白重點）', 'Additional text (required without AI): text in the image or video, or key narration points', '補足テキスト（AIを使わない場合は必須）：画像・動画内の文字、ナレーションの要点', '추가 설명(AI 미사용 시 필수): 이미지·동영상 속 글이나 내레이션 요점')}</label>
              <textarea id="extra" ref={extraRef} className="input min-h-24" value={extra} maxLength={limits.max_text_chars}
                onChange={(e) => setExtra(e.target.value)} />
              {SOCIAL_LINK.test(extra) && (
                <Alert kind="warn">{t('補充文字裡的 IG、Facebook 或 Threads 連結只會檢查網址本身，網站看不到貼文內容；請以上傳的截圖或錄影為主。', 'For Instagram, Facebook or Threads links in your notes, we check only the URL. Upload a screenshot or recording to check the post.', '補足にあるInstagram、Facebook、ThreadsのリンクはURLのみ確認できます。投稿内容はスクリーンショットや録画でお送りください。', '추가 설명 속 Instagram, Facebook, Threads 링크는 URL만 확인합니다. 게시물 내용은 스크린샷이나 녹화로 올려 주세요.')}</Alert>
              )}
            </div>
          </>
        )}
      </div>
      </div>

      <fieldset className="card space-y-3">
        <legend className="sr-only">{t('資料處理與同意', 'Data processing and consent', 'データの取扱いと同意', '데이터 처리 및 동의')}</legend>
        <h2 className="text-sm font-medium">{t('資料處理說明', 'How we handle your data', 'データの取扱い', '데이터 처리 안내')}</h2>
        <p className="text-sm text-slate-700">
          {t('系統會暫時處理你的內容以完成本次查核，本站不保存上傳的原始檔案。', 'We process your submission temporarily. This site does not retain the original uploaded files. ', 'チェックのため一時的に内容を処理します。このサイトはアップロードされた元のファイルを保管しません。', '확인을 위해 제출한 내용을 임시로 처리하며, 이 사이트는 업로드한 원본 파일을 보관하지 않습니다. ')}
          {t('沒有勾選「協助校內研究」時，分析結果（不含原文）保存 30 天後自動刪除。', 'If you opt out of school research, results without the original text are automatically deleted after 30 days. ', '「校内研究に協力する」を選ばない場合、原文を含まない分析結果は30日後に自動削除されます。', '‘교내 연구 참여’를 선택하지 않으면 원문을 제외한 분석 결과를 30일 후 자동으로 삭제합니다. ')}<Link to="/privacy">{t('詳細說明', 'Privacy details', '詳しい説明', '자세히 보기')}</Link>
        </p>
        <p className="text-xs text-slate-500">{t('外部查詢只會送至已勾選的服務，可展開下方設定調整。圖片、影片只有勾選 Gemini 時才會送到 Google，請勿上傳他人隱私。', 'Only the services you select below receive data. Images and videos go to Google only when Gemini is selected. Do not upload other people’s private information.', '外部送信先は下の設定で選択したサービスのみです。画像・動画はGeminiを選んだ場合のみGoogleに送信されます。他人の個人情報をアップロードしないでください。', '아래 설정에서 선택한 서비스에만 데이터를 보냅니다. Gemini를 선택해야만 이미지와 동영상을 Google에 보냅니다. 타인의 개인정보를 올리지 마세요.')}</p>
        <details className="setting-disclosure" id="service-settings">
          <summary><span className="disclosure-label">{t('查核設定', 'Check settings', 'チェック設定', '확인 설정')}<span className="disclosure-hint">{t('服務與 AI 模型', 'Services and AI model', 'サービスとAIモデル', '서비스와 AI 모델')}</span></span></summary>
          <div className="disclosure-content">
            {health && !aiAvailable && <p className="text-sm">{t('AI 分析未啟用。查核圖片或影片時，請手動輸入文字。', 'AI analysis is unavailable. Enter text for images or videos.', 'AI分析は利用できません。画像や動画の内容をテキストで入力してください。', 'AI 분석을 사용할 수 없습니다. 이미지나 영상의 내용을 글로 입력해 주세요.')}</p>}
        <ServiceOptions options={([
          cofactsAvailable && { key: 'cofacts', label: t('送至 Cofacts 比對', 'Compare with Cofacts', 'Cofactsと照合', 'Cofacts와 대조'), sends: ['文字'], to: t('Cofacts「真的假的」查核資料庫', 'Cofacts fact-check database', 'Cofactsのファクトチェックデータベース', 'Cofacts 팩트체크 데이터베이스'), checked: queryCofacts, onChange: setQueryCofacts, disabled: cofactsQ.blocked, chip: cofactsQ.chip },
          aiAvailable && { key: 'ai', label: t('使用 Gemini AI 分析', 'Analyze with Gemini AI', 'Gemini AIで分析', 'Gemini AI로 분석'), sends: mode === 'text' ? ['文字'] : ['文字', '圖片影片'], to: t('Google Gemini（請勿上傳他人隱私）', 'Google Gemini (do not upload other people’s private information)', 'Google Gemini（他人の個人情報をアップロードしないでください）', 'Google Gemini(타인의 개인정보를 올리지 마세요)'), checked: useAi, onChange: setUseAi,
            disabled: aiBlocked,
            note: updated ? <>{activeSample?.daily_limit_reached && t('Google 已回報這個模型今日達限。', 'Google reports this model reached its daily limit. ', 'Googleの集計ではこのモデルは本日の上限に達しました。', 'Google 집계에서 이 모델은 오늘 한도에 도달했습니다. ')}{t(`Google 用量更新於 ${updated}`, `Google usage as of ${updated}`, `Googleの利用状況の更新日時：${updated}`, `Google 사용량 갱신 시각: ${updated}`)}</>
              : aiNow && t('次數依本站紀錄估算', 'Estimated from site usage', '回数はサイトの記録から推定', '사이트 사용 기록 기준 추정치'),
            chip: aiNow ? (
              <>
                <span className="model-selection-label input" aria-hidden="true">{modelOptions.find(m => m.id === aiModel)?.label ?? autoLabel}</span>
                <select aria-label={t('選擇 AI 模型', 'Choose AI model', 'AIモデルを選択', 'AI 모델 선택')} className="input min-h-11 py-1 text-xs" value={aiModel}
                  onClick={(e) => e.stopPropagation()} onChange={(e) => setAiChoice(e.target.value)}>
                  <option value="">{autoLabel}</option>
                  {modelOptions.map(m => <option key={m.id} value={m.id} disabled={m.disabled}>{m.label}</option>)}
                </select>
              </>
            ) : aiWait > 0
              ? <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700" role="status">{t(`使用人數較多，AI 冷卻中，${aiWait} 秒後可用`, `AI is busy. Try again in ${aiWait}s.`, `AIが混み合っています。あと${aiWait}秒で利用できます。`, `AI 사용량이 많습니다. ${aiWait}초 후 이용할 수 있습니다.`)}</span>
              : <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">{blockedReason}</span>,
            detail: (
              <p className="text-xs text-slate-600">
                {t('自動或手選的模型達到上限時，網站會依序改用下一個模型。', 'When the automatic or selected model reaches its limit, the site tries the next model in order. ', '自動または手動で選んだモデルが上限に達すると、順に次のモデルを試します。', '자동 또는 직접 선택한 모델이 한도에 도달하면 다음 모델을 차례로 시도합니다. ')}
                {aiModels.length > 0 && <>{t(`這些模型合計估剩 ${aiLeft} 次。`, `Estimated total across these models: ${aiLeft}. `, `これらのモデルの推定残数は合計${aiLeft}回です。`, `이 모델들의 예상 잔여 횟수는 총 ${aiLeft}회입니다. `)}{aiModels.map(m => `${m.label} · ${m.estimate}`).join(' → ')}</>}
              </p>
            ) },
          googleAvailable && { key: 'google', label: t('Google 網址安全與事實查核', 'Google URL safety and fact-checks', 'GoogleのURL安全性チェックとファクトチェック', 'Google URL 안전성 검사 및 팩트체크'), sends: ['網址', '文字'], to: t('Google 安全瀏覽、Google 事實查核搜尋', 'Google Safe Browsing and Fact Check Tools', 'Googleセーフブラウジングとファクトチェック検索', 'Google 세이프 브라우징 및 팩트체크 검색'), checked: queryGoogle, onChange: setQueryGoogle, disabled: googleQ.blocked, chip: googleQ.chip },
          vtAvailable && { key: 'vt', label: t('VirusTotal 病毒掃描', 'VirusTotal threat reports', 'VirusTotalの脅威レポート', 'VirusTotal 위협 보고서'), sends: ['網域'], to: t('VirusTotal（只查已有的掃描紀錄）', 'VirusTotal (existing scan reports only)', 'VirusTotal（既存のスキャン結果のみ）', 'VirusTotal(기존 검사 기록만 조회)'), checked: queryVt, onChange: setQueryVt, disabled: vtQ.blocked, chip: vtQ.chip },
        ].filter(Boolean) as ServiceOption[])} />
          </div>
        </details>
        {/* 預設展開，讓「協助校內研究」預設勾選的狀態一眼看得到 */}
        <details className="setting-disclosure" id="research-consent" open>
          <summary><span className="disclosure-label">{t('參與匿名研究（選填）', 'Take part in anonymous research (optional)', '匿名研究に参加する（任意）', '익명 연구 참여(선택)')}</span></summary>
          <div className="disclosure-content space-y-3">
        <p className="text-sm font-medium">{t('不參與研究也能使用查核服務。', 'You can use the check without taking part in research.', '研究に参加しなくてもチェックを利用できます。', '연구에 참여하지 않아도 확인 서비스를 이용할 수 있습니다.')}</p>
        <label className="consent-row" htmlFor="school-research">
          <input type="checkbox" id="school-research" aria-labelledby="school-research-title" aria-describedby="school-research-choice school-research-retention" className="mt-1 h-5 w-5 shrink-0" checked={consentB}
            onChange={(e) => { setConsentB(e.target.checked); if (!e.target.checked) setConsentC(false) }} />
          <span className="min-w-0 text-sm">
            <span className="block font-medium" id="school-research-title">{t('協助校內研究（選填）', 'Support school research (optional)', '校内研究に協力する（任意）', '교내 연구 참여(선택)')}</span>
            <span className="mt-1 block" id="school-research-choice">{t('勾選後，校內研究會保存已遮蔽個資的訊息內容與可疑網址，以及這次的分析結果。取消勾選也能查核，訊息內容與網址不會存入研究資料。', 'Select to save the redacted message, suspicious URLs and analysis results. You can still run the check with the box cleared. The message and URLs will then be excluded from the research records.', '選択すると、個人情報を伏せたメッセージ、不審なURL、分析結果を保存します。選択を外してもチェックでき、メッセージとURLは研究資料に保存されません。', '선택하면 개인정보를 가린 메시지와 의심스러운 URL, 분석 결과를 저장합니다. 선택을 해제해도 확인할 수 있으며 메시지와 URL은 연구 자료에 저장되지 않습니다.')}</span>
            <span className="mt-1 block text-xs text-slate-500" id="school-research-retention">{t(`研究用文字與網址保存至 ${retentionText} 後刪除。自動遮蔽可能遺漏個資，請勿填寫他人的個人資料。`, `Research text and URLs are deleted after ${retentionText}. Automatic masking can miss details. Please leave out other people’s personal information.`, `研究用の文章とURLは${retentionText}を過ぎたら削除します。自動処理で個人情報が残ることがあるため、他人の個人情報は入力しないでください。`, `연구용 메시지와 URL은 ${retentionText} 이후 삭제합니다. 자동 처리로 개인정보가 남을 수 있으니 타인의 개인정보를 입력하지 마세요.`)}</span>
          </span>
        </label>
        <label className="consent-row">
          <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" disabled={!consentB} checked={consentC} onChange={(e) => setConsentC(e.target.checked)} />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">{t('教育產品與商業研究（選填）', 'Educational products and commercial research (optional)', '教育製品・事業化に関する研究（任意）', '교육 제품 및 사업성 연구(선택)')}</span>
            <span className="mt-1 block text-xs text-slate-500">{t('同意將經審查的衍生統計資料用於教育產品及商業可行性研究。', 'I agree that reviewed statistics derived from the research may be used for educational products and commercial feasibility studies.', '審査済みの派生統計を教育製品や事業化の可能性を調べる研究に利用することに同意します。', '검토를 거친 파생 통계를 교육 제품과 사업 타당성 연구에 사용하는 데 동의합니다.')}</span>
          </span>
        </label>
        {wasWithdrawn && !consentB && <p className="text-xs text-slate-500">{t('你先前已撤回研究同意，如要再次參與請自行勾選。', 'You previously withdrew consent. Select this option yourself if you want to take part again.', '以前に研究への同意を撤回しています。再び参加する場合はご自身で選択してください。', '이전에 연구 동의를 철회했습니다. 다시 참여하려면 직접 선택하세요.')}</p>}
          </div>
        </details>
      </fieldset>

      {consentNotice && <Alert kind="warn">{message(consentNotice)}</Alert>}
      {error && <Alert kind="error">{message(error)}</Alert>}
      {busy ? <Spinner label={message(busy)} /> : (
        <NaughtyButton empty={mode === 'text' ? !text.trim() : !file} hint={mode === 'text' ? t('先貼上要查核的訊息喔！', 'Paste a message to check first.', '先に確認したいメッセージを貼り付けてください。', '먼저 확인할 메시지를 붙여 넣으세요.') : t('先選擇要上傳的檔案喔！', 'Choose a file to upload first.', '先にアップロードするファイルを選んでください。', '먼저 올릴 파일을 선택하세요.')}>{t('開始查核', 'Start check', 'チェックを開始', '확인 시작')}</NaughtyButton>
      )}
    </form>
  )
}
