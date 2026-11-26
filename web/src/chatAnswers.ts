import type { Copy } from './language'

const topics: { words: string[]; reply: Copy }[] = [
  {
    words: ['驗證碼', 'otp', '認證碼', 'verificationcode', 'one-time', 'passcode', '認証コード', '確認コード', '인증번호', '인증코드'],
    reply: [
      '驗證碼先留給自己。若對方說退款需要驗證碼，可以直接打開購物平台，從原本的訂單聯絡客服。',
      'Keep verification codes to yourself. If someone asks for one to issue a refund, open the shopping app and contact support from the original order.',
      '認証コードは人に教えないでください。返金に必要だと言われたら、通販アプリを自分で開き、注文履歴から問い合わせましょう。',
      '인증번호는 본인만 보관하세요. 환불하려면 인증번호가 필요하다고 하면 쇼핑 앱의 주문 내역에서 직접 고객센터에 문의하세요.',
    ],
  },
  {
    words: ['朋友', '借錢', '親友', '家人', 'friend', 'borrow', 'family', '友達', '友人', '借金', '家族', '친구', '가족', '돈을빌'],
    reply: [
      '先用原本存的電話打給對方，確認是本人再決定。就算訊息來自熟悉的帳號，也可能是別人在用。',
      'Call the person on a number you already know before deciding. Someone else might be using a familiar account.',
      '以前から知っている電話番号にかけて、本人か確かめてから判断しましょう。見慣れたアカウントでも別人が使っていることがあります。',
      '원래 알고 있던 전화번호로 연락해 본인인지 확인하세요. 익숙한 계정도 다른 사람이 쓰고 있을 수 있어요.',
    ],
  },
  {
    words: ['包裹', '物流', '配送', '運費', 'parcel', 'package', 'delivery', 'shipping', '荷物', '配送', '宅配', '택배', '배송'],
    reply: [
      '收到「包裹地址有誤」的簡訊，可以自己打開購物或物流 App 查配送進度。簡訊裡的連結先別點。',
      'If a text says your parcel address is wrong, open the shopping or delivery app yourself to check the shipment. Leave the link in the text alone.',
      '「お届け先の住所に誤りがあります」と届いたら、通販や配送会社の公式アプリから配送状況を確認しましょう。SMSのリンクは開かないでください。',
      '주소가 잘못됐다는 문자를 받으면 쇼핑 앱이나 택배사 앱을 직접 열어 배송 상황을 확인하세요. 문자의 링크는 누르지 마세요.',
    ],
  },
  {
    words: ['退款', '解除分期', '重複扣款', 'refund', 'duplicatecharge', '返金', '二重請求', '환불', '중복결제'],
    reply: [
      '打開原本購物的 App，從訂單查退款進度。如果來電的人要你照著操作 ATM 或網路銀行，先掛電話，再向平台確認。',
      'Check your refund in the original order. If a caller tells you to operate an ATM or use online banking, hang up and contact the platform yourself.',
      '返金状況は注文履歴で確認できます。電話でATMやネットバンキングの操作を指示されたら電話を切り、自分で購入先に確認しましょう。',
      '환불 상태는 주문 내역에서 확인하세요. 전화로 ATM이나 인터넷 뱅킹을 조작하라고 하면 전화를 끊고 쇼핑몰에 직접 확인하세요.',
    ],
  },
  {
    words: ['釣魚', '連結', '網址', '短網址', 'phishing', 'url', 'link', 'フィッシング', 'リンク', '피싱', '링크'],
    reply: [
      '先別從訊息裡的連結登入。自己打開平常使用的官方 App 或書籤，看看帳號裡是否真的有這則通知。',
      'To check an account notice, use your usual app or bookmark. Avoid signing in through a link in a message.',
      'アカウントに関する通知は、普段の公式アプリやブックマークから確認しましょう。メッセージのリンクからのログインは避けてください。',
      '계정 알림은 평소 쓰는 공식 앱이나 즐겨찾기에서 확인하세요. 메시지 속 링크로 로그인하지 마세요.',
    ],
  },
  {
    words: ['點數卡', '禮物卡', 'giftcard', 'ギフトカード', '기프트카드', '상품권'],
    reply: [
      '點數卡序號給了別人，對方就可能把餘額用掉。有人請你買卡再拍照給他時，先把卡片和收據留在自己手上。',
      'Anyone who gets a gift card code may be able to spend its balance. If someone wants a photo of a card, keep the card and receipt with you.',
      'ギフトカードの番号を知られると残高を使われるおそれがあります。購入後に写真を求められても、カードとレシートは手元に保管しましょう。',
      '상품권 번호를 알려 주면 상대방이 잔액을 사용할 수 있어요. 구매 후 사진을 보내 달라고 하면 카드와 영수증은 직접 보관하세요.',
    ],
  },
  {
    words: ['投資', '出金', 'invest', 'withdrawal', '投資', '出金', '투자', '출금'],
    reply: [
      '投資平台畫面上的獲利可以造假。如果提領時被要求再匯一筆「保證金」，先停下來，保留交易和對話紀錄。',
      'The profits displayed on an investment platform can be fabricated. If it asks for a deposit before you can withdraw, stop and keep the transaction and chat records.',
      '投資サイトの利益表示は偽装できます。出金のために追加の保証金を求められたら、送金を止め、取引とやり取りの記録を残しましょう。',
      '투자 사이트에 표시된 수익은 조작될 수 있어요. 출금하려면 보증금을 더 내라고 할 경우 송금을 멈추고 거래 및 대화 기록을 보관하세요.',
    ],
  },
  {
    words: ['中獎', '抽獎', 'prize', 'raffle', 'lottery', '当選', '懸賞', '당첨', '경품'],
    reply: [
      '收到中獎私訊時，自己到主辦單位的官方頁面找活動公告。如果對方催你先匯手續費，先別付款。',
      'If a message says you won a prize, look up the promotion on the organizer’s official site. Hold off if anyone pushes you to pay a fee first.',
      '当選のメッセージを受け取ったら、主催者の公式サイトで告知を確認しましょう。先に手数料を振り込むよう急かされても支払わないでください。',
      '당첨 메시지를 받으면 주최 측 공식 사이트에서 행사를 확인하세요. 수수료부터 보내라고 재촉하면 송금을 멈추세요.',
    ],
  },
  {
    words: ['求職', '打工', 'job', 'recruit', 'workoffer', '求人', 'アルバイト', '구직', '아르바이트'],
    reply: [
      '應徵打工時，若對方要求寄出提款卡和密碼來「驗證薪轉帳戶」，請把卡片留在自己手上，另外查證徵才單位。',
      'A recruiter might say they need your bank card and PIN to verify payroll. Keep the card and check the employer independently.',
      '給与口座の確認のためにカードと暗証番号を送るよう言われても、カードを渡さず、自分で募集元を確認してください。',
      '급여 계좌 확인을 위해 카드와 비밀번호를 요구한다면 카드를 보내지 말고 별도로 채용 업체를 확인하세요.',
    ],
  },
]

