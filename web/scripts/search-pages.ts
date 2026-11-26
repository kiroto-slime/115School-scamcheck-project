import type { Plugin } from 'vite'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParcelGuideContent, PublicFaq } from '../src/components/PublicGuideContent'
import { pageHead, pageMetadata, pagePaths, publicPagePaths, SITE_ORIGIN } from '../src/pageMetadata'

const marker = '<!-- route-head -->'
const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

function renderPage(template: string, path: string) {
  if (!template.includes(marker)) throw new Error('首頁樣板缺少搜尋標籤的位置。')
  const head = pageHead(path).map(({tag, attrs, text}) => {
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
  const t = (zh: string) => zh
  if (route === '/guides/parcel-message') {
    const guide = renderToStaticMarkup(createElement(ParcelGuideContent, { t }))
    return html.replace('<!-- route-intro -->', `<main><article class="card home-example parcel-guide"><a class="guide-back" href="/">回首頁</a>${guide}<a class="btn-primary guide-check" href="/check">查核自己的訊息</a></article></main>`)
  }
  const page = pageMetadata(route)
  const destinations = route === '/' ? publicPagePaths.filter(item => item !== '/') : ['/']
  const links = destinations.map(item => {
    const label = item === '/' ? '識詐數據庫首頁' : pageMetadata(item).heading
    return `<li><a href="${escapeHtml(item)}">${escapeHtml(label)}</a></li>`
  }).join('')
  const faq = route === '/' ? renderToStaticMarkup(createElement(PublicFaq, { t })) : ''
  return html.replace('<!-- route-intro -->', `<main><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.description)}</p><nav aria-label="網站導覽"><ul>${links}</ul></nav>${faq}</main>`)
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
          const path = req.url?.split('?')[0].replace(/\/+$/, '') || '/'
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
        const path = new URL(context.originalUrl ?? context.path, 'http://localhost').pathname
        return renderPage(html, path)
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
        const entries = publicPagePaths.map(path => `  <url><loc>${SITE_ORIGIN}${path}</loc></url>`).join('\n')
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n` })
      },
    },
  }
}
