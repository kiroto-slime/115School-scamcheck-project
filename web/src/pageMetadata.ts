import { msg } from './i18n/msg'
import { languageCodes, PREFIX, type Language } from './i18n/languages'

export const SITE_ORIGIN = 'https://scamcheck.slimebvs.net'
export const SOURCE_URL = 'https://github.com/kiroto-slime/115School-scamcheck-project'
const shareImage = SITE_ORIGIN + '/share/scamcheck.jpg'
const brand: string = msg('識詐數據庫')

type PageCopy = { title: string; description: string; private?: true }
const pages: Record<string, PageCopy> = {
  '/': {
    title: msg('可疑訊息與詐騙查核工具'),
    description: msg('收到包裹簡訊、購物廣告或可疑連結？識詐數據庫可查核文字、截圖與短片，解釋風險特徵，也提供可安心試看的防詐教學範例。'),
  },
  '/check': {
    title: msg('防詐查核：分析可疑訊息、截圖與短片'),
    description: msg('貼上可疑訊息或上傳截圖、短片，查看規則分析與可選的 Cofacts、網址安全和 AI 查核線索，了解下一步如何查證。'),
  },
  '/guides/parcel-message': {
    title: msg('包裹地址有誤？認識假冒物流簡訊'),
    description: msg('用一則合成的包裹簡訊練習識別限時退件、補運費和更新地址等警訊，學會從原始訂單與物流官網核對。閱讀範例無須上傳自己的訊息。'),
  },
  '/research': {
    title: msg('匿名防詐研究測驗'),
    description: msg('先自行判斷模擬訊息，再使用查核輔助，比較前後的判斷。瞭解三重商工資料處理科學生研究的匿名流程與參與同意。'),
  },
  '/products': {
    title: msg('防詐教材與產品需求調查'),
    description: msg('比較免費查核工具、防詐教材與案例包、教育報告三種產品構想，透過匿名問卷分享課堂與日常防詐的需求。'),
  },
  '/game': {
    title: msg('小方塊跑酷：防詐練習遊戲'),
    description: msg('在手機或電腦上操控小方塊，跑酷途中挑戰防詐練習題、閱讀答案解析。遊戲分數與最近作答保存在自己的瀏覽器。'),
  },
  '/chat': {
    title: msg('防詐小知識對話'),
    description: msg('在瀏覽器內開啟防詐小知識對話，每送出一則訊息就抽一則防詐提醒，練習日常遇到可疑訊息時的應對方式。'),
  },
  '/privacy': {
    title: msg('隱私、研究同意與資料刪除說明'),
    description: msg('了解查核與研究資料如何處理、外部服務會收到哪些資料、保存多久，以及如何用匿名研究編號撤回同意或刪除研究資料。'),
  },
  '/history': {
    private: true,
    title: msg('查核紀錄'),
    description: msg('檢視這個瀏覽器保存的查核摘要。'),
  },
  '/admin': {
    private: true,
    title: msg('管理後台'),
    description: msg('網站管理員登入與管理工具。'),
  },
  '/result': {
    private: true,
    title: msg('查核結果'),
    description: msg('檢視這次查核的說明與建議。'),
  },
}
const missing: PageCopy = {
  private: true,
  title: msg('找不到頁面'),
  description: msg('回首頁繼續使用識詐數據庫。'),
}
// 直接開啟公開網址時，靜態頁摘要用到的固定文字（建置時翻譯）。
export const staticCopy = { home: msg('識詐數據庫首頁'), nav: msg('網站導覽'), back: msg('回首頁'), check: msg('查核自己的訊息') }
export const pagePaths = Object.keys(pages)
export const publicPagePaths = pagePaths.filter(path => !pages[path].private)

/** 某頁在某語言的完整網址：繁中是原網址，其他語言加前綴（首頁以斜線結尾）。 */
export function localizedUrl(path: string, lang: Language) {
  if (lang === 'zh-Hant') return SITE_ORIGIN + path
  return SITE_ORIGIN + '/' + PREFIX[lang] + (path === '/' ? '/' : path)
}

export function pageMetadata(pathname: string, select: (zh: string) => string = zh => zh, lang: Language = 'zh-Hant') {
  const path = pathname.replace(/\/+$/, '') || '/'
  // 只比對固定路由；絕不把編號、查詢參數或使用者輸入帶入標籤。
  const key = path.startsWith('/result/') ? '/result' : path
  const page = Object.hasOwn(pages, key) ? pages[key] : missing
  return {
    heading: select(page.title),
    title: select(page.title) + '｜' + select(brand),
    description: select(page.description),
    robots: page.private ? 'noindex, nofollow' : 'index, follow',
    canonical: page.private ? null : localizedUrl(key, lang),
    path: key,
  }
}
export type HeadTag = {
  tag: 'title' | 'meta' | 'link' | 'script'
  attrs?: Record<string, string>
  text?: string
}

export function pageHead(pathname: string, select: (zh: string) => string = zh => zh, lang: Language = 'zh-Hant'): HeadTag[] {
  const page = pageMetadata(pathname, select, lang)
  const tags: HeadTag[] = [
    { tag: 'title', text: page.title },
    { tag: 'meta', attrs: { name: 'description', content: page.description } },
    { tag: 'meta', attrs: { name: 'robots', content: page.robots } },
  ]
  if (page.canonical) tags.push(
    { tag: 'link', attrs: { rel: 'canonical', href: page.canonical } },
    { tag: 'meta', attrs: { property: 'og:type', content: 'website' } },
    { tag: 'meta', attrs: { property: 'og:url', content: page.canonical } },
    { tag: 'meta', attrs: { property: 'og:title', content: page.title } },
    { tag: 'meta', attrs: { property: 'og:description', content: page.description } },
    { tag: 'meta', attrs: { property: 'og:image', content: shareImage } },
    { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
    { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
    { tag: 'meta', attrs: { property: 'og:image:alt', content: select('識詐數據庫 ScamCheck，包裹旁的手機顯示地址確認通知。') } },
  )
  if (page.canonical && page.path === '/') {
    tags.push({ tag: 'script', attrs: { type: 'application/ld+json' }, text: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': SITE_ORIGIN + '/#app',
      name: brand,
      alternateName: 'ScamCheck',
      url: page.canonical,
      sameAs: SOURCE_URL,
      inLanguage: languageCodes,
      isAccessibleForFree: true,
      description: pageMetadata('/check', select, lang).description,
      featureList: select('比對警政署 165 涉詐網站公開名單'),
    }) })
  }
  // 各語言版本互相標註，讓搜尋引擎依搜尋者的語言顯示對應網址。
  if (page.canonical) {
    for (const code of languageCodes) tags.push({ tag: 'link', attrs: { rel: 'alternate', hreflang: code, href: localizedUrl(page.path, code) } })
    tags.push({ tag: 'link', attrs: { rel: 'alternate', hreflang: 'x-default', href: localizedUrl(page.path, 'zh-Hant') } })
  }
  return tags
}
