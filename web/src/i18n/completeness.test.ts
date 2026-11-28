// 每個語言檔都要翻譯原始碼裡的全部句子：不能缺、不能多、佔位符要一致。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collectKeys, placeholders, suspicious } from '../../scripts/i18n-keys'

// 測試在 web/ 執行。
const root = process.cwd()
const keys = collectKeys([resolve(root, 'src'), resolve(root, 'shared')])
const locales = ['en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans'] as const
// 這些句子在部分語言因語序不同而不需要文字。
const emptyOk = new Set(['可在 '])

describe.each(locales)('%s 語言檔', lang => {
  const dict: Record<string, string> = JSON.parse(readFileSync(resolve(root, `src/locales/${lang}.json`), 'utf8'))
  it('原始碼裡的每一句都有譯文', () => expect([...keys.keys()].filter(k => !(k in dict))).toEqual([]))
  it('沒有原始碼已經不用的句子', () => expect(Object.keys(dict).filter(k => !keys.has(k))).toEqual([]))
  // 只有標點的句子（例如句號）在部分語言可以省略。
  it('譯文不是空字串', () => expect(Object.entries(dict).filter(([k, v]) => !v.trim() && !emptyOk.has(k) && /[\p{L}\p{N}]/u.test(k.split('｜').pop()!)).map(([k]) => k)).toEqual([]))
  // 譯文可以省略某些值（例如較短的提示），但不能出現繁中沒有的佔位符。
  it('譯文的佔位符都存在於繁中', () =>
    expect(Object.entries(dict).filter(([k, v]) => placeholders(v).split(',').some(p => p && !placeholders(k).split(',').includes(p))).map(([k]) => k)).toEqual([]))
})

it('收集到的句子數量合理（防止收集程式失效）', () => expect(keys.size).toBeGreaterThan(300))

it('翻譯呼叫的參數與佔位符一致（沒有殘留的舊寫法）', () => expect(suspicious).toEqual([]))

describe('小遊戲的固定文字', () => {
  const source = readFileSync(resolve(root, 'public/games/block-parkour/js/language.js'), 'utf8')
  const start = source.indexOf('new Map(') + 'new Map('.length
  let depth = 0, end = start
  for (; end < source.length; end++) {
    if (source[end] === '[') depth++
    if (source[end] === ']' && --depth === 0) break
  }
  // 原檔最後一項後面有逗號，去掉後才是合法 JSON。
  const copies = JSON.parse(source.slice(start, end + 1).replace(/,\s*\]$/, ']')) as [string, string[]][]
  it('語言順序與網站選單相同', () => {
    expect(source).toContain("const locales = ['zh-Hant', 'en', 'ja', 'ko', 'vi', 'id', 'th', 'zh-Hans'];")
  })
  it('每一項都有八種語言且不是空字串', () => {
    expect(copies.filter(([, list]) => list.length !== 8 || list.some(text => !text.trim())).map(([id]) => id)).toEqual([])
  })
  it('譯文的佔位符都存在於繁中', () => {
    expect(copies.filter(([, list]) => list.some(text => placeholders(text).split(',').some(p => p && !placeholders(list[0]).split(',').includes(p)))).map(([id]) => id)).toEqual([])
  })
})
