/** 個資遮蔽規則（Cofacts／Gemini／存檔／匯出共用）。順序有意義，避免規則互相吃掉。 */
const ADDRESS = /[一-龥]{2}[縣市](?:[一-龥]{1,4}[區鄉鎮市])?[一-龥\d]{0,12}?(?:路|街|大道)[一-龥\d之-]{0,10}?\d+號(?:之\d+)?(?:\d+樓)?/g
const NAME_LABEL = /(姓名[:：]\s*)[一-龥]{2,4}/g
const NAME_TITLE = /([一-龥]{2,3})(?=先生|小姐|女士|同學|老師)/g
// 這些不是人名，後面接稱謂時不遮（例如「我是老師」「各位同學」）
const NOT_NAMES = new Set(['我是', '各位', '請問', '親愛', '您是', '你是', '就是', '只是', '還是', '這位', '那位', '一位', '全體', '敬愛'])
// 量詞都有上限，避免回溯過多（輸入最長 10000 字）
// 國際格式手機：+886-912-345-678、+886 912 345 678、+886912345678
const INTL_MOBILE = /(?<![\d+])\+?886[- ]?9\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)/g
// 國際格式市話：+886-2-2345-6789、+886 (2) 2345 6789
const INTL_LANDLINE = /(?<![\d+])\+886[- ]?\(?[2-8]\d{0,2}\)?[- ]?\d{3,4}[- ]?\d{4}(?!\d)(?![- ]\d)/g
// 分段市話：02-2345-6789、(04)2234-5678、(02) 2345 6789；後面若還接一段數字（多半是帳號）就不當電話
const LANDLINE = /(?<![\d+])(?:\(0\d{1,3}\)[- ]?|0\d{1,3}[- ])\d{3,4}[- ]?\d{4}(?!\d)(?![- ]\d)/g
// 用「-」或空白分段的帳號：1234-5678-9012-3456、822 1234 5678 9012（數字總數 10～16 才算）
const SEGMENTED_ACCOUNT = /(?<!\d)\d{3,4}(?:[- ]\d{3,6}){2,4}(?!\d)/g

/** 送往第三方或存檔前，遮蔽常見個資 */
export function redactPii(text: string): string {
  return text
    .replace(/(?<![A-Za-z0-9])[A-Z][12]\d{8}(?!\d)/g, '[身分證]')
    .replace(INTL_MOBILE, '[手機]')
    .replace(/(?<!\d)09\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)/g, '[手機]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g, '[Email]')
    .replace(ADDRESS, '[地址]')
    .replace(NAME_LABEL, '$1[姓名]')
    .replace(NAME_TITLE, (m) => (NOT_NAMES.has(m) ? m : '[姓名]'))
    .replace(INTL_LANDLINE, '[電話]')
    .replace(LANDLINE, '[電話]')
    .replace(/(?<!\d)0\d{1,2}-?\d{6,8}(?!\d)(?![- ]\d)/g, '[電話]')
    .replace(/(?<![A-Za-z0-9])[A-Z]{2,3}-\d{3,4}(?![A-Za-z0-9])/g, '[車牌]')
    .replace(/(?<![A-Za-z0-9])\d{3,4}-[A-Z]{2,3}(?![A-Za-z0-9])/g, '[車牌]')
    .replace(SEGMENTED_ACCOUNT, (m) => {
      const digits = m.replace(/\D/g, '').length
      return digits >= 10 && digits <= 16 ? '[數字帳號]' : m
    })
    .replace(/(?<!\d)\d{10,16}(?!\d)/g, '[數字帳號]')
}

/** 去掉文字中網址的 ?query 與 #fragment（可能夾帶個資或追蹤碼） */
export function stripUrlQueries(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#<>「」『』，。；、]+)[?#][^\s<>「」『』，。；、]*/gi, '$1')
}
