import { describe, expect, it } from 'vitest'
import { detectLanguage, isCrawler, languageFromPath, languages, resolveInitialLanguage } from './languages'

describe('選單語言', () => {
  it('依固定順序列出八種語言，原本四種在最前面', () => {
    expect(Object.keys(languages)).toEqual(['zh-Hant', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans'])
  })
})

describe('依瀏覽器語言判斷', () => {
  it.each([
    [['zh-TW'], 'zh-Hant'], [['zh-HK'], 'zh-Hant'], [['zh-Hant-TW'], 'zh-Hant'], [['zh'], 'zh-Hant'],
    [['zh-Hant-SG'], 'zh-Hant'], [['zh-Hans-TW'], 'zh-Hans'], [['zh-CN'], 'zh-Hans'], [['zh-SG'], 'zh-Hans'], [['zh-Hans'], 'zh-Hans'],
    [['en-US', 'zh-TW'], 'en'], [['in-ID'], 'id'], [['fr-FR', 'th-TH'], 'th'], [['vi-VN'], 'vi'],
    [['ja-JP'], 'ja'], [['ko-KR'], 'ko'], [['fr-FR'], 'en'], [[], 'en'],
  ] as const)('%j → %s', (list, expected) => {
    expect(detectLanguage(list)).toBe(expected)
  })
})

describe('網址前綴', () => {
  it.each([
    ['/en/check', 'en', '/en'], ['/EN/check', 'en', '/en'], ['/zh-hans/', 'zh-Hans', '/zh-hans'], ['/en', 'en', '/en'],
    ['/th/guides/parcel-message', 'th', '/th'],
    ['/check', null, ''], ['/xx/check', null, ''], ['/english', null, ''], ['/', null, ''],
  ] as const)('%s', (path, lang, basename) => {
    expect(languageFromPath(path)).toEqual({ lang, basename })
  })
})

describe('爬蟲辨識', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
  ])('認得爬蟲：%s', ua => expect(isCrawler(ua)).toBe(true))
  it.each([
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0]',
    'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Instagram 300.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  ])('一般使用者不是爬蟲：%s', ua => expect(isCrawler(ua)).toBe(false))
})

describe('決定開啟時的語言', () => {
  const base = { urlLang: null, tab: null, tabChosen: false, saved: null, browser: ['vi-VN'], crawler: false } as const
  it('網址有語言：用網址語言並記在本分頁；沒存過就順便記住', () => {
    expect(resolveInitialLanguage({ ...base, urlLang: 'en' })).toEqual({ lang: 'en', save: true, tab: 'en' })
  })
  it('網址有語言但已存過別的：不覆蓋已存選擇', () => {
    expect(resolveInitialLanguage({ ...base, urlLang: 'en', saved: 'ja' })).toEqual({ lang: 'en', save: false, tab: 'en' })
  })
  it('在語言網址上從選單選過語言：重新整理仍照選單選擇，不被網址改回', () => {
    expect(resolveInitialLanguage({ ...base, urlLang: 'vi', tab: 'en', tabChosen: true, saved: 'en' })).toEqual({ lang: 'en', save: false, tab: 'en' })
  })
  it('本分頁先前由網址決定的語言優先於已存選擇', () => {
    expect(resolveInitialLanguage({ ...base, tab: 'en', saved: 'ja' })).toEqual({ lang: 'en', save: false, tab: 'en' })
  })
  it('已存選擇就照用，不再判斷', () => {
    expect(resolveInitialLanguage({ ...base, saved: 'ko' })).toEqual({ lang: 'ko', save: false, tab: null })
  })
  it.each(['fr', '', 'zh-TW', null, 42])('不合法的舊值 %j 視為沒選過，照瀏覽器判斷並記住', saved => {
    expect(resolveInitialLanguage({ ...base, saved, tab: 'xx' })).toEqual({ lang: 'vi', save: true, tab: null })
  })
  it('爬蟲且沒有網址語言：顯示繁中、不記住', () => {
    expect(resolveInitialLanguage({ ...base, crawler: true })).toEqual({ lang: 'zh-Hant', save: false, tab: null })
  })
})
