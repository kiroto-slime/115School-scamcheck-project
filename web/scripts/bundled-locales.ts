import type { Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 英、日、韓語言檔內建在主程式。三個檔案的鍵值都是同一批繁中句子，
// 打包時只放一份句子清單，再各放一份譯文陣列，避免主程式變大。
const ID = 'virtual:bundled-locales'
const RESOLVED = '\0' + ID
const LANGS = ['en', 'ja', 'ko'] as const

export function bundledLocales(): Plugin {
  let root = process.cwd()
  return {
    name: 'scamcheck-bundled-locales',
    configResolved(config) { root = config.root },
    resolveId(id) { return id === ID ? RESOLVED : null },
    load(id) {
      if (id !== RESOLVED) return null
      const files = LANGS.map(lang => resolve(root, `src/locales/${lang}.json`))
      files.forEach(file => this.addWatchFile(file))
      const dicts = files.map(file => JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>)
      const keys = [...new Set(dicts.flatMap(Object.keys))]
      const values = Object.fromEntries(LANGS.map((lang, i) => [lang, keys.map(key => dicts[i][key] ?? null)]))
      return `export const keys = ${JSON.stringify(keys)}\nexport const values = ${JSON.stringify(values)}\n`
    },
  }
}
