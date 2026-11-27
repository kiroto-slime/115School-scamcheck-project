/**
 * 備援 AI：Gemini 連續失敗（用盡失敗上限或額度）時，改用其他 AI 分析「文字」。
 * - 順序（擁有者 2026-11-27 決定）：Workers AI（不需金鑰、資料不出 Cloudflare）→ Groq（需 GROQ_API_KEY）。
 * - 不使用中國廠牌模型（擁有者決定，避免政治立場疑慮）。
 * - 與 Gemini 共用同一套提示詞、隨機分隔標記與回覆格式；格式不對就當失敗，不捏造結果。
 * - 呼叫端已先遮蔽個資（redactPii）；圖片與影片不送備援。
 */
import { type AIResult, aiResultFromJson, buildUserPrompt, GeminiError, parseJsonLoose, type ReplyLang, SCHEMA, systemPrompt } from './gemini'

export type BackupProvider = 'workers_ai' | 'groq'
export interface BackupModel { provider: BackupProvider; model: string; label: string }

export const BACKUP_MODELS: readonly BackupModel[] = [
  { provider: 'workers_ai', model: '@cf/nvidia/nemotron-3-120b-a12b', label: 'Nemotron 3 Super' },
  { provider: 'workers_ai', model: '@cf/google/gemma-4-26b-a4b-it', label: 'Gemma 4 26B' },
  { provider: 'groq', model: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
  { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
]

export const PROVIDER_LABEL: Record<BackupProvider, string> = { workers_ai: 'Cloudflare Workers AI', groq: 'Groq' }
const TIMEOUT_MS = 60_000
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

type AiBinding = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> }
const aiOf = (env: Env) => (env as unknown as { AI?: AiBinding }).AI

/** 這個備援目前能不能用（Workers AI 要有綁定；Groq 要有金鑰） */
export function backupAvailable(env: Env, m: BackupModel): boolean {
  return m.provider === 'workers_ai' ? Boolean(aiOf(env)) : Boolean(env.GROQ_API_KEY?.trim())
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new GeminiError('備援 AI 超過 60 秒沒有回應。', 408)), TIMEOUT_MS) }),
  ])
}

/** 把各家回覆統一取出 JSON 內容 */
function extractJson(out: unknown): Record<string, unknown> {
  const o = out as { response?: unknown; choices?: { message?: { content?: unknown } }[] } | null
  const body = o?.response ?? o?.choices?.[0]?.message?.content ?? out
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  if (typeof body === 'string') {
    try { return parseJsonLoose(body) } catch { /* 下方統一處理 */ }
  }
  throw new GeminiError('備援 AI 回覆格式無法解讀。')
}

/** 用一個備援模型分析文字；失敗時丟出 GeminiError（狀態碼供錯誤紀錄分類） */
export async function runBackupModel(env: Env, m: BackupModel, text: string, lang: ReplyLang, fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<AIResult> {
  const messages = [{ role: 'system', content: systemPrompt(lang) }, { role: 'user', content: buildUserPrompt(text, false) }]
  let out: unknown
  if (m.provider === 'workers_ai') {
    const ai = aiOf(env)
    if (!ai) throw new GeminiError('尚未設定 Workers AI。', 0)
    try {
      out = await withTimeout(ai.run(m.model, { messages, response_format: { type: 'json_schema', json_schema: SCHEMA }, max_tokens: 2048, temperature: 0.2 }))
    } catch (e) {
      if (e instanceof GeminiError) throw e
      // Workers AI 的錯誤訊息可能含內部細節，只依代碼分類，不轉給使用者
      const msg = String((e as Error)?.message ?? '')
      throw new GeminiError('Workers AI 暫時無法使用。', /\b3036\b|daily|neurons|limit/i.test(msg) ? 429 : 503)
    }
  } else {
    const key = env.GROQ_API_KEY?.trim()
    if (!key) throw new GeminiError('尚未設定 Groq 金鑰。', 0)
    // GPT-OSS 支援固定格式（json_schema）；Llama 3.3 只支援 JSON 物件模式，靠提示詞約束欄位
    const format = m.model.startsWith('openai/')
      ? { type: 'json_schema', json_schema: { name: 'scam_check', schema: SCHEMA, strict: false } }
      : { type: 'json_object' }
    let res: Response
    try {
      res = await fetcher(GROQ_URL, {
        method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m.model, messages, response_format: format, temperature: 0.2, max_completion_tokens: 2048 }),
      })
    } catch (e) {
      const timeout = e instanceof DOMException && e.name === 'TimeoutError'
      throw new GeminiError(timeout ? '備援 AI 超過 60 秒沒有回應。' : '無法連線到 Groq。', timeout ? 408 : 0)
    }
    if (!res.ok) throw new GeminiError('Groq 暫時無法使用。', res.status)
    try {
      out = await res.json()
    } catch (e) {
      // 讀取回應時逾時要記成逾時，不要誤記成「格式無法解讀」
      if (e instanceof DOMException && e.name === 'TimeoutError') throw new GeminiError('備援 AI 超過 60 秒沒有回應。', 408)
      throw new GeminiError('備援 AI 回覆格式無法解讀。')
    }
  }
  return aiResultFromJson(extractJson(out), m.provider, m.model, [], true)
}
