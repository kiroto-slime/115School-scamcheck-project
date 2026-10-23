import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { purgeExpired } from '../analysis'
import { DEFAULT_SETTINGS } from '../settings'
import { adminHeaders, call, count, SCAM } from './helpers'

async function fullFlow() {
  const s = (await call('/api/research/start', { body: { consent_research: true, consent_secondary: false } })).json
  const { research_id, pre_case, post_case } = s
  expect(pre_case.case_id).not.toBe(post_case.case_id)
  expect(pre_case.verified_label).toBeUndefined() // 作答前看不到答案
  const base = { research_id, decision_reason_code: 'link', response_time_ms: 5000 }
  expect((await call('/api/research/answer', { body: { ...base, case_id: pre_case.case_id, phase: 'pre', user_decision: 'scam' } })).status).toBe(200)
  expect((await call('/api/research/answer', { body: { ...base, case_id: post_case.case_id, phase: 'post_initial', user_decision: 'legit' } })).status).toBe(200)
  const help = await call('/api/research/assistance', { body: { research_id } })
  expect(['general_tips', 'system_evidence']).toContain(help.json.type)
  const last = await call('/api/research/answer', { body: { ...base, case_id: post_case.case_id, phase: 'post_assisted', user_decision: 'scam' } })
  expect(last.json.reveal).toHaveLength(2)
  return research_id as string
}

describe('研究流程', () => {
  it('拒絕研究同意：不建立紀錄，查核照常', async () => {
    const r = await call('/api/research/start', { body: { consent_research: false } })
    expect(r.status).toBe(400)
    expect(r.json.detail).toContain('基本查核服務不受影響')
    expect(await count('research_participants')).toBe(0)
    expect(await count('consent_records')).toBe(0)
    expect((await call('/api/analyze/text', { body: { text: '請立即匯款到這個帳戶' } })).status).toBe(200)
  })

  it('依序作答、不可重複', async () => {
    const s = (await call('/api/research/start', { body: { consent_research: true } })).json
    const base = { research_id: s.research_id, decision_reason_code: 'link', response_time_ms: 100 }
    expect((await call('/api/research/answer', { body: { ...base, case_id: s.post_case.case_id, phase: 'post_initial', user_decision: 'scam' } })).status).toBe(409)
    const ok = { ...base, case_id: s.pre_case.case_id, phase: 'pre', user_decision: 'scam' }
    expect((await call('/api/research/answer', { body: ok })).status).toBe(200)
    expect((await call('/api/research/answer', { body: ok })).status).toBe(409)
  })

  it('撤回同意後停止蒐集；刪除研究資料', async () => {
    const rid = await fullFlow()
    expect(await count('research_responses')).toBe(3)
    expect((await call('/api/consent', { body: { research_id: rid, purpose: 'research', status: 'withdrawn' } })).status).toBe(200)
    expect((await call('/api/research/assistance', { body: { research_id: rid } })).status).toBe(404)
    const d = await call('/api/privacy/delete', { body: { research_id: rid } })
    expect(d.json.deleted.research_responses).toBe(3)
    expect(await count('research_responses')).toBe(0)
    expect(await count('consent_records', `research_id = '${rid}' AND consent_status = 'granted'`)).toBe(0)
  })

  it('同意研究的查核紀錄會連結研究編號；撤回後不再連結', async () => {
    const rid = (await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })).json.research_id
    expect((await call('/api/analyze/text', { body: { text: '請立即匯款到這個帳戶', research_id: rid } })).json.consent_research).toBe(true)
    await call('/api/consent', { body: { research_id: rid, purpose: 'research', status: 'withdrawn' } })
    expect((await call('/api/analyze/text', { body: { text: '請立即匯款到這個帳戶', research_id: rid } })).json.consent_research).toBe(false)
  })

  it('研究結束後停止蒐集', async () => {
    const h = await adminHeaders()
    await call('/api/admin/settings', { method: 'PUT', body: { research_collection_enabled: false }, headers: h })
    expect((await call('/api/research/start', { body: { consent_research: true } })).status).toBe(403)
  })
})

