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

  it('姓名規則：前面有其他字也能遮，停用詞不遮', () => {
    expect(redactPii('您好王小明先生')).toBe('您好[姓名]先生')
    expect(redactPii('親愛的陳美玲小姐')).toBe('親愛的[姓名]小姐')
    expect(redactPii('我是老師')).toBe('我是老師')
    expect(redactPii('各位同學好')).toBe('各位同學好')
  })

  it('地址前後文字不被吃掉', () => {
    const out = redactPii('請寄到台北市大安區復興南路一段100號3樓謝謝')
    expect(out.startsWith('請寄到')).toBe(true)
    expect(out.endsWith('謝謝')).toBe(true)
    expect(out).toContain('[地址]')
    expect(redactPii('復興南路很好走')).toBe('復興南路很好走')
  })

  it('電話邊界行為', () => {
    expect(redactPii('0912345678')).toBe('[手機]')
    expect(redactPii('0123456789')).toBe('[電話]')
  })

  it('遮蔽分段與括號區碼的市話', () => {
    expect(redactPii('02-2345-6789')).toBe('[電話]')
    expect(redactPii('(04)2234-5678')).toBe('[電話]')
    expect(redactPii('(02) 2345 6789')).toBe('[電話]')
    expect(redactPii('客服專線02-2345-6789請來電')).toBe('客服專線[電話]請來電')
    expect(redactPii('電話：(04)2234-5678 地址')).toBe('電話：[電話] 地址')
  })

  it('遮蔽 +886 國際格式手機', () => {
    expect(redactPii('+886-912-345-678')).toBe('[手機]')
    expect(redactPii('+886 912 345 678')).toBe('[手機]')
    expect(redactPii('+886912345678')).toBe('[手機]')
    expect(redactPii('客服 +886 912 345 678 聯絡')).toBe('客服 [手機] 聯絡')
  })

  it('遮蔽以「-」或空白分段的帳號', () => {
    expect(redactPii('1234-5678-9012-3456')).toBe('[數字帳號]')
    expect(redactPii('822 1234 5678 9012')).toBe('[數字帳號]')
    expect(redactPii('入金帳戶 822-1234-5678-9012，車號')).toBe('入金帳戶 [數字帳號]，車號')
    expect(redactPii('銀行帳號 012-345678-901')).toBe('銀行帳號 [數字帳號]')
  })

  it('不誤遮日期、時間、金額與天數', () => {
    for (const s of ['2026-11-12', '2026/11/12', '113年5月20日', '12:30', '100元', '3-5 天', '民國113年', '於 2026-11-12 12:30 繳 100元']) {
      expect(redactPii(s)).toBe(s)
    }
  })

  it('極長輸入也能快速處理', () => {
    const long = '1-2 '.repeat(2500) + '0'.repeat(1000)
    const start = Date.now()
    redactPii(long.slice(0, 10000))
    expect(Date.now() - start).toBeLessThan(500)
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
