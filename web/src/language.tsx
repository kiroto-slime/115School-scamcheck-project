import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

export const languages = { 'zh-Hant': '繁體中文', en: 'English', ja: '日本語', ko: '한국어' } as const
export type Language = keyof typeof languages
export type Copy = readonly [string, string, string, string]
const index = { 'zh-Hant': 0, en: 1, ja: 2, ko: 3 } as const
export const translate = (lang: Language, ...copy: Copy) => copy[index[lang]]
const levels: Record<string, Copy> = {
  高: ['高', 'High', '高', '높음'], 中: ['中', 'Moderate', '中', '중간'], 低: ['低', 'Low', '低', '낮음'],
  資訊不足: ['資訊不足', 'Insufficient information', '情報不足', '정보 부족'],
  無法判斷: ['無法判斷', 'Unable to determine', '判定できません', '판단할 수 없음'],
}
export const riskLabel = (lang: Language, level: string) => levels[level] ? translate(lang, ...levels[level]) : level
const isLanguage = (value: string | null): value is Language => value !== null && Object.hasOwn(languages, value)

function readLanguage(): Language {
  try {
    const saved = localStorage.getItem('interfaceLanguage')
    if (isLanguage(saved)) return saved
  } catch { /* 儲存空間停用時仍可選擇語言。 */ }
  return 'zh-Hant'
}

const LanguageContext = createContext({
  lang: 'zh-Hant' as Language,
  t: (...copy: Copy) => copy[0],
  choose: (_lang: Language) => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState(readLanguage)
  useLayoutEffect(() => { document.documentElement.lang = lang === 'zh-Hant' ? 'zh-Hant-TW' : lang }, [lang])
  const value = useMemo(() => ({
    lang,
    t: (...copy: Copy) => translate(lang, ...copy),
    choose: (next: Language) => {
      setLang(next)
      try { localStorage.setItem('interfaceLanguage', next) } catch { /* 保留此次選擇。 */ }
    },
  }), [lang])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() { return useContext(LanguageContext) }
