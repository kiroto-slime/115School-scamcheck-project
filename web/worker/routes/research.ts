/** 研究測驗、同意、撤回、刪除、回饋、問卷 */
import { Hono } from 'hono'
import { z } from 'zod'
import { hasActiveConsent } from '../analysis'
import { AppEnv, Ctx, rateLimit, readBody } from '../auth'
import { analyzeText } from '../rules'
import { ASSISTANCE_BY_GROUP, assignGroup, buildAssistance, CaseRow, eligibleCases, newResearchId, PHASES, pickCasePair } from '../research'
import { isFormal } from '../settings'
import { audit, bool, HttpError, newId, nowIso } from '../util'

export const research = new Hono<AppEnv>()

const RID = z.string().regex(/^R[A-Z0-9]{12}$/)

interface Participant { research_id: string; experiment_group: string; pre_case_id: string; post_case_id: string; status: string; is_demo: number }

const publicCase = (c: CaseRow, phase: string) => ({ case_id: c.case_id, title: c.title, simulated_content: c.simulated_content, phase, reviewer_status: c.reviewer_status })
const getCase = (db: D1Database, id: string) => db.prepare('SELECT * FROM research_cases WHERE case_id = ?').bind(id).first<CaseRow>()

async function participant(c: Ctx, rid: string): Promise<Participant> {
  const p = await c.env.DB.prepare('SELECT * FROM research_participants WHERE research_id = ?').bind(rid).first<Participant>()
  if (!p || p.status === 'withdrawn') throw new HttpError(404, '找不到研究編號，或已撤回參與。')
  if (!(await hasActiveConsent(c.env.DB, rid, 'research'))) throw new HttpError(403, '研究同意已撤回，不再蒐集資料。')
  return p
}

const answeredPhases = async (db: D1Database, rid: string) =>
  new Set((await db.prepare('SELECT phase FROM research_responses WHERE research_id = ?').bind(rid).all<{ phase: string }>()).results.map((r) => r.phase))

research.post('/research/start', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const s = c.get('settings')
  const b = await readBody(c, z.object({ consent_research: z.boolean(), consent_secondary: z.boolean().default(false) }))
  if (!s.research_collection_enabled) throw new HttpError(403, '研究資料蒐集已結束，感謝參與。基本查核服務仍可使用。')
  // 拒絕研究同意：不建立任何紀錄，也不影響查核服務
  if (!b.consent_research) throw new HttpError(400, '未同意研究資料蒐集，因此無法進入研究測驗；基本查核服務不受影響。')
  const formal = isFormal(s)
  const pair = pickCasePair(await eligibleCases(c.env.DB, formal))
  if (!pair) throw new HttpError(503, '目前沒有足夠的已審核研究案例（需要至少兩題相同難度）。')
  const rid = newResearchId()
  const isDemo = !formal
  const group = await assignGroup(c.env.DB, s.research_group_mode, isDemo)
  const now = nowIso()
  const consent = (purpose: string, status: string) =>
    c.env.DB.prepare('INSERT INTO consent_records (consent_id, research_id, purpose, consent_version, consent_status, consent_time, is_demo) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(newId(), rid, purpose, s.consent_version, status, now, bool(isDemo))
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO research_participants (research_id, experiment_group, pre_case_id, post_case_id, status, is_demo, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)")
      .bind(rid, group, pair[0].case_id, pair[1].case_id, bool(isDemo), now),
    consent('research', 'granted'),
    consent('secondary_use', b.consent_secondary ? 'granted' : 'declined'),
  ])
  const warnings: string[] = []
  if (isDemo) warnings.push('目前為模擬研究模式（DEMO），資料不列入正式研究。')
  if (pair.some((x) => x.reviewer_status !== 'approved')) warnings.push('部分案例尚未完成人工審核，僅供系統測試。')
  return c.json({ research_id: rid, is_demo: isDemo, pre_case: publicCase(pair[0], 'pre'), post_case: publicCase(pair[1], 'post'), warnings })
})

