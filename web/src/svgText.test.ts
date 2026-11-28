import { describe, expect, it } from 'vitest'
import { estimateEm, fitFontSize } from './svgText'

describe('首頁主圖文字依長度縮小字級', () => {
  it.each([
    ['包裹通知', 31, 181, 31], ['配送通知', 31, 181, 31], ['배송 알림', 31, 181, 31], ['Parcel update', 25, 181, 25],
    ['地址需要確認', 30, 216, 30], ['주소 확인 요청', 30, 216, 30], ['Confirm address', 25, 216, 25],
  ])('原本放得下的「%s」維持原字級', (text, base, width, expected) => {
    expect(fitFontSize(text, base, width)).toBe(expected)
  })
  it.each([
    ['Pemberitahuan paket', 181], ['Thông báo bưu kiện', 181], ['Alamat perlu dikonfirmasi', 216], ['Cần xác nhận địa chỉ', 216],
  ])('較長的「%s」縮小到放得進卡片', (text, width) => {
    const size = fitFontSize(text, 31, width)
    expect(size).toBeLessThan(31)
    expect(estimateEm(text) * size).toBeLessThanOrEqual(width)
  })
  it('泰文的上下標記號不佔寬度', () => {
    expect(estimateEm('ที่อยู่')).toBeLessThan(estimateEm('ทอย'.repeat(2)))
  })
})
