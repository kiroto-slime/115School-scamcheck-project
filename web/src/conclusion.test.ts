import { describe, expect, it } from 'vitest'
import { aiAgreement } from '../shared/conclusion'

describe('規則與 AI 判斷比較', () => {
  it('判斷 AI 較輕、較重、一致或無法比較', () => {
    expect(aiAgreement('高', '低')).toBe('ai_lower')
    expect(aiAgreement('中', '低')).toBe('ai_lower')
    expect(aiAgreement('低', '高')).toBe('ai_higher')
    expect(aiAgreement('資訊不足', '高')).toBe('ai_higher')
    expect(aiAgreement('高', '高')).toBe('agree')
    expect(aiAgreement('高', '無法判斷')).toBe('unknown')
    expect(aiAgreement('高', null)).toBe('unknown')
  })
})
