/** 個資遮蔽規則（Cofacts／Gemini／存檔／匯出共用）。順序有意義，避免規則互相吃掉。 */
const ADDRESS = /[一-龥]{2,3}[縣市](?:[一-龥]{1,4}[區鄉鎮市])?[一-龥\d]{0,12}?(?:路|街|大道)[一-龥\d之-]{0,10}?\d+號(?:之\d+)?(?:\d+樓)?/g
const NAME_LABEL = /(姓名[:：]\s*)[一-龥]{2,4}/g
const NAME_TITLE = /(?<![一-龥])[一-龥]{2,4}(?=先生|小姐|女士|同學|老師)/g

/** 送往第三方或存檔前，遮蔽常見個資 */
export function redactPii(text: string): string {
  return text
    .replace(/(?<![A-Za-z0-9])[A-Z][12]\d{8}(?!\d)/g, '[身分證]')
    .replace(/(?<!\d)09\d{2}[- ]?\d{3}[- ]?\d{3}(?!\d)/g, '[手機]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g, '[Email]')
    .replace(ADDRESS, '[地址]')
    .replace(NAME_LABEL, '$1[姓名]')
    .replace(NAME_TITLE, '[姓名]')
    .replace(/(?<!\d)0\d{1,2}-?\d{6,8}(?!\d)/g, '[電話]')
    .replace(/(?<![A-Za-z0-9])[A-Z]{2,3}-\d{3,4}(?![A-Za-z0-9])/g, '[車牌]')
    .replace(/(?<![A-Za-z0-9])\d{3,4}-[A-Z]{2,3}(?![A-Za-z0-9])/g, '[車牌]')
    .replace(/(?<!\d)\d{10,16}(?!\d)/g, '[數字帳號]')
}

/** 去掉文字中網址的 ?query 與 #fragment（可能夾帶個資或追蹤碼） */
export function stripUrlQueries(text: string): string {
  return text.replace(/(https?:\/\/[^\s?#<>「」『』，。；、]+)[?#][^\s<>「」『』，。；、]*/gi, '$1')
}
