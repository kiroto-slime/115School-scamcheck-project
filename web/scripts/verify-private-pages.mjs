import { readFileSync } from 'node:fs'

const output = new URL('../dist/client/', import.meta.url)
const read = file => readFileSync(new URL(file, output), 'utf8')
const headers = read('_headers').replace(/\r/g, '').split(/\n(?=\/)/)

// 語言網址（/en/history 等）的私人頁也不能被收錄。
for (const path of ['/admin', '/history', '/result', '/result/*', '/:lang/admin', '/:lang/history', '/:lang/result', '/:lang/result/*']) {
  const group = headers.find(section => section.split('\n')[0] === path)
  if (!group || !/^\s*X-Robots-Tag:\s*noindex\b/im.test(group)) {
    throw new Error(`${path} 缺少禁止搜尋收錄的 HTTP 標頭。`)
  }
}
for (const name of ['admin', 'history', 'result']) {
  if (!/<meta\b[^>]*name="robots"[^>]*content="noindex\b/i.test(read(name + '.html'))) {
    throw new Error(`${name}.html 缺少禁止搜尋收錄的 HTML 標記。`)
  }
}
for (const [from, to] of [['/:lang/history', '/history'], ['/:lang/admin', '/admin'], ['/:lang/result', '/result'], ['/:lang/result/*', '/result']]) {
  const found = read('_redirects').split(/\r?\n/).some(line => line.trim().split(/\s+/).join(' ') === `${from} ${to} 200`)
  if (!found) throw new Error(`${from} 缺少對應到不收錄樣板的路由。`)
}
if (!/^\/result\/\*\s+\/result\s+200\s*$/m.test(read('_redirects'))) {
  throw new Error('個別查核結果缺少對應到不收錄樣板的路由。')
}
console.log('管理、歷史與個別結果頁的搜尋排除設定已通過檢查。')
