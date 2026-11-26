import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import { type AppEnv, rateLimit, readBody } from '../auth'
import { redactPii, stripUrlQueries } from '../redact'
import { type AppSettings } from '../settings'
import { HttpError, newId, sha256 } from '../util'
import { opinionTopics, type OpinionPeriod } from '../../shared/result-opinion'

export const opinions = new Hono<AppEnv>()
const deletionId = async (code: string) => Array.from(await sha256(code), b => b.toString(16).padStart(2, '0')).join('')
export const taipeiDay = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10)
const period = (s: AppSettings): OpinionPeriod => ({
  deadline: s.opinion_deadline, keepUntil: s.opinion_keep_until,
  open: s.opinion_deadline >= taipeiDay() && s.opinion_keep_until >= s.opinion_deadline,
})

opinions.use('/result-opinions', bodyLimit({ maxSize: 4096, onError: () => { throw new HttpError(413, '心得過長，請縮短內容後再送出。') } }))
opinions.get('/result-opinions', c => c.json(period(c.get('settings'))))
opinions.post('/result-opinions', async c => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const b = await readBody(c, z.object({
    topic: z.enum(Object.keys(opinionTopics) as [keyof typeof opinionTopics, ...(keyof typeof opinionTopics)[]]),
    suggestion: z.string().trim().min(1).max(300),
  }).strict())
  const { open, keepUntil } = period(c.get('settings'))
  if (!open) throw new HttpError(410, '目前未開放收件。')
  const code = newId()
  await c.env.DB.prepare('INSERT INTO result_opinions(id,topic,suggestion,submitted_day,keep_until) VALUES (?,?,?,?,?)')
    .bind(await deletionId(code), b.topic, redactPii(stripUrlQueries(b.suggestion)), taipeiDay(), keepUntil).run()
  return c.json({ deletion_code: code }, 201)
})

opinions.delete('/result-opinions', async c => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const { code } = await readBody(c, z.object({ code: z.string().regex(/^[a-f0-9]{32}$/) }))
  // 第二個條件相容本機試作時已發出的刪除碼。
  await c.env.DB.prepare('DELETE FROM result_opinions WHERE id IN (?, ?)').bind(await deletionId(code), code).run()
  return c.json({ removed: true })
})
