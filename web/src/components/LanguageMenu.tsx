import { languages, useLanguage, type Language } from '../language'

export function LanguageMenu({ desktop = false }: { desktop?: boolean }) {
  const { lang, choose, t } = useLanguage()
  return <label className={desktop ? 'language-menu language-dock' : 'language-menu language-in-nav'}>
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" />
    </svg>
    <select value={lang} aria-label={t('語言 / Language')}
      onChange={event => choose(event.target.value as Language)}>
      {Object.entries(languages).map(([id, label]) => <option key={id} value={id} lang={id}>{label}</option>)}
    </select>
  </label>
}
