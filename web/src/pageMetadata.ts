import type { Copy } from './language'

export const SITE_ORIGIN = 'https://scamcheck.slimebvs.net'
export const SOURCE_URL = 'https://github.com/kiroto-slime/115School-scamcheck-project'
const shareImage = SITE_ORIGIN + '/share/scamcheck.jpg'
const brand: Copy = ['識詐數據庫', 'ScamCheck', '詐欺チェック', '사기 확인']

type PageCopy = { title: Copy; description: Copy; private?: true }
const pages: Record<string, PageCopy> = {
  '/': {
    title: ['可疑訊息與詐騙查核工具', 'Scam checks for suspicious messages', '不審なメッセージの確認ツール', '의심스러운 메시지 확인 도구'],
    description: [
      '收到包裹簡訊、購物廣告或可疑連結？識詐數據庫可查核文字、截圖與短片，解釋風險特徵，也提供可安心試看的防詐教學範例。',
      'Check a suspicious text, screenshot or short video. See the warning signs in a delivery notice, shopping ad or link, or start with a fictional parcel text.',
      '不審な配送SMSや通販広告、リンクの注意点を確認。テキスト、画像、短い動画に対応し、架空のSMSでも練習できます。',
      '의심스러운 배송 문자, 쇼핑 광고, 링크를 확인하세요. 텍스트와 스크린샷, 짧은 영상의 위험 신호를 살펴보고 가상 문자로 연습할 수 있습니다.',
    ],
  },
  '/check': {
    title: ['防詐查核：分析可疑訊息、截圖與短片', 'Check a message, screenshot or video', 'メッセージ・画像・動画の詐欺対策チェック', '메시지·스크린샷·영상 사기 위험 확인'],
    description: [
      '貼上可疑訊息或上傳截圖、短片，查看規則分析與可選的 Cofacts、網址安全和 AI 查核線索，了解下一步如何查證。',
      'Paste a message or upload a screenshot or short video. Review rule-based warning signs and choose whether to use Cofacts, link checks and AI analysis.',
      'メッセージやスクリーンショット、短い動画から注意点を確認できます。Cofactsとの照合、URLの安全性チェック、AI分析も選べます。',
      '메시지를 붙여 넣거나 스크린샷·짧은 영상을 올려 위험 신호를 확인하세요. Cofacts 비교, URL 안전 확인, AI 분석도 선택할 수 있습니다.',
    ],
  },
  '/guides/parcel-message': {
    title: ['包裹地址有誤？認識假冒物流簡訊', 'Wrong delivery address? Spotting a fake parcel text', '住所不備を装う配送SMSの見分け方', '배송 주소 오류? 가짜 배송 문자 알아보기'],
    description: [
      '用一則合成的包裹簡訊練習識別限時退件、補運費和更新地址等警訊，學會從原始訂單與物流官網核對。閱讀範例無須上傳自己的訊息。',
      'Explore a fictional delivery text that demands a small fee and an address update. Learn how to verify the parcel using your order and the carrier’s official site.',
      '再配達料や住所更新を求める架空のSMSを例に、急がせる言葉を見抜き、注文履歴と配送会社の公式サイトで確認する方法を学べます。',
      '주소 수정과 소액 재배송비를 요구하는 가상 문자에서 위험 신호를 찾아보세요. 주문 내역과 배송업체 공식 사이트에서 확인하는 방법을 안내합니다.',
    ],
  },
  '/research': {
    title: ['匿名防詐研究測驗', 'Anonymous scam-awareness research quiz', '匿名の詐欺対策研究テスト', '익명 사기 예방 연구 퀴즈'],
    description: [
      '先自行判斷模擬訊息，再使用查核輔助，比較前後的判斷。瞭解三重商工資料處理科學生研究的匿名流程與參與同意。',
      'Assess simulated messages before and after using a checking aid. Learn how consent and anonymous participation work in this student research project.',
      '模擬メッセージを自分で判定し、確認ツールを使った後と比較します。生徒による研究の参加手順、同意、匿名化について確認できます。',
      '가상 메시지를 스스로 판단한 뒤 확인 도구 사용 전후의 판단을 비교합니다. 학생 연구의 익명 참여 절차와 동의 내용을 확인하세요.',
    ],
  },
  '/products': {
    title: ['防詐教材與產品需求調查', 'Scam prevention tools and teaching survey', '詐欺対策教材とニーズ調査', '사기 예방 교육 자료와 수요 조사'],
    description: [
      '比較免費查核工具、防詐教材與案例包、教育報告三種產品構想，透過匿名問卷分享課堂與日常防詐的需求。',
      'Compare ideas for a scam checking tool, classroom materials and educational reports. Share your needs in an anonymous survey.',
      '詐欺確認ツール、授業用教材・事例集、教育レポートの構想を比較し、匿名アンケートで必要な機能を伝えられます。',
      '사기 확인 도구, 수업 자료와 사례집, 교육 보고서 아이디어를 비교하고 익명 설문으로 필요한 기능을 알려 주세요.',
    ],
  },
  '/game': {
    title: ['小方塊跑酷：防詐練習遊戲', 'Block Parkour scam-awareness game', 'ブロックパルクールで詐欺対策を練習', '블록 파쿠르 사기 예방 연습 게임'],
    description: [
      '在手機或電腦上操控小方塊，跑酷途中挑戰防詐練習題、閱讀答案解析。遊戲分數與最近作答保存在自己的瀏覽器。',
      'Play Block Parkour on a phone or computer, answer scam-awareness questions and read explanations. Scores and recent answers stay in your browser.',
      'スマートフォンやパソコンでブロックを操作し、詐欺対策問題に挑戦。解説を読めます。得点や最近の回答はブラウザーに保存します。',
      '휴대전화나 컴퓨터로 블록을 조작하며 사기 예방 문제를 풀고 해설을 읽으세요. 점수와 최근 답변은 브라우저에 저장됩니다.',
    ],
  },
  '/chat': {
    title: ['防詐小知識對話', 'Chat for scam prevention tips', 'チャットで学ぶ詐欺対策のヒント', '대화로 살펴보는 사기 예방 팁'],
    description: [
      '在瀏覽器內開啟防詐小知識對話，每送出一則訊息就抽一則防詐提醒，練習日常遇到可疑訊息時的應對方式。',
      'Get a scam prevention tip with each message in this browser-based chat. Explore ways to respond to suspicious messages in everyday life.',
      'ブラウザーでメッセージを送るたびに詐欺対策のヒントを一つ紹介します。不審な連絡を受けたときの対応を学べます。',
      '브라우저에서 메시지를 보낼 때마다 사기 예방 팁을 하나씩 받아 보세요. 일상에서 의심스러운 연락에 대처하는 방법을 익힐 수 있습니다.',
    ],
  },
  '/privacy': {
    title: ['隱私、研究同意與資料刪除說明', 'Privacy, research consent and data deletion', 'プライバシー・研究同意・データ削除', '개인정보·연구 동의·자료 삭제 안내'],
    description: [
      '了解查核與研究資料如何處理、外部服務會收到哪些資料、保存多久，以及如何用匿名研究編號撤回同意或刪除研究資料。',
      'See how scam checks and research data are processed and retained, what external services receive, and how to withdraw consent or delete research data.',
      'メッセージ確認と研究データの処理・保存期間、外部サービスに送る内容、研究への同意の撤回やデータの削除方法を説明します。',
      '확인과 연구 자료를 처리·보관하는 방식, 외부 서비스로 전송하는 항목, 연구 동의 철회 및 자료 삭제 방법을 안내합니다.',
    ],
  },
  '/history': {
    private: true,
    title: ['查核紀錄', 'Check history', '確認履歴', '확인 기록'],
    description: ['檢視這個瀏覽器保存的查核摘要。', 'View check summaries saved in this browser.', 'このブラウザーに保存された確認の概要を表示します。', '이 브라우저에 저장된 확인 요약을 봅니다.'],
  },
  '/admin': {
    private: true,
    title: ['管理後台', 'Administration', '管理画面', '관리 화면'],
    description: ['網站管理員登入與管理工具。', 'Site administrator sign-in and tools.', '管理者用ログインと管理ツール。', '사이트 관리자 로그인 및 관리 도구입니다.'],
  },
  '/result': {
    private: true,
    title: ['查核結果', 'Check results', '確認結果', '확인 결과'],
    description: ['檢視這次查核的說明與建議。', 'View explanations and suggestions for this check.', '確認結果の説明とアドバイスを表示します。', '이번 확인의 설명과 권장 행동을 봅니다.'],
  },
}
const missing: PageCopy = {
  private: true,
  title: ['找不到頁面', 'Page not found', 'ページが見つかりません', '페이지를 찾을 수 없습니다'],
  description: ['回首頁繼續使用識詐數據庫。', 'Return to the home page.', 'ホームへ戻ってください。', '홈으로 돌아가세요.'],
}
export const pagePaths = Object.keys(pages)
export const publicPagePaths = pagePaths.filter(path => !pages[path].private)