research.post('/research/assistance', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const b = await readBody(c, z.object({ research_id: RID }))
  const p = await participant(c, b.research_id)
  if (!(await answeredPhases(c.env.DB, p.research_id)).has('post_initial')) throw new HttpError(409, '請先完成後測案例的初步判斷，再查看輔助資訊。')
  return c.json(buildAssistance(p.experiment_group, (await getCase(c.env.DB, p.post_case_id))!))
})

research.post('/research/answer', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const b = await readBody(c, z.object({
    research_id: RID,
    case_id: z.string().regex(/^[a-z0-9]{32}$/),
    phase: z.enum(PHASES),
    user_decision: z.enum(['scam', 'legit', 'unsure']),
    decision_reason_code: z.enum(['link', 'money', 'personal_data', 'urgency', 'authority', 'too_good', 'familiar_sender', 'looks_official', 'no_red_flag', 'gut_feeling', 'system_hint', 'other']),
    response_time_ms: z.number().int().min(0).max(3_600_000),
  }))
  if (!c.get('settings').research_collection_enabled) throw new HttpError(403, '研究資料蒐集已結束。')
  const db = c.env.DB
  const p = await participant(c, b.research_id)
  if (b.case_id !== (b.phase === 'pre' ? p.pre_case_id : p.post_case_id)) throw new HttpError(400, '案例與作答階段不符。')
  const done = await answeredPhases(db, p.research_id)
  if (PHASES.slice(0, PHASES.indexOf(b.phase)).some((ph) => !done.has(ph))) throw new HttpError(409, '請依序完成前面的階段。')

  const kase = (await getCase(db, b.case_id))!
  const correct = b.user_decision === 'unsure' ? null : b.user_decision === kase.verified_label
  const err = b.user_decision === 'unsure' ? 'unsure' : correct ? null : kase.verified_label === 'legit' ? 'false_positive' : 'false_negative'
  const assisted = b.phase === 'post_assisted'
  const triggers = assisted && p.experiment_group === 'B' ? analyzeText(kase.simulated_content).tags : []
  const responseId = newId()
  // 同一個寫入敘述檢查資格及重複作答，避免兩個同時送出的答案都被計入。
  const stmts = [
    db.prepare(`INSERT INTO research_responses (response_id, research_id, experiment_group, case_id, phase, user_decision, decision_reason_code, correctness, error_type,
      response_time_ms, assistance_used, system_triggers_json, is_demo, created_at)
      SELECT ?, p.research_id, p.experiment_group, ?, ?, ?, ?, ?, ?, ?, ?, ?, p.is_demo, ?
      FROM research_participants p WHERE p.research_id = ? AND p.status != 'withdrawn'
      AND (SELECT consent_status FROM consent_records WHERE research_id = p.research_id AND purpose = 'research'
           ORDER BY consent_time DESC, rowid DESC LIMIT 1) = 'granted'
      AND NOT EXISTS (SELECT 1 FROM research_responses WHERE research_id = p.research_id AND phase = ?)`).bind(
      responseId, kase.case_id, b.phase, b.user_decision, b.decision_reason_code, bool(correct), err, b.response_time_ms,
      assisted ? ASSISTANCE_BY_GROUP[p.experiment_group] : 'none', JSON.stringify(triggers), nowIso(), p.research_id, b.phase),
  ]
  const out: Record<string, unknown> = { recorded: true, phase: b.phase }
  if (assisted) {
    stmts.push(db.prepare(`UPDATE research_participants SET status = 'completed' WHERE research_id = ?
      AND EXISTS (SELECT 1 FROM research_responses WHERE response_id = ?)`).bind(p.research_id, responseId))
    const pre = (await getCase(db, p.pre_case_id))!
    out.reveal = [pre, kase].map((x) => ({ case_id: x.case_id, title: x.title, verified_label: x.verified_label, label_basis: x.label_basis }))
  }
  const [insert] = await db.batch(stmts)
  if (!insert.meta.changes) {
    await participant(c, p.research_id)
    throw new HttpError(409, '此階段已作答，請繼續下一個步驟。')
  }
  return c.json(out)
})

