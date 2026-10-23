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
    expect(ex.sheets.map((s: { name: string }) => s.name)).toEqual(['Analysis_Records', 'Source_Results', 'Research_Responses', 'Pattern_Dataset', 'Consent_Records', 'Product_Survey', 'Summary'])
    expect(ex.sheets[2].rows).toEqual([])
    const summary = Object.fromEntries(ex.sheets[6].rows)
    expect(summary['有效樣本數（完成前後測）']).toBe(0)
    expect(summary['判斷正確率']).toBe('無資料')
  })

  it('匯出資料：完成一位參與者後有一筆有效樣本，標示 DEMO', async () => {
    await fullFlow()
    const h = await adminHeaders()
    const ex = (await call('/api/admin/export-data?dataset=demo', { headers: h })).json
    expect(ex.sheets[2].rows).toHaveLength(3)
    expect(ex.sheets[2].rows[0][0]).toBe('DEMO')
    expect(Object.fromEntries(ex.sheets[6].rows)['有效樣本數（完成前後測）']).toBe(1)
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
