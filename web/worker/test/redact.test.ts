import { describe, expect, it } from 'vitest'
import { redactPii, stripUrlQueries } from '../redact'

describe('redactPii', () => {
  it('遮蔽地址', () => {
    const out = redactPii('寄到台北市大安區復興南路一段100號3樓')
    expect(out).toContain('[地址]')
    expect(out).not.toContain('100號')
  })

  it('遮蔽明顯姓名並保留稱謂', () => {
    const a = redactPii('姓名：王小明')
    expect(a).toContain('[姓名]')
    expect(a).not.toContain('王小明')
    expect(redactPii('陳美玲小姐您好')).toBe('[姓名]小姐您好')
  })

  it('遮蔽市話與車牌', () => {
    expect(redactPii('02-23456789')).toContain('[電話]')
    expect(redactPii('ABC-1234')).toContain('[車牌]')
    expect(redactPii('1234-AB')).toContain('[車牌]')
  })

  it('保留原有遮蔽', () => {
    expect(redactPii('A123456789')).toBe('[身分證]')
    expect(redactPii('0912-345-678')).toBe('[手機]')
    expect(redactPii('a.b@test.com')).toBe('[Email]')
    expect(redactPii('1234567890123456')).toBe('[數字帳號]')
  })

  it('不誤遮一般詞', () => {
    for (const s of ['台北市政府', '王牌客服', '中華郵政', '民國113年', '請到超商繳費']) {
      expect(redactPii(s)).toBe(s)
    }
  })
})

describe('stripUrlQueries', () => {
  it('去掉網址參數', () => {
    expect(stripUrlQueries('點 https://a.cc/pay?id=123#x 繳費')).toBe('點 https://a.cc/pay 繳費')
  })
})
