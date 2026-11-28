import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CHOSEN_KEY, loadDictionary, SAVED_KEY, setActiveDictionary, TAB_KEY, tc, translate, type BootResult, type Loaders } from './i18n/dictionary'
import { languages, type Language } from './i18n/languages'

export { languages, type Language } from './i18n/languages'
export { msg, tc, translate } from './i18n/dictionary'

export type Translate = (zh: string, ...values: (string | number)[]) => string

// 風險等級的資料代碼維持中文，只在畫面翻譯；用情境鍵避免和其他同字（例如文字大小「中」）混用。
const levels = new Set(['高', '中', '低', '資訊不足', '無法判斷'])
// 列出全部情境鍵，讓完整性檢查確認每種語言都有譯文。
const riskKeys = [tc('風險等級', '高'), tc('風險等級', '中'), tc('風險等級', '低'), tc('風險等級', '資訊不足'), tc('風險等級', '無法判斷')]
void riskKeys
export const riskLabel = (level: string) => (levels.has(level) ? tc('風險等級', level) : level)

const LanguageContext = createContext<{ lang: Language; t: Translate; choose: (lang: Language) => void }>({
  lang: 'zh-Hant', t: translate, choose: () => {},
})
const NOTICE_KEY = 'languageNoticeSeen'
const seen = () => { try { return sessionStorage.getItem(NOTICE_KEY) === '1' } catch { return false } }

const defaultInitial: BootResult = { lang: 'zh-Hant', shown: 'zh-Hant', failed: null }

export function LanguageProvider({ initial = defaultInitial, loaders, children }: { initial?: BootResult; loaders?: Loaders; children: ReactNode }) {
  const [shown, setShown] = useState<Language>(initial.shown)
  const [notice, setNotice] = useState(initial.failed && !seen() ? initial.failed : null)
  const ticket = useRef(0)
  useLayoutEffect(() => { document.documentElement.lang = shown === 'zh-Hant' ? 'zh-Hant-TW' : shown }, [shown])
  const value = useMemo(() => ({
    lang: shown,
    // 依目前語言產生新函式，讓依賴 t 的畫面在換語言時重新計算。
    t: ((zh, ...values) => translate(zh, ...values)) as Translate,
    choose: (next: Language) => {
      const mine = ++ticket.current
      loadDictionary(next, loaders).then(dict => {
        if (mine !== ticket.current) return
        setActiveDictionary(dict)
        setShown(next)
        try {
          localStorage.setItem(SAVED_KEY, next)
          sessionStorage.setItem(TAB_KEY, next)
          sessionStorage.setItem(CHOSEN_KEY, '1')
        } catch { /* 這次仍照選擇顯示。 */ }
      }, () => { /* 下載不到就維持原語言，使用者再選一次會重試。 */ })
    },
  }), [shown, loaders])
  const close = () => {
    setNotice(null)
    try { sessionStorage.setItem(NOTICE_KEY, '1') } catch { /* 這次已關閉。 */ }
  }
  return <LanguageContext.Provider value={value}>
    {notice && <div className="language-notice" role="status" lang="en">
      <span>Showing English for now. <span lang={notice}>{languages[notice]}</span> will load next time.</span>
      <button type="button" className="language-notice-switch" onClick={() => { value.choose('en'); close() }}>Use English</button>
      <button type="button" aria-label="Close" onClick={close}>×</button>
    </div>}
    {children}
  </LanguageContext.Provider>
}

export function useLanguage() { return useContext(LanguageContext) }
