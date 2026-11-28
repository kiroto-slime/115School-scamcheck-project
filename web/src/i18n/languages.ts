// 介面語言清單、第一次造訪的判斷，以及開啟網頁時要用哪種語言。
// 選單順序：原本四種在前，新增四種接在後面。
export const languages = {
  'zh-Hant': '繁體中文', en: 'English', ja: '日本語', ko: '한국어',
  vi: 'Tiếng Việt', id: 'Bahasa Indonesia', th: 'ไทย', 'zh-Hans': '简体中文',
} as const
export type Language = keyof typeof languages
export const languageCodes = Object.keys(languages) as Language[]

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && Object.hasOwn(languages, value)

// 繁中沒有前綴；其他語言的網址前綴（一律小寫）。
export const PREFIX: Record<Exclude<Language, 'zh-Hant'>, string> = {
  en: 'en', ja: 'ja', ko: 'ko', vi: 'vi', id: 'id', th: 'th', 'zh-Hans': 'zh-hans',
}
const byPrefix = new Map(Object.entries(PREFIX).map(([lang, prefix]) => [prefix, lang as Language]))

/** 從網址第一段判斷語言前綴（不分大小寫）；不是已知前綴就當作沒有前綴。 */
export function languageFromPath(pathname: string): { lang: Language | null; basename: string } {
  const first = pathname.split('/')[1]?.toLowerCase() ?? ''
  const lang = byPrefix.get(first)
  return lang ? { lang, basename: '/' + first } : { lang: null, basename: '' }
}

/** 一個瀏覽器語言代碼對應到哪種介面語言；對不到回傳 null。 */
function matchOne(tag: string): Language | null {
  const parts = tag.toLowerCase().split(/[-_]/)
  const [base] = parts
  if (base === 'zh') {
    if (parts.includes('hant')) return 'zh-Hant'
    if (parts.includes('hans') || parts.includes('cn') || parts.includes('sg')) return 'zh-Hans'
    // 只寫「中文」或繁體地區一律算繁中：本站由臺灣團隊製作。
    return 'zh-Hant'
  }
  if (base === 'in') return 'id'
  return isLanguage(base) ? base : null
}

/** 依瀏覽器偏好語言清單的順序，找第一個支援的語言；全部對不到用英文。 */
export function detectLanguage(list: readonly string[]): Language {
  for (const tag of list) {
    const lang = matchOne(tag)
    if (lang) return lang
  }
  return 'en'
}

const crawlerPattern = /googlebot|bingbot|duckduckbot|baiduspider|yandex|applebot|facebookexternalhit|twitterbot|slurp|linkedinbot/i
/** 搜尋引擎與連結預覽爬蟲不做自動判斷。 */
export const isCrawler = (userAgent: string) => crawlerPattern.test(userAgent)

export interface InitialInput { urlLang: Language | null; tab: unknown; tabChosen?: boolean; saved: unknown; browser: readonly string[]; crawler: boolean }
export interface InitialLanguage { lang: Language; save: boolean; tab: Language | null }

/** 決定開啟網頁時的語言：本分頁從選單選的 → 網址前綴 → 本分頁 → 已存選擇 → 瀏覽器判斷。 */
export function resolveInitialLanguage({ urlLang, tab, tabChosen, saved, browser, crawler }: InitialInput): InitialLanguage {
  // 使用者在這個分頁從選單選過，就一直照選單，不被網址前綴改回。
  if (tabChosen && isLanguage(tab)) return { lang: tab, save: false, tab }
  if (urlLang) return { lang: urlLang, save: !isLanguage(saved) && !crawler, tab: urlLang }
  if (isLanguage(tab)) return { lang: tab, save: false, tab }
  if (isLanguage(saved)) return { lang: saved, save: false, tab: null }
  if (crawler) return { lang: 'zh-Hant', save: false, tab: null }
  return { lang: detectLanguage(browser), save: true, tab: null }
}