export const tipQuestion: Copy = ['給我一則防詐提醒', 'Give me a safety tip', '詐欺対策のヒントを見る', '사기 예방 팁 보기']
export const siteQuestion: Copy = ['這個網站怎麼用？', 'How do I use this site?', 'このサイトの使い方は？', '이 사이트는 어떻게 사용하나요?']
export type ChatScope = 'support' | 'prevention'
export type Reply = { text: Copy; tip?: boolean }

/** 每個對話視窗各自抽選，一輪抽完才重來，換輪也避開上一則。 */
export function createTipPicker() {
  const seen = new Set<Copy>()
  let last: Copy | undefined
  return (): Reply => {
    if (seen.size === topics.length) seen.clear()
    const choices = topics.filter(({ reply }) => !seen.has(reply) && reply !== last)
    last = choices[Math.floor(Math.random() * choices.length)].reply
    seen.add(last)
    return { text: last, tip: true }
  }
}

export function answerQuestion(question: string, scope: ChatScope, pickTip: () => Reply): Reply {
  if (scope === 'prevention') return pickTip()
  const text = question.normalize('NFKC').toLowerCase().replace(/\s/g, '')
  const topic = topics.find(({ words }) => words.some(word => text.includes(word)))
  if (topic) return { text: topic.reply }
  if (/網站|怎麼查核|如何查核|怎麼使用|怎麼用|怎麼查|thissite|website|サイト|使い方|사이트/.test(text)) {
    return { text: [
      '收到拿不準的訊息，可以到「防詐查核」貼上文字或上傳截圖。結果會列出哪些地方值得留意，以及接下來可以怎麼做。',
      'Open Scam check to paste a message or upload a screenshot. The results highlight warning signs and suggest what to do next.',
      '「詐欺チェック」にメッセージを貼り付けるか、スクリーンショットをアップロードしてください。注意点と次にできることが表示されます。',
      '「사기 확인」에서 메시지를 붙여 넣거나 화면 캡처를 올리세요. 결과에서 주의할 점과 다음에 할 일을 확인할 수 있어요.',
    ] }
  }
  return pickTip()
}
