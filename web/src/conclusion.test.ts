import { describe, expect, it } from 'vitest'
import { finalRisk } from '../shared/conclusion'

const ai = (risk_level: string | null, status = 'ok') => ({ status, risk_level })

describe('綜合風險等級（取各來源最高）', () => {
  it('Gemini 判高、規則資訊不足：綜合為高，依據 Gemini', () => {
    const r = finalRisk({ risk_level: '資訊不足', ai: ai('高') })
    expect(r.level).toBe('高')
    expect(r.sources).toEqual(['Gemini'])
  })

  it('規則較高時以規則為準，Gemini 判低不會拉低', () => {
    const r = finalRisk({ risk_level: '高', ai: ai('低') })
    expect(r.level).toBe('高')
    expect(r.sources).toEqual(['關鍵字規則'])
  })

  it('規則資訊不足、Gemini 判低：顯示低', () => {
    expect(finalRisk({ risk_level: '資訊不足', ai: ai('低') }).level).toBe('低')
  })

  it('同等級時列出所有依據', () => {
    expect(finalRisk({ risk_level: '中', ai: ai('中') }).sources).toEqual(['關鍵字規則', 'Gemini'])
  })

  it('Gemini 出錯或無法判斷時不列入', () => {
    expect(finalRisk({ risk_level: '資訊不足', ai: ai('高', 'error') }).level).toBe('資訊不足')
    expect(finalRisk({ risk_level: '資訊不足', ai: ai('無法判斷') }).level).toBe('資訊不足')
    expect(finalRisk({ risk_level: '資訊不足' }).sources).toEqual([])
  })

  it('165 名單或 Google 安全瀏覽判定為高；VirusTotal、Cofacts 不實為中', () => {
    expect(finalRisk({ risk_level: '低', url_checks: { tw165: { status: 'listed' } } })).toMatchObject({ level: '高', sources: ['165 涉詐網站名單'] })
    expect(finalRisk({ risk_level: '低', url_checks: { safe_browsing: { status: 'found' } } }).level).toBe('高')
    expect(finalRisk({ risk_level: '低', url_checks: { virustotal: { status: 'found' } } }).level).toBe('中')
    expect(finalRisk({ risk_level: '資訊不足', cofacts: { matches: [{ reply_type: 'RUMOR' }] } })).toMatchObject({ level: '中', sources: ['Cofacts 查核'] })
  })

  it('列出各來源的判斷供結論卡顯示', () => {
    const r = finalRisk({ risk_level: '資訊不足', ai: ai('高') })
    expect(r.parts).toEqual([{ name: '關鍵字規則', level: '資訊不足' }, { name: 'Gemini', level: '高' }])
  })
})