describe('管理員', () => {
  it('遊戲題庫獨立管理，只有發布題目可抽取，作答不寫入研究資料', async () => {
    expect((await call('/api/game/question')).status).toBe(404)
    const body = { question: '教學練習：陌生人要求提供驗證碼，應該怎麼做？', options: ['提供驗證碼', '停止提供並查證'], correct_index: 1, explanation: '驗證碼不能交給他人。', published: false }
    expect((await call('/api/admin/game-questions', { body })).status).toBe(401)
    const h = await adminHeaders()
    expect((await call('/api/admin/game-questions', { body: { ...body, correct_index: 3 }, headers: h })).status).toBe(422)
    const created = await call('/api/admin/game-questions', { body, headers: h })
    expect(created.status).toBe(201)
    expect((await call('/api/game/question')).status).toBe(404)
    const id = created.json.id
    expect((await call(`/api/admin/game-questions/${id}`, { method: 'PUT', body: { ...body, published: true }, headers: h })).status).toBe(200)
    const question = (await call('/api/game/question')).json
    expect(question).toMatchObject({ id, question: body.question, options: body.options, correct_index: 1, explanation: body.explanation })
    expect(await count('research_responses')).toBe(0)
    expect(await count('research_participants')).toBe(0)
    expect((await call('/api/admin/game-questions', { headers: h })).json).toHaveLength(1)
  })
  it('未登入不能匯出或看統計；密碼錯誤被拒', async () => {
    expect((await call('/api/admin/export-data')).status).toBe(401)
    expect((await call('/api/admin/statistics', { headers: { Authorization: 'Bearer forged.token' } })).status).toBe(401)
    expect((await call('/api/admin/login', { body: { password: 'wrong' } })).status).toBe(401)
  })

  it('沒設定密碼時管理功能關閉', async () => {
    expect((await call('/api/admin/login', { body: { password: 'x' }, envOverride: { ADMIN_PASSWORD: undefined } })).status).toBe(503)
  })

  it('空資料庫的統計與匯出：只有欄位，不產生假資料', async () => {
    const h = await adminHeaders()
    const st = (await call('/api/admin/statistics', { headers: h })).json
    expect(st.valid_samples).toBe(0)
    expect(st.judgement.accuracy).toBeNull()
    expect(st.risk_tag_counts).toEqual({})
    const ex = (await call('/api/admin/export-data', { headers: h })).json
    expect(ex.sheets.map((s: { name: string }) => s.name)).toEqual(['查核摘要', '統計總覽', '分析紀錄', '查核來源', '研究作答', '風險模式資料集', '同意紀錄', '產品需求問卷', '匯出說明'])
    expect(ex.sheets.find((s: { name: string }) => s.name === '研究作答').rows).toEqual([])
    const summary = Object.fromEntries(ex.sheets.find((s: { name: string }) => s.name === '統計總覽').rows)
    expect(summary['有效樣本數（完成前後測）']).toBe(0)
    expect(summary['判斷正確率']).toBe('無資料')
  })

  it('匯出資料：完成一位參與者後有一筆有效樣本，標示 DEMO', async () => {
    await fullFlow()
    const h = await adminHeaders()
    const ex = (await call('/api/admin/export-data?dataset=demo', { headers: h })).json
    const responses = ex.sheets.find((s: { name: string }) => s.name === '研究作答')
    expect(responses.rows).toHaveLength(3)
    expect(responses.rows[0][0]).toBe('模擬研究（DEMO）')
    expect(responses.rows[0][5]).toBe('前測（無輔助）')
    expect(responses.rows[0][6]).toBe('可能是詐騙')
    expect(Object.fromEntries(ex.sheets.find((s: { name: string }) => s.name === '統計總覽').rows)['有效樣本數（完成前後測）']).toBe(1)
  })

  it('匯出既有摘要、分開規則與 AI 判斷、原因及建議；再次遮蔽且不匯出未同意者', async () => {
    const rid = (await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })).json.research_id
    const a = (await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })).json
    const saved = { ...a, cofacts: { status: 'found', matches: [{ reply_type: 'RUMOR', match_type: 'similar' }] }, ai: { status: 'ok', summary: '冒充客服索取驗證碼，聯絡 0912-345-678 或 a@example.com，前往 https://private.example/token。', risk_level: '低', risk_points: ['索取帳密'], advice: ['改用官方電話確認'] } }
    await env.DB.prepare('UPDATE analysis_records SET result_json = ? WHERE analysis_id = ?').bind(JSON.stringify(saved), a.analysis_id).run()
    const other = (await call('/api/analyze/text', { body: { text: SCAM } })).json
    const h = await adminHeaders()
    const ex = (await call('/api/admin/export-data?dataset=formal', { headers: h })).json
    const sheet = ex.sheets.find((s: { name: string }) => s.name === '查核摘要')
    const row = Object.fromEntries(sheet.headers.map((k: string, i: number) => [k, sheet.rows[0][i]]))
    expect(sheet.rows).toHaveLength(1)
    expect(row['發生什麼']).toContain('冒充客服索取驗證碼')
    expect(row['多嚴重']).toContain('規則：高')
    expect(row['多嚴重']).toContain('很可能是詐騙，請不要照訊息的指示做')
    expect(row['多嚴重']).toContain('AI：低')
    expect(row['有哪些問題']).toContain('要求付款或匯款')
    expect(row['有哪些問題']).toContain('Cofacts 有相同或相似的訊息被查核為不實')
    expect(row['有哪些問題']).toContain('AI：索取帳密')
    expect(row['建議怎麼處理']).toContain('不要依對方指示匯款')
    expect(row['建議怎麼處理']).toContain('AI：改用官方電話確認')
    expect(row['各來源查核結果']).toContain('找到相關資料')
    expect(row['教材使用提醒']).toContain('未同意衍生使用')
    expect(JSON.stringify(ex)).not.toMatch(/0912-345-678|a@example.com|private\.example/)
    expect(JSON.stringify(ex)).not.toContain(other.analysis_id)
  })

  it('沒有摘要或歷史結果欄位損壞時不編故事，保留舊分類且未知代碼可追溯', async () => {
    const rid = (await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })).json.research_id
    const a = (await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })).json
    await env.DB.prepare("UPDATE analysis_records SET is_demo = 1, result_json = ?, risk_tags_json = ? WHERE analysis_id = ?").bind('{"ai":{"status":"error","summary":"錯誤資訊不能當事件"},"features":"壞資料","basis":{},"safe_actions":null}', '["future_tag"]', a.analysis_id).run()
    const h = await adminHeaders()
    const ex = (await call('/api/admin/export-data?dataset=demo', { headers: h })).json
    const sheet = ex.sheets.find((s: { name: string }) => s.name === '查核摘要')
    expect(sheet.rows[0][0]).toContain('未保存事件敘述')
    expect(sheet.rows[0][0]).not.toContain('錯誤資訊不能當事件')
    expect(JSON.stringify(sheet.rows[0])).toContain('來源待確認')
    expect(JSON.stringify(ex)).toContain('未定義代碼：future_tag')
    expect(await env.DB.prepare('SELECT is_demo FROM analysis_records WHERE analysis_id = ?').bind(a.analysis_id).first()).toMatchObject({ is_demo: 1 })
    await env.DB.prepare("UPDATE analysis_records SET result_json = 'null', risk_tags_json = 'null' WHERE analysis_id = ?").bind(a.analysis_id).run()
    expect((await call('/api/admin/export-data?dataset=demo', { headers: h })).status).toBe(200)
  })

  it('一般使用者查核與回饋獨立分類，前後測維持 DEMO，同意仍可對照', async () => {
    const rid = (await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })).json.research_id
    const a = (await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })).json
    const row = await env.DB.prepare('SELECT is_demo, result_json FROM analysis_records WHERE analysis_id = ?').bind(a.analysis_id).first<{ is_demo: number; result_json: string }>()
    expect(row!.is_demo).toBe(0)
    expect(JSON.parse(row!.result_json).record_origin).toBe('user_submission')
    const study = (await call('/api/research/start', { body: { consent_research: true } })).json
    expect(study.is_demo).toBe(true)
    await call('/api/feedback', { body: { analysis_id: a.analysis_id, research_id: rid, helpful: true } })
    expect(await env.DB.prepare('SELECT is_demo FROM feedback_records WHERE analysis_id = ?').bind(a.analysis_id).first()).toMatchObject({ is_demo: 0 })
    const h = await adminHeaders()
    const ex = (await call('/api/admin/export-data?dataset=formal', { headers: h })).json
    expect(ex.sheets.find((s: { name: string }) => s.name === '同意紀錄').rows.some((r: unknown[]) => r[2] === rid)).toBe(true)
    expect(ex.sheets.find((s: { name: string }) => s.name === '研究作答').rows).toEqual([])
    expect((await call('/api/admin/statistics?dataset=formal', { headers: h })).json.analysis_records).toBe(1)
    expect((await call('/api/health')).json.modes.research_mode).toBe('simulation')
  })

  it('清除 DEMO 遇到來源未確認的舊查核先拒絕，合成與使用者資料均不誤刪', async () => {
    const a = (await call('/api/analyze/text', { body: { text: SCAM } })).json
    await env.DB.prepare("UPDATE analysis_records SET is_demo = 1, result_json = '{}' WHERE analysis_id = ?").bind(a.analysis_id).run()
    const h = await adminHeaders()
    await call('/api/admin/demo/seed', { method: 'POST', headers: h })
    const before = await count('analysis_records')
    const cleared = await call('/api/admin/demo/clear', { method: 'POST', headers: h })
    expect(cleared.status).toBe(409)
    expect(cleared.json.detail).toContain('來源待確認')
    expect(await count('analysis_records')).toBe(before)
    // JSON 數字 1 不能冒充 seedDemo 寫入的布林 true。
    await env.DB.prepare('UPDATE analysis_records SET result_json = ? WHERE analysis_id = ?').bind('{"demo":1}', a.analysis_id).run()
    expect((await call('/api/admin/demo/clear', { method: 'POST', headers: h })).status).toBe(409)
    expect(await count('analysis_records')).toBe(before)
  })

  it('清除 DEMO 不可刪掉新使用者查核所連結的原 DEMO 同意', async () => {
    const rid = (await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })).json.research_id
    await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })
    const h = await adminHeaders()
    await call('/api/admin/demo/seed', { method: 'POST', headers: h })
    expect((await call('/api/admin/demo/clear', { method: 'POST', headers: h })).status).toBe(409)
    expect(await count('consent_records', `research_id = '${rid}' AND consent_status = 'granted'`)).toBe(1)
  })

  it('DEMO 與正式資料隔離；清除測試資料只刪 DEMO', async () => {
    const h = await adminHeaders()
    expect((await call('/api/admin/demo/seed', { method: 'POST', headers: h })).json.participants).toBe(12)
    expect((await call('/api/admin/statistics?dataset=demo', { headers: h })).json.participants).toBe(12)
    expect((await call('/api/admin/statistics?dataset=formal', { headers: h })).json.participants).toBe(0)
    // 正式模式只用已核准案例
    await call('/api/admin/settings', { method: 'PUT', body: { research_mode: 'formal' }, headers: h })
    expect((await call('/api/research/start', { body: { consent_research: true } })).status).toBe(503)
    for (const c of (await call('/api/admin/cases', { headers: h })).json) await call(`/api/admin/cases/${c.case_id}`, { method: 'PATCH', body: { status: 'approved' }, headers: h })
    expect((await call('/api/research/start', { body: { consent_research: true } })).json.is_demo).toBe(false)
    expect((await call('/api/admin/statistics?dataset=formal', { headers: h })).json.participants).toBe(1)
    await call('/api/admin/demo/clear', { method: 'POST', headers: h })
    expect((await call('/api/admin/statistics?dataset=demo', { headers: h })).json.participants).toBe(0)
    expect((await call('/api/admin/statistics?dataset=formal', { headers: h })).json.participants).toBe(1)
  })

  it('系統設定可修改並驗證輸入', async () => {
    const h = await adminHeaders()
    expect((await call('/api/admin/settings', { method: 'PUT', body: { gemini_models: [{ id: 'gemini-9-flash', daily: 20, rpm: 5, media: true }], gemini_daily_limit: 50 }, headers: h })).status).toBe(200)
    expect((await call('/api/admin/settings', { headers: h })).json).toMatchObject({ gemini_models: [{ id: 'gemini-9-flash' }], gemini_daily_limit: 50 })
    expect((await call('/api/admin/settings', { method: 'PUT', body: { gemini_models: [{ id: 'Bad Model!', daily: 1, rpm: 1, media: true }] }, headers: h })).status).toBe(422)
  })

  it('回饋與商業問卷：意願與實際行為分開', async () => {
    const aid = (await call('/api/analyze/text', { body: { text: '請立即匯款到這個帳戶' } })).json.analysis_id
    expect((await call('/api/feedback', { body: { analysis_id: aid, helpful: true, rating: 4 } })).status).toBe(200)
    expect((await call('/api/feedback', { body: { analysis_id: '0'.repeat(32) } })).status).toBe(404)
    // 只在查核頁勾了「B. 同意研究」（沒做研究測驗）的人，也能用自己的研究編號送評價
    const consent = await call('/api/consent', { body: { purpose: 'research', status: 'granted' } })
    const rid = consent.json.research_id
    const checked = await call('/api/analyze/text', { body: { text: SCAM, research_id: rid } })
    expect(checked.json.consent_research).toBe(true)
    expect((await call('/api/feedback', { body: { analysis_id: checked.json.analysis_id, research_id: rid, helpful: true } })).status).toBe(200)
    // 不存在的研究編號仍然拒絕
    expect((await call('/api/feedback', { body: { analysis_id: checked.json.analysis_id, research_id: 'RZZZZZZZZZZZZ', helpful: true } })).status).toBe(404)
    const survey = { respondent_role: 'teacher', product: 'B', perceived_value: 4, most_needed_feature: 'teaching_material', teacher_would_use: true,
      verbal_interest: true, trial_intent: true, payment_intent: false, acceptable_price_range: '1-99' }
    expect((await call('/api/survey', { body: survey })).status).toBe(200)
    const h = await adminHeaders()
    await call('/api/admin/business-events', { body: { product: 'B', event_type: 'actual_trial', count: 2 }, headers: h })
    const b = (await call('/api/admin/statistics?dataset=demo', { headers: h })).json.business.B
    expect(b).toMatchObject({ trial_intent: 1, actual_trial: 2, actual_payment: 0 })
  })

  it('完整備份不含原始投稿', async () => {
    await call('/api/analyze/text', { body: { text: SCAM } })
    const h = await adminHeaders()
    const r = await call('/api/admin/backup.json', { headers: h })
    expect(r.status).toBe(200)
    expect(Object.keys(r.json.tables)).toContain('research_responses')
    expect(JSON.stringify(r.json)).not.toContain('包裹地址錯誤')
  })
})

describe('保存期限', () => {
  it('過期的暫存紀錄會被清除', async () => {
    const aid = (await call('/api/analyze/text', { body: { text: SCAM } })).json.analysis_id
    await env.DB.prepare("UPDATE analysis_records SET expires_at = '2000-01-01T00:00:00Z' WHERE analysis_id = ?").bind(aid).run()
    expect((await call(`/api/analysis/${aid}`)).status).toBe(404)
    expect(await purgeExpired(env.DB, DEFAULT_SETTINGS)).toBe(1)
    expect(await count('analysis_records', `analysis_id = '${aid}'`)).toBe(0)
  })
})
