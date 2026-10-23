/** 匯出用中文呈現：只整理已保存結果，不重做查核或產生事件。 */
import { redactPii, RULES } from './rules'
import { parseJson } from './util'
import { mainReasons, riskConclusion } from '../shared/conclusion'

export type JsonObject = Record<string, unknown>
export const objectOf = (value: unknown): JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
export const savedResult = (json: string | null | undefined) => objectOf(parseJson<unknown>(json, {}))
export const stringsOf = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && !!x.trim()) : []

export const FEATURE_ZH: Record<string, string> = Object.fromEntries(RULES.map((r) => [r.feature_id, r.label]))
export const MEDIA_ZH: Record<string, string> = { text: '文字訊息', image: '圖片截圖', video: '短影片' }
export const PROVIDER_ZH: Record<string, string> = { cofacts: 'Cofacts 真的假的', tw165: '警政署 165 名單', safe_browsing: 'Google 網址安全', virustotal: 'VirusTotal 網域報告', google_factcheck: 'Google 事實查核', gemini: 'Gemini AI' }
export const STATUS_ZH: Record<string, string> = {
  found: '找到相關資料（需閱讀內容）', not_found: '查無資料（不代表安全）', listed: '在涉詐網站名單上', not_listed: '未列入名單（不代表安全）',
  ok: '查詢完成', clean: '未發現已知威脅（不代表安全）', safe: '未發現已知威脅（不代表安全）', error: '查詢失敗', rate_limited: '額度已用完或查詢過於頻繁',
  disabled: '服務未啟用', not_requested: '使用者未選擇使用', skipped: '未送出查詢', no_url: '沒有可檢查的網址',
  unavailable: '來源暫時無法使用', completed: '分析完成', completed_with_source_error: '分析完成，但部分來源查詢失敗',
}
export const MATCH_ZH: Record<string, string> = { exact: '相同內容', similar: '相似內容（不等於同一事件）', none: '無比對結果', listed: '名單命中', threat: '發現威脅訊號' }
export const REPLY_ZH: Record<string, string> = { RUMOR: '來源查核為不實', NOT_RUMOR: '來源查核為非不實', NOT_ARTICLE: '不屬於可查核訊息', OPINIONATED: '個人觀點', DISAGREEMENT: '查核意見不同' }
export const PHASE_ZH: Record<string, string> = { pre: '前測（無輔助）', post_initial: '後測初次判斷（看輔助前）', post_assisted: '後測再次判斷（看輔助後）' }
export const DECISION_ZH: Record<string, string> = { scam: '可能是詐騙', legit: '應該是正常訊息', unsure: '無法判斷' }
export const REASON_ZH: Record<string, string> = { link: '有可疑連結', money: '要求付款或匯款', personal_data: '要求個資或驗證碼', urgency: '催促或時間壓力', authority: '自稱官方或權威', too_good: '好處太誇張', familiar_sender: '看起來是認識的人', looks_official: '看起來很正式', no_red_flag: '沒有看到可疑之處', gut_feeling: '直覺', system_hint: '參考輔助資訊', other: '其他' }
export const ERROR_ZH: Record<string, string> = { false_positive: '把正常訊息判為詐騙', false_negative: '把詐騙判為正常訊息', unsure: '無法判斷' }
export const ASSIST_ZH: Record<string, string> = { none: '無輔助', general_tips: '一般防詐提醒', system_evidence: '規則風險解釋' }
export const CATEGORY_ZH: Record<string, string> = { ignored_link: '忽略連結', trusted_authority: '信任權威', greed: '貪心', fear: '恐懼', trusted_acquaintance: '信任熟人', over_trust_system: '過度信任系統', over_suspicion: '過度懷疑', careless: '粗心', other: '其他' }
export const REVIEW_ZH: Record<string, string> = { pending: '待審核', approved: '已核准', rejected: '未通過', verified: '已驗證', unverified: '尚未驗證', human_reviewed: '已人工審核' }
export const ROLE_ZH: Record<string, string> = { student: '學生', teacher: '教師', parent: '家長', other: '其他' }
export const PRODUCT_ZH: Record<string, string> = { A: '免費防詐查核工具', B: '防詐教材與案例包', C: '防詐趨勢分析與教育報告' }
export const NEED_ZH: Record<string, string> = { quick_check: '快速查核', case_library: '案例資料庫', teaching_material: '課堂教材', trend_report: '趨勢報告', other: '其他' }
export const CONSENT_ZH: Record<string, string> = { research: '校內研究', secondary_use: '教育產品與商業可行性研究', granted: '已同意', declined: '未同意', withdrawn: '已撤回' }
export const zh = (value: unknown, dictionary: Record<string, string>, empty = '未提供'): string => {
  if (typeof value !== 'string' || !value) return empty
  return dictionary[value] ?? `未定義代碼：${value}`
}
export const yesNo = (value: unknown) => value === null || value === undefined ? '未提供' : value === true || value === 1 ? '是' : '否'

