import { describe, expect, it } from 'vitest'
import { analyzeText, redactPii } from '../rules'

describe('RiskAnalyzer（與 v0.1 Python 版結果一致）', () => {
  it('同樣的訊息得到同樣的分數與特徵', () => {
    const a = analyzeText('您的帳戶涉嫌洗錢將被凍結，請立即提供簡訊驗證碼 https://bit.ly/x')
    expect(a.risk_level).toBe('高')
    expect(a.risk_score).toBe(81)
    expect(a.tags).toEqual(['urgency', 'credential_request', 'suspicious_link', 'emotional_pressure'])
    const b = analyzeText('【中華郵政】您的包裹地址錯誤，請於24小時內點擊連結 https://bit.ly/abc 更新資料並支付手續費，逾期將退回。')
    expect(b.risk_score).toBe(100)
    expect(b.tags).toEqual(['urgency', 'authority', 'financial_request', 'personal_data', 'suspicious_link'])
  })

  it('每個特徵都有說明、觸發依據、規則版本、人工驗證狀態', () => {
    for (const f of analyzeText('恭喜您中獎，限時領取，請加LINE並提供身分證').features) {
      expect(f.description && f.triggers.length && f.rule_version).toBeTruthy()
      expect(f.human_verified).toBe(false)
    }
  })

  it('沒有特徵時是「資訊不足」而不是安全；太短時沒有分數', () => {
    expect(analyzeText('明天下午三點社團開會，記得帶筆電喔').risk_level).toBe('資訊不足')
    expect(analyzeText('你好').risk_score).toBeNull()
  })

  it('網址只看網域類型，不記完整網址', () => {
    const f = analyzeText('請點 http://1.2.3.4/login 或 www.prize-tw.top 或 https://line.me/ti/p/abc 領獎').features.find((x) => x.feature_id === 'suspicious_link')!
    expect(f.triggers).toEqual(expect.arrayContaining(['以 IP 位址組成的網址', '較常被濫用的網域結尾（.top）', '導流至私人通訊軟體']))
    expect(f.triggers.join()).not.toContain('login')
  })

  it('Cofacts 查核為不實的相同內容會加分', () => {
    const base = analyzeText('請立即匯款到這個帳戶以免被凍結').risk_score!
    expect(analyzeText('請立即匯款到這個帳戶以免被凍結', [{ reply_type: 'RUMOR', match_type: 'exact' }]).risk_score).toBe(Math.min(base + 25, 100))
  })

  it('遮蔽個資（中英混排也有效）', () => {
    const out = redactPii('電話0912345678身分證A123456789信箱a.b@test.com帳號12345678901234')
    expect(out).toBe('電話[手機]身分證[身分證]信箱[Email]帳號[數字帳號]')
  })
})

describe('觸發依據的文字', () => {
  it('限時樣式顯示成一般人看得懂的說明，不顯示比對規則', () => {
    const r = analyzeText('請於24小時內完成付款，否則帳號停用')
    const urgency = r.features.find((f) => f.feature_id === 'urgency')!
    expect(urgency.triggers).toContain('出現限時字眼（例如「24 小時內」）')
    expect(JSON.stringify(r)).not.toContain('\\d')
  })
})
