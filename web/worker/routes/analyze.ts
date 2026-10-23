/** 查核 API：文字、圖片、影片 */
import { Hono } from 'hono'
import { z } from 'zod'
import { getRecord, runAnalysis } from '../analysis'
import { AppEnv, rateLimit, readBody } from '../auth'
import { Gemini, signMediaRef, verifyMediaRef } from '../gemini'
import { aiMode, LIMITS } from '../settings'
import { HttpError } from '../util'

export const analyze = new Hono<AppEnv>()

const rid = z.string().regex(/^R[A-Z0-9]{12}$/).nullish()
const common = {
  research_id: rid,
  query_cofacts: z.boolean().default(true),
  query_google: z.boolean().default(true),
  query_virustotal: z.boolean().default(false),
  // 使用者指定的 AI 模型（不填＝自動）
  ai_model: z.string().regex(/^[a-z0-9][a-z0-9.-]{2,60}$/).optional(),
  use_ai: z.boolean().default(true),
}
const extraText = z.string().max(LIMITS.maxTextChars).default('')

const IMAGE_MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP',
}

analyze.post('/analyze/text', async (c) => {
  await rateLimit(c, 'ANALYZE_LIMITER')
  const b = await readBody(c, z.object({ text: z.string().min(1).max(LIMITS.maxTextChars), ...common }))
  return c.json(await runAnalysis(c.env, c.get('settings'), {
    text: b.text, mediaType: 'text', researchId: b.research_id, queryCofacts: b.query_cofacts, queryGoogle: b.query_google, queryVirusTotal: b.query_virustotal, aiModel: b.ai_model, useAi: b.use_ai,
  }))
})

/** 圖片：瀏覽器已先縮圖並轉成 base64。只解碼前幾個位元組檢查檔頭，不整張解碼（省 CPU）。 */
analyze.post('/analyze/image', async (c) => {
  await rateLimit(c, 'ANALYZE_LIMITER')
  const b = await readBody(c, z.object({
    image_base64: z.string().min(16).max(Math.ceil((LIMITS.maxImageMb * 1024 * 1024 * 4) / 3) + 8).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    extra_text: extraText,
    ...common,
  }))
  const head = Uint8Array.from(atob(b.image_base64.slice(0, 16)), (ch) => ch.charCodeAt(0))
  if (!IMAGE_MAGIC[b.mime_type](head)) throw new HttpError(415, '檔案內容與格式不符，或不是有效的圖片。')
  const aiOn = b.use_ai && aiMode(c.env) === 'gemini'
  const notes = aiOn ? ['圖片由 Gemini 直接判讀（含圖中文字），AI 可能出錯，請以原圖為準。'] : ['未使用 AI，無法自動辨識圖片文字；以下只分析你輸入的補充文字。']
  if (!aiOn && !b.extra_text.trim())
    return c.json({ needs_manual_text: true, media: { notes }, message: '沒有使用 AI 時無法讀取圖片內容，請在「補充文字」輸入圖片中的文字' + (aiMode(c.env) === 'gemini' ? '（或勾選使用 AI 分析）。' : '。') })
  return c.json(await runAnalysis(c.env, c.get('settings'), {
    text: b.extra_text, mediaType: 'image', researchId: b.research_id, queryCofacts: b.query_cofacts, queryGoogle: b.query_google, queryVirusTotal: b.query_virustotal, aiModel: b.ai_model, useAi: b.use_ai,
    aiMedia: aiOn ? [{ kind: 'image', mime: b.mime_type, base64: b.image_base64 }] : [],
    mediaInfo: { notes, used_manual_text: Boolean(b.extra_text.trim()), ocr_status: aiOn ? 'gemini' : 'unavailable' },
  }))
})

