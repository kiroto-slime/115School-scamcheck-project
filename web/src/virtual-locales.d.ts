// 由 scripts/bundled-locales.ts 在建置時產生：內建語言共用一份繁中句子清單。
declare module 'virtual:bundled-locales' {
  export const keys: string[]
  export const values: Record<'en' | 'ja' | 'ko', (string | null)[]>
}
