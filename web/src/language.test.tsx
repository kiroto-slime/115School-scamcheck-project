import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageProvider, useLanguage } from './language'
import { setActiveDictionary, type Loaders } from './i18n/dictionary'
import type { Language } from './i18n/languages'

const deferred = () => {
  let resolve!: (v: { default: Record<string, string> }) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<{ default: Record<string, string> }>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
function Probe() {
  const { lang, t, choose } = useLanguage()
  return <div>
    <p data-testid="lang">{lang}</p><p data-testid="text">{t('你好')}</p>
    {(['vi', 'th', 'en'] as Language[]).map(l => <button key={l} onClick={() => choose(l)}>{l}</button>)}
  </div>
}
const initial = { lang: 'zh-Hant', shown: 'zh-Hant', failed: null } as const

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); setActiveDictionary({}) })
afterEach(cleanup)

describe('語言切換', () => {
  it('快速連續切換時，較慢回來的語言檔不會蓋掉最後的選擇', async () => {
    const vi = deferred(), th = deferred()
    const loaders: Loaders = { vi: () => vi.promise, th: () => th.promise, id: () => vi.promise, 'zh-Hans': () => vi.promise }
    render(<LanguageProvider initial={initial} loaders={loaders}><Probe /></LanguageProvider>)
    fireEvent.click(screen.getByText('vi'))
    fireEvent.click(screen.getByText('th'))
    await act(async () => { th.resolve({ default: { 你好: 'สวัสดี' } }) })
    await act(async () => { vi.resolve({ default: { 你好: 'Xin chào' } }) })
    expect(screen.getByTestId('lang')).toHaveTextContent('th')
    expect(screen.getByTestId('text')).toHaveTextContent('สวัสดี')
    expect(localStorage.getItem('interfaceLanguage')).toBe('th')
  })
  it('選單切換時下載失敗：維持原語言、不跳提示', async () => {
    const fail = () => Promise.reject(new Error('network'))
    render(<LanguageProvider initial={initial} loaders={{ vi: fail, th: fail, id: fail, 'zh-Hans': fail }}><Probe /></LanguageProvider>)
    await act(async () => { fireEvent.click(screen.getByText('vi')) })
    expect(screen.getByTestId('lang')).toHaveTextContent('zh-Hant')
    expect(screen.queryByRole('status')).toBeNull()
    expect(localStorage.getItem('interfaceLanguage')).toBeNull()
  })
  it('自己選語言後記住選擇，並讓本分頁改用選單的語言', async () => {
    sessionStorage.setItem('interfaceLanguageTab', 'ja')
    render(<LanguageProvider initial={initial}><Probe /></LanguageProvider>)
    await act(async () => { fireEvent.click(screen.getByText('en')) })
    expect(localStorage.getItem('interfaceLanguage')).toBe('en')
    expect(sessionStorage.getItem('interfaceLanguageTab')).toBe('en')
    expect(sessionStorage.getItem('interfaceLanguageChosen')).toBe('1')
    expect(document.documentElement.lang).toBe('en')
  })
  it('繁中的頁面語言標記是 zh-Hant-TW', () => {
    render(<LanguageProvider initial={initial}><Probe /></LanguageProvider>)
    expect(document.documentElement.lang).toBe('zh-Hant-TW')
  })
})

describe('新語言暫時沒載入的提示', () => {
  const failed = { lang: 'vi', shown: 'en', failed: 'vi' } as const
  it('提示裡可以直接改用英文：記住英文、之後不再嘗試越南文', async () => {
    render(<LanguageProvider initial={failed}><Probe /></LanguageProvider>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Use English' })) })
    expect(localStorage.getItem('interfaceLanguage')).toBe('en')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByTestId('lang')).toHaveTextContent('en')
  })
  it('只出現一次、不寫失敗，關掉後同分頁不再出現', () => {
    const { unmount } = render(<LanguageProvider initial={failed}><Probe /></LanguageProvider>)
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Showing English for now. Tiếng Việt will load next time.')
    expect(notice.textContent).not.toMatch(/fail|error|失敗|錯誤/i)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    render(<LanguageProvider initial={failed}><Probe /></LanguageProvider>)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
