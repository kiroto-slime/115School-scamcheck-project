// 從原始碼收集所有要翻譯的繁中句子（t、translate、msg、select 的第一個字串，tc 的「情境｜句子」）。
// 完整性測試用它檢查每個語言檔都翻譯了全部句子。
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name)
  if (statSync(path).isDirectory()) return files(path)
  return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
})

const text = (node: ts.Node | undefined) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null

/** 佔位符集合，例如「剩 {0} 次」→ '0'。 */
export const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\d+)\}/g)].map(m => m[1]))].sort().join(',')

/** 翻譯呼叫的參數不合理（佔位符數量不符，或仍像舊寫法一樣直接傳譯文）。 */
export const suspicious: string[] = []

export function collectKeys(dirs: string[]): Map<string, string> {
  const keys = new Map<string, string>()
  suspicious.length = 0
  for (const file of dirs.flatMap(files)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression
        const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
        let key: string | null = null
        if (name === 't' || name === 'translate' || name === 'msg' || name === 'select') key = text(node.arguments[0])
        if (name === 'tc') {
          const context = text(node.arguments[0]), zh = text(node.arguments[1])
          key = context !== null && zh !== null ? `${context}｜${zh}` : null
        }
        if (key) keys.set(key, placeholders(key))
        if (name === 't' || name === 'translate' || name === 'tc') {
          const skip = name === 'tc' ? 2 : 1
          const values = node.arguments.slice(skip)
          const where = `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`
          if (key !== null) {
            const used = key.match(/\{(\d+)\}/g)?.map(m => Number(m.slice(1, -1))) ?? []
            const need = used.length ? Math.max(...used) + 1 : 0
            if (values.length !== need && !values.some(ts.isSpreadElement)) suspicious.push(`${where} 需要 ${need} 個值，傳了 ${values.length} 個`)
          } else if (values.some(v => text(v) !== null)) suspicious.push(`${where} 第一個參數不是固定句子，後面卻直接傳文字`)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return keys
}
