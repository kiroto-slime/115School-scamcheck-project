/** 合成測試資料（全部 is_demo=1，標示 DEMO）。只用於展示與測試，不可當作研究結果。 */
import { analyzeText, RULE_VERSION } from './rules'
import { CaseRow, pickCasePair } from './research'
import { newId, nowIso } from './util'

const DEMO_TEXTS = [
  '【物流通知】您的包裹地址錯誤，請於24小時內點擊 https://bit.ly/x 更新資料並支付手續費。',
  '恭喜您中獎！免費領取禮券，請加LINE客服並提供身分證照片。',
  '老師帶單穩賺不賠，月入十萬，名額有限。',
  '明天社團練習改到下午四點，記得帶水。',
]

/** 可重現的亂數（mulberry32） */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function seedDemo(db: D1Database, participants = 12, seed = 115): Promise<{ participants: number }> {
  const rand = rng(seed)
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const cases = (await db.prepare("SELECT * FROM research_cases WHERE reviewer_status != 'rejected'").all<CaseRow>()).results
  const stmts: D1PreparedStatement[] = []
  let made = 0
  for (let i = 0; i < participants; i++) {
    const pair = pickCasePair(cases, rand)
    if (!pair) break
    const rid = 'RDEMO' + Math.floor(rand() * 36 ** 8).toString(36).toUpperCase().padStart(8, '0').slice(-8)
    const group = i % 2 === 0 ? 'A' : 'B'
    const now = nowIso()
    stmts.push(
      db.prepare("INSERT INTO research_participants (research_id, experiment_group, pre_case_id, post_case_id, status, is_demo, created_at) VALUES (?, ?, ?, ?, 'completed', 1, ?)").bind(rid, group, pair[0].case_id, pair[1].case_id, now),
      db.prepare("INSERT INTO consent_records (consent_id, research_id, purpose, consent_version, consent_status, consent_time, is_demo) VALUES (?, ?, 'research', 'DEMO', 'granted', ?, 1)").bind(newId(), rid, now),
      db.prepare("INSERT INTO consent_records (consent_id, research_id, purpose, consent_version, consent_status, consent_time, is_demo) VALUES (?, ?, 'secondary_use', 'DEMO', ?, ?, 1)").bind(newId(), rid, pick(['granted', 'declined']), now),
    )
    for (const [phase, c] of [['pre', pair[0]], ['post_initial', pair[1]], ['post_assisted', pair[1]]] as const) {
      const decision = pick(['scam', 'legit', 'unsure'])
      const correct = decision === 'unsure' ? null : decision === c.verified_label
      const err = decision === 'unsure' ? 'unsure' : correct ? null : c.verified_label === 'legit' ? 'false_positive' : 'false_negative'
      const assisted = phase === 'post_assisted'
      stmts.push(db.prepare(`INSERT INTO research_responses (response_id, research_id, experiment_group, case_id, phase, user_decision, decision_reason_code, correctness,
        error_type, response_time_ms, assistance_used, system_triggers_json, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`).bind(
        newId(), rid, group, c.case_id, phase, decision, pick(['link', 'money', 'urgency', 'gut_feeling']), correct === null ? null : correct ? 1 : 0, err,
        4000 + Math.floor(rand() * 36000), assisted ? (group === 'A' ? 'general_tips' : 'system_evidence') : 'none',
        JSON.stringify(assisted && group === 'B' ? analyzeText(c.simulated_content).tags : []), nowIso(-Math.floor(rand() * 600) * 60_000)))
    }
    const r = analyzeText(pick(DEMO_TEXTS))
    const aid = newId()
    stmts.push(
      db.prepare(`INSERT INTO analysis_records (analysis_id, research_id_nullable, created_at, media_type, source_count, risk_score_nullable, risk_level, risk_tags_json,
        analysis_status, rule_version, external_ai_used, consent_research, consent_secondary_use, is_demo, result_json) VALUES (?, ?, ?, 'text', 0, ?, ?, ?, 'completed', ?, 0, 1, 0, 1, ?)`)
        .bind(aid, rid, now, r.risk_score, r.risk_level, JSON.stringify(r.tags), RULE_VERSION, JSON.stringify({ demo: true, features: r.features })),
      db.prepare("INSERT INTO source_results (source_result_id, analysis_id, provider, result_status, match_type, checked_at) VALUES (?, ?, 'cofacts', 'not_found', 'none', ?)").bind(newId(), aid, now),
      db.prepare('INSERT INTO feedback_records (feedback_id, analysis_id, research_id, helpful, rating, is_demo, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)').bind(newId(), aid, rid, rand() > 0.3 ? 1 : 0, 2 + Math.floor(rand() * 4), now),
      db.prepare(`INSERT INTO product_survey_responses (survey_id, respondent_role, product, perceived_value, most_needed_feature, teacher_would_use, verbal_interest, trial_intent,
        payment_intent, acceptable_price_range, is_demo, created_at) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?, ?, 1, ?)`).bind(
        newId(), pick(['student', 'teacher']), pick(['A', 'B', 'C']), 1 + Math.floor(rand() * 5), pick(['quick_check', 'case_library', 'teaching_material']),
        rand() > 0.5 ? 1 : 0, rand() > 0.8 ? 1 : 0, pick(['free_only', '1-99']), now),
    )
    made++
  }
  stmts.push(db.prepare("INSERT INTO business_events (event_id, product, event_type, count, is_demo, created_at) VALUES (?, 'A', 'actual_trial', 3, 1, ?)").bind(newId(), nowIso()))
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80))
  return { participants: made }
}

export async function clearDemo(db: D1Database): Promise<Record<string, number>> {
  const tables = ['research_responses', 'consent_records', 'feedback_records', 'research_participants', 'product_survey_responses', 'business_events']
  const out: Record<string, number> = {}
  await db.prepare('DELETE FROM source_results WHERE analysis_id IN (SELECT analysis_id FROM analysis_records WHERE is_demo = 1)').run()
  for (const t of [...tables, 'analysis_records']) out[t] = (await db.prepare(`DELETE FROM ${t} WHERE is_demo = 1`).run()).meta.changes
  return out
}
