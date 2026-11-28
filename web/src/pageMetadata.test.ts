import { describe, expect, it } from 'vitest'
import { localizedUrl, pageHead } from './pageMetadata'

const O = 'https://scamcheck.slimebvs.net'
const attr = (tags: ReturnType<typeof pageHead>, rel: string) => tags.filter(t => t.attrs?.rel === rel).map(t => t.attrs!)

describe('各語言網址', () => {
  it('繁中維持原網址，其他語言加前綴；首頁以斜線結尾', () => {
    expect(localizedUrl('/check', 'zh-Hant')).toBe(O + '/check')
    expect(localizedUrl('/check', 'en')).toBe(O + '/en/check')
    expect(localizedUrl('/', 'zh-Hant')).toBe(O + '/')
    expect(localizedUrl('/', 'th')).toBe(O + '/th/')
    expect(localizedUrl('/privacy', 'zh-Hans')).toBe(O + '/zh-hans/privacy')
  })
})

describe('搜尋引擎標註', () => {
  it('公開頁的 canonical 指向自己的語言網址', () => {
    expect(attr(pageHead('/check', z => z, 'en'), 'canonical')[0].href).toBe(O + '/en/check')
  })
  it('列出八種語言與 x-default 的互相標註，x-default 是繁中原網址', () => {
    const alt = attr(pageHead('/check', z => z, 'ja'), 'alternate')
    expect(alt.map(a => a.hreflang)).toEqual(['zh-Hant', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans', 'x-default'])
    expect(alt.find(a => a.hreflang === 'x-default')!.href).toBe(O + '/check')
    expect(alt.find(a => a.hreflang === 'vi')!.href).toBe(O + '/vi/check')
  })
  it('首頁的英文 canonical 以斜線結尾', () => {
    expect(attr(pageHead('/', z => z, 'en'), 'canonical')[0].href).toBe(O + '/en/')
  })
  it('私人頁沒有 canonical 與互相標註，且不收錄', () => {
    const tags = pageHead('/history', z => z, 'en')
    expect(attr(tags, 'canonical')).toEqual([])
    expect(attr(tags, 'alternate')).toEqual([])
    expect(tags.find(t => t.attrs?.name === 'robots')!.attrs!.content).toBe('noindex, nofollow')
  })
  it('結構化資料列出八種語言', () => {
    const script = pageHead('/', z => z).find(t => t.tag === 'script')!
    expect(JSON.parse(script.text!).inLanguage).toEqual(['zh-Hant', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans'])
  })
  it('繁中標頭除了互相標註以外和原本相同（順序不變）', () => {
    const tags = pageHead('/check').filter(t => t.attrs?.rel !== 'alternate')
    expect(tags.map(t => t.tag + ':' + (t.attrs?.name ?? t.attrs?.property ?? t.attrs?.rel ?? ''))).toEqual([
      'title:', 'meta:description', 'meta:robots', 'link:canonical', 'meta:og:type', 'meta:og:url', 'meta:og:title',
      'meta:og:description', 'meta:og:image', 'meta:og:image:width', 'meta:og:image:height', 'meta:og:image:alt',
    ])
    expect(attr(tags, 'canonical')[0].href).toBe(O + '/check')
  })
})
