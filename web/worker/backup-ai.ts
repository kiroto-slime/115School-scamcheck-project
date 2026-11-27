/**
 * 備援 AI：Gemini 連續失敗（用盡失敗上限或額度）時，改用其他 AI 分析「文字」。
 * - 使用哪些模型、順序由後台「系統設定」選（只能從 BACKUP_CATALOG 選）；預設 Workers AI（不需金鑰、資料不出 Cloudflare）→ Groq（需 GROQ_API_KEY）。
 * - 不使用中國廠牌模型（擁有者決定，避免政治立場疑慮）。
 * - 與 Gemini 共用同一套提示詞、隨機分隔標記與回覆格式；格式不對就當失敗，不捏造結果。
 * - 呼叫端已先遮蔽個資（redactPii）；圖片與影片不送備援。
 */
import { type AIResult, aiResultFromJson, buildUserPrompt, GeminiError, parseJsonLoose, type ReplyLang, SCHEMA, systemPrompt } from './gemini'

export type BackupProvider = 'workers_ai' | 'groq'
export interface BackupModel { key: string; provider: BackupProvider; model: string; label: string; maker: string }

const entry = (provider: BackupProvider, model: string, label: string, maker: string): BackupModel => ({ key: `${provider}:${model}`, provider, model, label, maker })

/**
 * 後台可選的備援候選名單（已確認：非中國廠牌、支援固定 JSON 格式、2026-11-27 官方頁面未標示停用）。
 * 新增候選前要先確認上面三點；已停用的模型直接從這裡刪掉，後台存的舊代號會自動被忽略。
 */
export const BACKUP_CATALOG: readonly BackupModel[] = [
  entry('workers_ai', '@cf/openai/gpt-oss-120b', 'GPT-OSS 120B', 'OpenAI'),
  entry('workers_ai', '@cf/google/gemma-4-26b-a4b-it', 'Gemma 4 26B', 'Google'),
  entry('workers_ai', '@cf/meta/llama-4-scout-17b-16e-instruct', 'Llama 4 Scout 17B', 'Meta'),
  entry('workers_ai', '@cf/openai/gpt-oss-20b', 'GPT-OSS 20B', 'OpenAI'),
  entry('groq', 'openai/gpt-oss-120b', 'GPT-OSS 120B', 'OpenAI'),
  entry('groq', 'openai/gpt-oss-20b', 'GPT-OSS 20B', 'OpenAI'),
]
export const BACKUP_KEYS = BACKUP_CATALOG.map(m => m.key) as [string, ...string[]]

/** 預設順序（擁有者 2026-11-27 決定）：Workers AI 先，Groq 後 */
export const DEFAULT_BACKUP_KEYS: string[] = [
  'workers_ai:@cf/openai/gpt-oss-120b', 'workers_ai:@cf/google/gemma-4-26b-a4b-it', 'workers_ai:@cf/meta/llama-4-scout-17b-16e-instruct',
  'groq:openai/gpt-oss-120b', 'groq:openai/gpt-oss-20b',
]

/** 把後台存的代號轉成模型（名單外、重複或格式錯的忽略） */
export function backupModelsFor(keys: unknown): BackupModel[] {
  if (!Array.isArray(keys)) return []
  const out: BackupModel[] = []
  for (const k of keys) {
    const m = BACKUP_CATALOG.find(x => x.key === k)
    if (m && !out.includes(m)) out.push(m)
  }
  return out
}

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

/** 把各家回覆統一取出 JSON 內容：response（字串或物件）、choices[].message.content、Responses 格式 output[] 的 output_text */
function extractJson(out: unknown): Record<string, unknown> {
  const o = out as { response?: unknown; choices?: { message?: { content?: unknown } }[]; output?: { type?: string; content?: { type?: string; text?: unknown }[] }[] } | null
  const fromOutput = Array.isArray(o?.output)
    ? o.output.filter(x => x?.type === 'message').flatMap(x => x.content ?? []).filter(c => c?.type === 'output_text').map(c => c.text).find(t => typeof t === 'string')
    : undefined
  const body = o?.response ?? o?.choices?.[0]?.message?.content ?? fromOutput ?? out
  if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>
  if (typeof body === 'string') {
    try { return parseJsonLoose(body) } catch { /* 下方統一處理 */ }
  }
  throw new GeminiError('備援 AI 回覆格式無法解讀。')
}

/** 即時讀取 Groq 目前提供的模型代號（後台選單用）；沒有金鑰回 null，讀取失敗丟錯 */
export async function groqModelIds(env: Env, fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<Set<string> | null> {
  const key = env.GROQ_API_KEY?.trim()
  if (!key) return null
  const res = await fetcher('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = (await res.json()) as { data?: { id?: unknown }[] }
  return new Set((data.data ?? []).map(m => m?.id).filter((id): id is string => typeof id === 'string'))
}

/** 用一個備援模型分析文字；失敗時丟出 GeminiError（狀態碼供錯誤紀錄分類） */
export async function runBackupModel(env: Env, m: BackupModel, text: string, lang: ReplyLang, fetcher: typeof fetch = (i, init) => fetch(i, init)): Promise<AIResult> {
  const messages = [{ role: 'system', content: systemPrompt(lang) }, { role: 'user', content: buildUserPrompt(text, false) }]
  let out: unknown
  if (m.provider === 'workers_ai') {
    const ai = aiOf(env)
    if (!ai) throw new GeminiError('尚未設定 Workers AI。', 0)
    try {
      out = await withTimeout(ai.run(m.model, { messages, response_format: { type: 'json_schema', json_schema: SCHEMA }, max_tokens: 4096, temperature: 0.2 }))
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
        body: JSON.stringify({ model: m.model, messages, response_format: format, temperature: 0.2, max_completion_tokens: 4096 }),
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