export function pageMetadata(pathname: string, select: (...copy: Copy) => string = zh => zh) {
  const path = pathname.replace(/\/+$/, '') || '/'
  // 只比對固定路由；絕不把編號、查詢參數或使用者輸入帶入標籤。
  const key = path.startsWith('/result/') ? '/result' : path
  const page = Object.hasOwn(pages, key) ? pages[key] : missing
  return {
    heading: select(...page.title),
    title: select(...page.title) + '｜' + select(...brand),
    description: select(...page.description),
    robots: page.private ? 'noindex, nofollow' : 'index, follow',
    canonical: page.private ? null : SITE_ORIGIN + key,
  }
}
export type HeadTag = {
  tag: 'title' | 'meta' | 'link' | 'script'
  attrs?: Record<string, string>
  text?: string
}

export function pageHead(pathname: string, select: (...copy: Copy) => string = zh => zh): HeadTag[] {
  const page = pageMetadata(pathname, select)
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
    { tag: 'meta', attrs: { property: 'og:image:alt', content: select(
      '識詐數據庫 ScamCheck，包裹旁的手機顯示地址確認通知。',
      'ScamCheck: a phone beside a parcel shows an address confirmation message.',
      'ScamCheck。荷物の横にあるスマートフォンに住所確認の通知が表示されています。',
      'ScamCheck. 택배 상자 옆 휴대전화에 주소 확인 알림이 표시되어 있습니다.',
    ) } },
  )
  if (page.canonical === SITE_ORIGIN + '/') {
    tags.push({ tag: 'script', attrs: { type: 'application/ld+json' }, text: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      '@id': SITE_ORIGIN + '/#app',
      name: brand[0],
      alternateName: brand[1],
      url: page.canonical,
      sameAs: SOURCE_URL,
      inLanguage: ['zh-Hant', 'en', 'ja', 'ko'],
      isAccessibleForFree: true,
      description: pageMetadata('/check', select).description,
      featureList: select('比對警政署 165 涉詐網站公開名單', 'Check domains against the Taiwan police 165 public list',
        '台湾警察の165公開リストでドメインを照合', '대만 경찰 165 공개 목록과 도메인 대조'),
    }) })
  }
  return tags
}
