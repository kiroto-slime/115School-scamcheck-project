import type { Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParcelGuideContent, PublicFaq } from '../src/components/PublicGuideContent'
import { localizedUrl, pageHead, pageMetadata, pagePaths, publicPagePaths, staticCopy } from '../src/pageMetadata'
import { languageCodes, languageFromPath, PREFIX, type Language } from '../src/i18n/languages'

const marker = '<!-- route-head -->'
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

// 建置時直接讀語言檔翻譯靜態頁（繁中不翻）。
const dictionaries = new Map<Language, Record<string, string>>()
function selector(lang: Language) {
  if (lang === 'zh-Hant') return (zh: string) => zh
  if (!dictionaries.has(lang)) dictionaries.set(lang, JSON.parse(readFileSync(resolve(__dirname, `../src/locales/${lang}.json`), 'utf8')))
  const dict = dictionaries.get(lang)!
  return (zh: string) => dict[zh] ?? zh
}
/** 站內連結：其他語言加上前綴，繁中維持原網址。 */
const localPath = (path: string, lang: Language) => (lang === 'zh-Hant' ? path : '/' + PREFIX[lang] + (path === '/' ? '/' : path))

export function renderPage(template: string, path: string, lang: Language = 'zh-Hant') {
  if (!template.includes(marker)) throw new Error('首頁樣板缺少搜尋標籤的位置。')
  const t = selector(lang)
  if (lang !== 'zh-Hant') template = template.replace('<html lang="zh-Hant-TW">', `<html lang="${lang}">`)
  const head = pageHead(path, t, lang).map(({tag, attrs, text}) => {
    const attributes = Object.entries(attrs ?? {}).map(([key, value]) => ` ${key}="${escapeHtml(value)}"`).join('')
    // JSON-LD 是 JSON 文字；跳脫左尖括號，避免被 HTML 解析為 script 結尾。
    if (tag === 'script') return `<script data-page-head${attributes}>${text!.replaceAll('<', '\\u003c')}</script>`
    return tag === 'title'
      ? `<title data-page-head>${escapeHtml(text!)}</title>`
      : `<${tag} data-page-head${attributes}>`
  })
  const html = template.replace(marker, head.join('\n    '))
  const route = path.replace(/\/+$/, '') || '/'
  if (!publicPagePaths.includes(route)) return html

  // 直接開啟公開網址時先提供可閱讀的摘要；互動介面載入後會接手同一個根節點。
  if (route === '/guides/parcel-message') {
    const guide = renderToStaticMarkup(createElement(ParcelGuideContent, { t }))
    return html.replace('<!-- route-intro -->', `<main><article class="card home-example parcel-guide"><a class="guide-back" href="${localPath('/', lang)}">${escapeHtml(t(staticCopy.back))}</a>${guide}<a class="btn-primary guide-check" href="${localPath('/check', lang)}">${escapeHtml(t(staticCopy.check))}</a></article></main>`)
  }
  const page = pageMetadata(route, t, lang)
  const destinations = route === '/' ? publicPagePaths.filter(item => item !== '/') : ['/']
  const links = destinations.map(item => {
    const label = item === '/' ? t(staticCopy.home) : pageMetadata(item, t, lang).heading
    return `<li><a href="${escapeHtml(localPath(item, lang))}">${escapeHtml(label)}</a></li>`
  }).join('')
  const faq = route === '/' ? renderToStaticMarkup(createElement(PublicFaq, { t })) : ''
  return html.replace('<!-- route-intro -->', `<main><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p><nav aria-label="${escapeHtml(t(staticCopy.nav))}"><ul>${links}</ul></nav>${faq}</main>`)
}

/** 網站地圖：每種語言的公開頁，各自附上全部語言版本的互相標註。 */
export function sitemap() {
  const alternates = (path: string) => [
    ...languageCodes.map(code => `    <xhtml:link rel="alternate" hreflang="${code}" href="${localizedUrl(path, code)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${localizedUrl(path, 'zh-Hant')}"/>`,
  ].join('\n')
  const entries = languageCodes.flatMap(lang => publicPagePaths.map(path =>
    `  <url>\n    <loc>${localizedUrl(path, lang)}</loc>\n${alternates(path)}\n  </url>`)).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`
}

export function searchPages(): Plugin {
  return {
    name: 'scamcheck-search-pages',
    enforce: 'post',
    configureServer: {
      order: 'pre',
      handler(server) {
        // Cloudflare 本機模擬器只傳入 index.html 的磁碟路徑。讓公開頁保有原始網址。
        const templatePath = resolve(server.config.root, 'index.html')
        server.middlewares.use(async (req, res, next) => {
          const raw = req.url?.split('?')[0] ?? '/'
          // 語言網址（/en/check 等）也直接回傳該語言的公開頁。
          const { basename } = languageFromPath(raw)
          const path = raw.slice(basename.length).replace(/\/+$/, '') || '/'
          if (!publicPagePaths.includes(path) || !['GET', 'HEAD'].includes(req.method ?? '')) return next()
          try {
            const html = await server.transformIndexHtml('/index.html', await readFile(templatePath, 'utf8'), path)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(req.method === 'HEAD' ? undefined : html)
          } catch (error) { next(error) }
        })
      },
    },
    transformIndexHtml(html, context) {
      if (context.server) {
        const raw = new URL(context.originalUrl ?? context.path, 'http://localhost').pathname
        const { lang, basename } = languageFromPath(raw)
        return renderPage(html, raw.slice(basename.length) || '/', lang ?? 'zh-Hant')
      }
    },
    generateBundle: {
      order: 'post',
      handler(_, bundle) {
        // 此專案同時建置前端和 Worker，只有前端的輸出包含 HTML。
        const index = bundle['index.html']
        if (index?.type !== 'asset' || typeof index.source !== 'string') return
        const template = index.source
        index.source = renderPage(template, '/')
        for (const path of pagePaths.filter(path => path !== '/')) {
          this.emitFile({ type: 'asset', fileName: path.slice(1) + '.html', source: renderPage(template, path) })
        }
        // 其他語言只產生公開頁；私人頁的語言網址由 _redirects 回傳原本的不收錄樣板。
        for (const lang of languageCodes.filter(code => code !== 'zh-Hant')) {
          for (const path of publicPagePaths) {
            const fileName = `${PREFIX[lang as Exclude<Language, 'zh-Hant'>]}/${path === '/' ? 'index' : path.slice(1)}.html`
            this.emitFile({ type: 'asset', fileName, source: renderPage(template, path, lang) })
          }
        }
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() })
      },
    },
  }
}