research.post('/consent', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const s = c.get('settings')
  const db = c.env.DB
  const b = await readBody(c, z.object({ research_id: RID.nullish(), purpose: z.enum(['research', 'secondary_use']), status: z.enum(['granted', 'declined', 'withdrawn']) }))
  const isDemo = !isFormal(s)
  let rid = b.research_id ?? null
  if (b.status === 'withdrawn') {
    if (!rid) throw new HttpError(400, '撤回同意需要提供研究編號。')
    const now = nowIso()
    const statements = [db.prepare(`UPDATE consent_records SET consent_status = 'withdrawn', withdrawal_time = ?
      WHERE research_id = ? AND consent_status = 'granted' AND (purpose = ? OR (? = 'research' AND purpose = 'secondary_use'))`)
      .bind(now, rid, b.purpose, b.purpose)]
    if (b.purpose === 'research') {
      statements.push(db.prepare(`UPDATE research_participants SET status = 'withdrawn' WHERE research_id = ?
        AND EXISTS (SELECT 1 FROM consent_records WHERE research_id = ? AND withdrawal_time = ? AND consent_status = 'withdrawn')`)
        .bind(rid, rid, now))
    }
    const [r] = await db.batch(statements)
    if (!r.meta.changes) throw new HttpError(404, '找不到有效的同意紀錄。')
    return c.json({ research_id: rid, purpose: b.purpose, status: 'withdrawn', message: '已撤回同意，之後不再蒐集研究資料。若要刪除已蒐集資料，請使用「刪除我的研究資料」。' })
  }
  if (b.status === 'granted' && !s.research_collection_enabled) throw new HttpError(403, '研究資料蒐集已結束。')
  if (!rid) {
    if (b.status !== 'granted' || b.purpose !== 'research') return c.json({ research_id: null, purpose: b.purpose, status: b.status, message: '未建立任何研究紀錄。' })
    rid = newResearchId()
  }
  const requiresResearch = b.purpose === 'secondary_use' && b.status === 'granted'
  const saved = await db.prepare(`INSERT INTO consent_records (consent_id, research_id, purpose, consent_version, consent_status, consent_time, is_demo)
    SELECT ?, ?, ?, ?, ?, ?, ? WHERE ? = 0 OR (SELECT consent_status FROM consent_records
      WHERE research_id = ? AND purpose = 'research' ORDER BY consent_time DESC, rowid DESC LIMIT 1) = 'granted'`)
    .bind(newId(), rid, b.purpose, s.consent_version, b.status, nowIso(), bool(isDemo), bool(requiresResearch), rid).run()
  if (!saved.meta.changes) throw new HttpError(400, '需先同意研究用途，才能同意衍生統計使用。')
  return c.json({ research_id: rid, purpose: b.purpose, status: b.status, consent_version: s.consent_version })
})

research.post('/privacy/delete', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const db = c.env.DB
  const { research_id: rid } = await readBody(c, z.object({ research_id: RID }))
  // 先清除只留下查核編號的評價與來源，再刪除研究編號和查核之間的關聯。
  const [, feedback, responses, analyses, participants] = await db.batch([
    db.prepare('DELETE FROM source_results WHERE analysis_id IN (SELECT analysis_id FROM analysis_records WHERE research_id_nullable = ?)').bind(rid),
    db.prepare(`DELETE FROM feedback_records WHERE research_id = ?
      OR analysis_id IN (SELECT analysis_id FROM analysis_records WHERE research_id_nullable = ?)`).bind(rid, rid),
    db.prepare('DELETE FROM research_responses WHERE research_id = ?').bind(rid),
    db.prepare('DELETE FROM analysis_records WHERE research_id_nullable = ?').bind(rid),
    db.prepare('DELETE FROM research_participants WHERE research_id = ?').bind(rid),
    db.prepare("UPDATE consent_records SET consent_status = 'withdrawn', withdrawal_time = ? WHERE research_id = ? AND consent_status = 'granted'").bind(nowIso(), rid),
    db.prepare("UPDATE audit_logs SET target = NULL WHERE action = 'privacy_delete' AND target = ?").bind(rid),
  ])
  const counts = {
    research_responses: responses.meta.changes,
    analysis_records: analyses.meta.changes,
    feedback: feedback.meta.changes,
    participant: participants.meta.changes,
  }
  await audit(db, 'participant', 'privacy_delete', null, JSON.stringify(counts))
  return c.json({ research_id: rid, deleted: counts, message: '已刪除此研究編號的研究資料。' })
})

