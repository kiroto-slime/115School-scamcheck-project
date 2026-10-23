/** 串接 Cofacts／網址安全檢查／Google 事實查核 → 規則分析 → Gemini → 只儲存衍生結果（不存原文、不存完整網址） */
import { cofactsLookup, disabledLookup, LICENSE, skippedLookup } from './cofacts'
import { factCheckLookup, FactCheckResult } from './factcheck'
import { analyzeWithFallback } from './aimodels'
import { AIMedia, disabledResult, notRequestedResult } from './gemini'
import { analyzeText, redactPii } from './rules'
import { AppSettings, aiMode, isFormal } from './settings'
import { audit, bool, HttpError, newId, nowIso, parseJson } from './util'
import { ExternalUrlResult, extractUrls, safeBrowsingLookup, tw165Lookup, virusTotalLookup, vtMaliciousCount } from './urlcheck'

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
  /** Google 安全瀏覽＋事實查核 */
  queryGoogle?: boolean
  queryVirusTotal?: boolean
  useAi: boolean
  aiMedia?: AIMedia[]
  mediaInfo?: Record<string, unknown>
  fetcher?: typeof fetch
}

export async function runAnalysis(env: Env, s: AppSettings, inp: AnalyzeInput): Promise<Record<string, unknown>> {
  const db = env.DB
  const consentResearch = s.research_collection_enabled && (await hasActiveConsent(db, inp.researchId, 'research'))
  const consentSecondary = consentResearch && (await hasActiveConsent(db, inp.researchId, 'secondary_use'))

  const redacted = redactPii(inp.text)
  const urls = extractUrls(inp.text)
  const opts = { fetcher: inp.fetcher }
  const notRequested = (status: 'not_requested' | 'disabled', message: string): ExternalUrlResult => ({ status, threats: [], message })
  // 1. 外部查詢同時進行；只有使用者勾選的才送出，文字一律先遮蔽個資
  const [lookup, tw165, safeBrowsing, virusTotal, factCheck] = await Promise.all([
    !s.cofacts_enabled
      ? disabledLookup()
      : inp.queryCofacts && inp.text.trim()
        ? cofactsLookup(env, redacted, s.cofacts_daily_limit, opts)
        : skippedLookup(),
    tw165Lookup(env, urls),
    !env.GOOGLE_CLOUD_API_KEY
      ? notRequested('disabled', '網站尚未設定 Google 金鑰。')
      : inp.queryGoogle
        ? safeBrowsingLookup(env, urls, s.google_daily_limit, opts)
        : notRequested('not_requested', '你選擇不送出給 Google。'),
    !env.VIRUSTOTAL_API_KEY
      ? notRequested('disabled', '網站尚未設定 VirusTotal 金鑰。')
      : inp.queryVirusTotal
        ? virusTotalLookup(env, urls, s.virustotal_daily_limit, opts)
        : notRequested('not_requested', '你沒有勾選 VirusTotal 檢查。'),
    !env.GOOGLE_CLOUD_API_KEY
      ? ({ status: 'disabled', items: [], message: '網站尚未設定 Google 金鑰。' } satisfies FactCheckResult)
      : inp.queryGoogle && inp.text.trim()
        ? factCheckLookup(env, redacted, s.google_daily_limit, opts)
        : ({ status: 'not_requested', items: [], message: '未送出給 Google。' } satisfies FactCheckResult),
  ])
  // 2. 規則分析（加上查核與網址訊號）
  const risk = analyzeText(
    inp.text,
    lookup.matches.map((m) => ({ reply_type: m.reply_type, match_type: m.match_type })),
    { tw165Listed: tw165.matches.length, safeBrowsingThreats: safeBrowsing.threats.length, virusTotalMalicious: vtMaliciousCount(virusTotal) },
  )
  // 3. Gemini：只有使用者勾選時才送出
  const ai = aiMode(env) !== 'gemini'
    ? disabledResult()
    : !inp.useAi
      ? notRequestedResult()
      : await analyzeWithFallback(env, s, redacted, inp.aiMedia ?? [], inp.fetcher)

  const now = nowIso()
  const result = {
    media: inp.mediaInfo ?? {},
    cofacts: { status: lookup.status, mode: lookup.mode, message: lookup.message, license: LICENSE, matches: lookup.matches },
    fact_check: factCheck,
    url_checks: { url_count: urls.length, tw165, safe_browsing: safeBrowsing, virustotal: virusTotal },
    features: risk.features,
    basis: risk.basis,
    safe_actions: risk.safe_actions,
    ai,
    checked_at: now,
  }
  const analysisId = newId()
  const anyError = [lookup.status, ai.status, safeBrowsing.status, virusTotal.status, factCheck.status].includes('error')
  const status = anyError ? 'completed_with_source_error' : 'completed'
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
  const src = (provider: string, status: string, m: { match_type: string; title?: string | null; url?: string | null; reply_type?: string | null }, license: string | null) =>
    db.prepare(`INSERT INTO source_results (source_result_id, analysis_id, provider, result_status, match_type, source_title, source_url, reply_type, checked_at, license_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(newId(), analysisId, provider, status, m.match_type, m.title ?? null, m.url ?? null, m.reply_type ?? null, now, license)
  if (lookup.matches.length) for (const m of lookup.matches) stmts.push(src('cofacts', lookup.status, m, LICENSE))
  else stmts.push(src('cofacts', lookup.status, { match_type: 'none' }, lookup.status === 'not_found' ? LICENSE : null))
  // 其他來源只記狀態（不記使用者的網址）；有網址時才記網址檢查
  if (urls.length) {
    stmts.push(src('tw165', tw165.status, { match_type: tw165.matches.length ? 'listed' : 'none' }, '政府資料開放授權條款-第1版'))
    if (!['disabled', 'not_requested'].includes(safeBrowsing.status)) stmts.push(src('safe_browsing', safeBrowsing.status, { match_type: safeBrowsing.threats.length ? 'threat' : 'none' }, null))
    if (!['disabled', 'not_requested'].includes(virusTotal.status)) stmts.push(src('virustotal', virusTotal.status, { match_type: virusTotal.threats.length ? 'threat' : 'none' }, null))
  }
  if (!['disabled', 'not_requested'].includes(factCheck.status)) {
    if (factCheck.items.length) for (const it of factCheck.items) stmts.push(src('google_factcheck', factCheck.status, { match_type: 'similar', title: it.claim.slice(0, 80), url: it.url, reply_type: it.rating }, null))
    else stmts.push(src('google_factcheck', factCheck.status, { match_type: 'none' }, null))
  }
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
