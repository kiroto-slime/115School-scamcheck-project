// 翻譯字典：繁中原文就是鍵值。繁中、英、日、韓內建在主程式；新增的語言切換時才下載。
import { keys, values } from 'virtual:bundled-locales'
import { isCrawler, languageFromPath, resolveInitialLanguage, type Language } from './languages'

export type Dictionary = Record<string, string>
type Downloaded = 'vi' | 'id' | 'th' | 'zh-Hans'
export type Loaders = Record<Downloaded, () => Promise<{ default: Dictionary }>>

const unpack = (list: (string | null)[]): Dictionary =>
  Object.fromEntries(keys.flatMap((key, i) => (list[i] === null ? [] : [[key, list[i]]])))
const bundled: Record<Exclude<Language, Downloaded>, Dictionary> = { 'zh-Hant': {}, en: unpack(values.en), ja: unpack(values.ja), ko: unpack(values.ko) }
// 只能從這張固定對照表載入，不用字串拼接檔案路徑。
const defaultLoaders: Loaders = {
  vi: () => import('../locales/vi.json'),
  id: () => import('../locales/id.json'),
  th: () => import('../locales/th.json'),
  'zh-Hans': () => import('../locales/zh-Hans.json'),
}

let active: Dictionary = {}
export const setActiveDictionary = (dict: Dictionary) => { active = dict }

export { msg } from './msg'

/** 依序替換 {0}、{1}…。 */
export const format = (text: string, values: readonly (string | number)[]) =>
  values.length ? text.replace(/\{(\d+)\}/g, (whole, i: string) => (Number(i) < values.length ? String(values[Number(i)]) : whole)) : text

/** 用目前語言翻譯；查不到就顯示繁中。 */
export const translate = (zh: string, ...values: (string | number)[]) => format(active[zh] ?? zh, values)

/** 同一句繁中在不同情境要不同譯文時使用；繁中仍顯示原字。 */
export const tc = (context: string, zh: string, ...values: (string | number)[]) =>
  format(active[`${context}｜${zh}`] ?? zh, values)

/** 取得語言字典；下載的語言失敗時安靜重試一次。 */
export async function loadDictionary(lang: Language, loaders: Loaders = defaultLoaders): Promise<Dictionary> {
  if (Object.hasOwn(bundled, lang)) return bundled[lang as keyof typeof bundled]
  const load = loaders[lang as Downloaded]
  try { return (await load()).default } catch { return (await load()).default }
}

const read = (storage: () => Storage, key: string): string | null => {
  try { return storage().getItem(key) } catch { return null }
}
const write = (storage: () => Storage, key: string, value: string) => {
  try { storage().setItem(key, value) } catch { /* 儲存空間停用時這次照樣使用。 */ }
}
export const SAVED_KEY = 'interfaceLanguage'
export const TAB_KEY = 'interfaceLanguageTab'
// 本分頁的語言是使用者從選單選的（不是由網址決定）。
export const CHOSEN_KEY = 'interfaceLanguageChosen'

export interface BootEnv { path: string; languages: readonly string[]; userAgent: string; loaders?: Loaders; timeoutMs?: number }
export interface BootResult { lang: Language; shown: Language; failed: Language | null }

const browserEnv = (): BootEnv => ({
  path: location.pathname,
  languages: navigator.languages?.length ? navigator.languages : [navigator.language ?? ''],
  userAgent: navigator.userAgent,
})

/** 開啟網頁時決定語言並先載入語言檔（最多等 timeoutMs）；失敗就先用英文顯示。 */
export async function bootLanguage(env: BootEnv = browserEnv()): Promise<BootResult> {
  const initial = resolveInitialLanguage({
    urlLang: languageFromPath(env.path).lang,
    tab: read(() => sessionStorage, TAB_KEY),
    tabChosen: read(() => sessionStorage, CHOSEN_KEY) === '1',
    saved: read(() => localStorage, SAVED_KEY),
    browser: env.languages,
    crawler: isCrawler(env.userAgent),
  })
  if (initial.save) write(() => localStorage, SAVED_KEY, initial.lang)
  if (initial.tab) write(() => sessionStorage, TAB_KEY, initial.tab)
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), env.timeoutMs ?? 3000))
  try {
    setActiveDictionary(await Promise.race([loadDictionary(initial.lang, env.loaders), timeout]))
    return { lang: initial.lang, shown: initial.lang, failed: null }
  } catch {
    setActiveDictionary(bundled.en)
    return { lang: initial.lang, shown: 'en', failed: initial.lang }
  }
}
