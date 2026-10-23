// 前端只呼叫自己的後端 /api，不直接持有任何第三方 API Key。

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError('無法連線到伺服器，請確認網路或後端是否已啟動。', 0)
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* 非 JSON 回應 */
  }
  if (!res.ok) {
    const detail = (data as { detail?: unknown })?.detail
    throw new ApiError(typeof detail === 'string' ? detail : `發生錯誤（${res.status}），請稍後再試。`, res.status)
  }
  return data as T
}

export const postJson = <T,>(path: string, body: unknown, headers: Record<string, string> = {}) =>
  api<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })

export interface Health {
  status: string
  version: string
  rule_version: string
  modes: {
    cofacts: 'live' | 'off'
    google: 'live' | 'off'
    virustotal: 'live' | 'off'
    tw165: { available: boolean; origin?: string | null; updated_at: string | null; count: number }
    ai: 'disabled' | 'gemini'
    ai_model: string | null
    ai_models?: AiModelState[]
    quotas?: { cofacts: QuotaState; google: QuotaState; virustotal: QuotaState }
    research_mode: 'simulation' | 'formal'
    research_collection_enabled: boolean
    admin_configured: boolean
  }
  limits: { max_text_chars: number; max_image_mb: number; max_video_mb: number; max_video_seconds: number }
}

export interface Feature {
  feature_id: string
  label: string
  description: string
  triggers: string[]
  rule_version: string
  human_verified: boolean
}

export interface CofactsMatch {
  match_type: 'exact' | 'similar'
  title: string
  url: string
  reply_type: string | null
  reply_type_zh: string
  reply_excerpt: string | null
  similarity: number
}

export interface AnalysisResult {
  analysis_id: string
  created_at: string
  media_type: 'text' | 'image' | 'video'
  risk_level: '低' | '中' | '高' | '資訊不足'
  risk_score: number | null
  risk_tags: string[]
  analysis_status: string
  rule_version: string
  external_ai_used: boolean
  consent_research: boolean
  score_disclaimer: string
  cofacts: { status: string; mode: string; message: string; license: string; matches: CofactsMatch[] }
  fact_check?: { status: string; message: string; items: { claim: string; publisher: string; rating: string; url: string; date: string | null }[] }
  url_checks?: {
    url_count: number
    tw165: { status: string; message: string; updated_at: string | null; matches: { host_masked: string; lists: string[]; month: string; category: string }[] }
    safe_browsing: UrlCheck
    virustotal: UrlCheck
  }
  features: Feature[]
  basis: string[]
  safe_actions: string[]
  ai: {
    provider: string; status: string; is_demo: boolean; summary: string | null; external: boolean; model?: string | null
    risk_level?: string | null; risk_points?: string[]; advice?: string[]; media_description?: string | null; sent_media?: string[]
    fallback_note?: string | null
  }
  media: { ocr_status?: string; frames_extracted?: number; duration_seconds?: number | null; notes?: string[]; used_manual_text?: boolean }
  checked_at: string
  extracted_text_preview?: string
}

/** 外部服務今天剩幾次、這一分鐘是否冷卻中 */
export interface QuotaState { daily_left: number; minute_left: number | null; cooldown_seconds: number }

export interface AiModelState { id: string; label: string; remaining: number; daily: number; media: boolean; minute_left: number; cooldown_seconds: number }

/** 會被使用的模型：有圖片／影片時只看能分析媒體的 */
export const currentAiModel = (models: AiModelState[] = [], needMedia = false) =>
  models.find((m) => m.remaining > 0 && m.minute_left > 0 && (!needMedia || m.media)) ?? null

export interface UrlCheck { status: string; message: string; threats: { host_masked: string; detail: string }[] }

export interface NeedsManualText {
  needs_manual_text: true
  message: string
  media: AnalysisResult['media']
}

const RID_KEY = 'scamcheck_research_id'
export const researchId = {
  get: (): string | null => {
    try {
      return localStorage.getItem(RID_KEY)
    } catch {
      return null
    }
  },
  set: (v: string) => {
    try {
      localStorage.setItem(RID_KEY, v)
    } catch {
      /* 私密模式等情況忽略 */
    }
  },
  clear: () => {
    try {
      localStorage.removeItem(RID_KEY)
    } catch {
      /* ignore */
    }
  },
}

export const formatTime = (iso: string) => {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return isNaN(d.getTime()) ? iso : d.toLocaleString('zh-TW', { hour12: false })
}
