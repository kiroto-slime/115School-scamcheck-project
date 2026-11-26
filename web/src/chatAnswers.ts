const topics = [
  { words: ['驗證碼', 'otp', '認證碼'], reply: '驗證碼先留給自己。若對方說退款需要驗證碼，可以直接打開購物平台，從原本的訂單聯絡客服。' },
  { words: ['朋友', '借錢', '親友', '家人'], reply: '先用原本存的電話打給對方，確認是本人再決定。就算訊息來自熟悉的帳號，也可能是別人在用。' },
  { words: ['包裹', '物流', '配送', '運費'], reply: '收到「包裹地址有誤」的簡訊，可以自己打開購物或物流 App 查配送進度。簡訊裡的連結先別點。' },
  { words: ['退款', '解除分期', '重複扣款'], reply: '打開原本購物的 App，從訂單查退款進度。如果來電的人要你照著操作 ATM 或網路銀行，先掛電話，再向平台確認。' },
  { words: ['釣魚', '連結', '網址', '短網址'], reply: '先別從訊息裡的連結登入。自己打開平常使用的官方 App 或書籤，看看帳號裡是否真的有這則通知。' },
] as const

export const tipQuestion = '給我一則防詐提醒'
export const siteQuestion = '這個網站怎麼用？'
export type ChatScope = 'support' | 'prevention'

export function answerQuestion(question: string, scope: ChatScope) {
  const text = question.normalize('NFKC').toLowerCase().replace(/\s/g, '')
  if (text.replace(/[。!?！？，,]/g, '') === tipQuestion) {
    return topics[Math.floor(Math.random() * topics.length)].reply
  }
  const topic = topics.find(({ words }) => words.some(word => text.includes(word)))
  if (topic) return topic.reply
  if (scope === 'support' && /網站|怎麼查核|如何查核|怎麼使用|怎麼用|怎麼查/.test(text)) {
    return '收到拿不準的訊息，可以到「防詐查核」貼上文字或上傳截圖。結果會列出哪些地方值得留意，以及接下來可以怎麼做。'
  }
  return '這題目前沒有收錄。你可以換個問法，或到「防詐查核」檢查收到的訊息。'
}