/** 常見個資及連結再次遮蔽；自由文字仍須人工檢查，不能聲稱完全匿名。 */
export const exportText = (value: unknown): string => typeof value === 'string'
  ? redactPii(value).replace(/(?:https?:\/\/|www\.)[^\s<>「」『』，。；、]+/gi, '[網址已遮蔽]').replace(/\0/g, '')
  : ''
const lines = (values: string[]) => [...new Set(values.filter(Boolean))].map(exportText).join('\n')

export function recordOrigin(result: JsonObject): 'user_submission' | 'synthetic' | 'legacy_unknown' {
  if (result.demo === true) return 'synthetic'
  return result.record_origin === 'user_submission' ? 'user_submission' : 'legacy_unknown'
}

export function originLabel(result: JsonObject, demo: boolean) {
  const origin = recordOrigin(result)
  return origin === 'user_submission' ? '使用者查核' : origin === 'synthetic' ? '合成測試（DEMO）' : `舊紀錄（來源待確認；原分類${demo ? ' DEMO' : '正式'}）`
}

export interface ExportAnalysis {
  analysis_id: string; created_at: string; result_json: string; risk_level: string; risk_score_nullable: number | null;
  is_demo: number; consent_secondary_use: number; media_type: string
}

export function readableAnalysis(a: ExportAnalysis) {
  const result = savedResult(a.result_json)
  const ai = objectOf(result.ai)
  const aiOk = ai.status === 'ok'
  const summary = aiOk ? exportText(ai.summary).trim() : ''
  const features = Array.isArray(result.features) ? result.features.map(objectOf).map((f) => exportText(f.label)).filter(Boolean) : []
  const u = objectOf(result.url_checks)
  const cofacts = objectOf(result.cofacts)
  const reasons = mainReasons({
    features: Array.isArray(result.features) ? result.features.map(objectOf).filter((f) => typeof f.label === 'string').map((f) => ({ label: exportText(f.label), triggers: stringsOf(f.triggers).map(exportText) })) : [],
    cofacts: { matches: Array.isArray(cofacts.matches) ? cofacts.matches.map(objectOf).map((m) => ({ reply_type: typeof m.reply_type === 'string' ? m.reply_type : null })) : [] },
    fact_check: { status: String(objectOf(result.fact_check).status ?? '') },
    url_checks: { tw165: { status: String(objectOf(u.tw165).status ?? '') }, safe_browsing: { status: String(objectOf(u.safe_browsing).status ?? '') }, virustotal: { status: String(objectOf(u.virustotal).status ?? '') } },
  })
  const basis = stringsOf(result.basis)
  const issues = lines([
    ...reasons.map((s) => `結果頁主要原因：${s}`),
    ...(!reasons.length ? basis.map((s) => `規則：${s}`) : []),
    ...(!reasons.length && !basis.length ? features.map((s) => `規則：${s}`) : []),
    ...(aiOk ? stringsOf(ai.risk_points).map((s) => `AI：${s}`) : []),
  ]) || '未保存問題原因，請回原查核結果確認；不代表安全。'
  const actions = lines([
    ...stringsOf(result.safe_actions).map((s) => `規則建議：${s}`),
    ...(aiOk ? stringsOf(ai.advice).map((s) => `AI：${s}`) : []),
  ]) || '未保存當次處理建議。一般查證方式：先暫停操作，可撥 165 反詐騙諮詢專線。'
  const statuses: [string, unknown][] = [
    ['cofacts', objectOf(result.cofacts).status], ['google_factcheck', objectOf(result.fact_check).status],
    ['tw165', objectOf(u.tw165).status], ['safe_browsing', objectOf(u.safe_browsing).status], ['virustotal', objectOf(u.virustotal).status],
  ]
  return [
    summary || `未保存事件敘述。${features.length ? `僅能確認偵測特徵：${features.join('、')}；無法還原原始事件。` : '無法還原原始事件。'}`,
    `${riskConclusion(a.risk_level)}\n規則：${a.risk_level}（風險指數 ${a.risk_score_nullable ?? '無資料'}／100）\n${aiOk ? `AI：${exportText(ai.risk_level) || '未提供等級'}（與規則分開）` : `AI：${zh(ai.status, STATUS_ZH, '未保存狀態')}`}\n風險指數不是詐騙機率或司法認定。`,
    issues, actions,
    lines(statuses.filter(([, status]) => typeof status === 'string').map(([provider, status]) => `${PROVIDER_ZH[provider]}：${zh(status, STATUS_ZH)}`)) || '未保存來源查核狀態。',
    a.analysis_id, a.created_at, originLabel(result, !!a.is_demo), zh(a.media_type, MEDIA_ZH),
    summary ? '當次已保存的 AI 摘要，非投稿原文；AI 可能出錯。' : '僅列當次保存的規則結果，未生成事件故事。',
    a.consent_secondary_use ? '已同意衍生用途；仍須確認授權範圍、人工審查及去識別後才能作教材，不代表可直接公開。' : '未同意衍生使用；僅供已同意的校內研究，不直接作衍生教材或公開。',
  ]
}
