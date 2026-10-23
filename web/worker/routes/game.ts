/** 教學遊戲只讀發布題庫；不接收玩家分數或作答。 */
import { Hono } from 'hono'
import { z } from 'zod'
import { type AppEnv, readBody, requireAdmin, rateLimit } from '../auth'
import { audit, HttpError, newId, nowIso } from '../util'

export const game = new Hono<AppEnv>()
const schema = z.object({
  question: z.string().trim().min(1).max(1500),
  options: z.array(z.string().trim().min(1).max(300)).min(2).max(4),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string().trim().min(1).max(1500),
  published: z.boolean(),
}).refine((v) => v.correct_index < v.options.length, { path: ['correct_index'], message: '正確答案必須是現有選項' })
interface Row { id: string; question: string; options_json: string; correct_index: number; explanation: string; published: number }
const present = (r: Row) => ({ id: r.id, question: r.question, options: JSON.parse(r.options_json) as string[], correct_index: r.correct_index, explanation: r.explanation, published: !!r.published })

game.get('/game/question', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const row = await c.env.DB.prepare('SELECT * FROM game_questions WHERE published = 1 ORDER BY RANDOM() LIMIT 1').first<Row>()
  if (!row) throw new HttpError(404, '目前尚無已發布的遊戲題目，請管理員至「遊戲題庫」新增並發布。')
  return c.json(present(row))
})

game.use('/admin/game-questions', requireAdmin)
game.use('/admin/game-questions/*', requireAdmin)
game.get('/admin/game-questions', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM game_questions ORDER BY updated_at DESC LIMIT 200').all<Row>()).results.map(present)))
game.post('/admin/game-questions', async (c) => {
  const b = await readBody(c, schema)
  const id = newId()
  await c.env.DB.prepare('INSERT INTO game_questions (id, question, options_json, correct_index, explanation, published, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, b.question, JSON.stringify(b.options), b.correct_index, b.explanation, Number(b.published), nowIso()).run()
  await audit(c.env.DB, c.get('admin'), 'create_game_question', id)
  return c.json({ id }, 201)
})
game.put('/admin/game-questions/:id', async (c) => {
  const b = await readBody(c, schema)
  const result = await c.env.DB.prepare('UPDATE game_questions SET question = ?, options_json = ?, correct_index = ?, explanation = ?, published = ?, updated_at = ? WHERE id = ?')
    .bind(b.question, JSON.stringify(b.options), b.correct_index, b.explanation, Number(b.published), nowIso(), c.req.param('id')).run()
  if (!result.meta.changes) throw new HttpError(404, '找不到題目，請重新載入題庫。')
  await audit(c.env.DB, c.get('admin'), 'update_game_question', c.req.param('id'))
  return c.json({ updated: true })
})