/** 影片第一步：原始檔串流轉送到 Gemini Files API，回傳簽章過的 media_ref */
analyze.post('/media/video', async (c) => {
  await rateLimit(c, 'ANALYZE_LIMITER')
  if (aiMode(c.env) !== 'gemini') throw new HttpError(400, '網站尚未設定 Gemini，無法分析影片內容；請改在補充文字輸入影片重點。')
  const mime = (c.req.header('Content-Type') ?? '').split(';')[0].trim()
  if (mime !== 'video/mp4' && mime !== 'video/quicktime') throw new HttpError(415, '影片格式不支援，請上傳 MP4 或 MOV。')
  const size = Number(c.req.header('Content-Length') ?? 0)
  if (!size) throw new HttpError(411, '缺少檔案大小資訊，請重新上傳。')
  if (size > LIMITS.maxVideoMb * 1024 * 1024) throw new HttpError(413, `檔案超過 ${LIMITS.maxVideoMb} MB 上限，請壓縮或裁切後再上傳。`)
  const body = c.req.raw.body
  if (!body) throw new HttpError(400, '檔案是空的，請重新選擇。')

  // 讀第一段資料檢查 MP4/MOV 檔頭（ftyp），再把它和剩下的資料一起轉送
  const reader = body.getReader()
  const first = await reader.read()
  const head = first.value ?? new Uint8Array()
  if (head.length < 12 || String.fromCharCode(...head.slice(4, 8)) !== 'ftyp') {
    await reader.cancel()
    throw new HttpError(415, '檔案內容不是有效的 MP4 / MOV 影片。')
  }
  const { readable, writable } = new FixedLengthStream(size)
  const pump = (async () => {
    const w = writable.getWriter()
    try {
      await w.write(head)
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        await w.write(value)
      }
      await w.close()
    } catch (e) {
      await w.abort(e)
    }
  })()
  const gemini = new Gemini(c.env, c.get('settings').gemini_models[0]?.id ?? 'gemini')
  const [file] = await Promise.all([gemini.uploadStream(readable, size, mime === 'video/quicktime' ? 'video/mov' : 'video/mp4'), pump])
  return c.json({ media_ref: await signMediaRef(c.env, { ...file, mime: mime === 'video/quicktime' ? 'video/mov' : 'video/mp4' }), expires_in_seconds: 1800 })
})

/** 影片第二步：分析（有 media_ref 就交給 Gemini 看影片，分析後刪除 Google 上的檔案） */
analyze.post('/analyze/video', async (c) => {
  await rateLimit(c, 'ANALYZE_LIMITER')
  const b = await readBody(c, z.object({ media_ref: z.string().max(2000).nullish(), extra_text: extraText, duration_seconds: z.number().min(0).max(3600).nullish(), ...common }))
  const env = c.env
  const s = c.get('settings')
  const ref = b.media_ref ? await verifyMediaRef(env, b.media_ref) : null
  if (b.media_ref && !ref) throw new HttpError(400, '影片上傳憑證無效或已過期，請重新上傳。')
  const notes: string[] = []
  const gemini = new Gemini(env, s.gemini_models[0]?.id ?? 'gemini')
  try {
    if (ref) {
      await gemini.waitActive(ref.name)
      notes.push('影片已送交 Gemini 分析畫面與聲音，分析完成後即刪除 Google 上的檔案。')
    } else {
      notes.push('沒有使用 AI，未分析影片畫面與語音；以下只分析你輸入的補充文字。')
      if (!b.extra_text.trim()) return c.json({ needs_manual_text: true, media: { notes }, message: '請在「補充文字」輸入影片中的文字或旁白重點。' })
    }
    return c.json(await runAnalysis(env, s, {
      text: b.extra_text, mediaType: 'video', researchId: b.research_id, queryCofacts: b.query_cofacts, queryGoogle: b.query_google, queryVirusTotal: b.query_virustotal, aiModel: b.ai_model, useAi: Boolean(ref) && b.use_ai,
      aiMedia: ref && b.use_ai ? [{ kind: 'video', mime: ref.mime, uri: ref.uri }] : [],
      mediaInfo: { notes, used_manual_text: Boolean(b.extra_text.trim()), duration_seconds: b.duration_seconds ?? null, ocr_status: ref ? 'gemini' : 'unavailable' },
    }))
  } finally {
    if (ref) c.executionCtx.waitUntil(gemini.deleteFile(ref.name))
  }
})

analyze.get('/analysis/:id', async (c) => c.json(await getRecord(c.env.DB, c.req.param('id'))))
