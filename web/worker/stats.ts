/** 研究統計與匯出資料。只計算資料庫中的實際紀錄；沒有資料時回傳 0 / null，不產生假數據。 */
import { parseJson } from './util'

const rate = (num: number, den: number) => (den ? Math.round((num / den) * 10000) / 10000 : null)

interface Resp { research_id: string; experiment_group: string; phase: string; user_decision: string; correctness: number | null; error_type: string | null }

export async function computeStatistics(db: D1Database, demo: boolean) {
  const d = demo ? 1 : 0
  const all = <T>(sql: string) => db.prepare(sql).bind(d).all<T>().then((r) => r.results)
  const [analyses, sources, responses, participants, feedback, surveys, events] = await Promise.all([
    all<{ analysis_id: string; risk_tags_json: string }>('SELECT analysis_id, risk_tags_json FROM analysis_records WHERE is_demo = ? AND consent_research = 1'),
    all<{ analysis_id: string; result_status: string }>('SELECT s.analysis_id, s.result_status FROM source_results s JOIN analysis_records a ON a.analysis_id = s.analysis_id WHERE a.is_demo = ? AND a.consent_research = 1'),
    all<Resp>('SELECT research_id, experiment_group, phase, user_decision, correctness, error_type FROM research_responses WHERE is_demo = ?'),
    all<{ experiment_group: string }>('SELECT experiment_group FROM research_participants WHERE is_demo = ?'),
    all<{ helpful: number | null; rating: number | null }>('SELECT helpful, rating FROM feedback_records WHERE is_demo = ?'),
    all<Record<string, number | string>>('SELECT * FROM product_survey_responses WHERE is_demo = ?'),
    all<{ product: string; event_type: string; count: number }>('SELECT product, event_type, count FROM business_events WHERE is_demo = ?'),
  ])

  // 查核成功率：真的嘗試查 Cofacts（找到／查無／失敗／超額）中成功的比例；Mock、略過不計
  const perAnalysis = new Map(sources.map((s) => [s.analysis_id, s.result_status]))
  const attempted = [...perAnalysis.values()].filter((s) => ['found', 'not_found', 'error', 'rate_limited'].includes(s))
  const succeeded = attempted.filter((s) => s === 'found' || s === 'not_found')

  const byRid = new Map<string, Record<string, Resp>>()
  for (const r of responses) byRid.set(r.research_id, { ...(byRid.get(r.research_id) ?? {}), [r.phase]: r })
  const complete = [...byRid.values()].filter((ph) => ph.pre && ph.post_assisted)

  const groups: Record<string, unknown> = {}
  for (const g of ['A', 'B']) {
    const rows = complete.filter((ph) => ph.pre.experiment_group === g)
    const pre = rate(rows.filter((ph) => ph.pre.correctness).length, rows.length)
    const post = rate(rows.filter((ph) => ph.post_assisted.correctness).length, rows.length)
    groups[g] = {
      participants: participants.filter((p) => p.experiment_group === g).length,
      valid_samples: rows.length,
      pre_accuracy: pre,
      post_accuracy: post,
      accuracy_change: pre !== null && post !== null ? Math.round((post - pre) * 10000) / 10000 : null,
      decision_changed_after_assist: rows.filter((ph) => ph.post_initial && ph.post_initial.user_decision !== ph.post_assisted.user_decision).length,
    }
  }

  const judged = responses.filter((r) => r.phase === 'pre' || r.phase === 'post_assisted')
  const errCount = (t: string) => responses.filter((r) => r.error_type === t).length
  const tags = new Map<string, number>()
  for (const a of analyses) for (const t of parseJson<string[]>(a.risk_tags_json, [])) tags.set(t, (tags.get(t) ?? 0) + 1)
  const helpful = feedback.filter((f) => f.helpful !== null)
  const ratings = feedback.map((f) => f.rating).filter((r): r is number => !!r)

  const business: Record<string, unknown> = {}
  for (const p of ['A', 'B', 'C']) {
    const s = surveys.filter((x) => x.product === p)
    const ev = (t: string) => events.filter((e) => e.product === p && e.event_type === t).reduce((n, e) => n + e.count, 0)
    business[p] = {
      survey_responses: s.length,
      avg_perceived_value: s.length ? Math.round((s.reduce((n, x) => n + Number(x.perceived_value), 0) / s.length) * 100) / 100 : null,
      verbal_interest: s.filter((x) => x.verbal_interest).length,
      trial_intent: s.filter((x) => x.trial_intent).length,
      payment_intent: s.filter((x) => x.payment_intent).length,
      actual_trial: ev('actual_trial'),
      actual_payment: ev('actual_payment'),
    }
  }

  return {
    dataset: demo ? 'demo' : 'formal',
    analysis_records: analyses.length,
    participants: participants.length,
    valid_samples: complete.length,
    groups,
    source_check: { attempted: attempted.length, succeeded: succeeded.length, success_rate: rate(succeeded.length, attempted.length) },
    judgement: {
      answers: judged.length,
      accuracy: rate(judged.filter((r) => r.correctness).length, judged.length),
      false_positive: errCount('false_positive'),
      false_negative: errCount('false_negative'),
      unsure: errCount('unsure'),
    },
    risk_tag_counts: Object.fromEntries([...tags.entries()].sort((a, b) => b[1] - a[1])),
    feedback: {
      count: feedback.length,
      helpful_yes: helpful.filter((f) => f.helpful).length,
      helpful_no: helpful.filter((f) => !f.helpful).length,
      avg_rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 : null,
    },
    business,
  }
}

