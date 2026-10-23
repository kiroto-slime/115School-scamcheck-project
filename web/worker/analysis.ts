/** 串接 Cofacts → 規則分析 → Gemini → 只儲存衍生結果（不存原文） */
import { cofactsLookup, LICENSE, skippedLookup } from './cofacts'
import { AIMedia, disabledResult, Gemini, notRequestedResult } from './gemini'
import { analyzeText, redactPii } from './rules'
import { AppSettings, aiMode, isFormal } from './settings'
import { audit, bool, HttpError, newId, nowIso, parseJson } from './util'

export async function hasActiveConsent(db: D1Database, researchId: string | null | undefined, purpose: string): Promise<boolean> {
  if (!researchId) return false
  const row = await db
    .prepare('SELECT consent_status FROM consent_records WHERE research_id = ? AND purpose = ? ORDER BY consent_time DESC, rowid DESC LIMIT 1')
    .bind(researchId, purpose)
    .first<{ consent_status: string }>()
  return row?.consent_status === 'granted'
}

export interface AnalyzeInput {
  text: string
  mediaType: 'text' | 'image' | 'video'
  researchId?: string | null
  queryCofacts: boolean
  useAi: boolean
  aiMedia?: AIMedia[]
  mediaInfo?: Record<string, unknown>
  fetcher?: typeof fetch
}

export async function runAnalysis(env: Env, s: AppSettings, inp: AnalyzeInput): Promise<Record<string, unknown>> {
  const db = env.DB
  const consentResearch = s.research_collection_enabled && (await hasActiveConsent(db, inp.researchId, 'research'))
  const consentSecondary = consentResearch && (await hasActiveConsent(db, inp.researchId, 'secondary_use'))

  // 1. Cofacts：只送出遮蔽個資後的文字
  const lookup = inp.queryCofacts && inp.text.trim()
    ? await cofactsLookup(env, redactPii(inp.text), s.cofacts_daily_limit, { fetcher: inp.fetcher })
    : skippedLookup(env)
  // 2. 規則分析
  const risk = analyzeText(inp.text, lookup.matches.map((m) => ({ reply_type: m.reply_type, match_type: m.match_type })))
  // 3. Gemini：只有使用者勾選時才送出
  const ai = aiMode(env) !== 'gemini'
    ? disabledResult()
    : !inp.useAi
      ? notRequestedResult()
      : await new Gemini(env, s.gemini_model, inp.fetcher).analyze(redactPii(inp.text), inp.aiMedia ?? [], s.gemini_daily_limit)

  const now = nowIso()
  const result = {
    media: inp.mediaInfo ?? {},
    cofacts: { status: lookup.status, mode: lookup.mode, message: lookup.message, license: LICENSE, matches: lookup.matches },
    features: risk.features,
    basis: risk.basis,
    safe_actions: risk.safe_actions,
    ai,
    checked_at: now,
  }
  const analysisId = newId()
  const status = lookup.status !== 'error' && ai.status !== 'error' ? 'completed' : 'completed_with_source_error'
  const stmts = [
    db.prepare(`INSERT INTO analysis_records (analysis_id, research_id_nullable, created_at, media_type, source_count, risk_score_nullable, risk_level,
      risk_tags_json, analysis_status, rule_version, external_ai_used, consent_research, consent_secondary_use, is_demo, result_json, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      analysisId, consentResearch ? inp.researchId : null, now, inp.mediaType, lookup.matches.length, risk.risk_score, risk.risk_level,
      JSON.stringify(risk.tags), status, risk.rule_version, bool(ai.external && ai.status === 'ok'), bool(consentResearch), bool(consentSecondary),
      bool(!isFormal(s)), JSON.stringify(result),
      // 未同意研究者：只暫存供當次查看，到期自動刪除
      consentResearch ? null : nowIso(s.temp_retention_hours * 3600_000),
    ),
  ]
  const src = (m: { match_type: string; title?: string | null; url?: string | null; reply_type?: string | null }, license: string | null) =>
    db.prepare(`INSERT INTO source_results (source_result_id, analysis_id, provider, result_status, match_type, source_title, source_url, reply_type, checked_at, license_tag)
      VALUES (?, ?, 'cofacts', ?, ?, ?, ?, ?, ?, ?)`).bind(newId(), analysisId, lookup.status, m.match_type, m.title ?? null, m.url ?? null, m.reply_type ?? null, now, license)
  if (lookup.matches.length) for (const m of lookup.matches) stmts.push(src(m, LICENSE))
  else stmts.push(src({ match_type: 'none' }, lookup.status === 'not_found' ? LICENSE : null))
  await db.batch(stmts)
  const rec = await db.prepare('SELECT * FROM analysis_records WHERE analysis_id = ?').bind(analysisId).first<AnalysisRow>()
  return serialize(rec!)
}

export interface AnalysisRow {
  analysis_id: string
  research_id_nullable: string | null
  created_at: string
  media_type: string
  risk_level: string
  risk_score_nullable: number | null
  risk_tags_json: string
  analysis_status: string
  rule_version: string
  external_ai_used: number
  consent_research: number
  result_json: string
  expires_at: string | null
}

export function serialize(rec: AnalysisRow): Record<string, unknown> {
  return {
    analysis_id: rec.analysis_id,
    created_at: rec.created_at,
    media_type: rec.media_type,
    risk_level: rec.risk_level,
    risk_score: rec.risk_score_nullable,
    risk_tags: parseJson<string[]>(rec.risk_tags_json, []),
    analysis_status: rec.analysis_status,
    rule_version: rec.rule_version,
    external_ai_used: Boolean(rec.external_ai_used),
    consent_research: Boolean(rec.consent_research),
    score_disclaimer: '風險指數為規則加權分數，不是經統計校準的詐騙機率，也不是司法認定。',
    ...parseJson<Record<string, unknown>>(rec.result_json, {}),
  }
}

export async function getRecord(db: D1Database, id: string): Promise<Record<string, unknown>> {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpError(404, '找不到這筆分析結果。')
  const rec = await db.prepare('SELECT * FROM analysis_records WHERE analysis_id = ?').bind(id).first<AnalysisRow>()
  if (!rec || (rec.expires_at && rec.expires_at < nowIso())) throw new HttpError(404, '找不到這筆分析結果，可能已超過暫存期限而自動刪除。')
  return serialize(rec)
}

export async function purgeExpired(db: D1Database, s: AppSettings): Promise<number> {
  const now = nowIso()
  const cutoff = nowIso(-s.research_retention_days * 86_400_000)
  const ids = await db.prepare('SELECT analysis_id FROM analysis_records WHERE (expires_at IS NOT NULL AND expires_at < ?) OR created_at < ?').bind(now, cutoff).all<{ analysis_id: string }>()
  const list = ids.results.map((r) => r.analysis_id)
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50)
    const q = chunk.map(() => '?').join(',')
    await db.batch([
      db.prepare(`DELETE FROM source_results WHERE analysis_id IN (${q})`).bind(...chunk),
      db.prepare(`DELETE FROM analysis_records WHERE analysis_id IN (${q})`).bind(...chunk),
    ])
  }
  if (list.length) await audit(db, 'system', 'retention_purge', null, `刪除 ${list.length} 筆過期分析紀錄`)
  return list.length
}
