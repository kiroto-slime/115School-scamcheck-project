const topics = [
  { words: ['驗證碼', 'otp', '認證碼'], reply: '驗證碼先留給自己。若對方說退款需要驗證碼，可以直接打開購物平台，從原本的訂單聯絡客服。' },
  { words: ['朋友', '借錢', '親友', '家人'], reply: '先用原本存的電話打給對方，確認是本人再決定。就算訊息來自熟悉的帳號，也可能是別人在用。' },
  { words: ['包裹', '物流', '配送', '運費'], reply: '收到「包裹地址有誤」的簡訊，可以自己打開購物或物流 App 查配送進度。簡訊裡的連結先別點。' },
  { words: ['退款', '解除分期', '重複扣款'], reply: '打開原本購物的 App，從訂單查退款進度。如果來電的人要你照著操作 ATM 或網路銀行，先掛電話，再向平台確認。' },
  { words: ['釣魚', '連結', '網址', '短網址'], reply: '先別從訊息裡的連結登入。自己打開平常使用的官方 App 或書籤，看看帳號裡是否真的有這則通知。' },
  { words: ['點數卡', '禮物卡'], reply: '點數卡序號給了別人，對方就可能把餘額用掉。有人請你買卡再拍照給他時，先把卡片和收據留在自己手上。' },
  { words: ['投資', '出金'], reply: '投資平台畫面上的獲利可以造假。如果提領時被要求再匯一筆「保證金」，先停下來，保留交易和對話紀錄。' },
  { words: ['中獎', '抽獎'], reply: '收到中獎私訊時，自己到主辦單位的官方頁面找活動公告。如果對方催你先匯手續費，先別付款。' },
  { words: ['求職', '打工'], reply: '應徵打工時，若對方要求寄出提款卡和密碼來「驗證薪轉帳戶」，請把卡片留在自己手上，另外查證徵才單位。' },
] as const

export const tipQuestion = '給我一則防詐提醒'
export const siteQuestion = '這個網站怎麼用？'
export type ChatScope = 'support' | 'prevention'

/** 每個對話視窗各自抽選，一輪抽完才重來，換輪也避開上一則。 */
export function createTipPicker() {
  const pool = topics.map(topic => topic.reply)
  const seen = new Set<string>()
  let last = ''
  return () => {
    if (seen.size === pool.length) seen.clear()
    const choices = pool.filter(reply => !seen.has(reply) && reply !== last)
    last = choices[Math.floor(Math.random() * choices.length)]
    seen.add(last)
    return '防詐小知識：' + last
  }
}

export function answerQuestion(question: string, scope: ChatScope, pickTip: () => string) {
  if (scope === 'prevention') return pickTip()
  const text = question.normalize('NFKC').toLowerCase().replace(/\s/g, '')
  const topic = topics.find(({ words }) => words.some(word => text.includes(word)))
  if (topic) return topic.reply
  if (/網站|怎麼查核|如何查核|怎麼使用|怎麼用|怎麼查/.test(text)) {
    return '收到拿不準的訊息，可以到「防詐查核」貼上文字或上傳截圖。結果會列出哪些地方值得留意，以及接下來可以怎麼做。'
  }
  return pickTip()
}