export interface Sheet { name: string; headers: string[]; dateColumns: number[]; rows: (string | number | boolean | null)[][] }

/** Excel 匯出用的資料（由瀏覽器端組成 .xlsx）。不含原始投稿或個資。 */
export async function exportData(db: D1Database, demo: boolean): Promise<{ sheets: Sheet[]; exported_at: string; label: string }> {
  const d = demo ? 1 : 0
  const tag = demo ? 'DEMO' : '正式'
  const q = <T>(sql: string, bind = true) => (bind ? db.prepare(sql).bind(d) : db.prepare(sql)).all<T>().then((r) => r.results)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const analyses = await q<any>('SELECT * FROM analysis_records WHERE is_demo = ? AND consent_research = 1 ORDER BY created_at')
  const sources = await q<any>('SELECT s.* FROM source_results s JOIN analysis_records a ON a.analysis_id = s.analysis_id WHERE a.is_demo = ? AND a.consent_research = 1 ORDER BY s.checked_at')
  const responses = await q<any>('SELECT * FROM research_responses WHERE is_demo = ? ORDER BY created_at')
  const patterns = await q<any>('SELECT * FROM pattern_dataset', false)
  const consents = await q<any>('SELECT * FROM consent_records WHERE is_demo = ? ORDER BY consent_time')
  const surveys = await q<any>('SELECT * FROM product_survey_responses WHERE is_demo = ? ORDER BY created_at')
  const yn = (v: number | null) => (v === null || v === undefined ? null : Boolean(v))

  const st = await computeStatistics(db, demo)
  const pct = (v: number | null) => (v === null ? '無資料' : `${(v * 100).toFixed(1)}%`)
  const summary: (string | number)[][] = [
    ['資料類型', demo ? '模擬資料（DEMO）' : '正式資料'],
    ['匯出時間(UTC)', new Date().toISOString()],
    ['說明', '僅包含已同意研究的匿名紀錄；不含原始投稿、圖片、影片或個資。'],
    ['分析紀錄數', st.analysis_records], ['研究參與者數', st.participants], ['有效樣本數（完成前後測）', st.valid_samples],
  ]
  for (const [g, v] of Object.entries(st.groups) as [string, any][]) {
    summary.push([`${g} 組人數`, v.participants], [`${g} 組有效樣本`, v.valid_samples], [`${g} 組前測正確率`, pct(v.pre_accuracy)],
      [`${g} 組後測正確率`, pct(v.post_accuracy)], [`${g} 組前後測差異`, pct(v.accuracy_change)], [`${g} 組看過輔助後改變決策人數`, v.decision_changed_after_assist])
  }
  summary.push(['查核嘗試次數', st.source_check.attempted], ['查核成功率', pct(st.source_check.success_rate)], ['判斷作答數', st.judgement.answers],
    ['判斷正確率', pct(st.judgement.accuracy)], ['誤判（正常判為詐騙）', st.judgement.false_positive], ['漏判（詐騙判為正常）', st.judgement.false_negative],
    ['無法判斷', st.judgement.unsure])
  const tagRows = Object.entries(st.risk_tag_counts).map(([k, v]) => [`風險特徵次數：${k}`, v])
  summary.push(...(tagRows.length ? tagRows : [['風險特徵次數', '無資料']]))
  summary.push(['回饋數', st.feedback.count], ['回饋：有幫助', st.feedback.helpful_yes], ['回饋：沒幫助', st.feedback.helpful_no], ['平均評分', st.feedback.avg_rating ?? '無資料'])

  const sheets: Sheet[] = [
    { name: 'Analysis_Records', dateColumns: [3],
      headers: ['資料類型', '分析編號', '研究編號', '建立時間', '媒體類型', '來源數', '風險指數', '風險等級', '風險特徵', '分析狀態', '規則版本', '使用外部AI', '同意研究', '同意衍生使用'],
      rows: analyses.map((a) => [tag, a.analysis_id, a.research_id_nullable, a.created_at, a.media_type, a.source_count, a.risk_score_nullable, a.risk_level,
        parseJson<string[]>(a.risk_tags_json, []).join(','), a.analysis_status, a.rule_version, yn(a.external_ai_used), yn(a.consent_research), yn(a.consent_secondary_use)]) },
    { name: 'Source_Results', dateColumns: [9],
      headers: ['資料類型', '來源結果編號', '分析編號', '來源', '結果狀態', '比對類型', '來源標題', '來源網址', '查核回覆類型', '查核時間', '授權'],
      rows: sources.map((s) => [tag, s.source_result_id, s.analysis_id, s.provider, s.result_status, s.match_type, s.source_title, s.source_url, s.reply_type, s.checked_at, s.license_tag]) },
    { name: 'Research_Responses', dateColumns: [14],
      headers: ['資料類型', '作答編號', '研究編號', '實驗組別', '案例編號', '階段', '使用者判斷', '自述理由代碼', '是否正確', '錯誤類型', '作答時間(毫秒)', '輔助方式', '系統顯示特徵', '研究者人工分類', '建立時間'],
      rows: responses.map((r) => [tag, r.response_id, r.research_id, r.experiment_group, r.case_id, r.phase, r.user_decision, r.decision_reason_code, yn(r.correctness),
        r.error_type, r.response_time_ms, r.assistance_used, parseJson<string[]>(r.system_triggers_json, []).join(','), r.researcher_category, r.created_at]) },
    { name: 'Pattern_Dataset', dateColumns: [],
      headers: ['模式編號', '詐騙類型', '心理誘因', '風險指標', '防範方式', '驗證狀態', '證據來源', '來源授權', '人工審核狀態', '資料集版本'],
      rows: patterns.map((p) => [p.pattern_id, p.scam_category, p.psychological_trigger, p.risk_indicators, p.prevention_method, p.verification_status, p.evidence_source, p.source_license, p.human_review_status, p.dataset_version]) },
    { name: 'Consent_Records', dateColumns: [6, 7],
      headers: ['資料類型', '同意編號', '研究編號', '目的', '同意書版本', '狀態', '同意時間', '撤回時間'],
      rows: consents.map((c) => [tag, c.consent_id, c.research_id, c.purpose, c.consent_version, c.consent_status, c.consent_time, c.withdrawal_time]) },
    { name: 'Product_Survey', dateColumns: [11],
      headers: ['資料類型', '問卷編號', '身分', '產品', '價值評分(1-5)', '最需要功能', '教師願意課堂使用', '口頭興趣', '試用意願', '付款意願', '可接受價格', '建立時間'],
      rows: surveys.map((s) => [tag, s.survey_id, s.respondent_role, s.product, s.perceived_value, s.most_needed_feature, yn(s.teacher_would_use), yn(s.verbal_interest),
        yn(s.trial_intent), yn(s.payment_intent), s.acceptable_price_range, s.created_at]) },
    { name: 'Summary', dateColumns: [], headers: ['指標', '數值'], rows: summary },
  ]
  return { sheets, exported_at: new Date().toISOString(), label: demo ? '模擬資料（DEMO）' : '正式資料' }
}
