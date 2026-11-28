// 建置時為各語言產生的靜態公開頁與網站地圖。
import { describe, expect, it } from 'vitest'
import { renderPage, sitemap } from '../scripts/search-pages'

const template = '<!doctype html><html lang="zh-Hant-TW"><head><!-- route-head --></head><body><div id="root"><!-- route-intro --></div></body></html>'
const O = 'https://scamcheck.slimebvs.net'

describe('各語言靜態頁', () => {
  it('英文查核頁：頁面語言、標題、摘要都是英文，並有互相標註', () => {
    const html = renderPage(template, '/check', 'en')
    expect(html).toContain('<html lang="en">')
    expect(html).toContain('<title data-page-head>Check a message, screenshot or video｜ScamCheck</title>')
    expect(html).toContain('<h1>Check a message, screenshot or video</h1>')
    expect(html).toContain(`<link data-page-head rel="canonical" href="${O}/en/check">`)
    expect(html).toContain(`hreflang="th" href="${O}/th/check"`)
    expect(html).toContain('<a href="/en/">ScamCheck home</a>')
  })
  it('英文首頁的站內連結都帶 /en', () => {
    const html = renderPage(template, '/', 'en')
    expect(html).toContain('<a href="/en/check">')
    expect(html).not.toContain('<a href="/check">')
  })
  it('英文包裹教學的返回與查核連結帶 /en', () => {
    const html = renderPage(template, '/guides/parcel-message', 'en')
    expect(html).toContain('<a class="guide-back" href="/en/">Home</a>')
    expect(html).toContain('<a class="btn-primary guide-check" href="/en/check">Check your own message</a>')
  })
  it('繁中頁面維持原網址與原文字', () => {
    const html = renderPage(template, '/check')
    expect(html).toContain('<html lang="zh-Hant-TW">')
    expect(html).toContain('<a href="/">識詐數據庫首頁</a>')
    expect(html).toContain('<nav aria-label="網站導覽">')
    expect(html).toContain(`<link data-page-head rel="canonical" href="${O}/check">`)
  })
})

describe('網站地圖', () => {
  const xml = sitemap()
  it('列出每種語言的公開頁網址', () => {
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml).toContain(`<loc>${O}/check</loc>`)
    expect(xml).toContain(`<loc>${O}/zh-hans/check</loc>`)
    expect(xml).toContain(`<loc>${O}/vi/</loc>`)
    expect(xml.match(/<url>/g)).toHaveLength(8 * 8)
  })
  it('每個網址都附上九個互相標註', () => {
    const first = xml.split('<url>')[1]
    expect(first.match(/<xhtml:link /g)).toHaveLength(9)
  })
})
