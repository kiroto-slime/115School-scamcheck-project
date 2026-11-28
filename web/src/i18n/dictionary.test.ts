import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootLanguage, format, loadDictionary, msg, setActiveDictionary, tc, translate, type Loaders } from './dictionary'

const ok = (dict: Record<string, string>) => () => Promise.resolve({ default: dict })
const fail = () => Promise.reject(new Error('network'))
const loaders = (over: Partial<Loaders> = {}): Loaders =>
  ({ vi: ok({ 你好: 'Xin chào' }), id: ok({}), th: ok({ 你好: 'สวัสดี' }), 'zh-Hans': ok({}), ...over })

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setActiveDictionary({}) })
afterEach(() => setActiveDictionary({}))

describe('文字替換', () => {
  it('依序替換佔位符', () => expect(format('剩 {0} 次，共 {1}', [3, 'a'])).toBe('剩 3 次，共 a'))
  it('查不到的鍵顯示繁中並套用替換', () => expect(translate('剩 {0} 次', 5)).toBe('剩 5 次'))
  it('查得到就用譯文', () => {
    setActiveDictionary({ '剩 {0} 次': '{0} left' })
    expect(translate('剩 {0} 次', 5)).toBe('5 left')
  })
  it('msg 原樣回傳', () => expect(msg('你好')).toBe('你好'))
  it('tc 以情境區分同字不同義，繁中顯示原字', () => {
    expect(tc('風險等級', '中')).toBe('中')
    setActiveDictionary({ '風險等級｜中': 'Moderate' })
    expect(tc('風險等級', '中')).toBe('Moderate')
  })
})

describe('載入語言檔', () => {
  it('繁中、英、日、韓不經網路（新語言載入全部失敗也能取得）', async () => {
    const broken = loaders({ vi: fail, id: fail, th: fail, 'zh-Hans': fail })
    for (const lang of ['zh-Hant', 'en', 'ja', 'ko'] as const) await expect(loadDictionary(lang, broken)).resolves.toBeTypeOf('object')
  })
  it('第一次失敗會安靜重試一次', async () => {
    let calls = 0
    const flaky = () => (++calls === 1 ? fail() : ok({ 你好: 'Xin chào' })())
    await expect(loadDictionary('vi', loaders({ vi: flaky }))).resolves.toEqual({ 你好: 'Xin chào' })
    expect(calls).toBe(2)
  })
  it('兩次都失敗才回報失敗', async () => {
    await expect(loadDictionary('vi', loaders({ vi: fail }))).rejects.toThrow()
  })
})

describe('開啟網頁時準備語言', () => {
  const env = (over = {}) => ({ path: '/', languages: ['vi-VN'], userAgent: 'Mozilla/5.0', loaders: loaders(), timeoutMs: 200, ...over })
  it('第一次造訪依瀏覽器語言並記住', async () => {
    await expect(bootLanguage(env())).resolves.toEqual({ lang: 'vi', shown: 'vi', failed: null })
    expect(localStorage.getItem('interfaceLanguage')).toBe('vi')
    expect(translate('你好')).toBe('Xin chào')
  })
  it('已存選擇不被瀏覽器語言改變', async () => {
    localStorage.setItem('interfaceLanguage', 'ko')
    await expect(bootLanguage(env())).resolves.toEqual({ lang: 'ko', shown: 'ko', failed: null })
  })
  it('語言檔兩次都失敗：先用英文顯示，已存的語言不變', async () => {
    localStorage.setItem('interfaceLanguage', 'vi')
    await expect(bootLanguage(env({ loaders: loaders({ vi: fail }) }))).resolves.toEqual({ lang: 'vi', shown: 'en', failed: 'vi' })
    expect(localStorage.getItem('interfaceLanguage')).toBe('vi')
  })
  it('逾時也先用英文顯示', async () => {
    const slow = () => new Promise<never>(() => {})
    await expect(bootLanguage(env({ loaders: loaders({ vi: slow }), timeoutMs: 50 }))).resolves.toEqual({ lang: 'vi', shown: 'en', failed: 'vi' })
  })
  it('網址有語言前綴：本分頁記住網址語言', async () => {
    localStorage.setItem('interfaceLanguage', 'ja')
    await expect(bootLanguage(env({ path: '/th/check' }))).resolves.toEqual({ lang: 'th', shown: 'th', failed: null })
    expect(sessionStorage.getItem('interfaceLanguageTab')).toBe('th')
    expect(localStorage.getItem('interfaceLanguage')).toBe('ja')
  })
  it('本分頁在語言網址上從選單選過語言：重新整理照選單選擇', async () => {
    localStorage.setItem('interfaceLanguage', 'ko')
    sessionStorage.setItem('interfaceLanguageTab', 'ko')
    sessionStorage.setItem('interfaceLanguageChosen', '1')
    await expect(bootLanguage(env({ path: '/th/check' }))).resolves.toEqual({ lang: 'ko', shown: 'ko', failed: null })
  })
  it('儲存空間無法使用時照常判斷、不報錯', async () => {
    const original = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    try {
      await expect(bootLanguage(env())).resolves.toEqual({ lang: 'vi', shown: 'vi', failed: null })
    } finally { Storage.prototype.getItem = original }
  })
})