research.post('/feedback', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const db = c.env.DB
  const b = await readBody(c, z.object({
    analysis_id: z.string().regex(/^[a-f0-9]{32}$/).nullish(),
    research_id: RID.nullish(),
    helpful: z.boolean().nullish(),
    rating: z.number().int().min(1).max(5).nullish(),
    reason_code: z.enum(['clear', 'unclear', 'too_long', 'wrong_result', 'useful_tips', 'other']).nullish(),
  }))
  if (!b.analysis_id && !b.research_id) throw new HttpError(400, '需要分析編號或研究編號。')
  const saved = await db.prepare(`WITH submission(analysis_id, research_id) AS (VALUES (?, ?))
    INSERT INTO feedback_records (feedback_id, analysis_id, research_id, helpful, rating, reason_code, is_demo, created_at)
    SELECT ?, s.analysis_id, s.research_id, ?, ?, ?, COALESCE(a.is_demo, ?), ?
    FROM submission s LEFT JOIN analysis_records a ON a.analysis_id = s.analysis_id
    WHERE (s.analysis_id IS NULL OR a.analysis_id IS NOT NULL)
      AND (s.research_id IS NULL OR (SELECT consent_status FROM consent_records WHERE research_id = s.research_id
        AND purpose = 'research' ORDER BY consent_time DESC, rowid DESC LIMIT 1) = 'granted')`)
    .bind(b.analysis_id ?? null, b.research_id ?? null, newId(), bool(b.helpful), b.rating ?? null, b.reason_code ?? null, bool(!isFormal(c.get('settings'))), nowIso()).run()
  if (!saved.meta.changes) throw new HttpError(404, '找不到查核紀錄或有效的研究同意，請重新開啟查核結果或研究頁。')
  return c.json({ recorded: true })
})

research.post('/survey', async (c) => {
  await rateLimit(c, 'DEFAULT_LIMITER')
  const b = await readBody(c, z.object({
    respondent_role: z.enum(['student', 'teacher', 'parent', 'other']),
    product: z.enum(['A', 'B', 'C']),
    perceived_value: z.number().int().min(1).max(5),
    most_needed_feature: z.enum(['quick_check', 'case_library', 'teaching_material', 'trend_report', 'other']),
    teacher_would_use: z.boolean().nullish(),
    verbal_interest: z.boolean(),
    trial_intent: z.boolean(),
    payment_intent: z.boolean(),
    acceptable_price_range: z.enum(['free_only', '1-99', '100-299', '300-999', '1000+']),
  }))
  await c.env.DB.prepare(`INSERT INTO product_survey_responses (survey_id, respondent_role, product, perceived_value, most_needed_feature, teacher_would_use, verbal_interest,
    trial_intent, payment_intent, acceptable_price_range, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    newId(), b.respondent_role, b.product, b.perceived_value, b.most_needed_feature, bool(b.teacher_would_use), bool(b.verbal_interest), bool(b.trial_intent),
    bool(b.payment_intent), b.acceptable_price_range, bool(!isFormal(c.get('settings'))), nowIso()).run()
  return c.json({ recorded: true, message: '感謝填答！此問卷只用於商業可行性研究，填答不代表購買。' })
})
