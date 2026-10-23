/** 研究統計與匯出資料。只計算資料庫中的實際紀錄；沒有資料時回傳 0 / null，不產生假數據。 */
import { parseJson } from './util'
import { ASSIST_ZH, CATEGORY_ZH, CONSENT_ZH, DECISION_ZH, ERROR_ZH, exportText, FEATURE_ZH, MATCH_ZH, MEDIA_ZH, NEED_ZH, originLabel, PHASE_ZH, PRODUCT_ZH, PROVIDER_ZH, readableAnalysis, REASON_ZH, REPLY_ZH, REVIEW_ZH, ROLE_ZH, savedResult, STATUS_ZH, stringsOf, yesNo, zh } from './export-format'

const rate = (num: number, den: number) => (den ? Math.round((num / den) * 10000) / 10000 : null)

interface Resp { research_id: string; experiment_group: string; phase: string; user_decision: string; correctness: number | null; error_type: string | null }

export async function computeStatistics(db: D1Database, demo: boolean) {
  const d = demo ? 1 : 0
  const all = <T>(sql: string) => db.prepare(sql).bind(d).all<T>().then((r) => r.results)
  const [analyses, sources, responses, participants, feedback, surveys, events] = await Promise.all([
    all<{ analysis_id: string; risk_tags_json: string }>('SELECT analysis_id, risk_tags_json FROM analysis_records WHERE is_demo = ? AND consent_research = 1'),
    all<{ analysis_id: string; result_status: string }>(`SELECT s.analysis_id, s.result_status FROM source_results s JOIN analysis_records a ON a.analysis_id = s.analysis_id WHERE a.is_demo = ? AND a.consent_research = 1 AND s.provider = 'cofacts'`),
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
  for (const a of analyses) for (const t of stringsOf(parseJson<unknown>(a.risk_tags_json, []))) tags.set(t, (tags.get(t) ?? 0) + 1)
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
  const tag = demo ? '模擬研究（DEMO）' : '正式研究'
  const q = <T>(sql: string, bind = true) => (bind ? db.prepare(sql).bind(d) : db.prepare(sql)).all<T>().then((r) => r.results)
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const analyses = await q<any>('SELECT * FROM analysis_records WHERE is_demo = ? AND consent_research = 1 ORDER BY created_at')
  const sources = await q<any>('SELECT s.* FROM source_results s JOIN analysis_records a ON a.analysis_id = s.analysis_id WHERE a.is_demo = ? AND a.consent_research = 1 ORDER BY s.checked_at')
  const responses = await q<any>('SELECT * FROM research_responses WHERE is_demo = ? ORDER BY created_at')
  const patterns = await q<any>('SELECT * FROM pattern_dataset', false)
  // 一般查核的同意可能在模擬研究模式下取得；以所屬查核連結提供對照，不重標同意紀錄。
  const consents = await db.prepare(`SELECT c.* FROM consent_records c WHERE c.is_demo = ? OR EXISTS
    (SELECT 1 FROM analysis_records a WHERE a.research_id_nullable = c.research_id AND a.is_demo = ? AND a.consent_research = 1)
    ORDER BY c.consent_time`).bind(d, d).all<any>().then((r) => r.results)
  const surveys = await q<any>('SELECT * FROM product_survey_responses WHERE is_demo = ? ORDER BY created_at')
  const yn = yesNo

  const st = await computeStatistics(db, demo)
  const analysisOrigins = new Map(analyses.map((a) => [a.analysis_id, originLabel(savedResult(a.result_json), !!a.is_demo)]))
  const pct = (v: number | null) => (v === null ? '無資料' : `${(v * 100).toFixed(1)}%`)
  const summary: (string | number)[][] = [
    ['資料類型', demo ? 'DEMO／舊查核待確認' : '使用者查核／正式研究'],
    ['匯出時間(UTC)', new Date().toISOString()],
    ['說明', '查核只匯出已同意研究的紀錄；原文、圖片與影片不匯出。自由文字已遮蔽常見個資，仍須人工檢查。'],
    ['分類說明', '一般使用者查核與前後測研究模式分開。舊紀錄維持原分類，DEMO 不代表全部為合成資料；請看每筆來源。'],
    ['分析紀錄數', st.analysis_records], ['研究參與者數', st.participants], ['有效樣本數（完成前後測）', st.valid_samples],
  ]
  for (const [g, v] of Object.entries(st.groups) as [string, any][]) {
    summary.push([`${g} 組人數`, v.participants], [`${g} 組有效樣本`, v.valid_samples], [`${g} 組前測正確率`, pct(v.pre_accuracy)],
      [`${g} 組後測正確率`, pct(v.post_accuracy)], [`${g} 組前後測差異`, pct(v.accuracy_change)], [`${g} 組看過輔助後改變決策人數`, v.decision_changed_after_assist])
  }
  summary.push(['查核嘗試次數', st.source_check.attempted], ['查核成功率', pct(st.source_check.success_rate)], ['判斷作答數', st.judgement.answers],
    ['判斷正確率', pct(st.judgement.accuracy)], ['誤判（正常判為詐騙）', st.judgement.false_positive], ['漏判（詐騙判為正常）', st.judgement.false_negative],
    ['無法判斷', st.judgement.unsure])
  const tagRows = Object.entries(st.risk_tag_counts).map(([k, v]) => [`風險特徵次數：${zh(k, FEATURE_ZH)}`, v])
  summary.push(...(tagRows.length ? tagRows : [['風險特徵次數', '無資料']]))
  summary.push(['回饋數', st.feedback.count], ['回饋：有幫助', st.feedback.helpful_yes], ['回饋：沒幫助', st.feedback.helpful_no], ['平均評分', st.feedback.avg_rating ?? '無資料'])

  const sheets: Sheet[] = [
    { name: '查核摘要', dateColumns: [6],
      headers: ['發生什麼', '多嚴重', '有哪些問題', '建議怎麼處理', '各來源查核結果', '分析編號', '查核時間(UTC)', '資料來源', '媒體類型', '摘要依據', '教材使用提醒'],
      rows: analyses.map(readableAnalysis) },
    { name: '統計總覽', dateColumns: [], headers: ['指標', '數值'], rows: summary },
    { name: '分析紀錄', dateColumns: [3],
      headers: ['資料來源', '分析編號', '研究編號', '建立時間(UTC)', '媒體類型', 'Cofacts比對篇數', '規則風險指數', '規則風險等級', '風險特徵', '分析狀態', '規則版本', '使用外部AI', '同意研究', '同意衍生使用', '風險特徵原始代碼', '分析狀態原始代碼', '完整規則依據'],
      rows: analyses.map((a) => [originLabel(savedResult(a.result_json), !!a.is_demo), a.analysis_id, a.research_id_nullable, a.created_at, zh(a.media_type, MEDIA_ZH), a.source_count, a.risk_score_nullable, a.risk_level,
        stringsOf(parseJson<unknown>(a.risk_tags_json, [])).map((s) => zh(s, FEATURE_ZH)).join('、'), zh(a.analysis_status, STATUS_ZH), a.rule_version, yn(a.external_ai_used), yn(a.consent_research), yn(a.consent_secondary_use), stringsOf(parseJson<unknown>(a.risk_tags_json, [])).join(','), a.analysis_status, stringsOf(savedResult(a.result_json).basis).map(exportText).join('\n')]) },
    { name: '查核來源', dateColumns: [9],
      headers: ['資料類型', '來源結果編號', '分析編號', '來源', '結果狀態', '比對類型', '來源標題', '來源網址', '查核回覆類型', '查核時間', '授權'],
      rows: sources.map((s) => [analysisOrigins.get(s.analysis_id) ?? '來源待確認', s.source_result_id, s.analysis_id, zh(s.provider, PROVIDER_ZH), zh(s.result_status, STATUS_ZH), zh(s.match_type, MATCH_ZH), exportText(s.source_title), s.source_url, zh(s.reply_type, REPLY_ZH), s.checked_at, s.license_tag]) },
    { name: '研究作答', dateColumns: [14],
      headers: ['資料類型', '作答編號', '研究編號', '實驗組別', '案例編號', '階段', '使用者判斷', '自述理由代碼', '是否正確', '錯誤類型', '作答時間(毫秒)', '輔助方式', '系統顯示特徵', '研究者人工分類', '建立時間'],
      rows: responses.map((r) => [tag, r.response_id, r.research_id, `${r.experiment_group}組（${zh(r.experiment_group === 'A' ? 'general_tips' : r.experiment_group === 'B' ? 'system_evidence' : r.experiment_group, ASSIST_ZH)}）`, r.case_id, zh(r.phase, PHASE_ZH), zh(r.user_decision, DECISION_ZH), zh(r.decision_reason_code, REASON_ZH), yn(r.correctness),
        zh(r.error_type, ERROR_ZH, '無錯誤或未判定'), r.response_time_ms, zh(r.assistance_used, ASSIST_ZH), stringsOf(parseJson<unknown>(r.system_triggers_json, [])).map((s) => zh(s, FEATURE_ZH)).join('、'), zh(r.researcher_category, CATEGORY_ZH, '未分類'), r.created_at]) },
    { name: '風險模式資料集', dateColumns: [],
      headers: ['模式編號', '詐騙類型', '心理誘因', '風險指標', '防範方式', '驗證狀態', '證據來源', '來源授權', '人工審核狀態', '資料集版本'],
      rows: patterns.map((p) => [p.pattern_id, p.scam_category, p.psychological_trigger, p.risk_indicators, p.prevention_method, zh(p.verification_status, REVIEW_ZH), p.evidence_source, p.source_license, zh(p.human_review_status, REVIEW_ZH), p.dataset_version]) },
    { name: '同意紀錄', dateColumns: [6, 7],
      headers: ['資料類型', '同意編號', '研究編號', '目的', '同意書版本', '狀態', '同意時間', '撤回時間'],
      rows: consents.map((c) => [c.is_demo ? '原分類 DEMO（可能連結使用者查核）' : '原分類正式', c.consent_id, c.research_id, zh(c.purpose, CONSENT_ZH), c.consent_version, zh(c.consent_status, CONSENT_ZH), c.consent_time, c.withdrawal_time]) },
    { name: '產品需求問卷', dateColumns: [11],
      headers: ['資料類型', '問卷編號', '身分', '產品', '價值評分(1-5)', '最需要功能', '教師願意課堂使用', '口頭興趣', '試用意願', '付款意願', '可接受價格', '建立時間'],
      rows: surveys.map((s) => [tag, s.survey_id, zh(s.respondent_role, ROLE_ZH), zh(s.product, PRODUCT_ZH), s.perceived_value, zh(s.most_needed_feature, NEED_ZH), yn(s.teacher_would_use), yn(s.verbal_interest),
        yn(s.trial_intent), yn(s.payment_intent), s.acceptable_price_range === 'free_only' ? '只接受免費' : s.acceptable_price_range, s.created_at]) },
    { name: '匯出說明', dateColumns: [], headers: ['項目', '說明'], rows: [
      ['閱讀順序', '先看查核摘要的發生什麼、多嚴重、有哪些問題、建議怎麼處理，再看查核來源與統計總覽。'],
      ['事件敘述', '僅使用當次保存的 AI 摘要；沒有摘要就明示缺少，不還原原文、不編造故事、不再次呼叫 AI。'],
      ['風險與正確率', '規則風險指數不是詐騙機率或司法認定。AI 判斷另外列出；查核紀錄數不能當成前後測有效樣本數或準確率。'],
      ['資料分類', '使用者查核與前後測模式分開；DEMO 舊紀錄可能包含真實投稿，來源待確認，未自動重標或搬移。'],
      ['個資與授權', '摘要及原因已再次遮蔽常見手機、Email、身分證、長數字帳號及連結；人名、地址、特殊情節仍可能殘留，公開或教學使用前須人工審查與確認授權。'],
      ['教材範圍', '未同意衍生使用的紀錄不直接作衍生教材；已同意也不代表自動取得公開任何個別紀錄的許可。'],
      ['查無資料', '來源查無資料、未列名單或未發現威脅，都不代表安全。'],
      ['時間', '日期欄位使用 UTC，臺灣時間為 UTC 加 8 小時。'],
      ['代碼與布林', '常用代碼已轉為中文，是／否表示原有布林值；未知代碼保留「未定義代碼」供追溯，不猜測意思。'],
      ['資料缺漏', '舊紀錄可能沒有摘要、原因或建議，缺少時清楚標示；完整編號與原始特徵代碼保留於分析紀錄供對照。'],
    ] },
  ]
  return { sheets, exported_at: new Date().toISOString(), label: demo ? 'DEMO／舊查核待確認' : '使用者查核／正式研究' }
}
